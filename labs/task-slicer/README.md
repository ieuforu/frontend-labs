# Task Slicer

一个协作式主线程任务调度实验，用最小堆按到期时间安排任务，并观察长任务切片、优先级和取消。

## 运行

在仓库根目录：

```sh
pnpm dev:task
pnpm --filter task-slicer-lab build
```

页面可以投递后台计算、高优先级任务、取消后台工作，以及制造持续高优先级负载。

## 实现

- 每轮调度设置约 5ms 的预算；回调需要主动检查 `shouldYield()` 并返回 `true` 表示继续。
- 优先使用浏览器 `scheduler.yield()`，否则使用 MessageChannel。
- 任务从堆中取出后才调用回调；仅未完成任务重新入队，避免回调插入高优任务后被重复执行。
- AbortSignal 只影响后续调度，无法中断一个正在同步执行的 JavaScript 回调。
- 完成、取消和销毁时移除 abort 监听，`destroy()` 关闭 MessageChannel。

当前实验的到期偏移为 Immediate -1ms、UserBlocking 250ms、Normal 500ms、Background 800ms。
到期任务会收到 `didTimeout = true`；示例随后同步完成剩余工作，这可能产生长任务，正是实验要观察的取舍。

## 示例

```ts
import { TaskScheduler, PriorityLevel } from './src/scheduler.ts'

const scheduler = new TaskScheduler()
const controller = new AbortController()
let index = 0

scheduler.postTask(
  (didTimeout) => {
    while (index < items.length) {
      processItem(items[index++])
      if (!didTimeout && scheduler.shouldYield()) return true
    }
    return false
  },
  { priority: PriorityLevel.Background, signal: controller.signal },
)

// controller.abort()
// scheduler.destroy()
```

`items` 和 `processItem` 由调用方提供。一次 `processItem` 本身也必须足够短；
调度器无法抢占一个长时间不返回的函数。

## 验证与限制

根目录 `pnpm test` 验证回调插队、继续执行、取消、异常恢复、时间预算和 MessageChannel fallback。
调度不是帧率保证；布局、绘制和其他脚本同样消耗主线程时间。
实验不提供延时任务、完整任务生命周期事件或通用错误处理策略。

## 来源

迁自 [task-slicer-lab](https://github.com/ieuforu/task-slicer-lab)，完整原始历史已保留。原 README 声明 MIT。
