import { useEffect, useMemo, useState } from 'react'
import type { JSX } from 'react'
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

type AuthSource = 'browser' | 'gh-cli' | null

type CliAuthState = {
  available: boolean
  authenticated: boolean
  login: string | null
  message: string
}

type BrowserAuthState = {
  configured: boolean
  message: string
}

type DeviceFlowState = {
  userCode: string
  verificationUri: string
  expiresIn: number
}

const SECTIONS: Array<{ key: SectionKey; label: string }> = [
  { key: 'repositories', label: 'Repositories' },
  { key: 'pulls', label: 'Pull Requests' },
  { key: 'issues', label: 'Issues' },
  { key: 'branches', label: 'Branches' },
  { key: 'notifications', label: 'Notifications' },
]

function App() {
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
  const [browserAuth, setBrowserAuth] = useState<BrowserAuthState | null>(null)
  const [authBusy, setAuthBusy] = useState(false)
  const [authHint, setAuthHint] = useState('')
  const [deviceFlow, setDeviceFlow] = useState<DeviceFlowState | null>(null)
  const [loading, setLoading] = useState(false)
  const [repoLoading, setRepoLoading] = useState(false)
  const [error, setError] = useState('')
  const [lastSynced, setLastSynced] = useState('')

  useEffect(() => {
    void initializeAuth()
  }, [])

  async function initializeAuth() {
    const [status, browserStatus] = await Promise.all([
      window.githubDock?.getGhCliStatus(),
      window.githubDock?.getBrowserAuthStatus(),
    ])

    if (status) {
      setCliAuth(status)
    }

    if (browserStatus) {
      setBrowserAuth(browserStatus)
    }

    const storedSource = (window.localStorage.getItem('github-dock-auth-source') as AuthSource) ?? null

    if (storedSource === 'gh-cli' && status?.authenticated) {
      await connectWithGhCli(false)
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

  async function connectWithBrowser() {
    if (!browserAuth?.configured) {
      setError(browserAuth?.message || 'GitHub browser sign-in is not configured.')
      setAuthHint('Browser sign-in is unavailable in this build. Set GITHUB_OAUTH_CLIENT_ID or use GitHub CLI.')
      return
    }

    setAuthBusy(true)
    setAuthHint('Opening GitHub sign-in. Finish authentication in the browser to continue.')
    setError('')

    try {
      const flow = await window.githubDock?.startGitHubDeviceFlow()
      if (!flow) {
        throw new Error('GitHub sign-in did not start.')
      }

      setDeviceFlow({
        userCode: flow.userCode,
        verificationUri: flow.verificationUri,
        expiresIn: flow.expiresIn,
      })

      await window.githubDock?.openExternal(flow.verificationUriComplete ?? flow.verificationUri)

      let intervalMs = Math.max(flow.interval, 5) * 1000
      const expiresAt = Date.now() + flow.expiresIn * 1000

      while (Date.now() < expiresAt) {
        await delay(intervalMs)

        const result = await window.githubDock?.pollGitHubDeviceFlow(flow.deviceCode)
        if (!result) {
          throw new Error('GitHub sign-in did not return a result.')
        }

        if (result.status === 'pending') {
          continue
        }

        if (result.status === 'slow_down') {
          intervalMs += 5000
          continue
        }

        if (result.status === 'approved') {
          window.localStorage.setItem('github-dock-auth-source', 'browser')
          setToken(result.accessToken)
          setAuthSource('browser')
          setAuthHint('Signed in with GitHub. Loading repositories.')
          setDeviceFlow(null)
          return
        }

        if ('message' in result) {
          throw new Error(result.message)
        }

        throw new Error('GitHub sign-in did not complete successfully.')
      }

      throw new Error('GitHub sign-in timed out before approval was completed.')
    } catch (caughtError) {
      const message = caughtError instanceof Error ? caughtError.message : 'Failed to sign in with GitHub.'
      setError(message)
      setAuthHint('')
      setDeviceFlow(null)
    } finally {
      setAuthBusy(false)
    }
  }

  async function handlePrimaryAuth() {
    if (browserAuth?.configured) {
      await connectWithBrowser()
      return
    }

    if (cliAuth?.authenticated) {
      await connectWithGhCli(false)
      return
    }

    setError('Browser sign-in is not configured in this build.')
    setAuthHint('Set GITHUB_OAUTH_CLIENT_ID for GitHub browser auth, or run gh auth login and return here.')
  }

  async function connectWithGhCli(persistSource: boolean = true) {
    setAuthBusy(true)
    setError('')
    setAuthHint('Loading your GitHub CLI session.')

    try {
      const cliToken = await window.githubDock?.getGhCliToken()
      if (!cliToken) {
        throw new Error('GitHub CLI did not return a token.')
      }

      if (persistSource) {
        window.localStorage.setItem('github-dock-auth-source', 'gh-cli')
      }
      setToken(cliToken)
      setAuthSource('gh-cli')
      setDeviceFlow(null)

      const status = await window.githubDock?.getGhCliStatus()
      if (status) {
        setCliAuth(status)
      }

      setAuthHint('Connected through GitHub CLI.')
    } catch (caughtError) {
      const message = caughtError instanceof Error ? caughtError.message : 'Failed to connect through GitHub CLI.'
      setError(message)
      setAuthHint('')
    } finally {
      setAuthBusy(false)
    }
  }

  function handleDisconnect() {
    setToken('')
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
    setAuthHint('')
    setDeviceFlow(null)
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

  const authLabel = authSource === 'gh-cli' ? 'GitHub CLI session' : 'Browser sign-in'
  const primaryAuthLabel = browserAuth?.configured ? 'Continue with GitHub' : cliAuth?.authenticated ? 'Continue with GitHub CLI' : 'Continue'

  return (
    <div className="app-shell">
      {!token ? (
        <main className="login-shell">
          <section className="login-card panel-card">
            <div className="login-brand-row">
              <div className="brand-mark large-mark">
                <GitHubDockMark />
              </div>
              <div>
                <h1>GitHub Dock</h1>
                <p>Sign in first, then open your repository workspace.</p>
              </div>
            </div>

            <div className="login-copy">
              <h2>Authenticate</h2>
              <p>Use GitHub browser approval when available, or continue with an existing GitHub CLI session.</p>
              {authHint ? <p className="auth-hint">{authHint}</p> : null}
              {deviceFlow ? (
                <div className="device-flow-card">
                  <span className="field-label">Verification code</span>
                  <strong>{deviceFlow.userCode}</strong>
                  <p>Approve this sign-in on GitHub within about {Math.ceil(deviceFlow.expiresIn / 60)} minutes.</p>
                </div>
              ) : null}
              {!browserAuth?.configured ? <p className="muted top-gap">Browser sign-in requires GITHUB_OAUTH_CLIENT_ID in the app environment.</p> : null}
              {!cliAuth?.authenticated ? <p className="muted">GitHub CLI is available after you run gh auth login on this machine.</p> : null}
            </div>

            <div className="auth-actions login-actions">
              <button type="button" onClick={() => void handlePrimaryAuth()} disabled={authBusy}>
                {primaryAuthLabel}
              </button>
              <button type="button" className="secondary-button" onClick={() => void connectWithGhCli()} disabled={authBusy || !cliAuth?.available}>
                Use GitHub CLI
              </button>
            </div>

            {error ? <div className="error-banner">{error}</div> : null}
          </section>
        </main>
      ) : (
        <>
          <header className="app-header">
            <div className="brand-block">
              <div className="brand-mark">
                <GitHubDockMark />
              </div>
              <div>
                <h1>GitHub Dock</h1>
                <p>Dedicated GitHub workspace</p>
              </div>
            </div>

            <div className="header-right">
              <div className="header-meta">
                <span className="status-pill neutral">Tray popup</span>
                {lastSynced ? <span className="status-pill neutral">Synced {lastSynced}</span> : null}
              </div>

              <div className="window-controls">
                <button type="button" className="window-control" aria-label="Minimize" onClick={() => void window.githubDock?.minimizeWindow()}>
                  _
                </button>
                <button type="button" className="window-control danger" aria-label="Hide" onClick={() => void window.githubDock?.hideWindow()}>
                  ×
                </button>
              </div>
            </div>
          </header>

          <main className="main-panel">
            <section className="workspace-shell">
              <aside className="workspace-sidebar">
                <div className="sidebar-top">
                  <div className="sidebar-brand-lockup">
                    <span className="sidebar-kicker">Workspace</span>
                    <h3>GitHub</h3>
                  </div>

                  <nav className="section-nav sidebar-nav">
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
                </div>

                <div className="sidebar-bottom">
                  <div className="sidebar-account-card">
                    <h3>{user?.name ?? user?.login ?? 'GitHub'}</h3>
                    <p className="muted">{user ? `@${user.login}` : 'Loading account details'}</p>
                    <div className="status-pill-row top-gap">
                      <span className={`status-pill ${authSource === 'gh-cli' ? 'neutral' : 'success'}`}>{authLabel}</span>
                    </div>
                  </div>

                  <button type="button" className="secondary-button sidebar-action" onClick={handleDisconnect}>
                    Disconnect
                  </button>
                </div>
              </aside>

              <section className="workspace-content">
                {error ? <div className="error-banner">{error}</div> : null}

                {loading ? (
                  <section className="empty-state">
                    <h3>Loading GitHub data</h3>
                    <p>Fetching repositories, repository health, and notifications.</p>
                  </section>
                ) : (
                  <>
                    <section className="panel-card compact-panel control-bar">
                      <div className="control-bar-top">
                        <div>
                          <h3>{user?.name ?? user?.login ?? 'GitHub'}</h3>
                          <p className="muted">{user ? `@${user.login}` : 'Loading account details'}</p>
                        </div>
                        <div className="status-pill-row">
                          <span className={`status-pill ${authSource === 'gh-cli' ? 'neutral' : 'success'}`}>{authLabel}</span>
                          <span className="status-pill neutral">{filteredRepos.length} repos</span>
                        </div>
                      </div>

                      <div className="control-bar-grid">
                <div>
                  <div className="panel-title-row">
                    <h3>Repository</h3>
                    <span className="section-meta">{filteredRepos.length} visible</span>
                  </div>

                  <label className="field-label" htmlFor="repo-search">Filter</label>
                  <input
                    id="repo-search"
                    value={repoSearch}
                    onChange={(event) => setRepoSearch(event.target.value)}
                    placeholder="Filter repositories"
                  />

                  <label className="field-label" htmlFor="repo-select">Selection</label>
                  <select
                    id="repo-select"
                    className="repo-select"
                    value={selectedRepo ? String(selectedRepo.id) : ''}
                    onChange={(event) => {
                      const nextRepo = filteredRepos.find((repo) => String(repo.id) === event.target.value) ?? null
                      setSelectedRepo(nextRepo)
                    }}
                  >
                    {filteredRepos.length === 0 ? <option value="">No repositories</option> : null}
                    {filteredRepos.map((repo) => (
                      <option key={repo.id} value={repo.id}>
                        {repo.owner.login}/{repo.name}
                      </option>
                    ))}
                  </select>
                </div>

                <section className="summary-grid compact-summary-grid">
                  {summaryCards.map((card) => (
                    <article key={card.label} className="summary-card">
                      <span>{card.label}</span>
                      <strong>{card.value}</strong>
                    </article>
                  ))}
                </section>
                      </div>
                    </section>

              <section className="repo-heading panel-card compact-panel">
                <div>
                  <h2>{selectedRepo ? `${selectedRepo.owner.login}/${selectedRepo.name}` : 'Choose a repository'}</h2>
                  <p>{selectedRepo ? `${selectedRepo.language ?? 'Unknown language'} • ${selectedRepo.visibility}` : 'No repository selected'}</p>
                </div>
              </section>

              <section className="content-stack">
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

                <div className="detail-duo">
                  <div className="panel-card compact-panel">
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

                  <div className="panel-card compact-panel">
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
                </div>
              </section>
                  </>
                )}
              </section>
            </section>
          </main>
        </>
      )}
    </div>
  )
}

function GitHubDockMark() {
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true" focusable="false">
      <circle cx="20" cy="20" r="8" fill="currentColor" />
      <circle cx="44" cy="16" r="6" fill="#8cc9ff" />
      <circle cx="44" cy="42" r="9" fill="#67e0af" />
      <path d="M28 20h10M42 22v10M27 31l12-9" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
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
    return <RepositoryWorkspacePanel repoDetail={repoDetail} branches={branches} pulls={pulls} issues={issues} combinedStatus={combinedStatus} checkRuns={checkRuns} />
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

function RepositoryWorkspacePanel({
  repoDetail,
  branches,
  pulls,
  issues,
  combinedStatus,
  checkRuns,
}: {
  repoDetail: RepoDetail | null
  branches: BranchItem[]
  pulls: PullRequestItem[]
  issues: IssueItem[]
  combinedStatus: CombinedStatus | null
  checkRuns: CheckRunsResponse | null
}) {
  if (!repoDetail) {
    return (
      <div className="panel-card large-panel">
        <h3>Repository Overview</h3>
        <p className="muted">Select a repository from the top controls to inspect its branches, pull requests, and checks.</p>
      </div>
    )
  }

  return (
    <div className="repo-workspace-grid">
      <div className="panel-card large-panel">
        <h3>Repository Overview</h3>
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
      </div>

      <ListPanel title="Repository Pull Requests" items={pulls} emptyMessage="No open pull requests for this repository." renderItem={(item) => <PullRequestRow item={item} />} />
      <ListPanel title="Repository Branches" items={branches} emptyMessage="No branches loaded for this repository." renderItem={(item) => <BranchRow item={item} />} />
      <ListPanel title="Repository Issues" items={issues} emptyMessage="No open issues for this repository." renderItem={(item) => <IssueRow item={item} />} />
    </div>
  )
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

function delay(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}

export default App