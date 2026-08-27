// src/services/ai.js - AI analysis & live calendar parsing service

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
    weekStart.setDate(now2.getDate() - now2.getDay()) // Sunday
    weekStart.setHours(0, 0, 0, 0)
    const weekEnd = new Date(weekStart)
    weekEnd.setDate(weekStart.getDate() + 6)
    weekEnd.setHours(23, 59, 59, 999)

    let xmlText = ''
    try {
      const res = await fetch('/api/calendar')
      if (res.ok) {
        const text = await res.text()
        if (text.includes('<weeklyevents') || text.includes('<?xml')) xmlText = text
      }
    } catch { /* ignore, try direct */ }

    if (!xmlText) {
      const res = await fetch('https://nfs.faireconomy.media/ff_calendar_thisweek.xml')
      if (!res.ok) throw new Error('ForexFactory feed failed')
      const text = await res.text()
      if (text.includes('<weeklyevents') || text.includes('<?xml')) xmlText = text
      else throw new Error('ForexFactory returned non-XML response')
    }

    const events = parseForexFactoryXML(xmlText, weekStart, weekEnd)
    if (events.length) {
      calendarCache = { data: events, timestamp: now }
      return events
    }
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

  let idCounter = 1
  eventNodes.forEach(node => {
    const title = node.querySelector('title')?.textContent?.trim() || ''
    const country = node.querySelector('country')?.textContent?.trim() || ''
    const dateStr = node.querySelector('date')?.textContent?.trim() || ''
    const timeStr = node.querySelector('time')?.textContent?.trim() || ''
    const impactStr = node.querySelector('impact')?.textContent?.trim() || 'Low'
    const forecast = node.querySelector('forecast')?.textContent?.trim() || ''
    const previous = node.querySelector('previous')?.textContent?.trim() || ''

    if (!title || !dateStr) return

    let eventDate = parseFFDate(dateStr, timeStr)
    if (!eventDate) return

    if (eventDate < weekStart || eventDate > weekEnd) return

    const currency = countryToCurrency[country] || country || 'USD'

    let impact = 'low'
    const impLower = impactStr.toLowerCase()
    if (impLower.includes('high') || impLower.includes('red')) impact = 'high'
    else if (impLower.includes('medium') || impLower.includes('orange') || impLower.includes('yellow')) impact = 'medium'

    events.push({
      id: `ff-${idCounter++}`,
      title,
      currency,
      impact,
      date: eventDate.toISOString(),
      timeStr: timeStr || 'All Day',
      forecast: forecast || 'n/a',
      previous: previous || 'n/a',
      actual: null,
      description: `${impactStr} impact event for ${currency}. Forecast: ${forecast || 'N/A'}, Previous: ${previous || 'N/A'}.`
    })
  })

  return events.sort((a, b) => new Date(a.date) - new Date(b.date))
}

function parseFFDate(dateStr, timeStr) {
  try {
    const [month, day, year] = dateStr.split('-').map(Number)
    if (!month || !day || !year) return null

    let hours = 12
    let minutes = 0

    if (timeStr && timeStr !== 'All Day' && timeStr !== 'Day 1' && timeStr !== 'Tentative') {
      const match = timeStr.match(/(\d+):(\d+)(am|pm)/i)
      if (match) {
        hours = parseInt(match[1], 10)
        minutes = parseInt(match[2], 10)
        const ampm = match[3].toLowerCase()
        if (ampm === 'pm' && hours < 12) hours += 12
        if (ampm === 'am' && hours === 12) hours = 0
      }
    }

    return new Date(year, month - 1, day, hours, minutes)
  } catch {
    return null
  }
}

