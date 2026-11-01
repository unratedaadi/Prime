import { useEffect, useReducer, useRef, useState } from 'react'
import { DASHBOARD_STORAGE_KEY, initialDashboard, reduceDashboard, restoreDashboard, serializeDashboard } from './dashboardState.js'
import { describeCommand, describeResult, parseLocalCommand, requestAgent, requestAssistant, normalizeAssistantInput } from './localAgent.js'
import { COMMAND_HISTORY_KEY, appendCommandHistory, filterCommandHistory, pruneCommandHistory, restoreCommandHistory } from './commandHistory.js'
import { duplicateAutomation, toggleAutomation, executeAutomation, restoreAutomations } from './automationStore.js'
import { initialVoiceControl, reduceVoiceControl } from './voiceControl.js'
import { applySettingsPatch, PRIME_SETTINGS_KEY, restorePrimeSettings, shouldStoreTranscript } from './primeSettings.js'
import { parseDashboardLocalCommand } from './localDashboardTools.js'
import { isPushToTalkShortcut } from './voiceShortcut.js'
import { clearPrimeLocalData } from './localPrivacy.js'
import { startAutoConnection } from './autoConnection.js'
import './App.css'

const disconnectedAgent = { connected: false, paused: false, device: null }
const formatTime = (at) => new Date(at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
const voiceStates = ['Idle', 'Listening', 'Processing', 'Speaking', 'Needs confirmation', 'Error']
const AUTOMATIONS_KEY = 'prime.automations.v1'
const INTEGRATION_CONSENT_KEY = 'prime.integration-consent.v1'
const ONBOARDING_KEY = 'prime.onboarding.v1'
const NOTES_KEY = 'prime.local-notes.v1'
const focusAutomation = { id: 'focus-mode', name: 'Start focus mode', trigger: 'start focus mode', enabled: true, actions: ['Open Spotify', 'Set a timer for 25 minutes'], confirmations: [] }
const safetyGroups = [
  ['Safe actions', 'Run immediately from the fixed allowlist.', ['Read system status', 'Open an approved app', 'Search Google', 'Display a local notification']],
  ['Confirmation required', 'Shown exactly before a sensitive integration could act.', ['Send a message or email', 'Create or change calendar data', 'Change a system setting', 'Share personal data']],
  ['Blocked actions', 'Not executable by PRIME.', ['Arbitrary Terminal or shell commands', 'Arbitrary file deletion', 'Payments or purchases', 'Unknown app and script requests']],
]
const permissionExplanations = [
  ['Microphone', 'Lets push-to-talk hear a command. macOS asks separately when an audio feature is used.'],
  ['Notifications', 'Lets PRIME display its own local notifications; it does not read other apps’ notifications.'],
  ['Calendar', 'Would be required before PRIME can read or create events. Calendar data is not connected today.'],
  ['Email', 'Would be required before an approved mail integration could access a mailbox. No mailbox is connected.'],
  ['Accessibility', 'Would be required for approved UI automation. It is not enabled or requested by this dashboard.'],
]

function loadSavedDashboard() {
  try { return { state: restoreDashboard(localStorage.getItem(DASHBOARD_STORAGE_KEY)), error: '' } }
  catch { return { state: initialDashboard, error: 'Saved profiles could not be loaded. Existing browser data is untouched; changes in this session will not be saved.' } }
}

function Modal({ title, onClose, children, locked = false }) {
  const ref = useRef(null)
  useEffect(() => {
    const dialog = ref.current
    dialog.showModal()
    dialog.querySelector('[autofocus], input:not([type=radio]), .modal-actions button')?.focus()
    return () => dialog.close()
  }, [])
  return <dialog ref={ref} className="modal" aria-labelledby="modal-title" onCancel={(event) => { event.preventDefault(); if (!locked) onClose() }} onClick={(event) => { if (event.target === event.currentTarget && !locked) onClose() }}>
    <div className="modal-header"><h2 id="modal-title">{title}</h2><button type="button" className="icon-button" aria-label="Close dialog" disabled={locked} onClick={onClose}>×</button></div>
    {children}
  </dialog>
}

function App() {
  const [saved] = useState(loadSavedDashboard)
  const [state, setState] = useState(saved.state)
  const stateRef = useRef(saved.state)
  const [storageError, setStorageError] = useState(saved.error)
  const [agent, setAgent] = useState(disconnectedAgent)
  const [bridgeReady, setBridgeReady] = useState(false)
  const [connectionError, setConnectionError] = useState('')
  const [view, setView] = useState('command')
  const [busy, setBusy] = useState(false)
  const busyRef = useRef(false)
  const [error, setError] = useState('')
  const [command, setCommand] = useState('')
  const [result, setResult] = useState('')
  const [assistantConfirmation, setAssistantConfirmation] = useState(null)
  const [voiceStatus, setVoiceStatus] = useState({ available: false, message: 'Checking PRIME Voice Assistant…' })
  const [showAllActivity, setShowAllActivity] = useState(false)
  const [audit, setAudit] = useState(null)
  const [commandHistory, setCommandHistory] = useState(() => { try { return pruneCommandHistory(restoreCommandHistory(localStorage.getItem(COMMAND_HISTORY_KEY)), restorePrimeSettings(localStorage.getItem(PRIME_SETTINGS_KEY)).autoDeleteDays) } catch { return [] } })
  const [historyQuery, setHistoryQuery] = useState('')
  const [historyStatus, setHistoryStatus] = useState('all')
  const [historyType, setHistoryType] = useState('all')
  const [historyDate, setHistoryDate] = useState('all')
  const [automations, setAutomations] = useState(() => { try { return restoreAutomations(localStorage.getItem(AUTOMATIONS_KEY), [focusAutomation]) } catch { return [focusAutomation] } })
  const [settings, setSettings] = useState(() => { try { return restorePrimeSettings(localStorage.getItem(PRIME_SETTINGS_KEY)) } catch { return restorePrimeSettings(null) } })
  const [localConsent, setLocalConsent] = useState(() => { try { return { microphone: false, notifications: false, calendar: false, email: false, accessibility: false, ...JSON.parse(localStorage.getItem(INTEGRATION_CONSENT_KEY) ?? '{}') } } catch { return { microphone: false, notifications: false, calendar: false, email: false, accessibility: false } } })
  const [deleteDataOpen, setDeleteDataOpen] = useState(false)
  const [automationEditor, setAutomationEditor] = useState(null)
  const [automationLogs, setAutomationLogs] = useState([])
  const [onboardingOpen, setOnboardingOpen] = useState(() => { try { return localStorage.getItem(ONBOARDING_KEY) !== 'complete' } catch { return true } })
  const [notes, setNotes] = useState(() => { try { const value = JSON.parse(localStorage.getItem(NOTES_KEY) ?? '[]'); return Array.isArray(value) ? value.filter((item) => item && typeof item.id === 'string' && typeof item.content === 'string' && Number.isFinite(Date.parse(item.at))).slice(0, 30) : [] } catch { return [] } })
  const [timer, setTimer] = useState(null)
  const [voiceControl, dispatchVoice] = useReducer(reduceVoiceControl, initialVoiceControl)
  const [voiceActivity, setVoiceActivity] = useState([])
  const recognitionRef = useRef(null)
  const voiceStateRef = useRef(initialVoiceControl)
  const voiceResetRef = useRef(null)
  const startPushToTalkRef = useRef(null)
  const speakDashboardFeedbackRef = useRef(null)

  startPushToTalkRef.current = startPushToTalk
  speakDashboardFeedbackRef.current = speakDashboardFeedback

  function dispatch(action) {
    const next = reduceDashboard(stateRef.current, action)
    stateRef.current = next
    setState(next)
    if (storageError) return
    try { localStorage.setItem(DASHBOARD_STORAGE_KEY, serializeDashboard(next)) }
    catch { setStorageError('Browser storage is unavailable. Your current changes will be lost when this page closes.') }
  }

  useEffect(() => startAutoConnection({
    request: requestAgent,
    onState: (next) => { setAgent(next); setBridgeReady(next.connected) },
    onError: setConnectionError,
  }), [])

  useEffect(() => {
    const prune = () => setCommandHistory((items) => {
      const retained = pruneCommandHistory(items, settings.autoDeleteDays)
      try { localStorage.setItem(COMMAND_HISTORY_KEY, JSON.stringify(retained)) } catch { setStorageError('Command history could not be saved locally.') }
      return retained
    })
    prune()
    const interval = setInterval(prune, 60_000)
    return () => clearInterval(interval)
  }, [settings.autoDeleteDays])

  useEffect(() => {
    voiceStateRef.current = voiceControl
  }, [voiceControl])

  useEffect(() => () => {
    recognitionRef.current?.abort?.()
    globalThis.window?.speechSynthesis?.cancel?.()
    if (voiceResetRef.current) clearTimeout(voiceResetRef.current)
  }, [])

  useEffect(() => {
    const keydown = (event) => {
      if (event.repeat || event.target?.matches?.('input, textarea, select, button')) return
      if (!isPushToTalkShortcut(event, settings.pushToTalkShortcut)) return
      event.preventDefault()
      startPushToTalkRef.current?.()
    }
    const keyup = (event) => {
      if (settings.pushToTalkShortcut === 'Space' && event.key === ' ') stopPushToTalk()
      if (settings.pushToTalkShortcut === '⌘⇧P' && event.key.toLowerCase() === 'p') stopPushToTalk()
    }
    window.addEventListener('keydown', keydown)
    window.addEventListener('keyup', keyup)
    return () => { window.removeEventListener('keydown', keydown); window.removeEventListener('keyup', keyup) }
  }, [settings.pushToTalkShortcut, busy])

  useEffect(() => {
    if (!timer) return undefined
    const interval = setInterval(() => {
      if (Date.now() < timer.endsAt) return
      setTimer(null)
      setResult(`Timer complete: ${timer.minutes} minute${timer.minutes === 1 ? '' : 's'}.`)
      dispatchVoice({ type: 'speaking' })
      speakDashboardFeedbackRef.current?.('Timer complete, boss.')
    }, 1000)
    return () => clearInterval(interval)
  }, [timer])

  useEffect(() => {
    let active = true
    const refresh = async () => {
      try {
        const next = await requestAgent('/voice-status')
        if (active && next.voice) setVoiceStatus(next.voice)
      } catch {
        if (active) setVoiceStatus({ available: false, message: 'PRIME Voice Assistant is not reporting a status.' })
      }
    }
    void refresh()
    const timer = setInterval(() => { void refresh() }, 5_000)
    return () => { active = false; clearInterval(timer) }
  }, [])

  async function withAgent(operation) {
    if (busyRef.current) return
    busyRef.current = true
    setBusy(true)
    setError('')
    try { await operation() }
    catch (cause) {
      setError(cause.message)
      dispatch({ type: 'record-activity', title: 'Agent request not completed', detail: cause.message })
      try { setAgent(await requestAgent()); setBridgeReady(true) } catch { setAgent(disconnectedAgent); setBridgeReady(false) }
    } finally { busyRef.current = false; setBusy(false) }
  }

  function togglePause() {
    withAgent(async () => {
      const next = await requestAgent('/pause', { paused: !agent.paused })
      setAgent(next)
      dispatch({ type: 'record-activity', title: next.paused ? 'Dashboard commands paused' : 'Dashboard commands resumed', detail: 'This affects this local dashboard only; the native Mac voice listener remains independent.' })
    })
  }

  function submitCommand(event) {
    event.preventDefault()
    if (busyRef.current) return
    const request = normalizeAssistantInput(command)
    const routine = automations.find((item) => item.enabled && item.trigger.trim().toLowerCase() === request.toLowerCase())
    if (routine) { void runAutomation(routine); setCommand(''); return }
    const localTool = parseDashboardLocalCommand(request)
    if (localTool) { runDashboardLocalTool(localTool, request); setCommand(''); return }
    const parsed = parseLocalCommand(request)
    if (!parsed) { void runAssistantRequest(request); return }
    if (!agent.connected || agent.paused) { setError(agent.paused ? 'Resume dashboard commands first.' : 'PRIME is starting its local helper. Try again in a moment. Timers and notes work offline.'); return }
    withAgent(async () => {
      const next = await requestAgent('/run', { command: parsed })
      const message = describeResult(parsed, next.data)
      setResult(message)
      setCommand('')
      dispatch({ type: 'record-activity', title: describeCommand(parsed), detail: message })
    })
  }

  async function runAssistantRequest(text, spoken = false) {
    if (busyRef.current) return
    if (!agent.connected || agent.paused) {
      const message = agent.paused ? 'Resume dashboard commands first.' : 'PRIME is starting its local helper. Timers and notes work offline.'
      setError(message)
      if (spoken) dispatchVoice({ type: 'error', message })
      return
    }
    busyRef.current = true
    setBusy(true)
    setError('')
    setResult('')
    setAssistantConfirmation(null)
    if (spoken) dispatchVoice({ type: 'recognized', transcript: text, detectedCommand: 'Ask PRIME', intendedAction: 'Process your request on this Mac' })
    try {
      const reply = await requestAssistant(text)
      const status = reply.needsConfirmation ? 'pending' : ['blocked', 'error', 'unavailable'].includes(reply.kind) ? 'error' : 'success'
      if (reply.needsConfirmation) setAssistantConfirmation({ message: reply.message })
      else if (status === 'error') setError(reply.message)
      else setResult(reply.message)
      setCommand('')
      recordCommandHistory({ transcript: text, intent: 'Ask PRIME', target: 'Local assistant', type: 'assistant', status, result: reply.message, confirmation: reply.message })
      if (spoken) {
        recordVoiceActivity('PRIME reply', reply.message)
        dispatchVoice({ type: 'speaking' })
        speakDashboardFeedback(reply.message, reply.needsConfirmation ? 'confirm' : 'idle')
      }
    } catch (cause) {
      setError(cause.message)
      recordCommandHistory({ transcript: text, intent: 'Ask PRIME', target: 'Local assistant', type: 'assistant', status: 'error', result: cause.message })
      if (spoken) dispatchVoice({ type: 'error', message: cause.message })
    } finally { busyRef.current = false; setBusy(false) }
  }

  function runQuickAction(text) {
    const parsed = parseLocalCommand(text)
    if (!parsed || !agent.connected || agent.paused) { setCommand(text); return }
    withAgent(async () => {
      const next = await requestAgent('/run', { command: parsed })
      const message = describeResult(parsed, next.data)
      setResult(message)
      dispatch({ type: 'record-activity', title: describeCommand(parsed), detail: message })
    })
  }

  function recordVoiceActivity(title, detail) {
    setVoiceActivity((items) => [{ id: crypto.randomUUID(), at: new Date().toISOString(), title, detail }, ...items].slice(0, 5))
  }

  function recordCommandHistory(record) {
    if (!shouldStoreTranscript(settings)) return
    setCommandHistory((items) => {
      const next = appendCommandHistory(items, record)
      try { localStorage.setItem(COMMAND_HISTORY_KEY, JSON.stringify(next)) } catch { setStorageError('Command history could not be saved locally.') }
      return next
    })
  }

  function saveAutomations(next) {
    setAutomations(next)
    try { localStorage.setItem(AUTOMATIONS_KEY, JSON.stringify(next)) } catch { setStorageError('Routines could not be saved locally.') }
  }

  function updateSettings(patch) {
    const next = applySettingsPatch(settings, patch)
    setSettings(next)
    if (next.autoDeleteDays !== settings.autoDeleteDays && next.autoDeleteDays > 0) setCommandHistory((items) => {
      const retained = pruneCommandHistory(items, next.autoDeleteDays)
      try { localStorage.setItem(COMMAND_HISTORY_KEY, JSON.stringify(retained)) } catch { setStorageError('History retention could not be saved locally.') }
      return retained
    })
    try { localStorage.setItem(PRIME_SETTINGS_KEY, JSON.stringify(next)) } catch { setStorageError('Settings could not be saved locally.') }
  }

  function deleteAllLocalData() {
    if (busyRef.current) { setError('Wait for the current action to finish before deleting local data.'); return }
    try { clearPrimeLocalData(localStorage) }
    catch { setStorageError('Local data could not be fully deleted. Check storage access and try again.'); return }
    cancelVoiceControl()
    stateRef.current = initialDashboard
    setState(initialDashboard)
    setCommandHistory([])
    setAutomations([focusAutomation])
    setSettings(restorePrimeSettings(null))
    setLocalConsent({ microphone: false, notifications: false, calendar: false, email: false, accessibility: false })
    setNotes([])
    setTimer(null)
    setVoiceActivity([])
    setAutomationLogs([])
    setAudit(null)
    setCommand('')
    setAutomationEditor(null)
    setHistoryQuery('')
    setHistoryStatus('all')
    setHistoryType('all')
    setHistoryDate('all')
    setStorageError('')
    setError('')
    setAssistantConfirmation(null)
    setResult('Local dashboard data deleted. Native listener history and agent audit logs are managed separately.')
    setDeleteDataOpen(false)
  }

  function toggleLocalConsent(key) {
    setLocalConsent((current) => {
      const next = { ...current, [key]: !current[key] }
      try { localStorage.setItem(INTEGRATION_CONSENT_KEY, JSON.stringify(next)) } catch { setStorageError('Integration consent could not be saved locally.') }
      return next
    })
  }

  async function copyHistoryTranscript(transcript) {
    try { await navigator.clipboard.writeText(transcript); setResult('Transcript copied locally.') }
    catch { setError('PRIME could not copy this transcript. Your browser did not grant clipboard access.') }
  }

  function replayHistoryConfirmation(entry) {
    dispatchVoice({ type: 'speaking' })
    speakDashboardFeedback(entry.confirmation || entry.result || 'No spoken confirmation was saved for this command.')
  }

  function saveAutomation(event) {
    event.preventDefault()
    const name = automationEditor.name.trim()
    const trigger = automationEditor.trigger.trim()
    const actions = automationEditor.actions.split('\n').map((action) => action.trim()).filter(Boolean).slice(0, 6)
    if (!name || !trigger || !actions.length) return
    const next = { id: automationEditor.id ?? crypto.randomUUID(), name, trigger, actions, enabled: automationEditor.enabled, confirmations: actions.filter((action) => /do not disturb|message|calendar|email|delete/i.test(action)) }
    saveAutomations(automationEditor.id ? automations.map((item) => item.id === next.id ? next : item) : [next, ...automations])
    setAutomationEditor(null)
  }

  async function runAutomation(automation) {
    if (busyRef.current) return
    busyRef.current = true
    setBusy(true)
    setError('')
    const at = new Date().toISOString()
    let status
    try {
      // Validate connectivity before executing any part of a mixed routine.
      const needsAgent = automation.actions.some((text) => typeof text === 'string' && parseLocalCommand(text))
      if (needsAgent && (!agent.connected || agent.paused)) throw new Error(agent.paused ? 'Resume dashboard commands first.' : 'PRIME is starting its local helper. Try again in a moment.')
      const completed = await executeAutomation(automation, async (step, text) => {
        if (step.type === 'timer.start' || step.type === 'note.create') {
          runDashboardLocalTool(step, text)
        } else {
          const next = await requestAgent('/run', { command: step })
          dispatch({ type: 'record-activity', title: describeCommand(step), detail: describeResult(step, next.data) })
        }
      })
      status = `Completed ${completed} action${completed === 1 ? '' : 's'}.`
      setResult(`${automation.name}: ${status}`)
    } catch (cause) { status = cause.message; setError(status) }
    finally { busyRef.current = false; setBusy(false) }
    setAutomationLogs((items) => [{ id: crypto.randomUUID(), at, name: automation.name, status }, ...items].slice(0, 20))
  }

  function completeOnboarding() {
    try { localStorage.setItem(ONBOARDING_KEY, 'complete') } catch { setStorageError('Welcome preference could not be saved locally.') }
    setOnboardingOpen(false)
  }

  function saveNotes(next) {
    setNotes(next)
    try { localStorage.setItem(NOTES_KEY, JSON.stringify(next)) } catch { setStorageError('Local notes could not be saved.') }
  }

  function runDashboardLocalTool(tool, transcript) {
    if (tool.type === 'timer.start') {
      const nextTimer = { minutes: tool.payload.minutes, endsAt: Date.now() + tool.payload.minutes * 60_000 }
      setTimer(nextTimer)
      const message = `Timer started for ${tool.payload.minutes} minute${tool.payload.minutes === 1 ? '' : 's'}.`
      setResult(message)
      recordVoiceActivity('Start timer', message)
      recordCommandHistory({ transcript, intent: 'Start timer', target: 'This dashboard', type: 'timer', status: 'success', result: message, confirmation: 'Timer started, boss.' })
      return
    }
    if (tool.type === 'note.create') {
      const note = { id: crypto.randomUUID(), at: new Date().toISOString(), content: tool.payload.content }
      setNotes((items) => {
        const next = [note, ...items].slice(0, 30)
        try { localStorage.setItem(NOTES_KEY, JSON.stringify(next)) } catch { setStorageError('Local notes could not be saved.') }
        return next
      })
      const message = 'Saved a local PRIME note.'
      setResult(message)
      recordVoiceActivity('Create local note', message)
      recordCommandHistory({ transcript, intent: 'Create local note', target: 'This dashboard', type: 'notes', status: 'success', result: message, confirmation: 'Saved, boss.' })
      return
    }
    if (tool.type === 'weather.search') {
      setCommand(`search Google for weather in ${tool.payload.city}`)
      setResult(`Ready to search Google for the weather in ${tool.payload.city}. Press Run command to open the result.`)
      return
    }
    setResult('PRIME can open or close approved apps, search Google or YouTube, set a timer, save a local note, show status, and display local notifications.')
  }

  function speakDashboardFeedback(message, nextState = 'idle') {
    const speech = globalThis.window?.speechSynthesis
    const Utterance = globalThis.window?.SpeechSynthesisUtterance
    if (speech && Utterance) {
      speech.cancel()
      const utterance = new Utterance(message)
      utterance.lang = settings.language === 'hindi' ? 'hi-IN' : 'en-IN'
      utterance.rate = settings.ttsRate
      utterance.volume = settings.ttsVolume
      utterance.onend = () => dispatchVoice({ type: nextState })
      utterance.onerror = () => dispatchVoice({ type: nextState })
      speech.speak(utterance)
      return
    }
    voiceResetRef.current = setTimeout(() => dispatchVoice({ type: nextState }), 1100)
  }

  async function runApprovedVoiceCommand(transcript) {
    transcript = normalizeAssistantInput(transcript)
    if (busyRef.current) { dispatchVoice({ type: 'error', message: 'PRIME is completing another command. Try again in a moment.' }); return }
    const routine = automations.find((item) => item.enabled && item.trigger.trim().toLowerCase() === transcript.trim().toLowerCase())
    if (routine) { await runAutomation(routine); dispatchVoice({ type: 'idle' }); return }
    const localTool = parseDashboardLocalCommand(transcript)
    if (localTool) {
      dispatchVoice({ type: 'recognized', transcript, detectedCommand: localTool.type === 'timer.start' ? 'Start timer' : localTool.type === 'note.create' ? 'Create local note' : localTool.type === 'weather.search' ? 'Search weather' : 'Show help', intendedAction: 'Run a local dashboard tool' })
      runDashboardLocalTool(localTool, transcript)
      dispatchVoice({ type: 'speaking' })
      speakDashboardFeedback(localTool.type === 'timer.start' ? 'Timer started, boss.' : localTool.type === 'note.create' ? 'Saved, boss.' : localTool.type === 'weather.search' ? 'Preparing a weather search, boss.' : 'Here is what I can do, boss.')
      return
    }
    const parsed = parseLocalCommand(transcript)
    if (!parsed) { await runAssistantRequest(transcript, true); return }

    const detectedCommand = describeCommand(parsed)
    dispatchVoice({ type: 'recognized', transcript, detectedCommand, intendedAction: `${detectedCommand} on this Mac` })

    if (!agent.connected || agent.paused) {
      const message = agent.paused ? 'Dashboard commands are paused.' : 'Wait for PRIME’s local helper before using dashboard push-to-talk.'
      dispatchVoice({ type: 'error', message })
      recordVoiceActivity(detectedCommand, message)
      return
    }
    if (busyRef.current) {
      dispatchVoice({ type: 'error', message: 'PRIME is completing another command. Try again in a moment.' })
      return
    }

    busyRef.current = true
    setBusy(true)
    setError('')
    try {
      const next = await requestAgent('/run', { command: parsed })
      const message = describeResult(parsed, next.data)
      setResult(message)
      dispatch({ type: 'record-activity', title: detectedCommand, detail: message })
      recordVoiceActivity(detectedCommand, message)
      recordCommandHistory({ transcript, intent: detectedCommand, target: parsed.payload.app ?? parsed.payload.query ?? 'This Mac', type: parsed.type === 'web.search' ? 'search' : parsed.type === 'app.open' ? 'app' : 'system', status: 'success', result: message, confirmation: 'Completed, boss.' })
      dispatchVoice({ type: 'speaking' })
      speakDashboardFeedback(message)
    } catch (cause) {
      dispatchVoice({ type: 'error', message: cause.message })
      recordVoiceActivity(detectedCommand, cause.message)
      recordCommandHistory({ transcript, intent: detectedCommand, target: parsed.payload.app ?? parsed.payload.query ?? 'This Mac', type: parsed.type === 'web.search' ? 'search' : parsed.type === 'app.open' ? 'app' : 'system', status: 'error', result: cause.message, confirmation: '' })
      setError(cause.message)
    } finally {
      busyRef.current = false
      setBusy(false)
    }
  }

  function startPushToTalk() {
    if (busyRef.current || recognitionRef.current) return
    if (settings.speechProvider !== 'browser-speech') {
      dispatchVoice({ type: 'error', message: 'Dashboard microphone is off in local mode. Say “Hey Prime” to the native menu-bar listener, type below, or explicitly select Browser speech service in Settings.' })
      return
    }
    const Recognition = globalThis.window?.SpeechRecognition ?? globalThis.window?.webkitSpeechRecognition
    if (!Recognition) {
      const message = 'Speech recognition is unavailable in this dashboard. Use the Mac menu-bar listener or enable a supported speech service.'
      dispatchVoice({ type: 'error', message })
      recordVoiceActivity('Voice unavailable', message)
      return
    }

    const recognition = new Recognition()
    let receivedFinalResult = false
    recognition.lang = settings.language === 'hindi' ? 'hi-IN' : 'en-IN'
    recognition.continuous = false
    recognition.interimResults = true
    recognition.maxAlternatives = 1
    recognition.onstart = () => dispatchVoice({ type: 'start' })
    recognition.onresult = (event) => {
      let transcript = ''
      let finalTranscript = ''
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const text = event.results[index][0]?.transcript?.trim() ?? ''
        transcript += `${text} `
        if (event.results[index].isFinal) finalTranscript += `${text} `
      }
      const visibleTranscript = transcript.trim()
      if (visibleTranscript) dispatchVoice({ type: 'partial', transcript: visibleTranscript })
      if (finalTranscript.trim() && !receivedFinalResult) {
        receivedFinalResult = true
        void runApprovedVoiceCommand(finalTranscript.trim())
      }
    }
    recognition.onerror = (event) => {
      if (event.error === 'aborted') return
      const message = `Speech recognition error: ${event.error}.`
      dispatchVoice({ type: 'error', message })
      recordVoiceActivity('Voice recognition error', message)
    }
    recognition.onend = () => {
      recognitionRef.current = null
      if (!receivedFinalResult && voiceStateRef.current.status === 'Listening') dispatchVoice({ type: 'idle' })
    }
    recognitionRef.current = recognition
    dispatchVoice({ type: 'start' })
    try { recognition.start() }
    catch {
      recognitionRef.current = null
      dispatchVoice({ type: 'error', message: 'PRIME could not start microphone capture. Check your microphone permission.' })
    }
  }

  function stopPushToTalk() {
    recognitionRef.current?.stop?.()
  }

  function cancelVoiceControl() {
    recognitionRef.current?.abort?.()
    recognitionRef.current = null
    globalThis.window?.speechSynthesis?.cancel?.()
    if (voiceResetRef.current) clearTimeout(voiceResetRef.current)
    dispatchVoice({ type: 'cancel' })
    if (assistantConfirmation) void runAssistantRequest('cancel')
  }

  async function refreshVoiceStatus() {
    try {
      const next = await requestAgent('/voice-status')
      if (next.voice) setVoiceStatus(next.voice)
    } catch {
      setVoiceStatus({ available: false, message: 'PRIME Voice Assistant is not reporting a status.' })
    }
  }

  return <div className={`app-shell view-${view}`}>
    <aside className="sidebar">
      <a className="wordmark" href="#top" onClick={() => setView('command')} aria-label="PRIME home"><span className="brand-mark">◈</span> PRIME<span className="brand-period">.</span></a>
      <p className="sidebar-caption">PERSONAL INTELLIGENCE</p>
      <nav aria-label="Main navigation">{[['command', '◎', 'Command center'], ['tools', '⌘', 'Tools & routines'], ['activity', '≋', 'Activity'], ['settings', '⚙', 'Settings']].map(([id, glyph, label]) => <button key={id} type="button" className={view === id ? 'selected' : ''} aria-current={view === id ? 'page' : undefined} onClick={() => { setView(id); window.scrollTo(0, 0) }}><span aria-hidden="true">{glyph}</span>{label}</button>)}</nav>
      <div className="sidebar-bottom"><span className={`connection-dot ${agent.connected ? 'online' : ''}`} />{agent.connected ? 'Local helper ready' : 'Starting local helper'}<br /><small>PRIVATE. ON YOUR MAC.</small></div>
    </aside>
    <main className="workspace" id="top">
      <header className="topbar"><p className="eyebrow">PRIME OS <span>/</span> {view === 'command' ? 'COMMAND CENTER' : view.toUpperCase()}</p><button className={`secondary-button ${agent.paused ? 'paused' : ''}`} disabled={busy || !bridgeReady} onClick={togglePause}>{agent.paused ? 'Resume commands' : 'Pause commands'}</button></header>
      <div className="intro"><p className="eyebrow">YOUR PERSONAL INTELLIGENCE</p><h1>{view === 'command' ? 'At your command.' : view === 'tools' ? 'Make room for focus.' : view === 'activity' ? 'Every action, in view.' : 'Your system. Your rules.'}</h1><p>{view === 'command' ? 'One voice. Your whole workspace.' : view === 'tools' ? 'Shortcuts, local notes, timers, and routines.' : view === 'activity' ? 'Review your local commands and recent activity.' : 'Fine-tune voice, privacy, and local preferences.'}</p></div>
      <section className={`reactor-stage ${agent.connected ? 'online' : ''} ${voiceControl.status.toLowerCase()}`} aria-label="Assistant status">
        <div className="reactor-info"><p className="eyebrow">LOCAL HELPER</p><strong>{agent.connected ? agent.paused ? 'Standing by' : 'Systems ready' : 'Starting'}</strong><p>{agent.connected ? agent.device?.hostname || 'This Mac is ready' : 'Preparing local tools on this Mac'}</p><span className="hud-label">{agent.connected ? 'LOCAL ACCESS READY' : 'RETRYING EVERY 5 SECONDS'}</span></div>
        <div className="reactor" aria-hidden="true"><div className="reactor-orbit orbit-one" /><div className="reactor-orbit orbit-two" /><div className="reactor-ticks" /><div className="reactor-core"><span>PRIME</span><small>{agent.paused ? 'PAUSED' : !agent.connected ? 'LINKING' : voiceControl.status === 'Idle' ? 'READY' : voiceControl.status.toUpperCase()}</small></div></div>
        <div className="reactor-info reactor-right"><p className="eyebrow">VOICE CHANNEL</p><strong>{voiceStatus.available ? 'Voice online' : 'Keyboard ready'}</strong><p>{voiceStatus.available ? 'Say “Hey Prime” to begin' : 'Type a command below to begin'}</p><div className="signal-bars" aria-hidden="true">{Array.from({ length: 17 }, (_, i) => <i key={i} style={{ height: `${8 + ((i * 7) % 25)}px` }} />)}</div></div>
        <div className="reactor-caption"><span className={`connection-dot ${agent.connected ? 'online' : ''}`} />{agent.connected ? agent.paused ? 'Commands paused · resume when ready' : 'Local intelligence · ready when you are' : 'Initializing local tools'}</div>
      </section>
      {connectionError && <p className="notice warning" role="status">{connectionError} PRIME will retry its local helper automatically.</p>}
      {storageError && <p className="notice warning" role="alert">{storageError}</p>}
      {error && <div className="notice warning" role="alert"><p>{error}</p><button className="icon-button" aria-label="Dismiss error" onClick={() => setError('')}>×</button></div>}
      {agent.paused && <p className="notice" role="status">Dashboard commands and the local voice bridge are paused.</p>}

      <section className="agent-panel" id="local-mac" aria-labelledby="agent-heading">
        <div className="section-heading"><div><p className="eyebrow">LOCAL HELPER</p><h2 id="agent-heading">This Mac</h2></div><span className={`status ${agent.connected ? 'connected' : ''}`}><i />{agent.connected ? 'Ready' : 'Starting'}</span></div>
        <p className="section-description">PRIME starts its local helper automatically when you open the app.</p>
        <div className="agent-connection">
          <div>{agent.device ? <><strong>{agent.device.hostname}</strong><small>{agent.device.platform} {agent.device.release} · {agent.device.arch}</small></> : <><strong>Local Mac assistant</strong><small>Apps, web searches, music, volume, notes, and timers.</small></>}</div>
          <span className="hud-label">{agent.connected ? 'LOCAL HELPER ACTIVE' : 'STARTING…'}</span>
        </div>
        <div className={`voice-assistant ${voiceStatus.available ? 'active' : ''}`} role="status" aria-live="polite">
          <div><span className="voice-indicator" aria-hidden="true" /><span><strong>Voice Assistant</strong><small>{voiceStatus.message}</small></span></div>
          <button type="button" className="secondary-button" onClick={refreshVoiceStatus}>Refresh voice</button>
        </div>
        <section className="voice-console" aria-labelledby="voice-console-heading">
          <div className="voice-console-heading"><div><p className="eyebrow">PUSH-TO-TALK</p><h3 id="voice-console-heading">Speak to PRIME</h3></div><output className={`voice-state ${voiceControl.status.toLowerCase().replaceAll(' ', '-')}`} aria-live="polite">{voiceControl.status}</output></div>
          <div className={`voice-stage ${voiceControl.status.toLowerCase().replaceAll(' ', '-')}`}>
            <button type="button" className="microphone-button" disabled={busy || voiceControl.status === 'Processing' || voiceControl.status === 'Speaking'} aria-pressed={voiceControl.status === 'Listening'} aria-label="Hold to talk to PRIME" onPointerDown={startPushToTalk} onPointerUp={stopPushToTalk} onPointerCancel={stopPushToTalk} onPointerLeave={(event) => { if (event.buttons) stopPushToTalk() }} onKeyDown={(event) => { if ((event.key === ' ' || event.key === 'Enter') && !event.repeat) { event.preventDefault(); startPushToTalk() } }} onKeyUp={(event) => { if (event.key === ' ' || event.key === 'Enter') { event.preventDefault(); stopPushToTalk() } }}><span className="microphone-glyph" aria-hidden="true" /><span>{voiceControl.status === 'Listening' ? 'Listening… release to send' : 'Hold to talk'}</span></button>
            <div className="waveform" aria-hidden="true">{Array.from({ length: 18 }, (_, index) => <i key={index} style={{ '--wave-index': index, '--wave-scale': 1.25 + (index % 5) * 0.24 }} />)}</div>
          </div>
          <div className="voice-state-key" aria-label="Voice states">{voiceStates.map((stateName) => <span key={stateName} className={voiceControl.status === stateName ? 'current' : ''}>{stateName}</span>)}</div>
          <div className="voice-readout-grid">
            <div className="voice-readout"><span>Live transcript</span><output>{voiceControl.transcript || 'Hold the microphone button and speak a command.'}</output></div>
            <div className="voice-readout"><span>Detected command</span><output>{voiceControl.detectedCommand || 'Waiting for a completed command.'}</output></div>
            <div className="voice-readout"><span>Intended action</span><output>{voiceControl.intendedAction || 'No action will run until PRIME recognizes an approved command.'}</output></div>
          </div>
          {voiceControl.error && <p className="voice-error" role="alert">{voiceControl.error}</p>}
          <div className="voice-console-actions"><button type="button" className="secondary-button" disabled={voiceControl.status === 'Idle'} onClick={cancelVoiceControl}>Cancel voice command</button><p>The native listener uses on-device recognition. Dashboard microphone capture requires Browser speech service in Settings.</p></div>
          <div className="voice-recent" aria-labelledby="voice-recent-heading"><div><p className="eyebrow">RECENT VOICE ACTIVITY</p><h3 id="voice-recent-heading">Last commands</h3></div>{voiceActivity.length ? <ol>{voiceActivity.map((entry) => <li key={entry.id}><span><strong>{entry.title}</strong><small>{entry.detail}</small></span><time dateTime={entry.at}>{formatTime(entry.at)}</time></li>)}</ol> : <p>No dashboard voice commands yet. The menu-bar listener remains available separately.</p>}</div>
        </section>
        <p className="fine-print">Say <strong>“Hey Prime”</strong>, then ask a question or say “open Google Chrome,” “pause music,” or “search Google for today’s weather.” The native voice listener runs from the Mac menu bar, even when this dashboard is closed.</p>
        <form className="command-form" onSubmit={submitCommand} noValidate>
          <label htmlFor="command-input">Ask PRIME</label>
          <div className="command-bar"><input id="command-input" value={command} maxLength={2000} onChange={(event) => setCommand(event.target.value)} placeholder="Ask a question or try: open Google Chrome" disabled={busy} autoComplete="off" /><button className="primary-button" disabled={busy || !command.trim()}>{busy ? 'Working…' : 'Ask PRIME'}</button></div>
        </form>
        <div className="command-examples" aria-label="Command examples">{['What can you do?', 'Open Google Chrome', 'Pause music', 'Search Google for today’s weather'].map((example) => <button key={example} disabled={busy || !agent.connected || agent.paused} onClick={() => setCommand(example)}>{example}</button>)}</div>
        <p className="fine-print">Mac commands run locally. Open-ended answers require Ollama with a downloaded model on this Mac. Explicit web searches open your default browser and send the search query to the selected provider.</p>
        {assistantConfirmation && <div className="assistant-confirmation" role="group" aria-label="Confirm assistant action"><strong>Confirm this action</strong><p>{assistantConfirmation.message}</p><p className="fine-print">Confirmation expires after 30 seconds. Use these buttons or dashboard push-to-talk to say “yes” or “cancel”.</p><div className="modal-actions"><button type="button" className="secondary-button" disabled={busy} onClick={() => void runAssistantRequest('cancel')}>Cancel</button><button type="button" className="primary-button" disabled={busy} onClick={() => void runAssistantRequest('yes')}>Confirm action</button></div></div>}
        {result && <p className="notice success assistant-reply" role="status">{result}</p>}
      </section>

      <section className="section-block quick-actions" aria-labelledby="quick-actions-heading"><div className="section-heading"><div><p className="eyebrow">APP LAUNCHER</p><h2 id="quick-actions-heading">Quick actions</h2></div></div><p className="section-description">One-click shortcuts for the same approved Mac actions PRIME understands by voice.</p><div className="quick-action-grid">{['open Finder', 'open Notes', 'open Spotify', 'open Calendar', 'open Reminders', 'open WhatsApp', 'search Google for weather', 'search YouTube for focus music'].map((action) => <button key={action} className="secondary-button" disabled={busy} onClick={() => runQuickAction(action)}>{action.replace(/^open /, 'Open ').replace(/^search /, 'Search ')}</button>)}</div></section>

      <section className="section-block quick-tools" aria-labelledby="quick-tools-heading"><div className="section-heading"><div><p className="eyebrow">ON THIS MAC</p><h2 id="quick-tools-heading">Timers &amp; local notes</h2></div>{timer && <button className="secondary-button" onClick={() => setTimer(null)}>Cancel timer</button>}</div><p className="section-description">These utilities are local to PRIME. They do not access Reminders, Notes, Calendar, or a cloud account.</p>{timer ? <div className="timer-card"><strong>{timer.minutes}-minute timer active</strong><span>Ends {new Date(timer.endsAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span></div> : <div className="empty-state compact">Say “set a timer for 25 minutes” to start one.</div>}<div className="note-list">{notes.length ? notes.slice(0, 5).map((note) => <article key={note.id}><p>{note.content}</p><div><time dateTime={note.at}>{formatTime(note.at)}</time><button type="button" className="text-button" onClick={() => saveNotes(notes.filter((item) => item.id !== note.id))}>Remove</button></div></article>) : <p className="fine-print">Say “create a note: buy milk” to save an offline PRIME note.</p>}</div></section>

      <section className="section-block activity-panel" id="activity" aria-labelledby="activity-heading">
        <div className="section-heading"><div><p className="eyebrow">THIS BROWSER</p><h2 id="activity-heading">Dashboard history</h2></div>{state.activity.length > 5 && <button className="text-button" onClick={() => setShowAllActivity(!showAllActivity)}>{showAllActivity ? 'Show recent' : `Show all (${state.activity.length})`}</button>}</div>
        <p className="section-description">Last 100 events saved locally. This editable browser history is not a security audit.</p>
        {state.activity.length ? <ol className="activity-list">{state.activity.slice(0, showAllActivity ? 100 : 5).map((entry) => <li key={entry.id}><div><strong>{entry.title}</strong><p>{entry.detail}</p></div><time dateTime={entry.at}>{formatTime(entry.at)}</time></li>)}</ol> : <div className="empty-state compact">No activity yet. Only actual dashboard actions appear here.</div>}
        <div className="agent-audit"><button className="secondary-button" disabled={busy || !agent.connected} onClick={() => withAgent(async () => setAudit((await requestAgent('/audit')).entries))}>Read agent log</button><span className="fine-print">Recent Mac agent requests, including other local clients. Resets when the agent restarts.</span></div>
        {audit !== null && <div className="audit-log" aria-label="Mac agent log">{audit.length ? <ol className="activity-list">{audit.map((entry, index) => <li key={`${entry.at}-${index}`}><div><strong>{entry.type} · {entry.outcome}</strong>{entry.reason && <p>{entry.reason}</p>}</div><time dateTime={entry.at}>{formatTime(entry.at)}</time></li>)}</ol> : <p className="fine-print">The agent has no recorded requests.</p>}</div>}
      </section>

      <section className="section-block command-history" aria-labelledby="command-history-heading"><div className="section-heading"><div><p className="eyebrow">LOCAL VOICE DATA</p><h2 id="command-history-heading">Command history</h2></div><button className="secondary-button" disabled={!commandHistory.length} onClick={() => { setCommandHistory([]); localStorage.removeItem(COMMAND_HISTORY_KEY) }}>Delete local history</button></div><p className="section-description">Dashboard voice commands stay on this Mac. Menu-bar listener history is separate.</p><div className="history-filters history-filters-wide"><input aria-label="Search command history" value={historyQuery} onChange={(event) => setHistoryQuery(event.target.value)} placeholder="Search transcript or result" />{historyQuery && <button type="button" className="secondary-button" aria-label="Clear history search" onClick={() => { setHistoryQuery(''); document.querySelector('[aria-label="Search command history"]')?.focus() }}>Clear</button>}<select aria-label="Filter by date" value={historyDate} onChange={(event) => setHistoryDate(event.target.value)}><option value="all">Any date</option><option value="today">Today</option></select><select aria-label="Filter by status" value={historyStatus} onChange={(event) => setHistoryStatus(event.target.value)}><option value="all">All statuses</option><option value="success">Success</option><option value="error">Error</option></select><select aria-label="Filter by command type" value={historyType} onChange={(event) => setHistoryType(event.target.value)}><option value="all">All commands</option><option value="app">Apps</option><option value="search">Searches</option><option value="system">System</option><option value="assistant">Assistant replies</option></select></div>{filterCommandHistory(commandHistory, { query: historyQuery, status: historyStatus, type: historyType, date: historyDate }).length ? <ol className="activity-list">{filterCommandHistory(commandHistory, { query: historyQuery, status: historyStatus, type: historyType, date: historyDate }).map((entry) => <li key={entry.id}><div><strong>{entry.intent} · {entry.status}</strong><p>“{entry.transcript}” → {entry.result}</p><div className="history-actions"><button type="button" className="text-button" onClick={() => replayHistoryConfirmation(entry)}>Replay reply</button><button type="button" className="text-button" onClick={() => void copyHistoryTranscript(entry.transcript)}>Copy transcript</button></div></div><time dateTime={entry.at}>{formatTime(entry.at)}</time></li>)}</ol> : <div className="empty-state compact">No matching dashboard voice commands.</div>}</section>

      <section className="section-block routines-panel" aria-labelledby="automations-heading"><div className="section-heading"><div><p className="eyebrow">LOCAL ROUTINES</p><h2 id="automations-heading">Automations</h2></div><button className="primary-button" onClick={() => setAutomationEditor({ name: '', trigger: '', actions: '', enabled: true })}>Create routine</button></div><p className="section-description">Run approved actions in order. Unsupported or sensitive actions block the routine before it starts.</p><div className="automation-list">{automations.map((automation) => <article key={automation.id} className="automation-card"><div><strong>{automation.name}</strong><span className="status">{automation.enabled ? 'Enabled' : 'Disabled'}</span></div><p><b>Trigger:</b> “{automation.trigger}”</p><ol>{automation.actions.map((action) => <li key={action}>{action}{automation.confirmations.includes(action) && <em> confirmation required</em>}</li>)}</ol><div className="automation-actions"><button className="secondary-button" disabled={busy || !automation.enabled} onClick={() => void runAutomation(automation)}>Run</button><button className="secondary-button" onClick={() => setAutomationEditor({ ...automation, actions: automation.actions.join('\n') })}>Edit</button><button className="secondary-button" onClick={() => saveAutomations(toggleAutomation(automations, automation.id))}>{automation.enabled ? 'Disable' : 'Enable'}</button><button className="secondary-button" onClick={() => saveAutomations(duplicateAutomation(automations, automation.id))}>Duplicate</button><button className="danger-button" onClick={() => saveAutomations(automations.filter((item) => item.id !== automation.id))}>Delete</button></div></article>)}</div><div className="automation-log"><p className="eyebrow">EXECUTION LOG</p>{automationLogs.length ? <ol className="activity-list">{automationLogs.map((entry) => <li key={entry.id}><div><strong>{entry.name}</strong><p>{entry.status}</p></div><time dateTime={entry.at}>{formatTime(entry.at)}</time></li>)}</ol> : <p className="fine-print">No routine runs this session. Unsupported actions are blocked before any step runs.</p>}</div></section>

      <section className="section-block safety-panel" aria-labelledby="safety-heading"><div className="section-heading"><div><p className="eyebrow">GUARDRAILS</p><h2 id="safety-heading">Permissions &amp; safety</h2></div></div><p className="section-description">PRIME only exposes reviewed local actions. These controls record PRIME consent; macOS retains the final system permission decision.</p><div className="safety-groups">{safetyGroups.map(([title, description, actions]) => <article key={title} className={`safety-group ${title.startsWith('Blocked') ? 'blocked' : title.startsWith('Confirmation') ? 'confirm' : ''}`}><h3>{title}</h3><p>{description}</p><ul>{actions.map((action) => <li key={action}>{action}</li>)}</ul></article>)}</div><div className="permission-grid"><div><p className="eyebrow">INTEGRATION CONSENT</p><h3>Grant per integration</h3><p className="section-description">Turn on only an integration you intend to configure. This never bypasses macOS Privacy &amp; Security.</p></div><div>{permissionExplanations.map(([name, detail]) => { const key = name.toLowerCase(); return <label className="permission" key={key}><span><strong>{name}</strong><small>{detail}</small></span><input type="checkbox" checked={localConsent[key]} onChange={() => toggleLocalConsent(key)} /><span className="toggle" aria-hidden="true" /></label> })}</div></div></section>

      <section className="section-block settings-panel" id="next" aria-labelledby="settings-heading"><div className="section-heading"><div><p className="eyebrow">LOCAL PREFERENCES</p><h2 id="settings-heading">Settings</h2></div></div><p className="section-description">These preferences stay in this Mac’s dashboard. Local mode keeps the dashboard microphone off; use the native menu-bar listener for on-device voice recognition.</p><div className="settings-grid"><label>Microphone input<select value={settings.microphoneInput} onChange={(event) => updateSettings({ microphoneInput: event.target.value })}><option>System default</option></select><small>Audio test uses the dashboard’s push-to-talk path.</small></label><div className="settings-test"><strong>Audio test</strong><button className="secondary-button" type="button" onPointerDown={startPushToTalk} onPointerUp={stopPushToTalk} onPointerCancel={stopPushToTalk} onClick={stopPushToTalk}>Hold to test microphone</button><small>Release the control to stop.</small></div><label>Wake phrase<input value={settings.wakePhrase} maxLength={40} onChange={(event) => updateSettings({ wakePhrase: event.target.value })} /><small>The installed native listener currently uses “Hey Prime” / “Prime”. A custom phrase needs a listener rebuild.</small></label><label className="setting-toggle"><span><strong>Wake word</strong><small>Native listener status is managed separately from this preference.</small></span><input type="checkbox" checked={settings.wakeWordEnabled} onChange={(event) => updateSettings({ wakeWordEnabled: event.target.checked })} /><span className="toggle" /></label><label>Push-to-talk shortcut<select value={settings.pushToTalkShortcut} onChange={(event) => updateSettings({ pushToTalkShortcut: event.target.value })}><option>Space</option><option>⌘⇧P</option></select></label><label>Language<select value={settings.language} onChange={(event) => updateSettings({ language: event.target.value })}><option value="hinglish">English + Hindi (Hinglish)</option><option value="english">English</option><option value="hindi">Hindi</option></select></label><label>Speech-to-text provider<select value={settings.speechProvider} onChange={(event) => updateSettings({ speechProvider: event.target.value })}><option value="mock-local">Native listener / typing (no browser microphone)</option><option value="browser-speech">Browser speech service</option></select><small>Browser speech may use your operating system’s configured service.</small></label><label>Text-to-speech speed<input type="range" min="0.5" max="1.5" step="0.05" value={settings.ttsRate} onChange={(event) => updateSettings({ ttsRate: Number(event.target.value) })} /><small>{settings.ttsRate.toFixed(2)}× system voice</small></label><label>Text-to-speech volume<input type="range" min="0.5" max="1" step="0.05" value={settings.ttsVolume} onChange={(event) => updateSettings({ ttsVolume: Number(event.target.value) })} /><small>{Math.round(settings.ttsVolume * 100)}%</small></label><label>Transcript storage<select value={settings.transcriptStorage} onChange={(event) => updateSettings({ transcriptStorage: event.target.value })}><option value="local">Local only</option><option value="off">Do not store</option></select></label><label>Auto-delete history<select value={settings.autoDeleteDays} onChange={(event) => updateSettings({ autoDeleteDays: Number(event.target.value) })}><option value={0}>Never automatically</option><option value={7}>After 7 days</option><option value={30}>After 30 days</option><option value={90}>After 90 days</option></select></label><label>Appearance<select value={settings.appearance} onChange={(event) => updateSettings({ appearance: event.target.value })}><option value="dark">Dark (default)</option><option value="light">Light</option></select><small>Theme preference is saved; current visual theme remains the local control-center theme.</small></label></div><div className="privacy-callout"><strong>Cloud processing disclosure</strong><p>{settings.speechProvider === 'browser-speech' ? 'Browser speech may use an operating-system speech service. PRIME itself sends no transcripts to a cloud provider.' : 'The dashboard microphone is off. The native listener recognizes speech on-device. Ollama answers run locally; explicit searches send only your query to the search provider.'}</p><button className="danger-button" type="button" onClick={() => setDeleteDataOpen(true)}>Delete all local data</button></div></section>

      <section className="section-block next-section" aria-labelledby="next-heading"><p className="eyebrow">MAC-ONLY FOUNDATION</p><h2 id="next-heading">Keep PRIME local</h2><ol><li><strong>Voice</strong><span>Use the native macOS wake listener or dashboard push-to-talk while this Mac is awake.</span></li><li><strong>Safe actions</strong><span>Open or close approved Mac apps, search the web, create local notes, and run local timers.</span></li><li><strong>Optional integrations</strong><span>Add only reviewed Mac integrations one permission at a time.</span></li></ol><p className="fine-print">PRIME accepts commands only from this Mac through its local loopback agent.</p></section>
    </main>

    {deleteDataOpen && <Modal title="Delete all local PRIME data?" onClose={() => setDeleteDataOpen(false)}><p>This clears local notes, timers, transcripts, activity, routines, consent choices, and preferences in this dashboard. Native listener history and Mac agent audit logs are separate. It does not uninstall PRIME, touch other apps, or revoke macOS permissions.</p><div className="modal-actions"><button className="secondary-button" autoFocus onClick={() => setDeleteDataOpen(false)}>Keep local data</button><button className="danger-button" onClick={deleteAllLocalData}>Delete local data</button></div></Modal>}
    {automationEditor && <Modal title={automationEditor.id ? 'Edit routine' : 'Create routine'} onClose={() => setAutomationEditor(null)}><form onSubmit={saveAutomation} noValidate><label className="field-label" htmlFor="routine-name">Routine name</label><input id="routine-name" autoFocus maxLength={60} value={automationEditor.name} onChange={(event) => setAutomationEditor({ ...automationEditor, name: event.target.value })} placeholder="Start focus mode" /><label className="field-label" htmlFor="routine-trigger">Voice trigger</label><input id="routine-trigger" maxLength={80} value={automationEditor.trigger} onChange={(event) => setAutomationEditor({ ...automationEditor, trigger: event.target.value })} placeholder="start focus mode" /><label className="field-label" htmlFor="routine-actions">Ordered actions — one per line</label><textarea className="resize-none" id="routine-actions" rows="5" maxLength={400} value={automationEditor.actions} onChange={(event) => setAutomationEditor({ ...automationEditor, actions: event.target.value })} placeholder={'Open Spotify\nSet a timer for 25 minutes'} /><p className="fine-print">Use open app, search Google or YouTube, notify, set a timer, or create a note. Unsupported actions block the entire routine before it starts.</p><div className="modal-actions"><button type="button" className="secondary-button" onClick={() => setAutomationEditor(null)}>Cancel</button><button className="primary-button" disabled={!automationEditor.name.trim() || !automationEditor.trigger.trim() || !automationEditor.actions.trim()}>Save routine</button></div></form></Modal>}
    {onboardingOpen && <Modal title="Welcome to PRIME" onClose={completeOnboarding}><p>PRIME is local-first. The dashboard only runs a narrow, reviewed command list. It cannot use Terminal, erase files, spend money, or send messages without a future explicit confirmation step.</p><p>Microphone access is requested by macOS only when you use push-to-talk or the native wake listener. Transcripts remain local by default; mock local mode sends nothing to a cloud provider.</p><div className="modal-actions"><button className="primary-button" autoFocus onClick={completeOnboarding}>Continue to PRIME</button></div></Modal>}
  </div>
}

export default App
