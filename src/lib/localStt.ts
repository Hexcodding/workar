/**
 * Локальный слух: оба канала речи распознаются на этой же машине.
 *
 * Встроенное в Chromium распознавание ходит на серверы Google и из нашей сети
 * отваливается с «network», поэтому и свой микрофон, и петлю системного звука
 * гоняем через сайдкар stt/server.py. В интернет не уходит ничего.
 *
 * mic     — говорит Егор
 * system  — говорит мама или ребёнок (звук встречи в наушниках)
 */

export type LocalSttStatus = 'idle' | 'starting' | 'listening' | 'error' | 'unavailable'

export type SttSource = 'mic' | 'system'

type Handlers = {
  onFinal?: (text: string, id?: string) => void
  /** точная модель переслушала кусок и вернула другие слова */
  onRevision?: (id: string, text: string) => void
  onSpeech?: (speaking: boolean) => void
  onLevel?: (level: number) => void
  onStatus?: (status: LocalSttStatus) => void
  onError?: (message: string) => void
}

const FRAME_SAMPLES = 1600 // 0.1 сек при 16 кГц

/** Воркер живёт в аудиопотоке, поэтому копит кадры сам и не грузит UI */
const WORKLET_SOURCE = `
class PcmCollector extends AudioWorkletProcessor {
  constructor() {
    super()
    this.buffer = new Float32Array(${FRAME_SAMPLES})
    this.filled = 0
  }
  process(inputs) {
    const input = inputs[0]?.[0]
    if (!input) return true
    for (let i = 0; i < input.length; i++) {
      this.buffer[this.filled++] = input[i]
      if (this.filled === this.buffer.length) {
        const frame = this.buffer.slice(0)
        this.port.postMessage(frame, [frame.buffer])
        this.buffer = new Float32Array(${FRAME_SAMPLES})
        this.filled = 0
      }
    }
    return true
  }
}
registerProcessor('pcm-collector', PcmCollector)
`

function toInt16(frame: Float32Array): ArrayBuffer {
  const out = new Int16Array(frame.length)
  for (let i = 0; i < frame.length; i++) {
    const s = Math.max(-1, Math.min(1, frame[i]))
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff
  }
  return out.buffer
}

export class LocalSttListener {
  private source: SttSource
  private handlers: Handlers
  private wanted = false
  private ws: WebSocket | null = null
  private stream: MediaStream | null = null
  private ctx: AudioContext | null = null
  private node: AudioWorkletNode | null = null
  private port = 8756
  private retry: number | null = null

  constructor(source: SttSource, handlers: Handlers = {}) {
    this.source = source
    this.handlers = handlers
  }

  static get available() {
    return Boolean(window.workar?.stt)
  }

  async start() {
    if (!LocalSttListener.available) {
      this.handlers.onStatus?.('unavailable')
      return
    }

    this.wanted = true
    this.handlers.onStatus?.('starting')

    try {
      const status = await window.workar!.stt!.start()
      this.port = status.port
    } catch (e) {
      this.fail(e instanceof Error ? e.message : 'Не удалось запустить распознаватель')
      return
    }

    try {
      await this.capture()
    } catch (e) {
      const what =
        this.source === 'mic' ? 'Нет доступа к микрофону' : 'Нет доступа к системному звуку'
      this.fail(e instanceof Error ? `${what}: ${e.message}` : what)
      return
    }

    this.connect()
  }

  private async openStream(): Promise<MediaStream> {
    if (this.source === 'mic') {
      return navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      })
    }

    const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true })
    // видео просили только потому, что Chromium без него не отдаёт петлю
    stream.getVideoTracks().forEach((t) => t.stop())
    if (!stream.getAudioTracks().length) {
      throw new Error('система не отдала звуковую дорожку')
    }
    return stream
  }

  private async capture() {
    const stream = await this.openStream()
    this.stream = stream

    const ctx = new AudioContext({ sampleRate: 16000 })
    const blob = new Blob([WORKLET_SOURCE], { type: 'application/javascript' })
    const url = URL.createObjectURL(blob)
    await ctx.audioWorklet.addModule(url)
    URL.revokeObjectURL(url)

    const src = ctx.createMediaStreamSource(stream)
    const node = new AudioWorkletNode(ctx, 'pcm-collector')
    // глушим выход: звук уже звучит в наушниках, повторять его не нужно
    const mute = ctx.createGain()
    mute.gain.value = 0

    node.port.onmessage = (ev: MessageEvent<Float32Array>) => {
      const frame = ev.data
      let sum = 0
      for (let i = 0; i < frame.length; i++) sum += frame[i] * frame[i]
      this.handlers.onLevel?.(Math.sqrt(sum / frame.length))
      if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(toInt16(frame))
    }

    src.connect(node)
    node.connect(mute)
    mute.connect(ctx.destination)
    this.ctx = ctx
    this.node = node
  }

  private connect() {
    if (!this.wanted) return
    const ws = new WebSocket(`ws://127.0.0.1:${this.port}/?ch=${this.source}`)
    ws.binaryType = 'arraybuffer'
    this.ws = ws

    ws.onopen = () => this.handlers.onStatus?.('listening')

      ws.onmessage = (ev) => {
        let data: { type: string; id?: string; text?: string; on?: boolean }
        try {
          data = JSON.parse(String(ev.data))
        } catch {
          return
        }
        if (data.type === 'final' && data.text) this.handlers.onFinal?.(data.text, data.id)
        else if (data.type === 'revision' && data.id && data.text)
          this.handlers.onRevision?.(data.id, data.text)
        else if (data.type === 'speech') this.handlers.onSpeech?.(Boolean(data.on))
      }

    ws.onerror = () => {
      // сайдкар мог ещё грузить модель — молча переподключимся
    }

    ws.onclose = () => {
      this.ws = null
      if (!this.wanted) return
      this.handlers.onStatus?.('starting')
      this.retry = window.setTimeout(() => this.connect(), 1500)
    }
  }

  private fail(message: string) {
    this.handlers.onStatus?.('error')
    this.handlers.onError?.(message)
    void this.stop()
  }

  /** Досказать последний кусок, например перед завершением встречи */
  flush() {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'flush' }))
    }
  }

  async stop() {
    this.wanted = false
    if (this.retry) window.clearTimeout(this.retry)
    this.retry = null

    this.flush()
    this.ws?.close()
    this.ws = null

    this.node?.port.close()
    this.node?.disconnect()
    this.node = null

    this.stream?.getTracks().forEach((t) => t.stop())
    this.stream = null

    await this.ctx?.close().catch(() => undefined)
    this.ctx = null

    this.handlers.onStatus?.('idle')
  }
}
