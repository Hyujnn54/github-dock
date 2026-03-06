const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('githubDock', {
  getAppVersion: () => ipcRenderer.invoke('app:getVersion'),
})