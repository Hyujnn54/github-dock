import { useEffect, useMemo, useState } from 'react'
import type { FormEvent, JSX } from 'react'
import {
  fetchNotifications,
  fetchRepoBundle,
  fetchRepos,
  fetchViewer,
} from './lib/github'
import type {
  BranchItem,
  CheckRunsResponse,
  CombinedStatus,
  GitHubNotification,
  IssueItem,
  PullRequestItem,
  RepoDetail,
  RepoSummary,
  Viewer,
} from './types'

type SectionKey = 'repositories' | 'pulls' | 'issues' | 'branches' | 'notifications'

type AuthSource = 'manual' | 'gh-cli' | null

type CliAuthState = {
  available: boolean
  authenticated: boolean
  login: string | null
  message: string
}

const SECTIONS: Array<{ key: SectionKey; label: string }> = [
  { key: 'repositories', label: 'Repositories' },
  { key: 'pulls', label: 'Pull Requests' },
  { key: 'issues', label: 'Issues' },
  { key: 'branches', label: 'Branches' },
  { key: 'notifications', label: 'Notifications' },
]

function App() {
  const [tokenInput, setTokenInput] = useState('')
  const [token, setToken] = useState('')
  const [user, setUser] = useState<Viewer | null>(null)
  const [repos, setRepos] = useState<RepoSummary[]>([])
  const [notifications, setNotifications] = useState<GitHubNotification[]>([])
  const [selectedRepo, setSelectedRepo] = useState<RepoSummary | null>(null)
  const [repoDetail, setRepoDetail] = useState<RepoDetail | null>(null)
  const [pulls, setPulls] = useState<PullRequestItem[]>([])
  const [issues, setIssues] = useState<IssueItem[]>([])
  const [branches, setBranches] = useState<BranchItem[]>([])
  const [combinedStatus, setCombinedStatus] = useState<CombinedStatus | null>(null)
  const [checkRuns, setCheckRuns] = useState<CheckRunsResponse | null>(null)
  const [section, setSection] = useState<SectionKey>('repositories')
  const [repoSearch, setRepoSearch] = useState('')
  const [authSource, setAuthSource] = useState<AuthSource>(null)
  const [cliAuth, setCliAuth] = useState<CliAuthState | null>(null)
  const [loading, setLoading] = useState(false)
  const [repoLoading, setRepoLoading] = useState(false)
  const [error, setError] = useState('')
  const [lastSynced, setLastSynced] = useState('')

  useEffect(() => {
    void initializeAuth()
  }, [])

  async function initializeAuth() {
    const status = await window.githubDock?.getGhCliStatus()
    if (status) {
      setCliAuth(status)
    }

    const storedSource = (window.localStorage.getItem('github-dock-auth-source') as AuthSource) ?? null
    const storedToken = window.localStorage.getItem('github-dock-token') ?? ''

    if (storedSource === 'gh-cli' && status?.authenticated) {
      await connectWithGhCli(false)
      return
    }

    if (storedToken) {
      setTokenInput(storedToken)
      setToken(storedToken)
      setAuthSource('manual')
    }
  }

  useEffect(() => {
    if (!token) {
      return
    }

    void loadDashboard(token)
  }, [token])

  useEffect(() => {
    if (!token || !selectedRepo) {
      return
    }

    void loadRepo(selectedRepo.owner.login, selectedRepo.name, token)
  }, [selectedRepo, token])

  async function loadDashboard(authToken: string) {
    setLoading(true)
    setError('')

    try {
      const [viewer, repoItems, notificationItems] = await Promise.all([
        fetchViewer(authToken),
        fetchRepos(authToken),
        fetchNotifications(authToken),
      ])

      setUser(viewer)
      setRepos(repoItems)
      setNotifications(notificationItems)

      if (!selectedRepo && repoItems.length > 0) {
        setSelectedRepo(repoItems[0])
      }

      setLastSynced(new Date().toLocaleTimeString())
    } catch (caughtError) {
      const message = caughtError instanceof Error ? caughtError.message : 'Failed to load GitHub data.'
      setError(message)
    } finally {
      setLoading(false)
    }
  }

  async function loadRepo(owner: string, name: string, authToken: string) {
    setRepoLoading(true)
    setError('')

    try {
      const bundle = await fetchRepoBundle(owner, name, authToken)
      setRepoDetail(bundle.repo)
      setPulls(bundle.pulls)
      setIssues(bundle.issues)
      setBranches(bundle.branches)
      setCombinedStatus(bundle.combinedStatus)
      setCheckRuns(bundle.checkRuns)
      setLastSynced(new Date().toLocaleTimeString())
    } catch (caughtError) {
      const message = caughtError instanceof Error ? caughtError.message : 'Failed to load repository details.'
      setError(message)
    } finally {
      setRepoLoading(false)
    }
  }

  function handleConnect(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const trimmedToken = tokenInput.trim()
    if (!trimmedToken) {
      setError('Enter a GitHub token to continue.')
      return
    }

    window.localStorage.setItem('github-dock-token', trimmedToken)
    window.localStorage.setItem('github-dock-auth-source', 'manual')
    setToken(trimmedToken)
    setAuthSource('manual')
  }

  async function connectWithGhCli(persistSource: boolean = true) {
    setError('')

    try {
      const cliToken = await window.githubDock?.getGhCliToken()
      if (!cliToken) {
        throw new Error('GitHub CLI did not return a token.')
      }

      window.localStorage.removeItem('github-dock-token')
      if (persistSource) {
        window.localStorage.setItem('github-dock-auth-source', 'gh-cli')
      }
      setTokenInput('')
      setToken(cliToken)
      setAuthSource('gh-cli')

      const status = await window.githubDock?.getGhCliStatus()
      if (status) {
        setCliAuth(status)
      }
    } catch (caughtError) {
      const message = caughtError instanceof Error ? caughtError.message : 'Failed to connect through GitHub CLI.'
      setError(message)
    }
  }

  async function openGitHubCliDocs() {
    await window.githubDock?.openExternal('https://cli.github.com/')
  }

  function handleDisconnect() {
    window.localStorage.removeItem('github-dock-token')
    setToken('')
    setTokenInput('')
    setUser(null)
    setRepos([])
    setNotifications([])
    setSelectedRepo(null)
    setRepoDetail(null)
    setPulls([])
    setIssues([])
    setBranches([])
    setCombinedStatus(null)
    setCheckRuns(null)
    setError('')
    setLastSynced('')
    setAuthSource(null)
    window.localStorage.removeItem('github-dock-auth-source')
  }

  const filteredRepos = useMemo(() => {
    const query = repoSearch.trim().toLowerCase()
    if (!query) {
      return repos
    }

    return repos.filter((repo) => {
      const haystack = `${repo.owner.login}/${repo.name} ${repo.language ?? ''}`.toLowerCase()
      return haystack.includes(query)
    })
  }, [repoSearch, repos])

  const summaryCards = [
    { label: 'Repos', value: repos.length },
    { label: 'Open PRs', value: pulls.length },
    { label: 'Open Issues', value: issues.length },
    { label: 'Branches', value: branches.length },
    { label: 'Notifications', value: notifications.length },
  ]

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-block">
          <div className="brand-mark">GD</div>
          <div>
            <h1>GitHub Dock</h1>
            <p>Tray-first GitHub companion</p>
          </div>
        </div>

        <nav className="section-nav">
          {SECTIONS.map((item) => (
            <button
              key={item.key}
              className={item.key === section ? 'nav-item active' : 'nav-item'}
              onClick={() => setSection(item.key)}
              type="button"
            >
              {item.label}
            </button>
          ))}
        </nav>

        <div className="repo-filter-block">
          <label htmlFor="repo-search">Repository Filter</label>
          <input
            id="repo-search"
            value={repoSearch}
            onChange={(event) => setRepoSearch(event.target.value)}
            placeholder="Filter repositories"
          />
        </div>

        <div className="repo-list">
          {filteredRepos.map((repo) => (
            <button
              key={repo.id}
              type="button"
              className={selectedRepo?.id === repo.id ? 'repo-item active' : 'repo-item'}
              onClick={() => setSelectedRepo(repo)}
            >
              <div className="repo-item-header">
                <strong>{repo.name}</strong>
                <span>{repo.visibility}</span>
              </div>
              <div className="repo-item-meta">
                <span>{repo.language ?? 'No language'}</span>
                <span>{repo.default_branch}</span>
              </div>
            </button>
          ))}
        </div>
      </aside>

      <main className="main-panel">
        <header className="topbar">
          <div>
            <h2>{selectedRepo ? `${selectedRepo.owner.login}/${selectedRepo.name}` : 'Connect GitHub'}</h2>
            <p>{lastSynced ? `Last synced at ${lastSynced}` : 'No data loaded yet'}</p>
          </div>

          <form className="auth-form" onSubmit={handleConnect}>
            <input
              type="password"
              value={tokenInput}
              onChange={(event) => setTokenInput(event.target.value)}
              placeholder="GitHub token"
            />
            <button type="submit">Connect</button>
            <button type="button" className="secondary-button" onClick={() => void connectWithGhCli()}>
              Use GitHub CLI
            </button>
            <button type="button" className="secondary-button" onClick={handleDisconnect}>
              Clear
            </button>
          </form>
        </header>

        {error ? <div className="error-banner">{error}</div> : null}

        <section className="summary-grid">
          {summaryCards.map((card) => (
            <article key={card.label} className="summary-card">
              <span>{card.label}</span>
              <strong>{card.value}</strong>
            </article>
          ))}
        </section>

        {!token ? (
          <section className="empty-state">
            <h3>Connect a GitHub account</h3>
            <p>
              Use a personal access token with repository access. Add notifications scope if you want the
              notifications tab populated.
            </p>
          </section>
        ) : loading ? (
          <section className="empty-state">
            <h3>Loading GitHub data</h3>
            <p>Fetching repositories, repo state, and notifications.</p>
          </section>
        ) : (
          <section className="content-grid">
            <div className="content-primary">
              {renderSection(
                section,
                repoDetail,
                pulls,
                issues,
                branches,
                notifications,
                combinedStatus,
                checkRuns,
                repoLoading,
              )}
            </div>
            <aside className="content-secondary">
              <div className="panel-card">
                <h3>Account</h3>
                {user ? (
                  <>
                    <p>{user.name ?? user.login}</p>
                    <span className="muted">@{user.login}</span>
                    <div className="status-pill-row top-gap">
                      <span className="status-pill neutral">{authSource === 'gh-cli' ? 'GitHub CLI auth' : 'Manual token'}</span>
                    </div>
                  </>
                ) : (
                  <p className="muted">Not connected</p>
                )}
              </div>

              <div className="panel-card">
                <h3>GitHub CLI</h3>
                {cliAuth ? (
                  <>
                    <p>{cliAuth.message}</p>
                    <div className="status-pill-row top-gap">
                      <span className={`status-pill ${cliAuth.authenticated ? 'success' : 'neutral'}`}>
                        {cliAuth.available ? (cliAuth.authenticated ? 'Ready' : 'Not logged in') : 'Not installed'}
                      </span>
                    </div>
                    {!cliAuth.available ? (
                      <button type="button" className="secondary-button top-gap" onClick={() => void openGitHubCliDocs()}>
                        Install GitHub CLI
                      </button>
                    ) : null}
                  </>
                ) : (
                  <p className="muted">Checking GitHub CLI status.</p>
                )}
              </div>

              <div className="panel-card">
                <h3>Repository Health</h3>
                {repoDetail ? (
                  <ul className="detail-list">
                    <li>
                      <span>Stars</span>
                      <strong>{repoDetail.stargazers_count}</strong>
                    </li>
                    <li>
                      <span>Forks</span>
                      <strong>{repoDetail.forks_count}</strong>
                    </li>
                    <li>
                      <span>Watchers</span>
                      <strong>{repoDetail.subscribers_count ?? repoDetail.watchers_count}</strong>
                    </li>
                    <li>
                      <span>Open issues</span>
                      <strong>{repoDetail.open_issues_count}</strong>
                    </li>
                    <li>
                      <span>Updated</span>
                      <strong>{formatDate(repoDetail.updated_at)}</strong>
                    </li>
                  </ul>
                ) : (
                  <p className="muted">Select a repository to inspect its current state.</p>
                )}
              </div>

              <div className="panel-card">
                <h3>Default Branch Checks</h3>
                {repoDetail ? (
                  <>
                    <p>{repoDetail.default_branch}</p>
                    <div className="status-pill-row">
                      <span className={`status-pill ${statusTone(combinedStatus?.state ?? 'pending')}`}>
                        {formatStatusState(combinedStatus?.state ?? 'pending')}
                      </span>
                      <span className="status-pill neutral">{checkRuns?.total_count ?? 0} check runs</span>
                    </div>
                    <ul className="detail-list compact-list">
                      <li>
                        <span>Required contexts</span>
                        <strong>{countRequiredContexts(branches, repoDetail.default_branch)}</strong>
                      </li>
                      <li>
                        <span>Combined statuses</span>
                        <strong>{combinedStatus?.total_count ?? 0}</strong>
                      </li>
                    </ul>
                  </>
                ) : (
                  <p className="muted">Select a repository to inspect status checks.</p>
                )}
              </div>
            </aside>
          </section>
        )}
      </main>
    </div>
  )
}

