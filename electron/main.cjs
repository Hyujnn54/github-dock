const path = require('node:path')
const { execFile } = require('node:child_process')
const { promisify } = require('node:util')
const { app, BrowserWindow, Tray, nativeImage, ipcMain, screen, shell } = require('electron')

const execFileAsync = promisify(execFile)

const POPUP_WIDTH = 468
const POPUP_HEIGHT = 680
const POPUP_MARGIN = 14
const GITHUB_OAUTH_CLIENT_ID = process.env.GITHUB_OAUTH_CLIENT_ID || process.env.VITE_GITHUB_OAUTH_CLIENT_ID || ''

let mainWindow = null
let tray = null

function createTrayIcon() {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">
      <rect x="8" y="8" width="48" height="48" rx="14" fill="#f6f8fa" />
      <path d="M24 22h16m-14 10h14m-7-10v20" stroke="#0f172a" stroke-width="5" stroke-linecap="round" />
      <circle cx="43" cy="43" r="5" fill="#34d399" />
    </svg>`
  return nativeImage.createFromDataURL(`data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`).resize({ width: 16, height: 16 })
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: POPUP_WIDTH,
    height: POPUP_HEIGHT,
    minWidth: 420,
    minHeight: 600,
    maxWidth: 560,
    useContentSize: true,
    show: false,
    frame: false,
    titleBarStyle: 'hidden',
    autoHideMenuBar: true,
    skipTaskbar: true,
    maximizable: false,
    fullscreenable: false,
    resizable: false,
    alwaysOnTop: true,
    backgroundColor: '#08111f',
    title: 'GitHub Dock',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  const devServerUrl = process.env.VITE_DEV_SERVER_URL

  if (devServerUrl) {
    mainWindow.loadURL(devServerUrl)
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
  }

  mainWindow.once('ready-to-show', () => {
    positionWindowBottomRight()
  })

  mainWindow.on('blur', () => {
    if (!mainWindow.webContents.isDevToolsOpened()) {
      mainWindow.hide()
    }
  })
}

function positionWindowBottomRight() {
  if (!mainWindow) {
    return
  }

  const workArea = screen.getPrimaryDisplay().workArea
  const windowBounds = mainWindow.getBounds()
  const x = workArea.x + workArea.width - windowBounds.width - POPUP_MARGIN
  const y = workArea.y + workArea.height - windowBounds.height - POPUP_MARGIN

  mainWindow.setPosition(x, y, false)
}

function toggleWindow() {
  if (!mainWindow) {
    return
  }

  if (mainWindow.isVisible()) {
    mainWindow.hide()
  } else {
    positionWindowBottomRight()
    mainWindow.show()
    mainWindow.focus()
  }
}

async function runGhCommand(args) {
  const { stdout } = await execFileAsync('gh', args, {
    windowsHide: true,
    timeout: 15000,
    maxBuffer: 1024 * 1024,
  })

  return stdout.trim()
}

async function getGhCliStatus() {
  try {
    await runGhCommand(['--version'])
  } catch {
    return {
      available: false,
      authenticated: false,
      login: null,
      message: 'GitHub CLI is not installed.',
    }
  }

  try {
    await runGhCommand(['auth', 'token'])
    const login = await runGhCommand(['api', 'user', '-q', '.login'])
    return {
      available: true,
      authenticated: true,
      login: login || null,
      message: login ? `Authenticated as ${login}` : 'Authenticated in GitHub CLI.',
    }
  } catch {
    return {
      available: true,
      authenticated: false,
      login: null,
      message: 'Run gh auth login in a terminal to connect GitHub CLI.',
    }
  }
}

function getBrowserAuthStatus() {
  if (!GITHUB_OAUTH_CLIENT_ID) {
    return {
      configured: false,
      message: 'Set GITHUB_OAUTH_CLIENT_ID to enable in-app GitHub browser sign-in.',
    }
  }

  return {
    configured: true,
    message: 'Browser sign-in is ready.',
  }
}

async function postJson(url, body) {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams(body),
  })

  const payload = await response.json()

  if (!response.ok) {
    throw new Error(payload.error_description || payload.error || `GitHub auth request failed with ${response.status}`)
  }

  return payload
}

async function startGitHubDeviceFlow() {
  if (!GITHUB_OAUTH_CLIENT_ID) {
    throw new Error('GitHub OAuth is not configured. Set GITHUB_OAUTH_CLIENT_ID first.')
  }

  const payload = await postJson('https://github.com/login/device/code', {
    client_id: GITHUB_OAUTH_CLIENT_ID,
    scope: 'repo notifications read:user',
  })

  return {
    deviceCode: payload.device_code,
    userCode: payload.user_code,
    verificationUri: payload.verification_uri,
    verificationUriComplete: payload.verification_uri_complete || null,
    expiresIn: payload.expires_in,
    interval: payload.interval,
  }
}

async function pollGitHubDeviceFlow(deviceCode) {
  if (!GITHUB_OAUTH_CLIENT_ID) {
    throw new Error('GitHub OAuth is not configured. Set GITHUB_OAUTH_CLIENT_ID first.')
  }

  const payload = await postJson('https://github.com/login/oauth/access_token', {
    client_id: GITHUB_OAUTH_CLIENT_ID,
    device_code: deviceCode,
    grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
  })

  if (payload.error) {
    if (payload.error === 'authorization_pending') {
      return { status: 'pending' }
    }

    if (payload.error === 'slow_down') {
      return { status: 'slow_down' }
    }

    if (payload.error === 'expired_token') {
      return { status: 'expired', message: payload.error_description || 'GitHub sign-in expired.' }
    }

    if (payload.error === 'access_denied') {
      return { status: 'denied', message: payload.error_description || 'GitHub sign-in was cancelled.' }
    }

    return { status: 'error', message: payload.error_description || payload.error }
  }

  return {
    status: 'approved',
    accessToken: payload.access_token,
    scope: payload.scope,
    tokenType: payload.token_type,
  }
}

app.whenReady().then(() => {
  createWindow()

  try {
    const trayIcon = createTrayIcon()
    tray = new Tray(trayIcon)
    tray.setToolTip('GitHub Dock')
    tray.on('click', toggleWindow)
  } catch {
    tray = null
  }

  ipcMain.handle('app:getVersion', () => app.getVersion())
  ipcMain.handle('auth:getGhCliStatus', () => getGhCliStatus())
  ipcMain.handle('auth:getGhCliToken', async () => runGhCommand(['auth', 'token']))
  ipcMain.handle('auth:getBrowserAuthStatus', () => getBrowserAuthStatus())
  ipcMain.handle('auth:startGitHubDeviceFlow', () => startGitHubDeviceFlow())
  ipcMain.handle('auth:pollGitHubDeviceFlow', (_event, deviceCode) => pollGitHubDeviceFlow(deviceCode))
  ipcMain.handle('window:minimize', () => mainWindow?.minimize())
  ipcMain.handle('window:hide', () => mainWindow?.hide())
  ipcMain.handle('shell:openExternal', (_event, url) => shell.openExternal(url))
})

app.on('activate', () => {
  if (!mainWindow) {
    return
  }

  if (!mainWindow.isVisible()) {
    positionWindowBottomRight()
    mainWindow.show()
  }
})

app.on('window-all-closed', (event) => {
  event.preventDefault()
})

app.on('before-quit', () => {
  app.removeAllListeners('window-all-closed')
})