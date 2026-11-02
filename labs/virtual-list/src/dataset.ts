import type { ItemData } from './virtualList.ts'

export const DATASET_VERSION = 'mixed-text-v1'
export const COMPARISON_COUNTS = [500, 2_000, 5_000] as const
export const EXPLORATION_COUNT = 100_000

const SENTENCES = [
  '短句说明：系统已就绪。',
  '中长段落：这是一个包含较多文字的测试数据项，用来检验浏览器在处理多行文本换行以及盒模型计算时的稳定性。',
  '极长文本测试：虚拟列表的最核心难点是不定高场景。当每条记录根据内容动态折行扩展时，高度无法用固定的 index * height 进行直接定位。我们必须通过动态建立前缀和位置数组并在渲染后利用 ResizeObserver 实时修正真实高度，同时依赖二分查找以 O(log N) 的定位起始项，结合 DOM 节点复用减少滚动时的节点创建。高度修正仍有成本，需要实际测量。',
  '常规提示：网络已连接，数据缓存命中。',
  '带代码片段的内容：`const buffer = new SharedArrayBuffer(1024); Atomics.wait(int32, 0, 0);` 模拟技术日志与异常追踪堆栈。',
]

export function canCompare(count: number): boolean {
  return (COMPARISON_COUNTS as readonly number[]).includes(count)
}

export function createDataset(count: number): ItemData[] {
  if (!canCompare(count) && count !== EXPLORATION_COUNT) {
    throw new RangeError(
      'Use a supported data size; full-list comparisons are limited to 5,000 rows',
    )
  }
  return Array.from({ length: count }, (_, id) => ({
    id,
    title: `Record [Chunk-${Math.floor(id / 1000)}]`,
    content: SENTENCES[(id * 17 + 7) % SENTENCES.length],
  }))
}
