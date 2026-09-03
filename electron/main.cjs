const {
  app,
  BrowserWindow,
  clipboard,
  desktopCapturer,
  ipcMain,
  session,
  systemPreferences,
} = require('electron')
const { spawn } = require('child_process')
const path = require('path')

/** @type {BrowserWindow | null} */
let mainWindow = null
let alwaysOnTop = true

/** Локальный распознаватель речи мамы: живёт только пока идёт встреча */
/** @type {import('child_process').ChildProcess | null} */
let sttProc = null
let sttReady = false

const STT_PORT = Number(process.env.WORKAR_STT_PORT || 8756)
const PYTHON = process.env.WORKAR_PYTHON || 'python'
// быстрая модель отвечает вживую, точная переслушивает и правит текст;
// WORKAR_STT_EXACT=off выключает второй проход, если машина не тянет
const STT_MODEL = process.env.WORKAR_STT_MODEL || 'small'
const STT_EXACT = process.env.WORKAR_STT_EXACT || 'large-v3-turbo'

function sttLog(line) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('stt:log', line)
  }
}

function startStt() {
  if (sttProc) return { running: true, ready: sttReady, port: STT_PORT }

  const script = path.join(__dirname, '..', 'stt', 'server.py')
  const argv = [script, '--port', String(STT_PORT), '--model', STT_MODEL, '--exact', STT_EXACT]
  sttProc = spawn(PYTHON, argv, {
    cwd: path.join(__dirname, '..'),
    windowsHide: true,
  })

  sttProc.stdout?.on('data', (buf) => {
    const line = buf.toString('utf8').trim()
    if (!line) return
    if (line.includes('модель готова')) {
      sttReady = true
      if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('stt:ready', STT_PORT)
    }
    sttLog(line)
  })

  sttProc.stderr?.on('data', (buf) => sttLog(buf.toString('utf8').trim()))

  sttProc.on('error', (err) => {
    sttLog(`не запустился python: ${err.message}`)
    sttProc = null
    sttReady = false
  })

  sttProc.on('exit', (code) => {
    sttLog(`распознаватель остановлен (код ${code})`)
    sttProc = null
    sttReady = false
  })

  return { running: Boolean(sttProc), ready: false, port: STT_PORT }
}

function stopStt() {
  if (!sttProc) return { running: false, ready: false, port: STT_PORT }
  sttProc.kill()
  sttProc = null
  sttReady = false
  return { running: false, ready: false, port: STT_PORT }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 460,
    height: 860,
    minWidth: 360,
    minHeight: 560,
    title: 'Workar — встреча',
    frame: false,
    transparent: false,
    alwaysOnTop,
    resizable: true,
    backgroundColor: '#12161a',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  mainWindow.setAlwaysOnTop(alwaysOnTop, 'screen-saver')

  const devUrl = process.env.VITE_DEV_SERVER_URL
  if (devUrl) {
    mainWindow.loadURL(devUrl)
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show()
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

app.whenReady().then(async () => {
  session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => {
    if (permission === 'media' || permission === 'mediaKeySystem' || permission === 'display-capture') {
      callback(true)
      return
    }
    callback(false)
  })

  session.defaultSession.setPermissionCheckHandler((_wc, permission) => {
    return permission === 'media' || permission === 'display-capture'
  })

  // Петля системного звука: так программа слышит маму, пока Егор в наушниках.
  // Видео-источник Chromium требует всегда, в рендерере трек сразу гасится.
  session.defaultSession.setDisplayMediaRequestHandler(
    (_request, callback) => {
      desktopCapturer
        .getSources({ types: ['screen'] })
        .then((sources) => callback({ video: sources[0], audio: 'loopback' }))
        .catch(() => callback({}))
    },
    { useSystemPicker: false },
  )

  if (process.platform === 'win32' && systemPreferences?.getMediaAccessStatus) {
    // Windows: ensure mic access prompt can appear from Chromium
    void systemPreferences.getMediaAccessStatus('microphone')
  }

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

ipcMain.handle('window:get-always-on-top', () => alwaysOnTop)

ipcMain.handle('window:set-always-on-top', (_event, value) => {
  alwaysOnTop = Boolean(value)
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.setAlwaysOnTop(alwaysOnTop, 'screen-saver')
  }
  return alwaysOnTop
})

ipcMain.handle('window:minimize', () => {
  mainWindow?.minimize()
})

ipcMain.handle('window:close', () => {
  mainWindow?.close()
})

// в окне без рамки браузерный буфер обмена запрещён, поэтому пишем из главного
// процесса: иначе кнопки копирования молча ничего не делают
ipcMain.handle('clipboard:write', (_event, text) => {
  clipboard.writeText(String(text ?? ''))
  return true
})

ipcMain.handle('stt:start', () => startStt())
ipcMain.handle('stt:stop', () => stopStt())
ipcMain.handle('stt:status', () => ({
  running: Boolean(sttProc),
  ready: sttReady,
  port: STT_PORT,
}))

app.on('before-quit', () => {
  stopStt()
})
