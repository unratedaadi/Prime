const pageValue = (text, label) => Number(text.match(new RegExp(`Pages ${label}:\\s+(\\d+)\\.`, 'i'))?.[1])
const bytes = (value) => Number.isSafeInteger(value) && value >= 0 ? value : null

export async function getSystemInsight(kind, { execFile } = {}) {
  if (!['memory', 'storage'].includes(kind) || typeof execFile !== 'function') return { ok: false, code: 'invalid_system_insight' }
  try {
    if (kind === 'memory') {
      const { stdout } = await execFile('/usr/bin/vm_stat', [])
      const pageSize = Number(stdout.match(/page size of (\d+) bytes/i)?.[1])
      const freePages = pageValue(stdout, 'free')
      const usedPages = ['active', 'inactive', 'speculative', 'wired down', 'occupied by compressor'].map((label) => pageValue(stdout, label)).reduce((sum, value) => sum + value, 0)
      const freeBytes = bytes(freePages * pageSize)
      const usedBytes = bytes(usedPages * pageSize)
      const totalBytes = bytes(freeBytes + usedBytes)
      if (!freeBytes || !usedBytes || !totalBytes) throw new Error('invalid memory output')
      return { ok: true, data: { kind, totalBytes, usedBytes, freeBytes, usedPercent: Math.round((usedBytes / totalBytes) * 100) } }
    }
    const { stdout } = await execFile('/bin/df', ['-k', '/'])
    const fields = stdout.trim().split('\n').at(-1)?.trim().split(/\s+/) ?? []
    const [, totalBlocks, used, available, capacity] = fields
    const usedBytes = bytes(Number(used) * 1024)
    const freeBytes = bytes(Number(available) * 1024)
    const usedPercent = Number(capacity?.replace('%', ''))
    const totalBytes = bytes(Number(totalBlocks) * 1024)
    if (!usedBytes || !freeBytes || !totalBytes || !Number.isInteger(usedPercent) || usedPercent < 0 || usedPercent > 100) throw new Error('invalid storage output')
    return { ok: true, data: { kind, totalBytes, usedBytes, freeBytes, usedPercent } }
  } catch { return { ok: false, code: 'system_insight_unavailable' } }
}