export const DEFAULT_CALENDAR = [
  { id: '1', title: 'US Non-Farm Payrolls (NFP)', currency: 'USD', impact: 'high', date: '2026-08-28T12:30:00Z', forecast: '180K', previous: '206K', description: 'Monthly change in employment excluding the farming industry. Primary driver of Fed policy expectations.' },
  { id: '2', title: 'ECB Interest Rate Decision', currency: 'EUR', impact: 'high', date: '2026-08-28T12:15:00Z', forecast: '3.75%', previous: '4.00%', description: 'European Central Bank benchmark rate policy announcement and monetary policy statement.' },
  { id: '3', title: 'US Core CPI (MoM)', currency: 'USD', impact: 'high', date: '2026-08-27T12:30:00Z', forecast: '0.2%', previous: '0.3%', description: 'Measures change in price of goods/services excluding food & energy. Key inflation gauge.' },
  { id: '4', title: 'UK GDP (QoQ)', currency: 'GBP', impact: 'medium', date: '2026-08-27T06:00:00Z', forecast: '0.4%', previous: '0.7%', description: 'Broadest measure of economic activity and overall economic health in the United Kingdom.' },
  { id: '5', title: 'BOJ Core CPI (YoY)', currency: 'JPY', impact: 'medium', date: '2026-08-26T23:30:00Z', forecast: '2.1%', previous: '1.9%', description: 'Bank of Japan preferred inflation metric influencing yield curve control adjustments.' },
  { id: '6', title: 'Australia Employment Change', currency: 'AUD', impact: 'high', date: '2026-08-27T01:30:00Z', forecast: '25.0K', previous: '50.2K', description: 'Change in the number of employed people in Australia. High market sensitivity for AUD pairs.' },
  { id: '7', title: 'Canada Core Retail Sales (MoM)', currency: 'CAD', impact: 'low', date: '2026-08-28T12:30:00Z', forecast: '-0.1%', previous: '0.3%', description: 'Consumer spending excluding autos. Indicator of underlying Canadian retail demand.' },
  { id: '8', title: 'Swiss Producer & Import Prices', currency: 'CHF', impact: 'low', date: '2026-08-26T06:30:00Z', forecast: '0.1%', previous: '0.0%', description: 'Leading indicator of consumer inflation in Switzerland.' },
].sort((a, b) => new Date(a.date) - new Date(b.date))

import { getModelConfig } from '../config/model'

/* ---------- AI CALL (Real-Time Token Streaming) ---------- */
export async function callNVIDIA(prompt, customConfig = null, { temperature = 0.6, max_tokens = 2048, lang = 'en', onChunk = null } = {}) {
  const config = customConfig || getModelConfig()
  const isLocalOmniRoute = config.baseUrl.includes('localhost') || config.baseUrl.includes('127.0.0.1')

  const targetUrl = isLocalOmniRoute 
    ? `${config.baseUrl}/chat/completions` 
    : '/api/ai'

  async function makeCall(msgs, tokens, chunkCb) {
    const headers = { 'Content-Type': 'application/json' }
    if (isLocalOmniRoute) {
      headers['Authorization'] = `Bearer ${config.apiKey}`
    }

    const res = await fetch(targetUrl, {
      method: 'POST',
      headers,
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

    let accumulated = ''

    // 1. Try real-time stream reader if available
    if (res.body && res.body.getReader) {
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed.startsWith('data:')) continue
          const payload = trimmed.slice(5).trim()
          if (payload === '[DONE]') continue
          try {
            const json = JSON.parse(payload)
            const delta = json.choices?.[0]?.delta
            if (delta?.content) {
              accumulated += delta.content
              if (chunkCb) chunkCb(accumulated)
            }
          } catch { /* ignore non-JSON */ }
        }
      }

      if (buffer.trim().startsWith('data:')) {
        const payload = buffer.trim().slice(5).trim()
        if (payload !== '[DONE]') {
          try {
            const json = JSON.parse(payload)
            const delta = json.choices?.[0]?.delta
            if (delta?.content) {
              accumulated += delta.content
              if (chunkCb) chunkCb(accumulated)
            }
          } catch { /* ignore */ }
        }
      }

      if (accumulated.trim()) return accumulated.trim()
    }

    // 2. Fallback for environments where body.getReader is unavailable
    const text = await res.text()
    if (text.includes('data:')) {
      for (const line of text.split('\n')) {
        const trimmed = line.trim()
        if (!trimmed.startsWith('data:')) continue
        const payload = trimmed.slice(5).trim()
        if (payload === '[DONE]') continue
        try {
          const json = JSON.parse(payload)
          const delta = json.choices?.[0]?.delta
          if (delta?.content) {
            accumulated += delta.content
            if (chunkCb) chunkCb(accumulated)
          }
        } catch { /* ignore */ }
      }
      return accumulated.trim()
    }
    try {
      const data = JSON.parse(text)
      const content = data.choices?.[0]?.message?.content || ''
      if (chunkCb) chunkCb(content)
      return content
    } catch {
      if (chunkCb) chunkCb(text.trim())
      return text.trim()
    }
  }

  const msgs = [
    { role: 'system', content: getSystemPrompt(lang) },
    { role: 'user', content: prompt }
  ]
  let full = await makeCall(msgs, max_tokens, onChunk)

  const needsContinue = full.length > 100 && !/[.!?]\s*$/.test(full.trim()) && !full.includes('[DONE]')
  if (needsContinue) {
    try {
      const contMsgs = [
        { role: 'system', content: getSystemPrompt(lang) },
        { role: 'user', content: prompt },
        { role: 'assistant', content: full },
        { role: 'user', content: lang === 'ar' ? 'أكمل الإجابة من حيث توقفت بدون تكرار.' : 'Continue from where you left off without repeating.' }
      ]
      let continuedText = full
      const more = await makeCall(contMsgs, 1024, (newPart) => {
        if (onChunk) onChunk(continuedText + '\n\n' + newPart)
      })
      if (more) full += '\n\n' + more
    } catch { /* ignore continuation failures */ }
  }

  return full
}

