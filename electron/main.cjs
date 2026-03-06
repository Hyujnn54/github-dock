const path = require('node:path')
const { execFile } = require('node:child_process')
const { promisify } = require('node:util')
const { app, BrowserWindow, Tray, nativeImage, ipcMain, shell } = require('electron')

const execFileAsync = promisify(execFile)

let mainWindow = null
let tray = null

function createTrayIcon() {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">
      <rect width="64" height="64" rx="16" fill="#0b1320" />
      <path d="M18 18h28v8H26v12h16v8H26v8H18z" fill="#7dd3fc" />
      <circle cx="48" cy="46" r="8" fill="#34d399" />
    </svg>`
  return nativeImage.createFromDataURL(`data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`)
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1380,
    height: 900,
    minWidth: 1180,
    minHeight: 760,
    show: false,
    autoHideMenuBar: true,
    skipTaskbar: true,
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

  mainWindow.on('blur', () => {
    if (!mainWindow.webContents.isDevToolsOpened()) {
      mainWindow.hide()
    }
  })
}

function toggleWindow() {
  if (!mainWindow) {
    return
  }

  if (mainWindow.isVisible()) {
    mainWindow.hide()
  } else {
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

app.whenReady().then(() => {
  createWindow()
  tray = new Tray(createTrayIcon())
  tray.setToolTip('GitHub Dock')
  tray.on('click', toggleWindow)

  ipcMain.handle('app:getVersion', () => app.getVersion())
  ipcMain.handle('auth:getGhCliStatus', () => getGhCliStatus())
  ipcMain.handle('auth:getGhCliToken', async () => runGhCommand(['auth', 'token']))
  ipcMain.handle('shell:openExternal', (_event, url) => shell.openExternal(url))
})

app.on('window-all-closed', (event) => {
  event.preventDefault()
})

app.on('before-quit', () => {
  app.removeAllListeners('window-all-closed')
})