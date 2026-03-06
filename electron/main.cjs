const path = require('node:path')
const { app, BrowserWindow, Tray, nativeImage, ipcMain } = require('electron')

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

app.whenReady().then(() => {
  createWindow()
  tray = new Tray(createTrayIcon())
  tray.setToolTip('GitHub Dock')
  tray.on('click', toggleWindow)

  ipcMain.handle('app:getVersion', () => app.getVersion())
})

app.on('window-all-closed', (event) => {
  event.preventDefault()
})

app.on('before-quit', () => {
  app.removeAllListeners('window-all-closed')
})