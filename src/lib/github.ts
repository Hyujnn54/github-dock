import type {
  BranchItem,
  CheckRunsResponse,
  CombinedStatus,
  GitHubNotification,
  IssueItem,
  PullRequestItem,
  RepoBundle,
  RepoDetail,
  RepoSummary,
  Viewer,
} from '../types'

const API_BASE = 'https://api.github.com'

async function request<T>(path: string, token: string): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
    },
  })

  if (!response.ok) {
    const message = await response.text()
    throw new Error(message || `GitHub API request failed with ${response.status}`)
  }

  return response.json() as Promise<T>
}

export async function fetchViewer(token: string) {
  return request<Viewer>('/user', token)
}

export async function fetchRepos(token: string) {
  return request<RepoSummary[]>('/user/repos?sort=updated&per_page=100', token)
}

export async function fetchNotifications(token: string) {
  try {
    return await request<GitHubNotification[]>('/notifications?per_page=50', token)
  } catch {
    return []
  }
}

export async function fetchRepoBundle(owner: string, repo: string, token: string) {
  const [repoData, branchSummaries, pulls, issues] = await Promise.all([
    request<RepoDetail>(`/repos/${owner}/${repo}`, token),
    request<BranchItem[]>(`/repos/${owner}/${repo}/branches?per_page=100`, token),
    request<PullRequestItem[]>(`/repos/${owner}/${repo}/pulls?state=open&per_page=50`, token),
    request<IssueItem[]>(`/repos/${owner}/${repo}/issues?state=open&per_page=50`, token),
  ])

  const [combinedStatus, checkRuns, branchDetails] = await Promise.all([
    fetchCombinedStatus(owner, repo, repoData.default_branch, token),
    fetchCheckRuns(owner, repo, repoData.default_branch, token),
    Promise.all(branchSummaries.slice(0, 20).map((branch) => fetchBranchDetail(owner, repo, branch.name, token))),
  ])

  const availableBranchDetails = branchDetails.filter((candidate): candidate is BranchItem => candidate !== null)

  const detailedBranches = branchSummaries.map((branch) => {
    const detailed = availableBranchDetails.find((candidate) => candidate.name === branch.name)
    return detailed ?? branch
  })

  return {
    repo: repoData,
    branches: detailedBranches,
    pulls,
    issues: issues.filter((item) => !('pull_request' in item)),
    combinedStatus,
    checkRuns,
  } satisfies RepoBundle
}

async function fetchCombinedStatus(owner: string, repo: string, ref: string, token: string) {
  try {
    return await request<CombinedStatus>(`/repos/${owner}/${repo}/commits/${ref}/status`, token)
  } catch {
    return null
  }
}

async function fetchCheckRuns(owner: string, repo: string, ref: string, token: string) {
  try {
    return await request<CheckRunsResponse>(`/repos/${owner}/${repo}/commits/${ref}/check-runs`, token)
  } catch {
    return null
  }
}

async function fetchBranchDetail(owner: string, repo: string, branch: string, token: string) {
  try {
    return await request<BranchItem>(`/repos/${owner}/${repo}/branches/${encodeURIComponent(branch)}`, token)
  } catch {
    return null
  }
}