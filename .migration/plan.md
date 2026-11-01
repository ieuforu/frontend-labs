# 待授权的一次性迁移发布

此文件仅是供审阅的文档，不会作为 GitHub Actions 工作流执行。

## 已准备

- 已完整导入三个原仓库的 8 个提交，原 SHA、作者和时间不变。
- 已统一 workspace、依赖锁、格式配置、类型检查与 CI。
- 14 项回归测试、三个生产构建和格式检查已在本地通过。
- 已将完整 Git bundle 保存到 [.migration/frontend-labs.bundle.b64](frontend-labs.bundle.b64)。
- 测试通过的目标提交：`a2762cdddd669161392301a9a0edcc9756bbba02`。

## 待明确授权的操作

在 `ieuforu/frontend-labs` 创建并自动执行一次性 GitHub Actions 迁移工作流。
该作业需要本仓库的 `contents:write` 权限，只更新 `main` 与三个 `migration/*` 标签。
不会修改其他仓库，不使用长期令牌。完整检查通过后才更新分支；若远端出现新的提交则停止。
发布的目标树不含此迁移工作流及暂存文件，所以发布完成后它们会从默认分支移除。

下面是拟使用的完整工作流；当前尚未安装或运行：

```yaml
name: Import lab histories once

# Proposed one-time automatic migration; do not install without explicit approval.
# The imported tree excludes this workflow and its staging bundle.
on:
  push:
    branches: [main]
    paths: [.github/workflows/import-labs.yml]

permissions:
  contents: read

concurrency:
  group: import-lab-histories
  cancel-in-progress: false

jobs:
  migrate:
    # Only the first run can publish, and only in this destination.
    if: github.repository == 'ieuforu/frontend-labs' && github.event_name == 'push' && github.run_number == 1
    permissions:
      contents: write
    runs-on: ubuntu-latest
    timeout-minutes: 15
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - name: Verify and load the prepared history
        run: |
          set -eu
          base64 --decode .migration/frontend-labs.bundle.b64 > "$RUNNER_TEMP/frontend-labs.bundle"
          git bundle verify "$RUNNER_TEMP/frontend-labs.bundle"
          git fetch "$RUNNER_TEMP/frontend-labs.bundle" refs/heads/main:refs/remotes/migration/main 'refs/tags/migration/*:refs/tags/migration/*'
          test "$(git rev-parse migration/main)" = a2762cdddd669161392301a9a0edcc9756bbba02
          git checkout --detach migration/main
          git merge-base --is-ancestor e55fd497a997aba0c65525de39c2ffb37738cde4 HEAD
          git merge-base --is-ancestor 8d8b74e3f603a1e23d5ee42877825195d118ec10 HEAD
          git merge-base --is-ancestor d7d07b8de32c20b7a1eb3ddc405bfcab731d4d23 HEAD

      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 24
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm check

      - name: Publish the checked workspace without rewriting remote history
        env:
          SEED_SHA: ${{ github.sha }}
        run: |
          set -eu
          git fetch origin main --no-tags
          test "$(git rev-parse origin/main)" = "$SEED_SHA"
          git config user.name "github-actions[bot]"
          git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
          target_tree=$(git rev-parse 'HEAD^{tree}')
          test -z "$(git ls-tree -r --name-only "$target_tree" -- .github/workflows/import-labs.yml .migration)"
          migration_commit=$(git commit-tree "$target_tree" -p "$SEED_SHA" -p a2762cdddd669161392301a9a0edcc9756bbba02 -m "chore: publish verified frontend labs with original histories")
          git push --atomic origin "$migration_commit:refs/heads/main" refs/tags/migration/task-slicer-lab refs/tags/migration/thread-pool-lab refs/tags/migration/virtual-list-lab
          printf 'Published %s after pnpm check. All eight original commits are ancestors.\n' "$migration_commit" >> "$GITHUB_STEP_SUMMARY"
```
