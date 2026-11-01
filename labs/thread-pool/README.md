# Thread Pool

比较同一份整数运算的三种执行方式：同步主线程、协作切片、共享内存 Worker 池。
计算函数固定在 `src/constants.ts`，此实验不是可提交任意函数的通用线程池。

## 运行

在仓库根目录：

```sh
pnpm dev:threads
pnpm --filter thread-pool-lab build
pnpm --filter thread-pool-lab preview
```

浏览器必须支持 SharedArrayBuffer，并处于安全上下文和跨源隔离状态。
Vite dev 与 preview 已设置：

```http
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

生产静态服务器也需要设置上述响应头。第三方资源必须满足相应的跨源加载要求。
界面会显示 `crossOriginIsolated` 状态。

## 同步协议

共享 Int32Array 保存状态、下一个任务编号、任务数、完成数、批次序号、结束工作线程数和结果。
主线程先写好批次元数据，再递增批次序号并唤醒 Worker。

Worker 使用 Atomics.add 领取任务。耗尽本批工作后确认完成，随后等待**批次序号变化**，
不会因主线程尚未写回休眠状态而持续空转。
主线程收到所有 Worker 的批次完成确认后才允许下一批重置共享元数据。

## 使用边界

- `init(capacity)` 创建常驻 Worker 与共享内存；`run(count, onProgress)` 运行一批。
- 同时只允许一批任务；重叠调用会拒绝。
- Worker 异常、进度回调异常和 `destroy()` 会拒绝当前 Promise 并释放线程与轮询器。
- 返回的 results 是共享内存视图，下一批会复用；需要保留时调用 `results.slice()`。
- 轮询间隔为 16ms，显示耗时包含完成通知延迟。线程数越多不一定越快。
- 不提供排队、自动重启、单任务取消、动态扩容或跨浏览器性能保证。

## 测量

对相同任务量分别运行三个模式，记录设备、浏览器、Worker 数和多轮耗时。
共享内存减少数据复制，但原子操作、线程调度、缓存争用和主线程进度显示仍有成本。
不能把共享内存称为“零通信成本”，也不能据此推断固定加速比。

根目录 `pnpm test` 使用真实 Node Worker 线程执行同一计算与同步循环，
覆盖批次结束后休眠、连续批次结果、重叠调用、销毁和错误处理。
浏览器隔离策略及 UI 性能需要在目标浏览器中另外验证。

## 来源

迁自 [thread-pool-lab](https://github.com/ieuforu/thread-pool-lab)，完整原始历史已保留。原 README 声明 MIT。
