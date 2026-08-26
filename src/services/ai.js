// src/services/ai.js
import { getModelConfig } from '../config/model.js'

const API_KEY = import.meta.env.VITE_NVIDIA_API_KEY || ''
const API_BASE = import.meta.env.VITE_NVIDIA_API_URL || 'https://integrate.api.nvidia.com/v1'

/* ---------- LIVE CALENDAR FETCHER ---------- */
/** Fetches this week's economic events from ForexFactory free XML feed. */
let calendarCache = { data: null, timestamp: 0 }
const CACHE_TTL = 30 * 60 * 1000 // 30 min

export async function fetchLiveCalendar(force = false) {
  const now = Date.now()
  if (!force && calendarCache.data && (now - calendarCache.timestamp) < CACHE_TTL) {
    return calendarCache.data
  }
  try {
    const now2 = new Date()
    const weekStart = new Date(now2)
    weekStart.setDate(now2.getDate() - now2.getDay()) // This week's Sunday
    const weekEnd = new Date(weekStart)
    weekEnd.setDate(weekStart.getDate() + 6)

    // Try proxied endpoint first (dev), fallback to direct
    let xmlText = ''
    try {
      const res = await fetch('/api/calendar')
      if (res.ok) xmlText = await res.text()
    } catch { /* ignore, try direct */ }

    if (!xmlText) {
      const res = await fetch('https://nfs.faireconomy.media/ff_calendar_thisweek.xml')
      if (!res.ok) throw new Error('ForexFactory feed failed')
      xmlText = await res.text()
    }

    const events = parseForexFactoryXML(xmlText, weekStart, weekEnd)
    if (events.length) {
      calendarCache = { data: events, timestamp: now }
      return events
    }
    // If parsing yields nothing, return demo data (don't cache empty)
    return DEFAULT_CALENDAR
  } catch (e) {
    console.warn('Live calendar fetch failed, using demo data:', e)
    return DEFAULT_CALENDAR
  }
}

/** Parse ForexFactory XML into our event format. */
function parseForexFactoryXML(xml, weekStart, weekEnd) {
  const parser = new DOMParser()
  const doc = parser.parseFromString(xml, 'text/xml')
  const eventNodes = doc.querySelectorAll('event')
  const events = []

  const countryToCurrency = {
    'USD': 'USD', 'EUR': 'EUR', 'GBP': 'GBP', 'JPY': 'JPY', 'CHF': 'CHF',
    'AUD': 'AUD', 'CAD': 'CAD', 'NZD': 'NZD', 'CNY': 'CNY', 'INR': 'INR',
    'BRL': 'BRL', 'MXN': 'MXN', 'ZAR': 'ZAR', 'TRY': 'TRY', 'RUB': 'RUB'
  }

  const countryFlag = {
    'USD': '🇺🇸', 'EUR': '🇪🇺', 'GBP': '🇬🇧', 'JPY': '🇯🇵', 'CHF': '🇨🇭',
    'AUD': '🇦🇺', 'CAD': '🇨🇦', 'NZD': '🇳🇿', 'CNY': '🇨🇳', 'INR': '🇮🇳',
    'BRL': '🇧🇷', 'MXN': '🇲🇽', 'ZAR': '🇿🇦', 'TRY': '🇹🇷', 'RUB': '🇷🇺'
  }

  for (const node of eventNodes) {
    const title = node.querySelector('title')?.textContent?.trim() || ''
    const country = node.querySelector('country')?.textContent?.trim() || ''
    const dateStr = node.querySelector('date')?.textContent?.trim() || ''
    const timeStr = node.querySelector('time')?.textContent?.trim() || ''
    const impact = (node.querySelector('impact')?.textContent?.trim() || 'Low').toLowerCase()
    const forecast = node.querySelector('forecast')?.textContent?.trim() || '—'
    const previous = node.querySelector('previous')?.textContent?.trim() || '—'
    const url = node.querySelector('url')?.textContent?.trim() || ''

    // Skip events without proper date/time
    if (!dateStr || !timeStr) continue

    // Parse date: "08-26-2026" -> Date
    const [mm, dd, yyyy] = dateStr.split('-').map(Number)
    if (!yyyy || !mm || !dd) continue

    // Parse time: "10:45am" or "10:45pm" -> hours/minutes
    let hours = 0, minutes = 0
    const timeMatch = timeStr.match(/(\d{1,2}):(\d{2})(am|pm)/i)
    if (timeMatch) {
      hours = parseInt(timeMatch[1])
      minutes = parseInt(timeMatch[2])
      const ampm = timeMatch[3].toLowerCase()
      if (ampm === 'pm' && hours !== 12) hours += 12
      if (ampm === 'am' && hours === 12) hours = 0
    } else if (timeStr === 'All Day' || timeStr === 'Tentative') {
      hours = 0; minutes = 0
    } else {
      continue // skip unparseable
    }

    const eventDate = new Date(yyyy, mm - 1, dd, hours, minutes)

    // Only include events within the current week window
    if (eventDate < weekStart || eventDate > weekEnd) continue

    const currency = countryToCurrency[country] || country
    events.push({
      id: `ff-${currency}-${title}-${eventDate.getTime()}`.replace(/\s+/g, '-').toLowerCase(),
      date: eventDate.toISOString(),
      currency,
      title,
      impact: impact === 'high' ? 'high' : impact === 'medium' ? 'med' : 'low',
      forecast: forecast || '—',
      previous: previous || '—',
      description: getEventDescription(title, currency),
      sourceUrl: url
    })
  }

  return events.sort((a, b) => new Date(a.date) - new Date(b.date))
}

