import { useState, useEffect, useRef } from 'react'
import { marked } from 'marked'

/* Configure marked for GFM and single line-breaks */
marked.setOptions({
  breaks: true,
  gfm: true
})
import { DEFAULT_CALENDAR, analyzeEvent, simulateScenario, explainConcept, followUpChat, fetchLiveCalendar } from './services/ai.js'
import { getModelName } from './config/model.js'

/* ---------------- helpers ---------------- */
const impactMeta = {
  high: { label: 'High', color: '#dc2626', bg: 'rgba(220,38,38,0.12)' },
  med:  { label: 'Medium', color: '#f59e0b', bg: 'rgba(245,158,11,0.12)' },
  low:  { label: 'Low', color: '#16a34a', bg: 'rgba(22,163,74,0.12)' }
}
const impactMetaAr = { high: 'عالي', med: 'متوسط', low: 'منخفض' }
const currencyFlag = { USD: '🇺🇸', EUR: '🇪🇺', GBP: '🇬🇧', COM: '🛢️', JPY: '🇯🇵', AUD: '🇦🇺', CAD: '🇨🇦' }

/* Translation strings for EN / AR */
const T = {
  en: {
    forecast: 'Forecast', prev: 'Prev',
    analyzeBtn: 'AI Effect Analysis', reanalyze: 'Re-analyze', analyzing: 'Analyzing…',
    thinking: 'Thinking…', simTitle: 'What-if Simulator', simHint: 'Type a scenario to see how markets might react.',
    simPlaceholder: "e.g. 'CPI comes in way above 2.4%'", run: 'Run', simulating: 'Simulating…',
    logPred: 'Log a prediction', dirUp: 'Asset moves UP', dirDown: 'Asset moves DOWN',
    notePlaceholder: 'Which asset? Note…', saved: 'Saved to journal', savePred: 'Save prediction',
    learnTitle: 'Learn Trading', learnSub: 'Understand, then trade', askTitle: 'Ask any trading question',
    askPlaceholder: "e.g. 'How does a tech stock react to rate cuts?'", ask: 'Ask', teaching: 'Teaching…',
    journalTitle: 'Trading Journal', journalSub: 'Track your predictions',
    winRate: 'Win rate', wins: 'Wins', losses: 'Losses', entries: 'Entries',
    noPred: 'No predictions yet.', noPredHint: 'Open an event → log your call → come back and mark wins/losses to build your win rate.',
    win: 'Win', loss: 'Loss', won: 'Right call', lost: 'Missed',
    askFollowup: 'Ask a follow-up or request clarification…', send: 'Send', sending: 'Sending…',
    footer: 'learn&earn — live economic calendar from ForexFactory. AI powered by Alucard.'
  },
  ar: {
    forecast: 'التوقع', prev: 'السابق',
    analyzeBtn: 'تحليل الأثر بالذكاء الاصطناعي', reanalyze: 'إعادة التحليل', analyzing: '…جارٍ التحليل',
    thinking: '…جارٍ التفكير', simTitle: 'محاكي ماذا لو', simHint: 'اكتب سيناريو لترى كيف قد يتفاعل السوق.',
    simPlaceholder: 'مثال: "صدر مؤشر أسعار المستهلك أعلى بكثير من 2.4%"', run: 'تشغيل', simulating: '…جارٍ المحاكاة',
    logPred: 'سجّل توقعاً', dirUp: 'الأصل يرتفع', dirDown: 'الأصل ينخفض',
    notePlaceholder: 'أي أصل؟ ملاحظة…', saved: 'تم الحفظ في السجل', savePred: 'حفظ التوقع',
    learnTitle: 'تعلّم التداول', learnSub: 'افهم أولاً، ثم تداول', askTitle: 'اسأل أي سؤال تداولي',
    askPlaceholder: 'مثال: "كيف تتفاعل أسهم التقنية مع خفض الفائدة؟"', ask: 'اسأل', teaching: '…جارٍ الشرح',
    journalTitle: 'سجل التداول', journalSub: 'تتبّع توقعاتك',
    winRate: 'نسبة الفوز', wins: 'الفائز', losses: 'الخاسر', entries: 'السجلات',
    noPred: 'لا توجد توقعات بعد.', noPredHint: 'افتح حدثاً ← سجّل توقعك ← عُد وحدد الفوز/الخسارة لبناء نسبتك.',
    win: 'فوز', loss: 'خسارة', won: 'إصابة', lost: 'إخفاق',
    askFollowup: 'اطرح سؤالاً توضيحياً أو اطلب المزيد…', send: 'إرسال', sending: '…جارٍ الإرسال',
    footer: 'learn&earn — تقويم اقتصادي مباشر من ForexFactory. بالتعاون مع Alucard.'
  }
}

