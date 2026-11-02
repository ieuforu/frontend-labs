import assert from 'node:assert/strict'
import { test } from 'node:test'
import { canCompare, createDataset, DATASET_VERSION } from '../labs/virtual-list/src/dataset.ts'
import { nextFrame, roundOrder, summarize } from '../labs/virtual-list/src/benchmark.ts'

test('comparison datasets are deterministic prefixes of the exploration data', () => {
  const small = createDataset(500)
  const medium = createDataset(2_000)
  const exploration = createDataset(100_000)
  assert.equal(DATASET_VERSION, 'mixed-text-v1')
  assert.deepEqual(small, createDataset(500))
  assert.deepEqual(small, medium.slice(0, small.length))
  assert.deepEqual(medium, exploration.slice(0, medium.length))
  assert.equal(new Set(exploration.map((item) => item.id)).size, 100_000)
  assert.equal(new Set(small.map((item) => item.content)).size, 5)
})

test('full comparisons cannot silently grow into the 100,000-row exploration', () => {
  for (const count of [500, 2_000, 5_000]) assert.equal(canCompare(count), true)
  for (const count of [0, -1, 500.5, 10_000, 100_000, Infinity, NaN]) {
    assert.equal(canCompare(count), false)
    if (count !== 100_000) assert.throws(() => createDataset(count), RangeError)
  }
})

test('round order alternates and summaries retain outliers rather than reporting the fastest run', () => {
  assert.deepEqual([0, 1, 2].map(roundOrder), [
    ['full', 'virtual'],
    ['virtual', 'full'],
    ['full', 'virtual'],
  ])
  const samples = [12, 2, 5].map((mountMs, index) => ({
    round: index + 1,
    order: 1,
    mode: 'full',
    mountMs,
    layoutReadMs: mountMs / 2,
    secondFrameMs: mountMs + 30,
    rowNodes: 500,
    descendantNodes: 3_500,
    scrollHeight: 40_000,
  }))
  samples.push({ ...samples[0], mode: 'virtual', mountMs: 1, rowNodes: 20 })
  const summary = summarize(samples, 'full')
  assert.equal(summary.count, 3)
  assert.deepEqual(summary.mountMs, { median: 5, min: 2, max: 12 })
  assert.deepEqual(summary.rowNodes, { min: 500, max: 500 })
  assert.equal(summarize(samples, 'virtual').count, 1)
  assert.equal(summarize([], 'full'), null)
})

test('canceling a pending frame removes it instead of completing an interrupted measurement', async (t) => {
  const originalRequest = globalThis.requestAnimationFrame
  const originalCancel = globalThis.cancelAnimationFrame
  const frames = new Map()
  let sequence = 0
  globalThis.requestAnimationFrame = (callback) => {
    frames.set(++sequence, callback)
    return sequence
  }
  globalThis.cancelAnimationFrame = (id) => frames.delete(id)
  t.after(() => {
    globalThis.requestAnimationFrame = originalRequest
    globalThis.cancelAnimationFrame = originalCancel
  })
  const controller = new AbortController()
  const waiting = nextFrame(controller.signal)
  const rejection = assert.rejects(waiting, /environment changed/)
  controller.abort(new Error('environment changed'))
  await rejection
  assert.equal(frames.size, 0)
  await assert.rejects(nextFrame(controller.signal), /environment changed/)
  assert.equal(frames.size, 0)
})
