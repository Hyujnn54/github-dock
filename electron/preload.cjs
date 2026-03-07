const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('githubDock', {
  getAppVersion: () => ipcRenderer.invoke('app:getVersion'),
  getGhCliStatus: () => ipcRenderer.invoke('auth:getGhCliStatus'),
  getGhCliToken: () => ipcRenderer.invoke('auth:getGhCliToken'),
  getBrowserAuthStatus: () => ipcRenderer.invoke('auth:getBrowserAuthStatus'),
  startGitHubDeviceFlow: () => ipcRenderer.invoke('auth:startGitHubDeviceFlow'),
  pollGitHubDeviceFlow: (deviceCode) => ipcRenderer.invoke('auth:pollGitHubDeviceFlow', deviceCode),
  minimizeWindow: () => ipcRenderer.invoke('window:minimize'),
  hideWindow: () => ipcRenderer.invoke('window:hide'),
  openExternal: (url) => ipcRenderer.invoke('shell:openExternal', url),
})