const fmtTime = (iso) => new Date(iso).toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })

const loadJournal = () => {
  try { return JSON.parse(localStorage.getItem('marketscope-journal') || '[]') } catch { return [] }
}

/* Dark mode seed - default to dark theme */
const initialDark = () => {
  try {
    const val = localStorage.getItem('marketscope-dark')
    return val === null ? true : val === 'true'
  } catch {
    return true
  }
}

export default function App() {
  const [tab, setTab] = useState('calendar')
  const [calendar, setCalendar] = useState(DEFAULT_CALENDAR)
  const [calendarLoading, setCalendarLoading] = useState(false)
  const [selectedEvent, setSelectedEvent] = useState(null)
  const [analysis, setAnalysis] = useState(null)
  const [analyzing, setAnalyzing] = useState(false)
  const [aiError, setAiError] = useState(null)
  const [scenario, setScenario] = useState('')
  const [scenarioRes, setScenarioRes] = useState(null)
  const [scenarioLoading, setScenarioLoading] = useState(false)
  const [journal, setJournal] = useState(loadJournal)
  const [dark, setDark] = useState(initialDark)
  const [modelName] = useState(getModelName)
  const [lang, setLang] = useState(() => localStorage.getItem('marketscope-lang') || 'en')
  const [panelOpen, setPanelOpen] = useState(false)

  // Fetch live calendar on mount
  useEffect(() => {
    const loadCalendar = async () => {
      setCalendarLoading(true)
      try {
        const live = await fetchLiveCalendar()
        setCalendar(live.length ? live : DEFAULT_CALENDAR)
      } catch {
        setCalendar(DEFAULT_CALENDAR)
      } finally {
        setCalendarLoading(false)
      }
    }
    loadCalendar()
  }, [])

  // Apply language + dir
  useEffect(() => {
    localStorage.setItem('marketscope-lang', lang)
    document.documentElement.lang = lang
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr'
  }, [lang])

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark)
    localStorage.setItem('marketscope-dark', dark.toString())
  }, [dark])
  useEffect(() => { localStorage.setItem('marketscope-journal', JSON.stringify(journal)) }, [journal])

  // Lock background scroll on mobile and desktop when event details or side panel is open
  useEffect(() => {
    const isModalOpen = Boolean(selectedEvent || panelOpen)
    if (isModalOpen) {
      document.body.style.overflow = 'hidden'
      document.body.style.touchAction = 'none'
      document.documentElement.style.overflow = 'hidden'
      document.body.classList.add('modal-open')
    } else {
      document.body.style.overflow = ''
      document.body.style.touchAction = ''
      document.documentElement.style.overflow = ''
      document.body.classList.remove('modal-open')
    }
    return () => {
      document.body.style.overflow = ''
      document.body.style.touchAction = ''
      document.documentElement.style.overflow = ''
      document.body.classList.remove('modal-open')
    }
  }, [selectedEvent, panelOpen])

  /* ------- actions ------- */
  const openEvent = (ev) => {
    setSelectedEvent(ev)
    setAnalysis(null); setScenarioRes(null); setScenario(''); setAiError(null)
  }

  const closeEvent = () => { setSelectedEvent(null); setAnalysis(null); setScenarioRes(null); setAiError(null) }

  const runAnalysis = async () => {
    if (!selectedEvent) return
    setAnalyzing(true); setAiError(null); setAnalysis(null)
    try {
      const res = await analyzeEvent(selectedEvent, lang)
      setAnalysis(res)
    } catch (e) {
      setAiError(e.message)
    } finally { setAnalyzing(false) }
  }

  const runScenario = async () => {
    if (!selectedEvent || !scenario.trim()) return
    setScenarioLoading(true); setScenarioRes(null); setAiError(null)
    try {
      const res = await simulateScenario(selectedEvent, scenario, lang)
      setScenarioRes(res)
    } catch (e) { setAiError(e.message) }
    finally { setScenarioLoading(false) }
  }

  const addJournalEntry = (entry) => {
    setJournal(prev => [{ id: Date.now().toString(), ...entry, createdAt: new Date().toISOString() }, ...prev])
  }

  const updateJournalOutcome = (id, won) => {
    setJournal(prev => prev.map(j => j.id === id ? { ...j, won } : j))
  }

  const refreshCalendar = async () => {
    setCalendarLoading(true)
    try {
      const live = await fetchLiveCalendar(true) // force refresh
      setCalendar(live.length ? live : DEFAULT_CALENDAR)
    } finally {
      setCalendarLoading(false)
    }
  }

  const removeJournalEntry = (id) => setJournal(prev => prev.filter(j => j.id !== id))

  /* ------- derived ------- */
  const wins = journal.filter(j => j.won === true).length
  const losses = journal.filter(j => j.won === false).length
  const winRate = (wins + losses) > 0 ? Math.round((wins / (wins + losses)) * 100) : null

  return (
    <div className="app">
      {/* Header */}
      <header className="header">
        <div className="header-inner">
          <div className="brand">
            <Logo />
            <div>
              <h1>learn&earn</h1>
              <span className="brand-sub">{lang === 'ar' ? 'تعلّم التداول عبر الأحداث' : 'Learn trading through events'}</span>
            </div>
          </div>
          <div className="header-actions">
            <span className="model-chip" title="AI model in use">{modelName}</span>
            <button className="icon-btn menu-btn" onClick={() => setPanelOpen(true)} aria-label="Open menu">
              <span /><span /><span />
            </button>
          </div>
        </div>
        <nav className="tab-bar">
          {[['calendar', lang === 'ar' ? 'التقويم' : 'Calendar'], ['learn', lang === 'ar' ? 'تعلّم' : 'Learn'], ['journal', lang === 'ar' ? 'السجل' : 'Journal']].map(([k, label]) => (
            <button key={k} className={`tab ${tab === k ? 'active' : ''}`} onClick={() => setTab(k)}>{label}</button>
          ))}
        </nav>
      </header>

      {/* Side Panel */}
      <SidePanel
        open={panelOpen}
        onClose={() => setPanelOpen(false)}
        lang={lang}
        setLang={setLang}
        dark={dark}
        setDark={setDark}
        modelName={modelName}
      />

      <main className="content">
        {/* ---------- CALENDAR VIEW ---------- */}
        {tab === 'calendar' && (
          <section className="view">
            <div className="section-head">
              <h2>{lang === 'ar' ? 'الأحداث الاقتصادية' : 'Economic Events'}</h2>
              <span className="fade">
                {calendarLoading
                  ? (lang === 'ar' ? '…جارٍ تحميل البيانات المباشرة' : 'Loading live data…')
                  : (lang === 'ar' ? `هذا الأسبوع · ${calendar.length} حدث · مرتب تلقائياً` : `This week · ${calendar.length} events · auto-sorted`)}
                <button className="refresh-btn" onClick={refreshCalendar} disabled={calendarLoading} title={lang === 'ar' ? 'تحديث' : 'Refresh'}>↻</button>
              </span>
            </div>
            <div className="legend">
              {['high', 'med', 'low'].map(k => (
                <span key={k} className="legend-item"><i style={{ background: impactMeta[k].color }} /> {lang === 'ar' ? impactMetaAr[k] : impactMeta[k].label}</span>
              ))}
            </div>
            {calendarLoading && <div className="loader">{lang === 'ar' ? '…جارٍ جلب الأحداث المباشرة' : 'Fetching live events…'} <i /></div>}
            <ul className="event-list">
              {calendar.map(ev => {
                const im = impactMeta[ev.impact] || impactMeta.med
                return (
                  <li key={ev.id} className="event-card" onClick={() => openEvent(ev)}>
                    <div className="impact-line" style={{ background: im.color }} />
                    <div className="event-main">
                      <div className="event-top">
                        <span className="event-time">{fmtTime(ev.date)}</span>
                        <span className="impact-badge" style={{ color: im.color, background: im.bg }}>{im.label}</span>
                      </div>
                      <div className="event-title">{currencyFlag[ev.currency] || ''} {ev.title}</div>
                      <div className="event-meta">
                        <span>{ev.currency}</span>
                        {ev.forecast !== '—' && <span>Forecast: <b>{ev.forecast}</b></span>}
                        <span>Prev: <b>{ev.previous}</b></span>
                      </div>
                    </div>
                    <span className="chev">›</span>
                  </li>
                )
              })}
            </ul>
          </section>
        )}

        {/* ---------- LEARN VIEW ---------- */}
        {tab === 'learn' && (
          <LearnView explainConcept={explainConcept} addJournalEntry={addJournalEntry} lang={lang} />
        )}

        {/* ---------- JOURNAL VIEW ---------- */}
        {tab === 'journal' && (
          <JournalView journal={journal} winRate={winRate} wins={wins} losses={losses}
            updateOutcome={updateJournalOutcome} remove={removeJournalEntry} lang={lang} />
        )}
      </main>

      {/* ---------- EVENT DETAIL BOTTOM SHEET ---------- */}
      {selectedEvent && (
        <EventSheet
          event={selectedEvent}
          dark={dark}
          analysis={analysis}
          analyzing={analyzing}
          aiError={aiError}
          scenario={scenario}
          setScenario={setScenario}
          scenarioRes={scenarioRes}
          scenarioLoading={scenarioLoading}
          onAnalyze={runAnalysis}
          onScenario={runScenario}
          onClose={closeEvent}
          addJournal={addJournalEntry}
          lang={lang}
        />
      )}

      {/* Footer */}
      <footer className="footer">
        <span>{T[lang].footer}</span>
      </footer>
    </div>
  )
}

