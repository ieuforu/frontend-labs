import { MEM_OFFSET, POOL_STATUS, heavyWorkUnit } from './constants'

self.onmessage = (e: MessageEvent<{ sab: SharedArrayBuffer; workerId: number }>) => {
  const { sab } = e.data
  const sharedInt32 = new Int32Array(sab)

  // 常驻工作循环（Persistent Event Loop）
  while (true) {
    // 1. 如果状态为 SLEEP(0)，线程挂起进入深度内核休眠，等待主线程 notify 唤醒
    // Atomics.wait 仅允许在 Worker 线程调用，会阻塞线程且 CPU 消耗为 0
    Atomics.wait(sharedInt32, MEM_OFFSET.STATUS, POOL_STATUS.SLEEP)

    // 检查是否收到终结销毁指令
    if (Atomics.load(sharedInt32, MEM_OFFSET.STATUS) === POOL_STATUS.TERMINATED) {
      break
    }

    const totalTasks = Atomics.load(sharedInt32, MEM_OFFSET.TOTAL_TASKS)

    // 2. 唤醒后：进入无锁争抢流水线
    while (true) {
      const taskIndex = Atomics.add(sharedInt32, MEM_OFFSET.TASK_INDEX, 1)
      if (taskIndex >= totalTasks) {
        break // 任务池已被清空
      }

      // 执行纯 CPU 运算
      const result = heavyWorkUnit(taskIndex)

      // 物理共享内存零拷贝写入
      sharedInt32[MEM_OFFSET.WORK_DATA_START + taskIndex] = result

      // 原子累加完成数
      Atomics.add(sharedInt32, MEM_OFFSET.COMPLETED_COUNT, 1)
    }
  }
}