function renderSection(
  section: SectionKey,
  repoDetail: RepoDetail | null,
  pulls: PullRequestItem[],
  issues: IssueItem[],
  branches: BranchItem[],
  notifications: GitHubNotification[],
  combinedStatus: CombinedStatus | null,
  checkRuns: CheckRunsResponse | null,
  repoLoading: boolean,
) {
  if (repoLoading && section !== 'notifications') {
    return (
      <div className="panel-card large-panel">
        <h3>Loading repository view</h3>
        <p className="muted">Fetching live repository status.</p>
      </div>
    )
  }

  if (section === 'repositories') {
    return (
      <div className="panel-card large-panel">
        <h3>Repository Overview</h3>
        {repoDetail ? (
          <>
            <p>{repoDetail.description || 'No description set.'}</p>
            <ul className="detail-list">
              <li>
                <span>Language</span>
                <strong>{repoDetail.language ?? 'Unknown'}</strong>
              </li>
              <li>
                <span>Default branch</span>
                <strong>{repoDetail.default_branch}</strong>
              </li>
              <li>
                <span>Visibility</span>
                <strong>{repoDetail.visibility}</strong>
              </li>
              <li>
                <span>Archived</span>
                <strong>{repoDetail.archived ? 'Yes' : 'No'}</strong>
              </li>
              <li>
                <span>Protected branches</span>
                <strong>{branches.filter((branch) => branch.protected).length}</strong>
              </li>
              <li>
                <span>Default branch checks</span>
                <strong>{formatStatusState(combinedStatus?.state ?? 'pending')}</strong>
              </li>
              <li>
                <span>Check runs</span>
                <strong>{checkRuns?.total_count ?? 0}</strong>
              </li>
            </ul>
          </>
        ) : (
          <p className="muted">Select a repository from the left to inspect it.</p>
        )}
      </div>
    )
  }

  if (section === 'pulls') {
    return <ListPanel title="Open Pull Requests" items={pulls} emptyMessage="No open pull requests for this repository." renderItem={(item) => <PullRequestRow item={item} />} />
  }

  if (section === 'issues') {
    return <ListPanel title="Open Issues" items={issues} emptyMessage="No open issues for this repository." renderItem={(item) => <IssueRow item={item} />} />
  }

  if (section === 'branches') {
    return <ListPanel title="Branches" items={branches} emptyMessage="No branches loaded for this repository." renderItem={(item) => <BranchRow item={item} />} />
  }

  return <ListPanel title="Notifications" items={notifications} emptyMessage="No notifications available or token lacks notification scope." renderItem={(item) => <NotificationRow item={item} />} />
}