/* ================= LOGO ================= */
function Logo() {
  return (
    <svg className="brand-logo" width="34" height="34" viewBox="0 0 34 34" fill="none" xmlns="http://www.w3.org/2000/svg" aria-label="learn&earn">
      <rect x="1" y="1" width="32" height="32" rx="9" fill="var(--brand)" />
      <path d="M9 23L15 16L19 20L25 11" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="25" cy="11" r="2.6" fill="#fff" />
      <circle cx="9" cy="23" r="2.6" fill="#fff" />
    </svg>
  )
}

/* ================= SIDE PANEL ================= */
function SidePanel({ open, onClose, lang, setLang, dark, setDark, modelName }) {
  const themeNameEn = dark ? 'Obsidian Dark' : 'Slate Light'
  const themeNameAr = dark ? 'داكن (أوبسيديان)' : 'فاتح (سلايت)'

  return (
    <>
      <div className={`panel-overlay ${open ? 'open' : ''}`} onClick={onClose} />
      <aside className={`side-panel ${open ? 'open' : ''}`} aria-hidden={!open}>
        <div className="panel-head">
          <div className="brand">
            <Logo />
            <h2>learn&earn</h2>
          </div>
          <button className="icon-btn close-btn" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <div className="panel-section">
          <button className="panel-auth-btn primary" onClick={onClose}>{lang === 'ar' ? 'تسجيل الدخول' : 'Log in'}</button>
          <button className="panel-auth-btn" onClick={onClose}>{lang === 'ar' ? 'إنشاء حساب' : 'Register'}</button>
          <p className="panel-note">{lang === 'ar' ? 'عرض توضيحي — المصادقة غير مفعّلة بعد' : 'Demo — authentication not active yet'}</p>
        </div>

        <div className="panel-section">
          <div className="panel-row" onClick={() => setDark(d => !d)}>
            <div className="panel-row-info">
              <span className="panel-row-label">{lang === 'ar' ? 'نمط المظهر' : 'Active Theme'}</span>
              <span className="panel-value">{lang === 'ar' ? themeNameAr : themeNameEn}</span>
            </div>
            <span className={`toggle ${dark ? 'on' : ''}`}><span className="knob" /></span>
          </div>
          <div className="panel-row" onClick={() => setLang(l => l === 'en' ? 'ar' : 'en')}>
            <div className="panel-row-info">
              <span className="panel-row-label">{lang === 'ar' ? 'اللغة' : 'Language'}</span>
              <span className="panel-value">{lang === 'ar' ? 'العربية (Arabic)' : 'English'}</span>
            </div>
            <span className="panel-chip-btn">{lang === 'ar' ? 'EN' : 'AR'}</span>
          </div>
        </div>

        <div className="panel-footer">
          <span className="model-chip">{modelName}</span>
        </div>
      </aside>
    </>
  )
}