const SYSTEM_PROMPT_EN = `You are MarketScope — an elite macroeconomic trading analyst and active trader mentor.
Your goal is to provide deep, actionable, highly specific financial insights. NEVER give generic, vague, or repetitive advice.

CRITICAL RULES FOR ALL ANSWERS:
1. ALWAYS NAME SPECIFIC REAL-WORLD TOOLS & PLATFORMS:
   - When discussing analysis or execution, name exact software: TradingView, MetaTrader 5 (MT5), Bloomberg Terminal, Reuters Eikon, ForexFactory, Finviz, Bookmap, OrderFlow / Exocharts. NEVER say "use market analysis programs" without naming them!
2. ALWAYS NAME SPECIFIC FINANCIAL INSTRUMENTS & PAIRS:
   - Name exact assets: EUR/USD, USD/JPY, GBP/USD, AUD/USD, XAU/USD (Gold), WTI Crude Oil, S&P 500 (SPX), US 10-Year Treasury Yields (TNX).
3. PROVIDE REAL NUMERIC VOLATILITY & PRICE LEVELS:
   - Give realistic pip/point movements (e.g. 40-70 pips in EUR/USD, $15-25 move in Gold) and specific technical concepts (e.g. 15-minute high/low breakout, 50% Fibonacci retest, VWAP rejection, OCO pending orders).
4. NO DUMMY PLACEHOLDERS OR GENERIC REPETITION:
   - Do NOT output placeholder text like "[why]" or "[direction]". Fill every single section with concrete analysis based on current market fundamentals.

REQUIRED MARKDOWN OUTPUT FORMAT:

## 📊 What This Event Measures
Provide 2-3 clear sentences explaining the macroeconomic metric, what central bank (Fed, ECB, BOJ, RBA) watches it, and why it shifts institutional sentiment.

## 📈 Market Effect Scenarios
| Outcome vs Forecast | Macro Interpretation | Likely Move & Primary Pairs |
|---------------------|----------------------|-----------------------------|
| Above Forecast | [Detailed hawk/dove shift] | [Bullish/Bearish direction + specific pairs like EUR/USD, USD/JPY] |
| In-line | [Market priced-in effect] | [Rangebound / consolidation in specific pairs] |
| Below Forecast | [Detailed macro shift] | [Bullish/Bearish direction + specific pairs like EUR/USD, XAU/USD] |

## 🎯 Key Assets Affected (Ranked by Sensitivity)
1. **Primary**: **EUR/USD** (or relevant pair) — Specific pip range expectation & sensitivity reason.
2. **Secondary**: **XAU/USD (Gold)** — How dollar strength / yield shifts impact bullion.
3. **Tertiary**: **S&P 500 (SPX) / US10Y** — Equity index / bond yield reaction.

## ⏱️ Volatility & Timing Breakdown
- **First 2-5 min (News Spike)**: Initial 30-60 pip knee-jerk reaction. High slippage zone.
- **Peak (5-30 min)**: Trend continuation or fakeout reversal. Best entry window on 5m chart in TradingView/MT5.
- **Settle (1-4 hrs)**: Post-news consolidation around daily VWAP / Key Support-Resistance.

## 🧠 Trade Execution Checklist
- [ ] **Chart Setup**: Mark key 1-hour support & resistance levels on **TradingView** or **MetaTrader 5**.
- [ ] **News Strategy**: Wait for the 5-minute post-release candle close before entering (avoid trading during the spread-widening instant spike).
- [ ] **Risk Management**: Place Stop Loss 15-20 pips beyond the news spike wick. Risk max 1-2% per trade.
- [ ] **Execution Tools**: Use OCO (One-Cancels-the-Other) pending orders or limit orders on MT5/cTrader.`

