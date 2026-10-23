export const MEM_OFFSET = {
  STATUS: 0, // 线程池状态: 0 = 待机休眠, 1 = 工作运行, 2 = 销毁退出
  TASK_INDEX: 1, // 全局原子取号下标 (Atomics.add)
  TOTAL_TASKS: 2, // 任务总数
  COMPLETED_COUNT: 3, // 已完成子任务原子计数
  WORK_DATA_START: 4, // 计算产物起始物理内存地址
} as const

export const POOL_STATUS = {
  SLEEP: 0,
  RUNNING: 1,
  TERMINATED: 2,
} as const

// 算力消耗函数（防 V8 优化器死代码消除）
export function heavyWorkUnit(i: number): number {
  let acc = i
  for (let j = 0; j < 3000; j++) {
    acc = ((acc ^ j) * 1664525 + 1013904223) | 0
  }
  return acc
}