/* ================= FOLLOW-UP CHAT ================= */
function FollowUpChat({ context, lang }) {
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const t = T[lang]
  const bottomRef = useRef(null)

  const send = async () => {
    const q = input.trim()
    if (!q || loading) return
    setMessages(prev => [...prev, { role: 'user', content: q }])
    setInput('')
    setLoading(true)
    try {
      const answer = await followUpChat(context, q, lang)
      setMessages(prev => [...prev, { role: 'assistant', content: answer }])
    } catch (e) {
      setMessages(prev => [...prev, { role: 'assistant', content: `⚠️ ${e.message}` }])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages, loading])

  return (
    <div className="followup-chat">
      {messages.map((msg, i) => (
        <div key={i} className={`msg ${msg.role}`}>
          <div className="msg-bubble">
            {msg.role === 'assistant' ? (
              <div className="markdown" dangerouslySetInnerHTML={{ __html: marked.parse(msg.content) }} />
            ) : (
              <p>{msg.content}</p>
            )}
          </div>
        </div>
      ))}
      {loading && <div className="loader">{t.sending} <i /></div>}
      <div className="followup-input">
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && send()}
          placeholder={t.askFollowup}
          disabled={loading}
        />
        <button className="btn btn-primary sm" onClick={send} disabled={loading || !input.trim()}>
          {t.send}
        </button>
      </div>
      <div ref={bottomRef} />
    </div>
  )
}

