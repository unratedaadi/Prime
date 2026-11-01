export const initialVoiceControl = Object.freeze({
  status: 'Idle',
  transcript: '',
  detectedCommand: '',
  intendedAction: '',
  error: '',
})

export function reduceVoiceControl(state, event) {
  switch (event.type) {
    case 'start':
      return { ...initialVoiceControl, status: 'Listening' }
    case 'partial':
      return { ...state, transcript: event.transcript, error: '' }
    case 'recognized':
      return {
        ...state,
        status: 'Processing',
        transcript: event.transcript,
        detectedCommand: event.detectedCommand,
        intendedAction: event.intendedAction,
        error: '',
      }
    case 'speaking':
      return { ...state, status: 'Speaking', error: '' }
    case 'confirm':
      return { ...state, status: 'Needs confirmation', error: '' }
    case 'error':
      return { ...state, status: 'Error', error: event.message }
    case 'cancel':
    case 'idle':
      return initialVoiceControl
    default:
      return state
  }
}
