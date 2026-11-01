export const DASHBOARD_STORAGE_KEY = 'prime.mac-dashboard.v2'

export const initialDashboard = { activity: [] }

const validActivity = (entry) => entry && typeof entry.id === 'string' && typeof entry.title === 'string' && typeof entry.detail === 'string' && typeof entry.at === 'string' && Number.isFinite(Date.parse(entry.at))

const addActivity = (state, entry) => ({
  ...state,
  activity: [{ id: crypto.randomUUID(), at: new Date().toISOString(), ...entry }, ...state.activity].slice(0, 100),
})

export function reduceDashboard(state, action) {
  if (action.type === 'record-activity') {
    if (typeof action.title !== 'string' || typeof action.detail !== 'string') return state
    return addActivity(state, { title: action.title.slice(0, 200), detail: action.detail.slice(0, 600) })
  }
  return state
}

export function serializeDashboard(state) {
  return JSON.stringify({ version: 2, activity: state.activity.slice(0, 100) })
}

export function restoreDashboard(serialized) {
  if (!serialized) return initialDashboard
  const value = JSON.parse(serialized)
  if (value?.version !== 2 || !Array.isArray(value.activity) || value.activity.length > 100 || !value.activity.every(validActivity)) throw new Error('Invalid saved Mac dashboard')
  return {
    activity: value.activity.map((entry) => ({
      id: entry.id.slice(0, 128),
      title: entry.title.slice(0, 200),
      detail: entry.detail.slice(0, 600),
      at: entry.at,
    })),
  }
}