const SYSTEM_PROMPT_AR = `أنت MarketScope — خبير تحليلات اقتصادية ومتداول محترف وموجّه أسواق عالمية.
هدفك تقديم تحليلات مالية عميقة، محدودة بالدقة، وعملية جداً. يُمنع منعاً باتاً تقديم نصائح عامة أو مكررة أو مبهمة!

قواعد حاسمة لجميع الإجابات:
1. اذكر دائماً أسمـاء البرامج والأدوات الحقيقية بالكامل:
   - عند ذكر برامج التحليل أو التداول، اذكر دائماً الأسماء التالية صراحة: TradingView، MetaTrader 5 (MT5)، Bloomberg Terminal، ForexFactory، Finviz، Bookmap، Exocharts. لا تقل أبداً "استخدم برامج تحليليـة" دون ذكر أسمائها!
2. اذكر دائماً الأزواج والأدوات المالية المحددة بالاسم:
   - اذكر دائماً أزواج ومؤشرات صريحة: EUR/USD, USD/JPY, GBP/USD, AUD/USD, XAU/USD (الذهب), النفط WTI, مؤشر S&P 500, عوائد السندات الأمريكية US10Y.
3. قدم أرقام تذبذب ومستويات حقيقية بالنقاط:
   - قدم تحركات واقعية بالنقاط (مثلاً: 40-70 نقطة لـ EUR/USD، 15-25 دولار للذهب) واستراتيجيات دقيقة (مثل كسر قمة/قاع شمعة 5 دقائق، إعادة اختبار الفيبوناتشي 50%، الارتداد من متوسط VWAP، أوامر OCO).
4. لا تستخدم نصوص مبهمة أو تكرار عام:
   - لا تترك أي خانات فارغة أو مكررة. املأ كل قسم بتحليل اقتصادي وفني دقيق بناءً على البيانات.

تنسيق الماركداون المطلوب:

## 📊 ماذا يقيس هذا الحدث
2-3 جمل تشرح المؤشر الاقتصادي، والبنك المركزي المتابع له (الفيدرالي، الأوروبي، الياباني)، وكيف يغير معنويات المؤسسات المالية.

## 📈 سيناريوهات أثر السوق
| النتيجة مقارنة بالتوقعات | التفسير الاقتصادي الكلي | الحركة المتوقعة والأزواج الرئيسية |
|-------------------------|-------------------------|------------------------------------|
| أعلى من التوقع | [تفسير التضخم/الفائدة] | [صعود/هبوط محدد + أزواج صريحة مثل EUR/USD, USD/JPY] |
| مطابق للتوقع | [تأثير استيعاب السوق للخبر] | [تذبذب جانبي في نطاق محدد] |
| أقل من التوقع | [تفسير التيسير/الضعف] | [صعود/هبوط محدد + أزواج صريحة مثل EUR/USD, XAU/USD] |

## 🎯 الأصول الأكثر تأثراً (حسب الحساسية)
1. **الأساسي**: **EUR/USD** (أو الزوج المعني) — نطاق تحرك بالنقاط وحساسية الزوج.
2. **الثانوي**: **XAU/USD (الذهب)** — أثر حركة الدولار وعوائد السندات على المعدن الأصفر.
3. **الثالث**: **S&P 500 / US10Y** — رد فعل مؤشرات الأسهم وعوائد السندات.

## ⏱️ تفكيك التذبذب والتوقيت
- **أول 2-5 دقائق (قفزة الخبر)**: قفزة مفاجئة 30-60 نقطة مع اتساع الفارق السعري (Spread).
- **الذروة (5-30 دقيقة)**: استمرار الاتجاه أو الانعكاس الوهمي. أفضل نافذة دخول على إطار 5 دقائق في TradingView أو MT5.
- **الاستقرار (1-4 ساعات)**: التماسك بعد الخبر حول خط الفوليم VWAP أو مستويات الدعم والمقاومة.

## 🧠 قائمة تنفيذ الصفقة
- [ ] **إعداد الرسم البياني**: حدد مستويات الدعم والمقاومة الرئيسية على إطار 1 ساعة في **TradingView** أو **MetaTrader 5**.
- [ ] **استراتيجية الأخبار**: انتظر إغلاق شمعة 5 دقائق بعد الخبر قبل الدخول (لتجنب الانزلاق السعري Instant Spike).
- [ ] **إدارة المخاطر**: ضع أمر وقف الخسارة على بعد 15-20 نقطة خارج ذيل شمعة الخبر. مخاطرة لا تتجاوز 1-2% من الحساب.
- [ ] **أدوات التنفيذ**: استخدم أوامر OCO المعلقة (One-Cancels-the-Other) أو الأوامر المحددة على منصة MT5.`