function ListPanel<T>({
  title,
  items,
  emptyMessage,
  renderItem,
}: {
  title: string
  items: T[]
  emptyMessage: string
  renderItem: (item: T) => JSX.Element
}) {
  return (
    <div className="panel-card large-panel">
      <h3>{title}</h3>
      {items.length === 0 ? <p className="muted">{emptyMessage}</p> : <div className="row-list">{items.map(renderItem)}</div>}
    </div>
  )
}

function PullRequestRow({ item }: { item: PullRequestItem }) {
  return (
    <a className="row-card" href={item.html_url} target="_blank" rel="noreferrer">
      <div className="row-card-top">
        <strong>{item.title}</strong>
        <span>#{item.number}</span>
      </div>
      <div className="row-card-meta">
        <span>{item.user.login}</span>
        <span>{item.head.ref} → {item.base.ref}</span>
        <span>{formatDate(item.updated_at)}</span>
      </div>
    </a>
  )
}

function IssueRow({ item }: { item: IssueItem }) {
  return (
    <a className="row-card" href={item.html_url} target="_blank" rel="noreferrer">
      <div className="row-card-top">
        <strong>{item.title}</strong>
        <span>#{item.number}</span>
      </div>
      <div className="row-card-meta">
        <span>{item.user.login}</span>
        <span>{item.comments} comments</span>
        <span>{formatDate(item.updated_at)}</span>
      </div>
    </a>
  )
}

