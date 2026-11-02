# 迁移记录

2026-11-01 将三个浏览器实验接入本仓库，保留原仓库默认分支的全部 8 个提交。

| 原仓库                                                          | 目录              | 导入时 main                              |
| --------------------------------------------------------------- | ----------------- | ---------------------------------------- |
| [task-slicer-lab](https://github.com/ieuforu/task-slicer-lab)   | labs/task-slicer  | e55fd497a997aba0c65525de39c2ffb37738cde4 |
| [thread-pool-lab](https://github.com/ieuforu/thread-pool-lab)   | labs/thread-pool  | 8d8b74e3f603a1e23d5ee42877825195d118ec10 |
| [virtual-list-lab](https://github.com/ieuforu/virtual-list-lab) | labs/virtual-list | d7d07b8de32c20b7a1eb3ddc405bfcab731d4d23 |

每次导入建立一个双父合并提交，并将原树写入对应的 labs 子目录。
原始提交对象未重写，因此作者、时间、消息和 SHA 不变。
迁移前提交中的文件仍在原路径；迁移后位于 labs 路径。

```sh
git log --graph --oneline --all
git show migration/task-slicer-lab
git show migration/thread-pool-lab
git show migration/virtual-list-lab
git merge-base --is-ancestor e55fd497a997aba0c65525de39c2ffb37738cde4 main
git merge-base --is-ancestor 8d8b74e3f603a1e23d5ee42877825195d118ec10 main
git merge-base --is-ancestor d7d07b8de32c20b7a1eb3ddc405bfcab731d4d23 main
```

检查提交的祖先关系命令以退出码 0 表示成功。

## 导入后的整理

- 使用一个 pnpm workspace、锁文件、格式配置、TypeScript 基础配置及 CI。
- 保留原包名、独立 HTML 入口、Vite 构建和线程池隔离响应头。
- 构建检查统一使用 TypeScript；删除三个重复的 tsrs 实验依赖。
- 修复调度器完成任务被重复执行，补齐 shouldYield 与生命周期清理。
- 线程池改为批次序号唤醒，增加完成屏障、重叠调用保护及异常/销毁收尾。
- 虚拟列表在高度变化后重新定位，处理视口变化、节点池扩展及销毁。
- 移除缺少测量记录的性能数字，明确实验与测试的边界。

原仓库的 Issue、PR、Star 和仓库设置不会随 Git 提交历史迁移。
旧仓库迁移说明与归档应在新仓库推送并验证完成后处理。

## Infinite Canvas（2026-11-02）

将 [infinite-canvas-core](https://github.com/ieuforu/infinite-canvas-core) 迁入 `labs/infinite-canvas`，
导入时 main 为 `6fc38dbea9c17148d366265a246671823b2d2007`，共 5 个提交。
双父合并提交 `7378b09` 保留全部原始提交对象；迁移标签为 `migration/infinite-canvas-core`。

```sh
git show migration/infinite-canvas-core
git merge-base --is-ancestor 6fc38dbea9c17148d366265a246671823b2d2007 main
```

- 保留包名 `infinite-canvas-core`；使用共享 TypeScript、依赖、锁文件与 CI。
- 加入第四张首页卡片、统一导航、`pnpm dev:canvas` 和 `/infinite-canvas/` 子路径构建。
- 画布尺寸与坐标改为相对容器，使用指针捕获并处理取消，避免导航与滚轮冲突。
- 批量拖动限制在场景边界，避免图形被移出固定四叉树后丢失。
- 补充范围查询、去重、移动重索引、边界、锚点缩放和框选回归测试。
- 更新实验说明，区分可无限漫游的视口与固定场景，移除固定帧率和零 GC 保证。

旧仓库在新仓库推送并验证后添加迁移说明并归档；原始截图继续保留。