function getSystemPrompt(lang) {
  return lang === 'ar' ? SYSTEM_PROMPT_AR : SYSTEM_PROMPT_EN
}

export async function analyzeEvent(event, lang = 'en', onChunk = null) {
  const prompt = lang === 'ar'
    ? `حلل هذا الحدث الاقتصادي بشكل عميق ومباشر لمتداول:

الحدث: ${event.title}
العملة: ${event.currency}
الأهمية: ${event.impact}
التاريخ/الوقت: ${new Date(event.date).toLocaleString('ar-EG')}
التوقع: ${event.forecast || 'غير متوفر'}
السابق: ${event.previous || 'غير متوفر'}
الوصف: ${event.description || ''}

اذكر أسماء الأدوات والمنصات المحددة بالاسم (مثل TradingView, MetaTrader 5, Bloomberg) وأزواج العملات المحددة (مثل EUR/USD, USD/JPY, XAU/USD) وأرقام النقاط المتوقعة دون تكرار أو عبارات عامة.`
    : `Analyze this economic event with high-level professional detail for a trader:

Event: ${event.title}
Currency: ${event.currency}
Impact: ${event.impact}
Date/Time: ${new Date(event.date).toLocaleString()}
Forecast: ${event.forecast || 'n/a'}
Previous: ${event.previous || 'n/a'}
Description: ${event.description || ''}

Always state exact tool names (e.g. TradingView, MetaTrader 5, Bloomberg), specific currency pairs/assets (e.g. EUR/USD, USD/JPY, Gold XAU/USD), and precise pip targets without any vague generalities.`
  return callNVIDIA(prompt, undefined, { max_tokens: 1200, lang, onChunk })
}

