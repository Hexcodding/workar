import { useEffect, useState } from 'react'
import { CallWorkspace } from './components/CallWorkspace'
import { HistoryList } from './components/HistoryList'
import { SessionSetup } from './components/SessionSetup'
import { TitleBar } from './components/TitleBar'
import {
  createSession,
  loadActiveSession,
  loadHistory,
  loadProfile,
  saveActiveSession,
  saveProfile,
  type Session,
  upsertHistory,
} from './store/sessionStore'

type Screen = 'setup' | 'call' | 'history'

export default function App() {
  const [screen, setScreen] = useState<Screen>('setup')
  const [session, setSession] = useState<Session | null>(null)
  const [history, setHistory] = useState<Session[]>(() => loadHistory())
  const [profile, setProfile] = useState(() => loadProfile())
  const [toast, setToast] = useState<string | null>(null)

  useEffect(() => {
    const active = loadActiveSession()
    if (active) setSession(active)
  }, [])

  useEffect(() => {
    if (!toast) return
    const id = window.setTimeout(() => setToast(null), 2200)
    return () => window.clearTimeout(id)
  }, [toast])

  useEffect(() => {
    if (session && screen === 'call') saveActiveSession(session)
  }, [session, screen])

  function showToast(message: string) {
    setToast(message)
  }

  function startSession(data: { momName: string; childName: string; sellerName: string }) {
    const nextProfile = { sellerName: data.sellerName }
    setProfile(nextProfile)
    saveProfile(nextProfile)
    const next = createSession(data)
    setSession(next)
    setScreen('call')
    saveActiveSession(next)
  }

  function resumeSession() {
    if (!session) return
    setScreen('call')
  }

  function finishMeeting() {
    if (!session) return
    const finished = {
      ...session,
      endedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    upsertHistory(finished)
    setHistory(loadHistory())
    saveActiveSession(null)
    setSession(null)
    setScreen('setup')
    showToast('Встреча сохранена в историю')
  }

  function openFromHistory(item: Session) {
    setSession(item)
    saveActiveSession(item)
    setScreen('call')
  }

  const subtitle =
    screen === 'call' && session
      ? `${session.momName}${session.childName ? ` · ${session.childName}` : ''}`
      : screen === 'history'
        ? 'история'
        : 'живой коуч'

  return (
    <div className="app">
      <TitleBar subtitle={subtitle} />
      <main className="content">
        {screen === 'setup' ? (
          <SessionSetup
            defaultSeller={profile.sellerName || 'seller'}
            historyCount={history.length}
            resumeSession={session}
            onResume={resumeSession}
            onStart={startSession}
            onOpenHistory={() => {
              setHistory(loadHistory())
              setScreen('history')
            }}
          />
        ) : null}

        {screen === 'history' ? (
          <HistoryList
            items={history}
            onOpen={openFromHistory}
            onBack={() => setScreen('setup')}
          />
        ) : null}

        {screen === 'call' && session ? (
          <CallWorkspace
            session={session}
            history={history}
            onSessionChange={(updater) => setSession((prev) => (prev ? updater(prev) : prev))}
            onCollapse={() => {
              upsertHistory(session)
              setHistory(loadHistory())
              saveActiveSession(null)
              setSession(null)
              setScreen('setup')
            }}
            onFinish={finishMeeting}
            onCopied={showToast}
          />
        ) : null}
      </main>
      {toast ? <div className="toast">{toast}</div> : null}
    </div>
  )
}
