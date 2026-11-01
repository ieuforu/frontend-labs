import { MEM_OFFSET, POOL_STATUS } from './constants.ts'

type Result = { elapsed: number; results: Int32Array }
type ActiveRun = { timer: number; reject: (error: Error) => void }

export class PersistentThreadPool {
  private workers: Worker[] = []
  public readonly concurrency: number
  private sab: SharedArrayBuffer | null = null
  private sharedInt32: Int32Array | null = null
  private allocatedTaskCapacity = 0
  private active: ActiveRun | null = null
  private failure: Error | null = null

  constructor(concurrency: number = navigator.hardwareConcurrency || 4) {
    if (!Number.isInteger(concurrency) || concurrency < 1) {
      throw new RangeError('Concurrency must be a positive integer')
    }
    this.concurrency = concurrency
  }

  init(maxTaskCapacity = 500_000): void {
    if (this.workers.length > 0) return
    if (!Number.isInteger(maxTaskCapacity) || maxTaskCapacity < 1 || maxTaskCapacity > 0x7fffffff) {
      throw new RangeError('Capacity must be a positive Int32 task count')
    }
    this.failure = null
    this.allocatedTaskCapacity = maxTaskCapacity
    this.sab = new SharedArrayBuffer(
      (MEM_OFFSET.WORK_DATA_START + maxTaskCapacity) * Int32Array.BYTES_PER_ELEMENT,
    )
    this.sharedInt32 = new Int32Array(this.sab)

    try {
      for (let id = 0; id < this.concurrency; id++) {
        const worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' })
        worker.onerror = () => this.fail(new Error('Worker execution failed'))
        worker.onmessageerror = () => this.fail(new Error('Worker message could not be decoded'))
        this.workers.push(worker)
        worker.postMessage({ sab: this.sab })
      }
    } catch (error) {
      const failure = error instanceof Error ? error : new Error(String(error))
      this.fail(failure)
      throw failure
    }
  }

  async run(
    totalTasks: number,
    onProgress: (completed: number, total: number) => void = () => {},
  ): Promise<Result> {
    if (this.failure) throw this.failure
    const shared = this.sharedInt32
    if (!shared || !this.sab) throw new Error('Initialize the thread pool before running tasks')
    if (this.active) throw new Error('A batch is already running')
    if (
      !Number.isInteger(totalTasks) ||
      totalTasks < 0 ||
      totalTasks > this.allocatedTaskCapacity
    ) {
      throw new RangeError('Task count must be an integer within the allocated capacity')
    }
    if (totalTasks === 0) {
      onProgress(0, 0)
      return {
        elapsed: 0,
        results: shared.subarray(MEM_OFFSET.WORK_DATA_START, MEM_OFFSET.WORK_DATA_START),
      }
    }

    Atomics.store(shared, MEM_OFFSET.TASK_INDEX, 0)
    Atomics.store(shared, MEM_OFFSET.TOTAL_TASKS, totalTasks)
    Atomics.store(shared, MEM_OFFSET.COMPLETED_COUNT, 0)
    Atomics.store(shared, MEM_OFFSET.FINISHED_WORKERS, 0)
    const start = performance.now()

    return new Promise<Result>((resolve, reject) => {
      const run: ActiveRun = { timer: 0, reject }
      this.active = run
      run.timer = window.setInterval(() => {
        if (this.active !== run) return
        const completed = Atomics.load(shared, MEM_OFFSET.COMPLETED_COUNT)
        try {
          onProgress(completed, totalTasks)
        } catch (error) {
          this.fail(error instanceof Error ? error : new Error(String(error)))
          return
        }
        if (this.active !== run) return
        if (
          completed === totalTasks &&
          Atomics.load(shared, MEM_OFFSET.FINISHED_WORKERS) === this.concurrency
        ) {
          window.clearInterval(run.timer)
          this.active = null
          Atomics.store(shared, MEM_OFFSET.STATUS, POOL_STATUS.SLEEP)
          resolve({
            elapsed: performance.now() - start,
            // This view is reused by the next run. Call .slice() to retain a result.
            results: shared.subarray(
              MEM_OFFSET.WORK_DATA_START,
              MEM_OFFSET.WORK_DATA_START + totalTasks,
            ),
          })
        }
      }, 16)

      Atomics.store(shared, MEM_OFFSET.STATUS, POOL_STATUS.RUNNING)
      Atomics.add(shared, MEM_OFFSET.GENERATION, 1)
      Atomics.notify(shared, MEM_OFFSET.GENERATION, this.concurrency)
    })
  }

  destroy(): void {
    this.fail(new Error('Thread pool was destroyed'))
  }

  private fail(error: Error): void {
    this.failure = error
    if (this.active) {
      window.clearInterval(this.active.timer)
      const pending = this.active
      this.active = null
      pending.reject(error)
    }
    if (this.sharedInt32) {
      Atomics.store(this.sharedInt32, MEM_OFFSET.STATUS, POOL_STATUS.TERMINATED)
      Atomics.add(this.sharedInt32, MEM_OFFSET.GENERATION, 1)
      Atomics.notify(this.sharedInt32, MEM_OFFSET.GENERATION, this.concurrency)
    }
    for (const worker of this.workers) {
      worker.onerror = null
      worker.onmessageerror = null
      worker.terminate()
    }
    this.workers = []
    this.sab = null
    this.sharedInt32 = null
  }
}