export async function simulateScenario(event, scenario, lang = 'en', onChunk = null) {
  const prompt = lang === 'ar'
    ? `الحدث الاقتصادي: ${event.title} (${event.currency}، أهمية ${event.impact})
التوقع: ${event.forecast}. السابق: ${event.previous}.

السيناريو المحاكى: "${scenario}"

اذكر بالتفصيل ما سيحدث في السوق لو تحقق هذا السيناريو. اذكر أزواج محددة بالاسم (مثل EUR/USD, USD/JPY, XAU/USD) ومنصات تحليل محددة (مثل TradingView, MetaTrader 5) واستراتيجية تداول واضحة.`
    : `Economic event: ${event.title} (${event.currency}, ${event.impact} impact)
Forecast: ${event.forecast}. Previous: ${event.previous}.

Simulated Scenario: "${scenario}"

Explain in realistic detail what happens to specific market instruments (e.g., EUR/USD, USD/JPY, Gold XAU/USD, S&P 500). Name actual platforms like TradingView or MetaTrader 5 and concrete pip movements.`
  return callNVIDIA(prompt, undefined, { max_tokens: 1000, lang, onChunk })
}

export async function explainConcept(topic, lang = 'en', onChunk = null) {
  const prompt = lang === 'ar'
    ? `أجب على سؤال/طلب المستخدم التداولي بشكل عميق وعملي ومباشر:

"${topic}"

كن معلماً خبيراً. اذكر أمثلة واقعية، منصات محددة بالاسم (مثل TradingView, MetaTrader 5, Bloomberg Terminal, ForexFactory)، أزواج عملات صريحة، واستراتيجيات قابلة للتطبيق. لا تستخدم أبداً عبارات مبهمة مثل "برامج تحليليـة" دون ذكر أسمائها!`
    : `Answer the user's trading question/request with high-level practical depth:

"${topic}"

Be an expert mentor. Provide real-world examples, name specific software/platforms (e.g., TradingView, MetaTrader 5, Bloomberg Terminal, ForexFactory, Finviz), specific currency pairs, and actionable strategies. Never use vague phrases like "analysis programs" without naming the actual software!`
  return callNVIDIA(prompt, undefined, { max_tokens: 1000, lang, onChunk })
}

export async function followUpChat(context, question, lang = 'en', onChunk = null) {
  const isArabic = lang === 'ar'
  
  const rolePrompt = isArabic
    ? `أنت MarketScope — مساعد تداول متخصص. دورك: تقديم إجابات دقيقة وعميقة ومباشرة حول الأحداث الاقتصادية، تحليل أثر السوق، واستراتيجيات التداول.
اذكر دائماً أسماء برامج ومنصات حقيقية (TradingView, MetaTrader 5, Bloomberg) وأزواج عملات صريحة (EUR/USD, USD/JPY, XAU/USD).`
    : `You are MarketScope — an expert trading analyst and mentor.
Provide direct, deep, actionable answers. Always name exact software (TradingView, MetaTrader 5, Bloomberg) and specific financial assets (EUR/USD, USD/JPY, Gold XAU/USD).`

  const contextStr = context.type === 'analysis' && context.event
    ? `Previous analysis for: ${context.event.title} (${context.event.currency}).\nPrevious AI response summary:\n${context.previousResponse}`
    : `Previous AI response:\n${context.previousResponse}`

  const prompt = `${rolePrompt}

CONTEXT:
${contextStr}

USER FOLLOW-UP QUESTION:
${question}

Answer the follow-up with concrete, specific trading details. Name specific tools and assets.`

  return callNVIDIA(prompt, undefined, { max_tokens: 800, lang, onChunk })
}

export default { analyzeEvent, simulateScenario, explainConcept, followUpChat, fetchLiveCalendar, DEFAULT_CALENDAR }