/** Generate a teaching description for known events. */
function getEventDescription(title, currency) {
  const lower = title.toLowerCase()
  const descMap = {
    'cpi': 'Consumer Price Index — primary inflation gauge. Higher → hawkish central bank → currency up.',
    'core cpi': 'CPI excluding food & energy. Fed/ECB watch this closely for underlying trend.',
    'pce': 'Personal Consumption Expenditures — Fed\'s preferred inflation measure.',
    'core pce': 'Core PCE — Fed\'s #1 inflation target. Above 2% → hawkish.',
    'fomc': 'Federal Reserve rate decision. Most market-moving USD event. Watch statement + press conference.',
    'rate decision': 'Central bank interest rate decision. Higher rates → currency strength.',
    'non-farm payrolls': 'US jobs added (excl. farming). #1 monthly volatility event. Strong jobs → higher rates → USD up.',
    'nfp': 'Non-Farm Payrolls — US employment change. Biggest monthly mover for USD.',
    'unemployment': 'Unemployment rate. Lower → tighter labor market → hawkish.',
    'gdp': 'Gross Domestic Product — economic growth. Above forecast → currency up, stocks up.',
    'retail sales': 'Consumer spending (~70% of GDP). Strong → hawkish → currency up.',
    'industrial production': 'Factory/mining/utility output. Leading indicator for growth.',
    'pmi': 'Purchasing Managers Index — survey of business conditions. >50 = expansion.',
    'trade balance': 'Exports minus imports. Surplus → currency demand up.',
    'current account': 'Broad trade + investment income. Surplus → currency support.',
    'consumer confidence': 'Household sentiment. High → spending → growth → currency up.',
    'opec': 'OPEC production decisions. Affects oil, CAD, NOK, energy stocks.',
    'crude oil inventories': 'Weekly US oil storage. Build → oil down, USD/CAD up.',
    'eia': 'Energy Information Administration oil data. Moves WTI, CAD, energy sector.',
  }

  for (const [key, desc] of Object.entries(descMap)) {
    if (lower.includes(key)) return desc
  }
  return `${title} for ${currency}. Watch for deviation from forecast — moves ${currency} pairs.`
}