/* ================= EVENT SHEET ================= */
function EventSheet({ event, analysis, analyzing, aiError, scenario, setScenario, scenarioRes, scenarioLoading, onAnalyze, onScenario, onClose, addJournal, lang }) {
  const im = impactMeta[event.impact] || impactMeta.med
  const [direction, setDirection] = useState('up')
  const [note, setNote] = useState('')
  const [saved, setSaved] = useState(false)
  const t = T[lang]

  /* Touch drag-to-dismiss state */
  const [dragY, setDragY] = useState(0)
  const [isDragging, setIsDragging] = useState(false)
  const touchStartY = useRef(0)
  const sheetRef = useRef(null)

  const handleTouchStart = (e) => {
    const scrollTop = sheetRef.current ? sheetRef.current.scrollTop : 0
    if (scrollTop <= 0) {
      touchStartY.current = e.touches[0].clientY
      setIsDragging(true)
    }
  }

  const handleTouchMove = (e) => {
    if (!isDragging) return
    const currentY = e.touches[0].clientY
    const deltaY = currentY - touchStartY.current
    if (deltaY > 0) {
      setDragY(deltaY)
    } else {
      setDragY(0)
    }
  }

  const handleTouchEnd = () => {
    if (!isDragging) return
    setIsDragging(false)
    if (dragY > 90) {
      onClose()
    } else {
      setDragY(0)
    }
  }

  const savePrediction = () => {
    addJournal({ eventTitle: event.title, eventId: event.id, direction, note, won: null })
    setSaved(true)
    setTimeout(() => setSaved(false), 1500)
  }

  return (
    <div className="sheet-overlay" onClick={onClose}>
      <div
        ref={sheetRef}
        className={`sheet ${isDragging ? 'dragging' : ''}`}
        style={{
          transform: dragY > 0 ? `translate3d(0, ${dragY}px, 0)` : undefined,
          transition: isDragging ? 'none' : 'transform 0.2s cubic-bezier(0.16, 1, 0.3, 1)'
        }}
        onClick={e => e.stopPropagation()}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <div className="sheet-handle" title={lang === 'ar' ? 'اسحب لأسفل للإغلاق' : 'Drag down to close'} />
        <div className="sheet-header">
          <div>
            <div className="event-top">
              <span className="event-time">{fmtTime(event.date)}</span>
              <span className="impact-badge" style={{ color: im.color, background: im.bg }}>{lang === 'ar' ? impactMetaAr[event.impact] || im.label : im.label}</span>
            </div>
            <h3>{currencyFlag[event.currency] || ''} {event.title}</h3>
            <div className="event-meta">
              <span>{t.forecast}: <b>{event.forecast || '—'}</b></span>
              <span>{t.prev}: <b>{event.previous || '—'}</b></span>
            </div>
          </div>
          <button className="icon-btn close-btn" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <p className="desc">{event.description || event.teases || event.learn}</p>

        {/* Analysis */}
        <button className="btn btn-primary" onClick={onAnalyze} disabled={analyzing}>
          {analyzing ? t.analyzing : (analysis ? t.reanalyze : t.analyzeBtn)}
        </button>
        {aiError && <p className="error">{aiError}</p>}
        {analyzing && <div className="loader">{t.thinking} <i /></div>}
        {analysis && (
          <div className="ai-result">
            <div className="markdown" dangerouslySetInnerHTML={{ __html: marked.parse(analysis) }} />
            <FollowUpChat
              context={{ type: 'analysis', event, previousResponse: analysis }}
              lang={lang}
            />
          </div>
        )}

        {/* Scenario simulator */}
        <div className="sim-block">
          <h4>{t.simTitle}</h4>
          <p className="fade">{t.simHint}</p>
          <div className="row">
            <input value={scenario} onChange={e => setScenario(e.target.value)}
              placeholder={t.simPlaceholder} />
            <button className="btn btn-primary" onClick={onScenario} disabled={scenarioLoading || !scenario.trim()}>{scenarioLoading ? '…' : t.run}</button>
          </div>
          {scenarioLoading && <div className="loader">{t.simulating} <i /></div>}
          {scenarioRes && (
            <div className="ai-result">
              <div className="markdown" dangerouslySetInnerHTML={{ __html: marked.parse(scenarioRes) }} />
              <FollowUpChat
                context={{ type: 'simulation', event, scenario, previousResponse: scenarioRes }}
                lang={lang}
              />
            </div>
          )}
        </div>

        {/* Prediction journal quick-add */}
        <div className="journal-quick">
          <h4>{t.logPred}</h4>
          <div className="row">
            <select value={direction} onChange={e => setDirection(e.target.value)}>
              <option value="up">{t.dirUp}</option>
              <option value="down">{t.dirDown}</option>
            </select>
            <input value={note} onChange={e => setNote(e.target.value)} placeholder={t.notePlaceholder} />
          </div>
          <button className="btn btn-secondary" onClick={savePrediction} disabled={saved}>
            {saved ? t.saved : t.savePred}
          </button>
        </div>
      </div>
    </div>
  )
}

