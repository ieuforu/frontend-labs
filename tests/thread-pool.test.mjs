import assert from 'node:assert/strict'
import { setTimeout as delay } from 'node:timers/promises'
import { test } from 'node:test'
import { BrowserWorker } from './support/browser-worker.mjs'
import { PersistentThreadPool } from '../labs/thread-pool/src/pool.ts'
import { MEM_OFFSET, POOL_STATUS, heavyWorkUnit } from '../labs/thread-pool/src/constants.ts'

globalThis.Worker = BrowserWorker
globalThis.window = { setInterval, clearInterval }

async function waitFor(check) {
  const until = Date.now() + 5000
  while (!check()) {
    assert.ok(Date.now() < until, 'worker did not complete within five seconds')
    await delay(5)
  }
}

test(
  'an exhausted worker parks even while the host still reports RUNNING',
  { timeout: 6000 },
  async (t) => {
    const worker = new BrowserWorker(new URL('../labs/thread-pool/src/worker.ts', import.meta.url))
    t.after(() => worker.terminate())
    const sab = new SharedArrayBuffer((MEM_OFFSET.WORK_DATA_START + 1) * 4)
    const shared = new Int32Array(sab)
    Atomics.store(shared, MEM_OFFSET.TOTAL_TASKS, 1)
    Atomics.store(shared, MEM_OFFSET.STATUS, POOL_STATUS.RUNNING)
    Atomics.store(shared, MEM_OFFSET.GENERATION, 1)
    worker.postMessage({ sab })
    await waitFor(() => Atomics.load(shared, MEM_OFFSET.FINISHED_WORKERS) === 1)
    const index = Atomics.load(shared, MEM_OFFSET.TASK_INDEX)
    await delay(30)
    assert.equal(Atomics.load(shared, MEM_OFFSET.TASK_INDEX), index)
    assert.equal(index, 2)
    assert.equal(shared[MEM_OFFSET.WORK_DATA_START], heavyWorkUnit(0))
  },
)

test(
  'sequential batches compute every result and overlapping batches are rejected',
  { timeout: 10000 },
  async (t) => {
    const pool = new PersistentThreadPool(3)
    t.after(() => pool.destroy())
    pool.init(100)
    const first = pool.run(64)
    await assert.rejects(pool.run(2), /already running/)
    const a = (await first).results.slice()
    const b = (await pool.run(7)).results.slice()
    assert.deepEqual(
      [...a],
      Array.from({ length: 64 }, (_, i) => heavyWorkUnit(i)),
    )
    assert.deepEqual(
      [...b],
      Array.from({ length: 7 }, (_, i) => heavyWorkUnit(i)),
    )
    assert.equal((await pool.run(0)).results.length, 0)
    await assert.rejects(pool.run(-1), /Task count/)
    await assert.rejects(pool.run(101), /Task count/)
  },
)

test(
  'destroy rejects a pending batch and the pool can be initialized again',
  { timeout: 10000 },
  async () => {
    const pool = new PersistentThreadPool(2)
    pool.init(100)
    const pending = pool.run(100)
    pool.destroy()
    await assert.rejects(pending, /destroyed/)
    pool.init(10)
    try {
      assert.equal((await pool.run(2)).results.length, 2)
    } finally {
      pool.destroy()
    }
  },
)

test('worker failure rejects a pending batch instead of leaving its polling timer alive', async (t) => {
  const pool = new PersistentThreadPool(1)
  t.after(() => pool.destroy())
  pool.init(10)
  const pending = pool.run(10)
  pool.workers[0].onerror(new Error('simulated worker failure'))
  await assert.rejects(pending, /Worker execution failed/)
  assert.equal(pool.active, null)
})
