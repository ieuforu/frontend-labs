import { MEM_OFFSET } from './constants'

export class WorkerThreadPool {
  private workers: Worker[] = []
  public readonly concurrency: number

  constructor(concurrency: number = navigator.hardwareConcurrency || 4) {
    this.concurrency = concurrency
  }

  async runParallel(
    totalTasks: number,
    onProgress: (completed: number, total: number) => void,
  ): Promise<{ elapsed: number; results: Int32Array }> {
    // 1. 分配一块物理共享连续内存：元数据区 + 产物区
    const totalSlots = MEM_OFFSET.WORK_DATA_START + totalTasks
    const byteLength = totalSlots * Int32Array.BYTES_PER_ELEMENT
    const sab = new SharedArrayBuffer(byteLength)
    const sharedInt32 = new Int32Array(sab)

    // 初始化控制元数据
    sharedInt32[MEM_OFFSET.TASK_INDEX] = 0
    sharedInt32[MEM_OFFSET.TOTAL_TASKS] = totalTasks
    sharedInt32[MEM_OFFSET.COMPLETED_COUNT] = 0

    const t0 = performance.now()

    // 2. 按照核心数并发创建并唤醒 Worker
    this.workers = Array.from({ length: this.concurrency }, () => {
      return new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' })
    })

    const completionPromises = this.workers.map((worker, id) => {
      return new Promise<void>((resolve) => {
        worker.onmessage = (e) => {
          if (e.data.type === 'DONE') resolve()
        }
        worker.postMessage({ sab, workerId: id })
      })
    })

    // 3. 轮询共享内存进度（零通信通信开销，仅读内存）
    const progressTimer = window.setInterval(() => {
      const completed = Atomics.load(sharedInt32, MEM_OFFSET.COMPLETED_COUNT)
      onProgress(completed, totalTasks)
      if (completed >= totalTasks) {
        clearInterval(progressTimer)
      }
    }, 16)

    // 等待所有核心完成
    await Promise.all(completionPromises)
    clearInterval(progressTimer)

    // 销毁 Workers 释放线程资源
    this.workers.forEach((w) => w.terminate())
    this.workers = []

    const elapsed = performance.now() - t0
    onProgress(totalTasks, totalTasks)

    const results = sharedInt32.subarray(
      MEM_OFFSET.WORK_DATA_START,
      MEM_OFFSET.WORK_DATA_START + totalTasks,
    )

    return { elapsed, results }
  }
}
