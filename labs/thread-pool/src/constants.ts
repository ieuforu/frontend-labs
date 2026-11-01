export const MEM_OFFSET = {
  STATUS: 0,
  TASK_INDEX: 1,
  TOTAL_TASKS: 2,
  COMPLETED_COUNT: 3,
  GENERATION: 4,
  FINISHED_WORKERS: 5,
  WORK_DATA_START: 6,
} as const

export const POOL_STATUS = { SLEEP: 0, RUNNING: 1, TERMINATED: 2 } as const

export function heavyWorkUnit(i: number): number {
  let acc = i
  for (let j = 0; j < 3000; j++) acc = ((acc ^ j) * 1664525 + 1013904223) | 0
  return acc
}