/* ================= LEARN VIEW ================= */
function LearnView({ explainConcept, addJournalEntry, lang }) {
  const [topic, setTopic] = useState('')
  const [res, setRes] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const t = T[lang]

  const concepts = lang === 'ar' ? [
    ['مؤشر أسعار المستهلك والتضخم', 'ما هو مؤشر أسعار المستهلك ولماذا يحرك العملات؟'],
    ['أسعار الفائدة', 'كيف تؤثر قرارات البنوك المركزية على كل شيء'],
    ['تقرير الوظائف غير الزراعية', 'أكثر الأحداث تقلباً في السوق'],
    ['إقبال/إحجام عن المخاطرة', 'كيف يوجه مزاج السوق تدفقات الأصول'],
    ['الدعم والمقاومة', 'مستويات الأسعار المهمة للتداول'],
    ['النقطة وأحجام العقود', 'أساسيات الفوركس للمبتدئين']
  ] : [
    ['CPI & Inflation', 'What is CPI and why does it move currencies?'],
    ['Interest Rates', 'How central bank rates affect everything'],
    ['Non-Farm Payrolls', 'The jobs report — most volatile event'],
    ['Risk On vs Risk Off', 'How market mood drives asset flows'],
    ['Support & Resistance', 'Key price levels for trading'],
    ['Pip & Lot Sizes', 'Forex basics for beginners']
  ]

  const run = async (q) => {
    const query = q || topic
    if (!query.trim()) return
    setLoading(true); setError(null); setRes(null)
    try { setRes(await explainConcept(query, lang)) }
    catch (e) { setError(e.message) }
    finally { setLoading(false) }
  }

  return (
    <section className="view">
      <div className="section-head"><h2>{t.learnTitle}</h2><span className="fade">{t.learnSub}</span></div>

      <div className="concept-grid">
        {concepts.map(([title, sub]) => (
          <button key={title} className="concept-card" onClick={() => run(title)}>
            <b>{title}</b><span>{sub}</span>
          </button>
        ))}
      </div>

      <div className="sim-block">
        <h4>{t.askTitle}</h4>
        <div className="row">
          <input value={topic} onChange={e => setTopic(e.target.value)}
            placeholder={t.askPlaceholder} onKeyDown={e => e.key === 'Enter' && run()} />
          <button className="btn btn-primary" onClick={() => run()} disabled={loading || !topic.trim()}>{loading ? '…' : t.ask}</button>
        </div>
      </div>

      {error && <p className="error">{error}</p>}
      {loading && <div className="loader">{t.teaching} <i /></div>}
      {res && (
        <div className="ai-result">
          <div className="markdown" dangerouslySetInnerHTML={{ __html: marked.parse(res) }} />
          <FollowUpChat context={{ type: 'concept', topic, previousResponse: res }} lang={lang} />
        </div>
      )}
    </section>
  )
}