function BranchRow({ item }: { item: BranchItem }) {
  const requiredContexts = item.protection?.required_status_checks?.contexts.length ?? 0

  return (
    <div className="row-card static-row">
      <div className="row-card-top">
        <strong>{item.name}</strong>
        <div className="branch-badges">
          <span className={`status-pill ${item.protected ? 'success' : 'neutral'}`}>
            {item.protected ? 'Protected' : 'Open'}
          </span>
          {requiredContexts > 0 ? <span className="status-pill pending">{requiredContexts} required checks</span> : null}
        </div>
      </div>
      <div className="row-card-meta">
        <span>{item.commit.sha.slice(0, 7)}</span>
      </div>
    </div>
  )
}

function NotificationRow({ item }: { item: GitHubNotification }) {
  return (
    <div className="row-card static-row">
      <div className="row-card-top">
        <strong>{item.subject.title}</strong>
        <span>{item.subject.type}</span>
      </div>
      <div className="row-card-meta">
        <span>{item.repository.full_name}</span>
        <span>{formatDate(item.updated_at)}</span>
      </div>
    </div>
  )
}

function formatDate(value: string) {
  return new Date(value).toLocaleString()
}

function countRequiredContexts(branches: BranchItem[], defaultBranch: string) {
  const branch = branches.find((candidate) => candidate.name === defaultBranch)
  return branch?.protection?.required_status_checks?.contexts.length ?? 0
}

function formatStatusState(state: string) {
  if (state === 'success') {
    return 'Passing'
  }

  if (state === 'failure' || state === 'error') {
    return 'Failing'
  }

  return 'Pending'
}

function statusTone(state: string) {
  if (state === 'success') {
    return 'success'
  }

  if (state === 'failure' || state === 'error') {
    return 'danger'
  }

  return 'pending'
}

export default App