import { MinHeap, type HeapItem } from './minHeap.ts'

export const PriorityLevel = {
  Immediate: 0,
  UserBlocking: 1,
  Normal: 2,
  Background: 3,
} as const

export type PriorityLevel = (typeof PriorityLevel)[keyof typeof PriorityLevel]

// Short deadlines make starvation observable in this experiment.
const TIMEOUT_CONFIG: Record<PriorityLevel, number> = {
  [PriorityLevel.Immediate]: -1,
  [PriorityLevel.UserBlocking]: 250,
  [PriorityLevel.Normal]: 500,
  [PriorityLevel.Background]: 800,
}

export type TaskCallback = (didTimeout: boolean) => boolean | void

export interface TaskOptions {
  priority?: PriorityLevel
  signal?: AbortSignal
}

export interface Task extends HeapItem {
  id: number
  priority: PriorityLevel
  startTime: number
  expirationTime: number
  callback: TaskCallback
  signal?: AbortSignal
  isCancelled: boolean
  cancel: () => void
  abortListener?: () => void
}

export class TaskScheduler {
  private taskQueue = new MinHeap<Task>()
  private taskIdCounter = 1
  private isHostCallbackScheduled = false
  private isPerformingWork = false
  private currentTask: Task | null = null
  private deadline = 0
  private destroyed = false
  private channel: MessageChannel | null = null
  private nativeYield?: () => Promise<void>
  public readonly isNativeYieldSupported: boolean

  public onStarvationResolved?: (task: Task, waitTimeMs: number) => void

  constructor() {
    const host =
      typeof window === 'undefined'
        ? undefined
        : (window as Window & {
            scheduler?: { yield: () => Promise<void> }
          })
    if (typeof host?.scheduler?.yield === 'function') {
      this.nativeYield = host.scheduler.yield.bind(host.scheduler)
    }
    this.isNativeYieldSupported = Boolean(this.nativeYield)
    if (!this.nativeYield) {
      this.channel = new MessageChannel()
      this.channel.port1.onmessage = () => this.performWorkUntilDeadline()
    }
  }

  postTask(callback: TaskCallback, options: TaskOptions = {}): Task {
    if (this.destroyed) throw new Error('Scheduler has been destroyed')
    const priority = options.priority ?? PriorityLevel.Normal
    if (!(priority in TIMEOUT_CONFIG)) throw new RangeError('Unknown priority')
    const startTime = performance.now()
    const expirationTime = startTime + TIMEOUT_CONFIG[priority]

    const task: Task = {
      id: this.taskIdCounter++,
      priority,
      startTime,
      expirationTime,
      sortIndex: expirationTime,
      callback,
      signal: options.signal,
      isCancelled: false,
      cancel: () => {
        task.isCancelled = true
        this.release(task)
      },
    }

    if (task.signal?.aborted) {
      task.isCancelled = true
    } else if (task.signal) {
      task.abortListener = task.cancel
      task.signal.addEventListener('abort', task.abortListener, { once: true })
    }

    this.taskQueue.push(task)
    this.requestHostCallback()
    return task
  }

  shouldYield(): boolean {
    if (!this.isPerformingWork) return false
    const next = this.taskQueue.peek()
    return (
      performance.now() >= this.deadline ||
      Boolean(next && this.currentTask && next.sortIndex < this.currentTask.sortIndex)
    )
  }

  destroy(): void {
    this.destroyed = true
    this.currentTask?.cancel()
    for (let task = this.taskQueue.pop(); task; task = this.taskQueue.pop()) task.cancel()
    this.channel?.port1.close()
    this.channel?.port2.close()
  }

  private release(task: Task) {
    if (task.abortListener) {
      task.signal?.removeEventListener('abort', task.abortListener)
      task.abortListener = undefined
    }
  }

  private requestHostCallback() {
    if (this.destroyed || this.isHostCallbackScheduled || this.isPerformingWork) return
    this.isHostCallbackScheduled = true
    if (this.nativeYield) {
      void this.nativeYield().then(() => this.performWorkUntilDeadline())
    } else {
      this.channel!.port2.postMessage(null)
    }
  }

  private performWorkUntilDeadline() {
    this.isHostCallbackScheduled = false
    if (this.destroyed) return
    this.isPerformingWork = true
    this.deadline = performance.now() + 5

    try {
      for (let next = this.taskQueue.peek(); next; next = this.taskQueue.peek()) {
        if (next.isCancelled || next.signal?.aborted) {
          this.release(this.taskQueue.pop()!)
          continue
        }

        const now = performance.now()
        const didTimeout = next.expirationTime <= now
        if (now >= this.deadline && !didTimeout) break

        // Remove before calling user code: the callback may enqueue an earlier deadline.
        const task = this.taskQueue.pop()!
        this.currentTask = task
        let continuing = false
        try {
          if (didTimeout) this.onStarvationResolved?.(task, now - task.startTime)
          continuing =
            task.callback(didTimeout) === true &&
            !task.isCancelled &&
            !task.signal?.aborted &&
            !this.destroyed
        } finally {
          if (continuing) this.taskQueue.push(task)
          else this.release(task)
          this.currentTask = null
        }
      }
    } finally {
      this.isPerformingWork = false
      if (this.taskQueue.size > 0) this.requestHostCallback()
    }
  }
}
