export interface Viewer {
  login: string
  name: string | null
  avatar_url: string
}

export interface RepoSummary {
  id: number
  name: string
  full_name: string
  description: string | null
  default_branch: string
  language: string | null
  updated_at: string
  visibility: string
  owner: {
    login: string
  }
}

export interface RepoDetail extends RepoSummary {
  archived: boolean
  forks_count: number
  stargazers_count: number
  watchers_count: number
  subscribers_count?: number
  open_issues_count: number
}

export interface PullRequestItem {
  id: number
  number: number
  title: string
  html_url: string
  updated_at: string
  user: {
    login: string
  }
  head: {
    ref: string
  }
  base: {
    ref: string
  }
}

export interface IssueItem {
  id: number
  number: number
  title: string
  html_url: string
  updated_at: string
  comments: number
  user: {
    login: string
  }
}

export interface BranchItem {
  name: string
  protected: boolean
  commit: {
    sha: string
  }
  protection?: {
    required_status_checks?: {
      contexts: string[]
    }
  }
}

export interface CombinedStatus {
  state: 'error' | 'failure' | 'pending' | 'success'
  total_count: number
  statuses: Array<{
    context: string
    state: string
    description: string | null
    target_url: string | null
  }>
}

export interface CheckRunsResponse {
  total_count: number
  check_runs: Array<{
    id: number
    name: string
    status: string
    conclusion: string | null
    html_url: string | null
    details_url: string | null
    started_at: string | null
    completed_at: string | null
  }>
}

export interface RepoBundle {
  repo: RepoDetail
  branches: BranchItem[]
  pulls: PullRequestItem[]
  issues: IssueItem[]
  combinedStatus: CombinedStatus | null
  checkRuns: CheckRunsResponse | null
}

export interface GitHubNotification {
  id: string
  updated_at: string
  repository: {
    full_name: string
  }
  subject: {
    title: string
    type: string
    url: string | null
  }
}