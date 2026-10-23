export const MEM_OFFSET = {
  TASK_INDEX: 0, // 全局流水线原子取号器下标 (Atomics.add)
  TOTAL_TASKS: 1, // 任务总数
  COMPLETED_COUNT: 2, // 已完成子任务原子计数
  WORK_DATA_START: 3, // 实际计算产物存储的起始物理地址
} as const

// 算力消耗函数（防 V8 优化器死代码消除）
export function heavyWorkUnit(i: number): number {
  let acc = i
  for (let j = 0; j < 3000; j++) {
    acc = ((acc ^ j) * 1664525 + 1013904223) | 0
  }
  return acc
}
