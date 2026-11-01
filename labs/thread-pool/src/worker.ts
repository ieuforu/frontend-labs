import { MEM_OFFSET, POOL_STATUS, heavyWorkUnit } from './constants.ts'

self.onmessage = (event: MessageEvent<{ sab: SharedArrayBuffer }>) => {
  const shared = new Int32Array(event.data.sab)
  let lastGeneration = 0

  while (true) {
    if (Atomics.load(shared, MEM_OFFSET.STATUS) === POOL_STATUS.TERMINATED) return
    const generation = Atomics.load(shared, MEM_OFFSET.GENERATION)
    if (generation === lastGeneration) {
      Atomics.wait(shared, MEM_OFFSET.GENERATION, lastGeneration)
      continue
    }

    const total = Atomics.load(shared, MEM_OFFSET.TOTAL_TASKS)
    while (true) {
      const index = Atomics.add(shared, MEM_OFFSET.TASK_INDEX, 1)
      if (index >= total) break
      shared[MEM_OFFSET.WORK_DATA_START + index] = heavyWorkUnit(index)
      Atomics.add(shared, MEM_OFFSET.COMPLETED_COUNT, 1)
    }

    // Acknowledge only after this worker has stopped touching batch metadata.
    // The host waits for every acknowledgement before allowing another batch.
    lastGeneration = generation
    Atomics.add(shared, MEM_OFFSET.FINISHED_WORKERS, 1)
  }
}
