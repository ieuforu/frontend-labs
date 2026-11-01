import assert from 'node:assert/strict'
import { getEventListeners } from 'node:events'
import { test } from 'node:test'
import { TaskScheduler, PriorityLevel } from '../labs/task-slicer/src/scheduler.ts'

function harness(t) {
  const callbacks = []
  globalThis.window = {
    scheduler: { yield: () => ({ then: (callback) => callbacks.push(callback) }) },
  }
  const scheduler = new TaskScheduler()
  t.after(() => {
    scheduler.destroy()
    delete globalThis.window
  })
  const drain = () => {
    let frames = 0
    while (callbacks.length) {
      assert.ok(++frames < 100, 'scheduler must eventually drain')
      callbacks.shift()()
    }
    return frames
  }
  return { scheduler, callbacks, drain }
}

test('a completed callback is not repeated when it enqueues higher priority work', (t) => {
  const { scheduler, drain } = harness(t)
  const calls = []
  scheduler.postTask(() => {
    calls.push('normal')
    scheduler.postTask(
      () => {
        calls.push('immediate')
      },
      { priority: PriorityLevel.Immediate },
    )
    assert.equal(scheduler.shouldYield(), true)
  })
  drain()
  assert.deepEqual(calls, ['normal', 'immediate'])
})

test('continuations resume after higher priority work', (t) => {
  const { scheduler, drain } = harness(t)
  const calls = []
  scheduler.postTask(() => {
    calls.push('normal')
    if (calls.length === 1) {
      scheduler.postTask(
        () => {
          calls.push('immediate')
        },
        { priority: PriorityLevel.Immediate },
      )
      return true
    }
    return false
  })
  drain()
  assert.deepEqual(calls, ['normal', 'immediate', 'normal'])
})

test('cancelled work does not execute and completed work releases its abort listener', (t) => {
  const { scheduler, drain } = harness(t)
  const cancelled = new AbortController()
  const completed = new AbortController()
  let calls = 0
  scheduler.postTask(
    () => {
      calls++
    },
    { signal: cancelled.signal },
  )
  scheduler.postTask(
    () => {
      calls++
    },
    { signal: completed.signal },
  )
  cancelled.abort()
  drain()
  assert.equal(calls, 1)
  assert.equal(getEventListeners(completed.signal, 'abort').length, 0)
  assert.equal(getEventListeners(cancelled.signal, 'abort').length, 0)
})

test('a throwing task is retired and remaining tasks can continue', (t) => {
  const { scheduler, callbacks, drain } = harness(t)
  const calls = []
  scheduler.postTask(
    () => {
      calls.push('failed')
      throw new Error('expected failure')
    },
    { priority: 0 },
  )
  scheduler.postTask(() => {
    calls.push('next')
  })
  assert.throws(() => callbacks.shift()(), /expected failure/)
  drain()
  assert.deepEqual(calls, ['failed', 'next'])
})

test('a cooperative continuation yields after its frame budget', (t) => {
  let now = 0
  t.mock.method(performance, 'now', () => now)
  const { scheduler, drain } = harness(t)
  let count = 0
  scheduler.postTask(() => {
    now += 6
    assert.equal(scheduler.shouldYield(), true)
    return ++count < 2
  })
  assert.equal(drain(), 2)
  assert.equal(count, 2)
})

test('MessageChannel fallback delivers work and can be destroyed', async () => {
  delete globalThis.window
  const scheduler = new TaskScheduler()
  try {
    assert.equal(scheduler.isNativeYieldSupported, false)
    await new Promise((resolve) => scheduler.postTask(resolve))
  } finally {
    scheduler.destroy()
  }
  assert.throws(() => scheduler.postTask(() => {}), /destroyed/)
})
