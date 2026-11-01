import { MEM_OFFSET, POOL_STATUS } from './constants'

export class PersistentThreadPool {
  private workers: Worker[] = []
  public readonly concurrency: number
  private sab: SharedArrayBuffer | null = null
  private sharedInt32: Int32Array | null = null
  private allocatedTaskCapacity = 0

  constructor(concurrency: number = navigator.hardwareConcurrency || 4) {
    this.concurrency = concurrency
  }

  /**
   * 初始化常驻线程池（只分配一次线程，常驻后台）
   */
  init(maxTaskCapacity: number = 500_000): void {
    if (this.workers.length > 0) return

    this.allocatedTaskCapacity = maxTaskCapacity
    const totalSlots = MEM_OFFSET.WORK_DATA_START + maxTaskCapacity
    const byteLength = totalSlots * Int32Array.BYTES_PER_ELEMENT

    this.sab = new SharedArrayBuffer(byteLength)
    this.sharedInt32 = new Int32Array(this.sab)

    // 初始状态置为 SLEEP
    Atomics.store(this.sharedInt32, MEM_OFFSET.STATUS, POOL_STATUS.SLEEP)

    // 创建常驻 Workers 并注入共享内存引用
    this.workers = Array.from({ length: this.concurrency }, (_, id) => {
      const worker = new Worker(new URL('./worker.ts', import.meta.url), {
        type: 'module',
      })
      worker.postMessage({ sab: this.sab, workerId: id })
      return worker
    })
  }

  /**
   * 唤醒常驻线程执行计算任务（零线程创建开销）
   */
  async run(
    totalTasks: number,
    onProgress: (completed: number, total: number) => void,
  ): Promise<{ elapsed: number; results: Int32Array }> {
    if (!this.sharedInt32 || !this.sab) {
      throw new Error('ThreadPool must be initialized before running tasks.')
    }
    if (totalTasks > this.allocatedTaskCapacity) {
      throw new Error(`Tasks count exceeds allocated capacity (${this.allocatedTaskCapacity}).`)
    }

    // 重置本轮任务元数据
    Atomics.store(this.sharedInt32, MEM_OFFSET.TASK_INDEX, 0)
    Atomics.store(this.sharedInt32, MEM_OFFSET.TOTAL_TASKS, totalTasks)
    Atomics.store(this.sharedInt32, MEM_OFFSET.COMPLETED_COUNT, 0)

    const t0 = performance.now()

    // 1. 修改状态为 RUNNING 并发出原子广播唤醒所有休眠核心
    Atomics.store(this.sharedInt32, MEM_OFFSET.STATUS, POOL_STATUS.RUNNING)
    Atomics.notify(this.sharedInt32, MEM_OFFSET.STATUS, this.concurrency)

    // 2. 主线程轻量轮询完成进度
    await new Promise<void>((resolve) => {
      const timer = window.setInterval(() => {
        const completed = Atomics.load(this.sharedInt32!, MEM_OFFSET.COMPLETED_COUNT)
        onProgress(completed, totalTasks)

        if (completed >= totalTasks) {
          clearInterval(timer)
          // 任务完成后，状态重置为 SLEEP，让 Workers 自动休眠归位
          Atomics.store(this.sharedInt32!, MEM_OFFSET.STATUS, POOL_STATUS.SLEEP)
          resolve()
        }
      }, 16)
    })

    const elapsed = performance.now() - t0
    onProgress(totalTasks, totalTasks)

    const results = this.sharedInt32.subarray(
      MEM_OFFSET.WORK_DATA_START,
      MEM_OFFSET.WORK_DATA_START + totalTasks,
    )

    return { elapsed, results }
  }

  /**
   * 销毁常驻线程池
   */
  destroy(): void {
    if (this.sharedInt32) {
      Atomics.store(this.sharedInt32, MEM_OFFSET.STATUS, POOL_STATUS.TERMINATED)
      Atomics.notify(this.sharedInt32, MEM_OFFSET.STATUS, this.concurrency)
    }
    this.workers.forEach((w) => w.terminate())
    this.workers = []
    this.sab = null
    this.sharedInt32 = null
  }
}
