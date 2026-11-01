import assert from 'node:assert/strict'
import test from 'node:test'

import { getSystemInsight } from './system-insight.mjs'

test('memory insight derives bounded used and total memory from vm_stat pages', async () => {
  const result = await getSystemInsight('memory', { execFile: async () => ({ stdout: `Mach Virtual Memory Statistics: (page size of 4096 bytes)\nPages free:                               100.\nPages active:                            200.\nPages inactive:                          300.\nPages speculative:                        50.\nPages wired down:                        150.\nPages occupied by compressor:            100.\n` }) })
  assert.deepEqual(result, { ok: true, data: { kind: 'memory', totalBytes: 3_686_400, usedBytes: 3_276_800, freeBytes: 409_600, usedPercent: 89 } })
})

test('storage insight parses only a valid root filesystem df result', async () => {
  const result = await getSystemInsight('storage', { execFile: async () => ({ stdout: `Filesystem 1024-blocks Used Available Capacity iused ifree %iused Mounted on\n/dev/disk3s1s1  994662584 510000000 480000000 52% 600000 3000000 17% /\n` }) })
  assert.deepEqual(result, { ok: true, data: { kind: 'storage', totalBytes: 1_018_534_486_016, usedBytes: 522_240_000_000, freeBytes: 491_520_000_000, usedPercent: 52 } })
})

test('system insight rejects unknown kinds and malformed operating-system output', async () => {
  assert.deepEqual(await getSystemInsight('network', { execFile: async () => assert.fail('must not execute') }), { ok: false, code: 'invalid_system_insight' })
  assert.deepEqual(await getSystemInsight('storage', { execFile: async () => ({ stdout: 'invalid' }) }), { ok: false, code: 'system_insight_unavailable' })
})