/* ================= JOURNAL VIEW ================= */
function JournalView({ journal, winRate, wins, losses, updateOutcome, remove, lang }) {
  const t = T[lang]
  return (
    <section className="view">
      <div className="section-head"><h2>{t.journalTitle}</h2><span className="fade">{t.journalSub}</span></div>

      <div className="stats-row">
        <div className="stat"><b>{winRate !== null ? winRate + '%' : '—'}</b><span>{t.winRate}</span></div>
        <div className="stat"><b>{wins}</b><span>{t.wins}</span></div>
        <div className="stat"><b>{losses}</b><span>{t.losses}</span></div>
        <div className="stat"><b>{journal.length}</b><span>{t.entries}</span></div>
      </div>

      {journal.length === 0 ? (
        <div className="empty">
          <p>{t.noPred}</p>
          <p className="fade">{t.noPredHint}</p>
        </div>
      ) : (
        <ul className="journal-list">
          {journal.map(j => (
            <li key={j.id} className={`journal-card ${j.won === null ? '' : j.won ? 'won' : 'lost'}`}>
              <div className="journal-head">
                <b>{j.direction === 'up' ? t.dirUp : t.dirDown}</b>
                <span className="fade">{new Date(j.createdAt).toLocaleString(lang === 'ar' ? 'ar-EG' : [], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
              </div>
              <div className="journal-title">{j.eventTitle || t.logPred}</div>
              {j.note && <p className="journal-note">"{j.note}"</p>}
              <div className="journal-actions">
                {j.won === null ? (
                  <>
                    <button className="btn btn-secondary sm" onClick={() => updateOutcome(j.id, true)}>{t.win}</button>
                    <button className="btn btn-danger sm" onClick={() => updateOutcome(j.id, false)}>{t.loss}</button>
                  </>
                ) : (
                  <span className={`result-tag ${j.won ? 'won' : 'lost'}`}>{j.won ? t.won : t.lost}</span>
                )}
                <button className="icon-btn sm" onClick={() => remove(j.id)} aria-label="Delete">✕</button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}