/* ---------- DEFAULT DEMO DATA (fallback) ---------- */
export const DEFAULT_CALENDAR = [
  { id: 'cpi-us-may', date: '2026-09-01T12:30:00', currency: 'USD', title: 'CPI y/y', impact: 'high',
    forecast: '2.4%', previous: '2.3%',
    description: 'CPI (Consumer Price Index) measures US inflation. Higher-than-expected → bonds sell off, USD rises, rate-cut expectations retreat. Watch EUR/USD + DXY + gold.' },
  { id: 'fomc-rate', date: '2026-09-03T18:00:00', currency: 'USD', title: 'FOMC Rate Decision', impact: 'high',
    forecast: '4.50%', previous: '4.50%',
    description: 'Federal Reserve interest rate decision. The most market-moving event in USD. Focus on the statement tone and press conference.' },
  { id: 'nfp-us', date: '2026-09-05T12:30:00', currency: 'USD', title: 'Non-Farm Payrolls', impact: 'high',
    forecast: '150K', previous: '175K',
    description: 'Non-Farm Payrolls = US jobs added (excl. farming). The single most volatile monthly event. Deviation from forecast moves USD, indices, gold.' },
  { id: 'ecb-zone', date: '2026-09-04T11:15:00', currency: 'EUR', title: 'ECB Rate Decision', impact: 'high',
    forecast: '3.00%', previous: '3.00%',
    description: 'European Central Bank rate decision. Moves EUR pairs (EUR/USD, EUR/GBP). Watch hawkish/dovish tone.' },
  { id: 'gdp-uk', date: '2026-09-02T06:00:00', currency: 'GBP', title: 'GDP m/m', impact: 'med',
    forecast: '0.2%', previous: '0.1%',
    description: 'Gross Domestic Product growth for UK. Above forecast → GBP strength, UK index up.' },
  { id: 'cpi-de', date: '2026-09-01T06:00:00', currency: 'EUR', title: 'German CPI m/m', impact: 'med',
    forecast: '0.3%', previous: '0.2%',
    description: 'German CPI is the bellwether for eurozone inflation. Higher CPI → hawkish ECB → EUR up.' },
  { id: 'oil-ops', date: '2026-09-06T14:00:00', currency: 'COM', title: 'OPEC Monthly Report', impact: 'med',
    forecast: '—', previous: '—',
    description: 'OPEC monthly report on oil supply/demand. Affects WTI/Brent, USD/CAD, commodity currencies.' },
  { id: 'ret-us', date: '2026-09-07T12:30:00', currency: 'USD', title: 'Retail Sales m/m', impact: 'med',
    forecast: '0.4%', previous: '0.2%',
    description: 'US retail sales = consumer spending (approx 70% of GDP). Strong → hawkish → USD up.' }
].sort((a, b) => new Date(a.date) - new Date(b.date))

