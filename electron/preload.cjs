const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('githubDock', {
  getAppVersion: () => ipcRenderer.invoke('app:getVersion'),
  getGhCliStatus: () => ipcRenderer.invoke('auth:getGhCliStatus'),
  getGhCliToken: () => ipcRenderer.invoke('auth:getGhCliToken'),
  openExternal: (url) => ipcRenderer.invoke('shell:openExternal', url),
})