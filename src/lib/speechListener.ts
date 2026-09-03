type SpeechHandlers = {
  onPartial?: (text: string) => void
  onFinal?: (text: string) => void
  onError?: (message: string) => void
  onStatus?: (status: 'idle' | 'listening' | 'unsupported' | 'denied') => void
}

type SpeechRec = {
  lang: string
  continuous: boolean
  interimResults: boolean
  maxAlternatives: number
  start: () => void
  stop: () => void
  abort: () => void
  onresult: ((ev: SpeechRecognitionEventLike) => void) | null
  onerror: ((ev: { error?: string }) => void) | null
  onend: (() => void) | null
}

type SpeechRecognitionEventLike = {
  resultIndex: number
  results: ArrayLike<{
    isFinal: boolean
    0: { transcript: string }
  }>
}

function getRecognitionCtor(): (new () => SpeechRec) | null {
  const w = window as Window & {
    SpeechRecognition?: new () => SpeechRec
    webkitSpeechRecognition?: new () => SpeechRec
  }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

export class SpeechListener {
  private rec: SpeechRec | null = null
  private wanted = false
  private handlers: SpeechHandlers

  constructor(handlers: SpeechHandlers = {}) {
    this.handlers = handlers
  }

  get supported() {
    return Boolean(getRecognitionCtor())
  }

  async start() {
    const Ctor = getRecognitionCtor()
    if (!Ctor) {
      this.handlers.onStatus?.('unsupported')
      this.handlers.onError?.(
        'Распознавание речи не поддерживается в этом окне. Обнови Electron / Chrome.',
      )
      return
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      stream.getTracks().forEach((t) => t.stop())
    } catch {
      this.handlers.onStatus?.('denied')
      this.handlers.onError?.(
        'Нет доступа к микрофону. Разреши микрофон для Workar в Windows / настройках.',
      )
      return
    }

    this.wanted = true
    this.rec = new Ctor()
    this.rec.lang = 'ru-RU'
    this.rec.continuous = true
    this.rec.interimResults = true
    this.rec.maxAlternatives = 1

    this.rec.onresult = (event) => {
      let partial = ''
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const piece = event.results[i][0]?.transcript?.trim()
        if (!piece) continue
        if (event.results[i].isFinal) this.handlers.onFinal?.(piece)
        else partial += `${piece} `
      }
      if (partial.trim()) this.handlers.onPartial?.(partial.trim())
    }

    this.rec.onerror = (ev) => {
      const err = ev.error || 'error'
      if (err === 'not-allowed') {
        this.handlers.onStatus?.('denied')
        this.handlers.onError?.('Микрофон запрещён системой.')
        this.wanted = false
        return
      }
      if (err === 'no-speech' || err === 'aborted') return
      this.handlers.onError?.(`STT: ${err}`)
    }

    this.rec.onend = () => {
      if (this.wanted) {
        try {
          this.rec?.start()
        } catch {
          window.setTimeout(() => {
            if (this.wanted) {
              try {
                this.rec?.start()
              } catch {
                // ignore
              }
            }
          }, 300)
        }
      } else {
        this.handlers.onStatus?.('idle')
      }
    }

    try {
      this.rec.start()
      this.handlers.onStatus?.('listening')
    } catch (e) {
      this.handlers.onError?.(e instanceof Error ? e.message : 'Не удалось стартовать STT')
      this.handlers.onStatus?.('idle')
    }
  }

  stop() {
    this.wanted = false
    try {
      this.rec?.stop()
    } catch {
      try {
        this.rec?.abort()
      } catch {
        // ignore
      }
    }
    this.rec = null
    this.handlers.onStatus?.('idle')
  }
}