/* ---------- AI CALL (streaming SSE parsing) ---------- */
export async function callNVIDIA(prompt, config = getModelConfig(), { temperature = 0.6, max_tokens = 2048, lang = 'en' } = {}) {
  if (!API_KEY) throw new Error('AI key not configured. Set VITE_NVIDIA_API_KEY in .env')
  const baseUrl = API_BASE || config.baseUrl
  
  // Helper to call the API and parse SSE
  async function makeCall(msgs, tokens) {
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${API_KEY}` },
      body: JSON.stringify({
        model: config.model,
        messages: msgs,
        max_tokens: tokens,
        temperature,
        stream: true
      })
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(`API Error: ${err.error?.message || res.statusText}`)
    }
    const text = await res.text()
    if (text.includes('data:')) {
      let content = ''
      for (const line of text.split('\n')) {
        const trimmed = line.trim()
        if (!trimmed.startsWith('data:')) continue
        const payload = trimmed.slice(5).trim()
        if (payload === '[DONE]') continue
        try {
          const json = JSON.parse(payload)
          const delta = json.choices?.[0]?.delta
          if (delta?.content) content += delta.content
          else if (delta?.reasoning_content) { /* skip chain-of-thought */ }
        } catch { /* ignore keep-alive / non-JSON lines */ }
      }
      return content.trim()
    }
    try {
      const data = JSON.parse(text)
      return data.choices?.[0]?.message?.content || ''
    } catch {
      return text.trim()
    }
  }

  // First call
  const msgs = [
    { role: 'system', content: getSystemPrompt(lang) },
    { role: 'user', content: prompt }
  ]
  let full = await makeCall(msgs, max_tokens)

  // Auto-continue if response seems cut off (no ending punctuation, still has content)
  const needsContinue = full.length > 100 && !/[.!?]\s*$/.test(full.trim()) && !full.includes('[DONE]')
  if (needsContinue) {
    try {
      const contMsgs = [
        { role: 'system', content: getSystemPrompt(lang) },
        { role: 'user', content: prompt },
        { role: 'assistant', content: full },
        { role: 'user', content: lang === 'ar' ? 'أكمل الإجابة من حيث توقفت.' : 'Continue from where you left off.' }
      ]
      const more = await makeCall(contMsgs, 1024)
      if (more) full += '\n\n' + more
    } catch { /* ignore continuation failures */ }
  }

  return full
}

const SYSTEM_PROMPT_EN = `You are MarketScope — a trading mentor who teaches through events and effect analysis.
Explain economic events, how markets react, and practical trading lessons.
Be concise, structured, and give concrete levels/trades where relevant.
OUTPUT FORMAT (use exactly this markdown structure):

## 📊 What This Event Measures
[2-3 sentences plain language]

## 📈 Market Effect Scenarios
| Outcome vs Forecast | Interpretation | Likely Move |
|---------------------|----------------|-------------|
| Above forecast | [why] | [direction + assets] |
| In-line | [why] | [direction + assets] |
| Below forecast | [why] | [direction + assets] |

## 🎯 Key Assets Affected (Ranked by Sensitivity)
1. **Primary**: [pair/instrument] — [why, typical pip range]
2. **Secondary**: [pair/instrument] — [why]
3. **Tertiary**: [pair/instrument] — [why]

## ⏱️ Volatility & Timing
- **First 2-5 min**: [pip range] spike
- **Peak (5-30 min)**: [pip range]
- **Settle (1-4 hrs)**: [behavior]

## 🧠 Trade Planning Checklist
- [ ] Pre-release: identify key levels (support/resistance)
- [ ] Entry logic: [specific rule]
- [ ] Stop: [placement logic]
- [ ] Target: [R-multiple or level]
- [ ] Avoid if: [condition]

Use tables, bullet points, bold for emphasis. No fluff. Teach like a pro showing a junior trader.`

const SYSTEM_PROMPT_AR = `أنت MarketScope — معلم تداول عربي يعلم المستخدمين من خلال الأحداث الاقتصادية وتحليل أثرها على الأسواق.
اشرح الأحداث الاقتصادية وكيف تتفاعل الأسواق معها وقدم دروساً عملية للتداول.
كن موجزاً ومنظماً وقدم مستويات وصفقات ملموسة.
أجب دائماً باللغة العربية بصيغة الماركداون التالية (املأ الفراغات ولا تطرح أسئلة):

## 📊 ماذا يقيس هذا الحدث
[اكتب هنا جملتين إلى ثلاث جمل بلغة بسيطة]

## 📈 سيناريوهات أثر السوق
| النتيجة مقارنة بالتوقع | التفسير | الحركة المتوقعة |
|---------------------|----------------|-------------|
| أعلى من التوقع | [اكتب السبب] | [الاتجاه + الأصول] |
| مطابق للتوقع | [اكتب السبب] | [الاتجاه + الأصول] |
| أقل من التوقع | [اكتب السبب] | [الاتجاه + الأصول] |

## 🎯 الأصول الأكثر تأثراً (حسب الحساسية)
1. **الأساسي**: [الزوج/الأداة] — [السبب ومدى التحرك بالنقاط]
2. **الثانوي**: [الزوج/الأداة] — [السبب]
3. **الثالث**: [الزوج/الأداة] — [السبب]

## ⏱️ التذبذب والتوقيت
- **أول 2-5 دقائق**: قفزة [بالنقاط]
- **الذروة (5-30 دقيقة)**: [بالنقاط]
- **الاستقرار (1-4 ساعات)**: [السلوك]

## 🧠 قائمة تخطيط الصفقة
- [ ] قبل الحدث: حدد المستويات المهمة (دعم/مقاومة)
- [ ] منطق الدخول: [قاعدة محددة]
- [ ] الوقف: [مكانه]
- [ ] الهدف: [نسبة الربح أو مستوى]
- [ ] تجنب الصفقة إذا: [الشرط]

استخدم الجداول والنقاط والتنسيق العريض. بدون حشو. علّم كخبير يعرض على متداول مبتدئ، وأجب مباشرة دون أسئلة.`

/** Pick the system prompt based on language. */
function getSystemPrompt(lang) {
  return lang === 'ar' ? SYSTEM_PROMPT_AR : SYSTEM_PROMPT_EN
}

/** Analyze an economic event: expected market effect, affected assets, key levels, trading approach. */
export async function analyzeEvent(event, lang = 'en') {
  const prompt = lang === 'ar'
    ? `حلل هذا الحدث الاقتصادي لمتداول مبتدئ:

الحدث: ${event.title}
العملة: ${event.currency}
الأهمية: ${event.impact}
التاريخ/الوقت: ${new Date(event.date).toLocaleString('ar-EG')}
التوقع: ${event.forecast || 'غير متوفر'}
السابق: ${event.previous || 'غير متوفر'}
الوصف: ${event.description || ''}

استخدم الهيكل المحدد في تعليمات النظام تماماً.`
    : `Analyze this economic event for a trader learner:

Event: ${event.title}
Currency: ${event.currency}
Impact: ${event.impact}
Date/Time: ${new Date(event.date).toLocaleString()}
Forecast: ${event.forecast || 'n/a'}
Previous: ${event.previous || 'n/a'}
Description: ${event.description || ''}

Use the exact output format specified in your system prompt.`
  return callNVIDIA(prompt, undefined, { max_tokens: 1000, lang })
}

/** "What would happen if X" — simulate a scenario. */
export async function simulateScenario(event, scenario, lang = 'en') {
  const prompt = lang === 'ar'
    ? `الحدث الاقتصادي: ${event.title} (${event.currency}، أهمية ${event.impact})
التوقع: ${event.forecast}. السابق: ${event.previous}.
الوصف: ${event.description || ''}

السيناريو: "${scenario}"

اشرح ما قد يحدث في السوق لو وقع هذا السيناريو.
استخدم نفس تنسيق الماركداون المنظم الخاص بـ analyzeEvent.`
    : `Economic event: ${event.title} (${event.currency}, ${event.impact} impact)
Forecast: ${event.forecast}. Previous: ${event.previous}.
Description: ${event.description || ''}

User scenario: "${scenario}"

Walk through what would likely happen in the market if this scenario occurred.
Use the same structured markdown format as analyzeEvent.`
  return callNVIDIA(prompt, undefined, { max_tokens: 800, lang })
}

/* Explain a concept in simple trading terms — freely, shaped by the user's prompt. */
export async function explainConcept(topic, lang = 'en') {
  const prompt = lang === 'ar'
    ? `أجب على سؤال/طلب المستخدم التداولي بحرية وكما يناسبه، دون قالب ثابت:

"${topic}"

كن معلماً ودّياً للمبتدئين. اجعل الإجابة مناسبة لما طلبه المستخدم تماماً — إن كان سؤالاً مباشراً فأجب عليه مباشرة، وإن طلب شرحاً مفصلاً فافصّل، وإن أراد مثالاً فاضرب مثالاً. استخدم الماركداون (عناوين، نقاط، جداول، تنسيق عريض) فقط عندما يحسّن الوضوح. أجب بالعربية.`
    : `Answer the user's trading question/request freely and exactly as it suits the prompt — no fixed template:

"${topic}"

Be a friendly mentor for beginners. Shape the answer precisely to what the user asked — if it's a direct question, answer directly; if they want detail, go deep; if they want an example, give one. Use markdown (headings, bullets, tables, bold) only where it improves clarity.`
  return callNVIDIA(prompt, undefined, { max_tokens: 700, lang })
}

/** Follow-up chat with role guard — maintains context from previous AI response. */
export async function followUpChat(context, question, lang = 'en') {
  // context: { type: 'analysis'|'simulation'|'concept', event?: object, previousResponse: string }
  const isArabic = lang === 'ar'
  
  const rolePrompt = isArabic
    ? `أنت MarketScope — مساعد تداول متخصص. دورك الوحيد: شرح الأحداث الاقتصادية، تحليل أثر السوق، وتعليم مفاهيم التداول.
لا تجب عن أي سؤال خارج هذا النطاق. إذا سأل المستخدم شيئاً لا علاقة له (سياسة، طبخ، تقنية، شؤون شخصية، إلخ)، أجب بعبارة واحدة بلغة المستخدم:
"أنا مساعد تداول متخصص. لا يمكنني الإجابة عن هذا الموضوع — اسألني عن أحداث اقتصادية، تحليل سوق، أو مفاهيم تداول."`
    : `You are MarketScope — a specialized trading mentor. Your ONLY role: explain economic events, analyze market effects, and teach trading concepts.
Do NOT answer anything outside this scope. If the user asks something unrelated (politics, cooking, tech support, personal advice, etc.), respond with ONE sentence in their language:
"I'm a specialized trading assistant. I can't answer that — ask me about economic events, market analysis, or trading concepts."`

  const contextStr = context.type === 'analysis' && context.event
    ? `Previous analysis was for: ${context.event.title} (${context.event.currency}, ${context.event.impact} impact).\nPrevious response:\n${context.previousResponse}`
    : context.type === 'simulation' && context.event
      ? `Previous simulation was for: ${context.event.title} (${context.event.currency}). Scenario: "${context.scenario}".\nPrevious response:\n${context.previousResponse}`
      : context.type === 'concept'
        ? `Previous concept explained: "${context.topic}".\nPrevious response:\n${context.previousResponse}`
        : `Previous response:\n${context.previousResponse}`

  const prompt = `${rolePrompt}

---
CONTEXT:
${contextStr}

---
USER FOLLOW-UP:
${question}

Answer the follow-up concisely. Stay in your role.`

  return callNVIDIA(prompt, undefined, { max_tokens: 600, lang })
}

export default { analyzeEvent, simulateScenario, explainConcept, followUpChat, fetchLiveCalendar, DEFAULT_CALENDAR }