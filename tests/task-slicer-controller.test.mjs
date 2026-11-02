import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { stripTypeScriptTypes } from 'node:module'
import { test } from 'node:test'
import { runInNewContext } from 'node:vm'
import { TaskScheduler, PriorityLevel } from '../labs/task-slicer/src/scheduler.ts'

class Element extends EventTarget {
  textContent = ''
  style = {}
  attributes = new Map()
  setAttribute(name, value) {
    this.attributes.set(name, value)
  }
  getContext() {
    return {}
  }
  click() {
    this.dispatchEvent(new Event('click'))
  }
}

test('the task controller can cancel partial work, restart, and reject duplicate starts', async (t) => {
  const elements = new Map()
  const getElementById = (id) => {
    if (!elements.has(id)) elements.set(id, new Element())
    return elements.get(id)
  }
  const callbacks = []
  const tasks = []
  const previousWindow = globalThis.window
  let clock = 0
  let scheduler
  t.mock.method(performance, 'now', () => ++clock)
  globalThis.window = {
    scheduler: { yield: () => ({ then: (callback) => callbacks.push(callback) }) },
  }
  t.after(() => {
    scheduler?.destroy()
    if (previousWindow === undefined) delete globalThis.window
    else globalThis.window = previousWindow
  })

  class RecordingScheduler extends TaskScheduler {
    constructor() {
      super()
      scheduler = this
    }
    postTask(callback, options) {
      const task = super.postTask(callback, options)
      tasks.push(task)
      return task
    }
  }

  // Run the actual UI controller with the real scheduler. Only style/navigation
  // imports and browser rendering are omitted; no controller logic is replaced.
  const source = await readFile(new URL('../labs/task-slicer/src/main.ts', import.meta.url), 'utf8')
  const controller = stripTypeScriptTypes(source.replace(/^import .*\n/gm, ''))
  runInNewContext(controller, {
    document: { getElementById },
    requestAnimationFrame: () => 0,
    performance,
    AbortController,
    TaskScheduler: RecordingScheduler,
    PriorityLevel,
  })

  const start = getElementById('btn-bg')
  const cancel = getElementById('btn-cancel')
  const status = getElementById('status')
  const progress = getElementById('progress')
  const flushOne = () => {
    assert.ok(callbacks.length > 0, 'there must be a scheduled continuation')
    callbacks.shift()()
  }

  start.click()
  start.click()
  assert.equal(tasks.length, 1, 'a second click before the first slice must not queue another task')
  flushOne()
  assert.match(status.textContent, /后台切片推进中/)
  assert.notEqual(progress.style.width, '100%', 'the first slice must leave unfinished work')
  start.click()
  assert.equal(tasks.length, 1, 'a second click during partial work must not queue another task')

  cancel.click()
  assert.equal(tasks[0].signal.aborted, true)
  assert.match(status.textContent, /任务已取消/)
  const cancelledStatus = status.textContent
  flushOne()
  assert.equal(status.textContent, cancelledStatus, 'the cancelled continuation must not run')
  assert.equal(callbacks.length, 0)

  start.click()
  assert.equal(tasks.length, 2, 'starting after cancellation must enqueue fresh work')
  assert.equal(tasks[1].signal.aborted, false)
  assert.notEqual(tasks[0].signal, tasks[1].signal)
  assert.equal(progress.style.width, '0%')
  start.click()
  assert.equal(tasks.length, 2, 'restarted work must also reject duplicate starts')

  // Advance the controlled clock beyond the scheduler's starvation deadline so
  // the resumed run completes in one callback, without a wall-clock wait.
  clock += 1000
  flushOne()
  assert.match(status.textContent, /执行完成，总耗时/)
  assert.equal(progress.style.width, '100%')
  assert.equal(callbacks.length, 0)

  cancel.click()
  assert.match(getElementById('log').textContent, /^\[.*\] 当前没有运行中的后台任务可取消/)
  assert.match(status.textContent, /执行完成，总耗时/)
})
