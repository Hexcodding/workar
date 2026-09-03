const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('workar', {
  getAlwaysOnTop: () => ipcRenderer.invoke('window:get-always-on-top'),
  setAlwaysOnTop: (value) => ipcRenderer.invoke('window:set-always-on-top', value),
  minimize: () => ipcRenderer.invoke('window:minimize'),
  close: () => ipcRenderer.invoke('window:close'),
  copy: (text) => ipcRenderer.invoke('clipboard:write', text),
  stt: {
    start: () => ipcRenderer.invoke('stt:start'),
    stop: () => ipcRenderer.invoke('stt:stop'),
    status: () => ipcRenderer.invoke('stt:status'),
    onReady: (fn) => {
      const handler = (_e, port) => fn(port)
      ipcRenderer.on('stt:ready', handler)
      return () => ipcRenderer.off('stt:ready', handler)
    },
    onLog: (fn) => {
      const handler = (_e, line) => fn(line)
      ipcRenderer.on('stt:log', handler)
      return () => ipcRenderer.off('stt:log', handler)
    },
  },
})
