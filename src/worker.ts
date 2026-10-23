import { MEM_OFFSET, heavyWorkUnit } from './constants'

self.onmessage = (e: MessageEvent<{ sab: SharedArrayBuffer; workerId: number }>) => {
  const { sab, workerId } = e.data
  const sharedInt32 = new Int32Array(sab)
  const totalTasks = sharedInt32[MEM_OFFSET.TOTAL_TASKS]

  // 无锁流水线争抢循环（Work-Stealing / Lock-Free Pipeline）
  while (true) {
    // 硬件原子加：安全返回当前下标并原子性自增 1
    const taskIndex = Atomics.add(sharedInt32, MEM_OFFSET.TASK_INDEX, 1)

    if (taskIndex >= totalTasks) {
      break
    }

    // 执行计算
    const result = heavyWorkUnit(taskIndex)

    // 零拷贝直接寻址写入物理内存槽位
    sharedInt32[MEM_OFFSET.WORK_DATA_START + taskIndex] = result

    // 原子累加完成计数器
    Atomics.add(sharedInt32, MEM_OFFSET.COMPLETED_COUNT, 1)
  }

  // 通知主线程该核心分配额度已处理完毕
  self.postMessage({ type: 'DONE', workerId })
}
