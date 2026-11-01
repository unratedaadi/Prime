export function isPushToTalkShortcut(event, shortcut) {
  if (shortcut === '⌘⇧P') return event.key.toLowerCase() === 'p' && event.metaKey && event.shiftKey
  return event.key === ' ' && !event.metaKey && !event.ctrlKey && !event.altKey
}
