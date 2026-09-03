/// <reference types="vite/client" />

interface WorkarSttStatus {
  running: boolean
  ready: boolean
  port: number
}

interface WorkarSttAPI {
  start: () => Promise<WorkarSttStatus>
  stop: () => Promise<WorkarSttStatus>
  status: () => Promise<WorkarSttStatus>
  onReady: (fn: (port: number) => void) => () => void
  onLog: (fn: (line: string) => void) => () => void
}

interface WorkarDesktopAPI {
  getAlwaysOnTop: () => Promise<boolean>
  setAlwaysOnTop: (value: boolean) => Promise<boolean>
  minimize: () => Promise<void>
  close: () => Promise<void>
  copy?: (text: string) => Promise<boolean>
  stt?: WorkarSttAPI
}

interface Window {
  workar?: WorkarDesktopAPI
}
