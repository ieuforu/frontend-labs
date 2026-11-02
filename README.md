# Frontend Labs

四个可以独立运行的浏览器实验：协作调度、多线程计算、动态虚拟滚动与无限画布。
从[实验首页](https://labs.selena.ink/)选择一个开始，通过侧边导航切换实验。
关注实现原理、可观察行为和限制，适合学习与验证想法。

| 实验                                              | 问题                                       | 启动               |
| ------------------------------------------------- | ------------------------------------------ | ------------------ |
| [Task Slicer](labs/task-slicer/README.md)         | 如何把长任务切开，并安排优先级与取消       | `pnpm dev:task`    |
| [Thread Pool](labs/thread-pool/README.md)         | 如何用 Worker 和共享内存分配 CPU 工作      | `pnpm dev:threads` |
| [Virtual List](labs/virtual-list/README.md)       | 固定数据对照全量 DOM 与不定高虚拟列表      | `pnpm dev:list`    |
| [Infinite Canvas](labs/infinite-canvas/README.md) | 如何用空间索引查询、绘制和框选视口中的图形 | `pnpm dev:canvas`  |

## 开始

需要 Node.js 24+ 和 pnpm 11.25.0。

```sh
git clone https://github.com/ieuforu/frontend-labs.git
cd frontend-labs
pnpm install --frozen-lockfile
pnpm dev:task
```

打开终端输出的 Vite 地址。每个实验保留自己的 HTML、源码、构建产物和运行入口。
`pnpm dev:home` 单独开发首页；独立开发服务器只提供当前页面，跨实验导航需要组合部署。
也可以直接使用原包名：

```sh
pnpm --filter thread-pool-lab dev
pnpm --filter virtual-list-lab build
pnpm --filter task-slicer-lab preview
```

## 检查

```sh
pnpm check
```

依次执行格式检查、首页和四个实验的 TypeScript 检查、回归测试和生产构建。
构建产物分别位于 `labs/*/dist`。根目录统一维护依赖、锁文件和基础配置。

测试使用 Node.js 内置测试运行器。线程池测试通过一层消息适配运行真实 Worker 线程和原始计算代码；
虚拟列表测试使用可控 DOM/ResizeObserver 替身，验证状态和生命周期，不代表真实浏览器布局或性能测试。

Virtual List 另提供同一视口下的普通列表/虚拟列表对照：有界规模、预热、交替轮次、原始时间和环境 JSON 导出。10 万条模式保留为虚拟列表探索。详见[实验协议与源码导读](labs/virtual-list/README.md)。

## 如何测量

1. 记录浏览器、操作系统、CPU、屏幕刷新率、数据量与测试模式。
2. 先预热，再重复运行，保留每轮数据；比较中位数及波动。
3. 结合浏览器 Performance 面板观察长任务、帧时间和内存。
4. 改变输入规模、内容高度和窗口大小，检查正确性后再比较耗时。

界面中的 FPS 和耗时是当前环境的观察值。这里不承诺固定帧率、零 GC 或生产级兼容性，
也没有保留旧 README 中缺少可复现记录的性能对照数字。

## 部署

运行 `pnpm build:site`，将首页和四个实验按正式路径构建并组合到根目录 `dist/`。
将该目录整体部署为静态站点即可保留统一导航。Thread Pool 额外要求安全上下文与跨源隔离；
其 Vite dev/preview 已配置响应头，生产服务器必须自行配置。详见该实验说明。

线上入口：[实验首页](https://labs.selena.ink/)、
[Virtual List](https://labs.selena.ink/virtual-list/)、
[Task Slicer](https://labs.selena.ink/task-slicer/)、
[Thread Pool](https://labs.selena.ink/thread-pool/)。
Infinite Canvas 的组合部署路径为 `/infinite-canvas/`。
子路径构建、Caddy 配置和回滚方式见[静态部署说明](deploy/README.md)。

## 来源与历史

本仓库由四个原仓库迁入，导入时保留原提交 SHA、作者和时间，并通过合并提交接入 `main`。
源码移动到 `labs/` 后统一配置、补充边界测试并修正已知问题。
[迁移记录](docs/migration.md) 列出原始提交与检查方式。

2026-11-02 将 `infinite-canvas-core` 接入 `labs/infinite-canvas`，保留其全部 5 个原始提交。
画布按容器布局，输入限制在画布内，并为场景边界、空间查询与坐标变换补充回归测试。

## License

沿用原实验 README 的 MIT 声明。
