import '../../../shared/shell.ts'
import './style.css'
import { VirtualList, type ItemData } from './virtualList.ts'
import { canCompare, createDataset, DATASET_VERSION } from './dataset.ts'
import { createRow, fillRow } from './row.ts'
import { nextFrame, roundOrder, summarize, type RenderMode, type Sample } from './benchmark.ts'

const viewport = document.getElementById('viewport') as HTMLElement
const phantom = document.getElementById('phantom') as HTMLElement
const contentBox = document.getElementById('content-box') as HTMLElement
const countSelect = document.getElementById('data-count') as HTMLSelectElement
const modeSelect = document.getElementById('render-mode') as HTMLSelectElement
const debugButton = document.getElementById('btn-toggle-debug') as HTMLButtonElement
const runButton = document.getElementById('run-comparison') as HTMLButtonElement
const stopButton = document.getElementById('stop-comparison') as HTMLButtonElement
const exportButton = document.getElementById('export-results') as HTMLButtonElement
const status = document.getElementById('measurement-status') as HTMLElement
const resultBody = document.getElementById('results-body') as HTMLElement
const rawBody = document.getElementById('raw-results') as HTMLElement
const resultContext = document.getElementById('result-context') as HTMLElement
const statDomCount = document.getElementById('stat-dom-count') as HTMLElement
const statRange = document.getElementById('stat-range') as HTMLElement
const statHeight = document.getElementById('stat-phantom-height') as HTMLElement
const labels: Record<RenderMode, string> = { full: '普通全量 DOM', virtual: '虚拟列表' }
let currentList: VirtualList | null = null
let data = createDataset(Number(countSelect.value))
let isDebug = false
let controller: AbortController | null = null
let report: ReturnType<typeof makeReport> | null = null
let disposed = false

function environment() {
  const rect = viewport.getBoundingClientRect()
  return {
    buildMode: import.meta.env.MODE,
    sourceRevision: import.meta.env.VITE_SOURCE_REVISION ?? null,
    userAgent: navigator.userAgent,
    language: navigator.language,
    hardwareConcurrency: navigator.hardwareConcurrency ?? null,
    devicePixelRatio: window.devicePixelRatio,
    window: { width: window.innerWidth, height: window.innerHeight },
    viewport: { width: rect.width, height: rect.height, clientWidth: viewport.clientWidth },
    visibilityState: document.visibilityState,
  }
}

function setDebug(value: boolean) {
  isDebug = value
  document.body.classList.toggle('debug-mode', value)
  debugButton.classList.toggle('active', value)
  debugButton.setAttribute('aria-pressed', String(value))
  debugButton.textContent = value ? '退出调试透视' : '开启调试透视'
  refreshFullHeight()
}

function refreshFullHeight() {
  if (modeSelect.value === 'full' && contentBox.children.length > 0) {
    statHeight.textContent = `${viewport.scrollHeight.toLocaleString()} px`
  }
}

function clearList() {
  currentList?.destroy()
  currentList = null
  contentBox.replaceChildren()
  phantom.style.height = '0px'
  viewport.scrollTop = 0
}

function mount(mode: RenderMode, items: ItemData[]) {
  if (mode === 'full' && !canCompare(items.length)) {
    throw new RangeError('普通列表只允许 500、2,000 或 5,000 条。')
  }
  viewport.classList.toggle('is-full', mode === 'full')
  if (mode === 'virtual') {
    currentList = new VirtualList({
      viewport,
      phantom,
      contentBox,
      data: items,
      estimatedHeight: 70,
      bufferCount: 6,
      onMetricsUpdate: (domCount, range, totalHeight) => {
        statDomCount.textContent = `${domCount.toLocaleString()} 行节点`
        statRange.textContent = `[${range[0]}, ${range[1]}]`
        statHeight.textContent = `${Math.round(totalHeight).toLocaleString()} px（估计）`
      },
    })
  } else {
    const fragment = document.createDocumentFragment()
    for (const item of items) {
      const row = createRow(item.id, false)
      row.dataset.index = item.id.toString()
      fillRow(row, item)
      fragment.appendChild(row)
    }
    contentBox.appendChild(fragment)
    statDomCount.textContent = `${items.length.toLocaleString()} 行节点`
    statRange.textContent = `[0, ${items.length - 1}]`
    statHeight.textContent = '等待布局'
  }
  document.getElementById('stat-total')!.textContent = `${items.length.toLocaleString()} 条`
  document.getElementById('active-mode')!.textContent = labels[mode]
}

function renderSelected() {
  clearList()
  mount(modeSelect.value as RenderMode, data)
  if (modeSelect.value === 'full')
    statHeight.textContent = `${viewport.scrollHeight.toLocaleString()} px`
}

function refreshControls() {
  const allowed = canCompare(data.length)
  const fullOption = modeSelect.querySelector('option[value="full"]') as HTMLOptionElement
  fullOption.disabled = !allowed
  if (!allowed) modeSelect.value = 'virtual'
  runButton.disabled = !allowed || controller !== null
  document.getElementById('count-note')!.textContent = allowed
    ? '两种模式使用相同的文本、行样式和视口；对照最多 5,000 条。'
    : '100,000 条保留为虚拟列表探索；全量 DOM 对照限制为 5,000 条。'
}

function setBusy(busy: boolean) {
  countSelect.disabled = busy
  modeSelect.disabled = busy
  debugButton.disabled = busy
  stopButton.hidden = !busy
  exportButton.disabled = busy || !report
  viewport.classList.toggle('is-measuring', busy)
  viewport.setAttribute('aria-busy', String(busy))
  viewport.tabIndex = busy ? -1 : 0
  viewport.inert = busy
  refreshControls()
}

function makeReport(samples: Sample[], initialEnvironment: ReturnType<typeof environment>) {
  return {
    schemaVersion: 1,
    createdAt: new Date().toISOString(),
    dataset: {
      version: DATASET_VERSION,
      count: data.length,
      order: 'ascending id',
      textIndex: '(id * 17 + 7) % 5',
    },
    environment: initialEnvironment,
    protocol: {
      warmupPerMode: 1,
      measuredRoundsPerMode: 3,
      order: 'full/virtual, virtual/full, full/virtual',
      startingScrollTop: 0,
      estimatedHeight: 70,
      bufferCount: 6,
      debug: false,
      mountMs:
        'Synchronous renderer construction and DOM insertion, including any layout triggered inside the renderer and telemetry text updates; excludes dataset creation and teardown.',
      layoutReadMs:
        'Time of one viewport.scrollHeight read immediately after mount; includes any pending style/layout work that the read triggers.',
      secondFrameMs:
        'Elapsed from mount start until the second requestAnimationFrame callback. Not paint completion or fully measured row heights.',
      rowNodes:
        'All .list-item elements in the list, including hidden pool slots, sampled after the second callback.',
      descendantNodes:
        'All element descendants of content-box; excludes its container, phantom and the rest of the page.',
      exclusions: [
        'No scroll benchmark',
        'No memory or GC measurement',
        'No FPS or speedup guarantee',
        'Virtual offscreen heights remain estimates',
      ],
    },
    samples,
    summary: { full: summarize(samples, 'full'), virtual: summarize(samples, 'virtual') },
  }
}

function appendCells(body: HTMLElement, values: string[]) {
  const row = document.createElement('tr')
  for (const value of values) {
    const cell = document.createElement('td')
    cell.textContent = value
    row.appendChild(cell)
  }
  body.appendChild(row)
}

function showResults() {
  if (!report) return
  resultBody.replaceChildren()
  rawBody.replaceChildren()
  for (const mode of ['full', 'virtual'] as const) {
    const summary = report.summary[mode]!
    const format = (distribution: { median: number; min: number; max: number }) =>
      `${distribution.median.toFixed(2)} ms (${distribution.min.toFixed(2)}–${distribution.max.toFixed(2)})`
    appendCells(resultBody, [
      labels[mode],
      format(summary.mountMs),
      format(summary.layoutReadMs),
      format(summary.secondFrameMs),
      `${summary.rowNodes.min}–${summary.rowNodes.max}`,
    ])
  }
  for (const sample of report.samples) {
    appendCells(rawBody, [
      String(sample.round),
      String(sample.order),
      labels[sample.mode],
      sample.mountMs.toFixed(3),
      sample.layoutReadMs.toFixed(3),
      sample.secondFrameMs.toFixed(3),
      String(sample.rowNodes),
      String(sample.descendantNodes),
    ])
  }
  const env = report.environment
  resultContext.textContent = `${report.dataset.count.toLocaleString()} 条 · ${report.dataset.version} · 视口 ${env.viewport.width} × ${env.viewport.height} CSS px · ${new Date(report.createdAt).toLocaleTimeString()}`
  document.getElementById('recorded-environment')!.textContent =
    `${env.userAgent}\n窗口 ${env.window.width} × ${env.window.height} · DPR ${env.devicePixelRatio} · 逻辑处理器 ${env.hardwareConcurrency ?? '未提供'} · ${env.buildMode}`
}

async function measure(
  mode: RenderMode,
  round: number,
  order: number,
  signal: AbortSignal,
): Promise<Sample> {
  clearList()
  // Give teardown a frame boundary; dataset generation is outside all timers.
  await nextFrame(signal)
  await nextFrame(signal)
  signal.throwIfAborted()
  const started = performance.now()
  mount(mode, data)
  const mounted = performance.now()
  const scrollHeight = viewport.scrollHeight
  const layoutRead = performance.now()
  await nextFrame(signal)
  await nextFrame(signal)
  const secondFrame = performance.now()
  signal.throwIfAborted()
  if (viewport.scrollTop !== 0) throw new Error('测量时列表发生滚动，本次已取消；请重新运行。')
  return {
    round,
    order,
    mode,
    mountMs: mounted - started,
    layoutReadMs: layoutRead - mounted,
    secondFrameMs: secondFrame - started,
    rowNodes: contentBox.querySelectorAll('.list-item').length,
    descendantNodes: contentBox.querySelectorAll('*').length,
    scrollHeight,
  }
}

async function compare() {
  if (controller || !canCompare(data.length)) return
  if (document.visibilityState !== 'visible') {
    status.textContent = '请让页面保持可见，再开始对照。'
    return
  }
  const run = new AbortController()
  controller = run
  report = null
  resultBody.replaceChildren()
  rawBody.replaceChildren()
  resultContext.textContent = '本次测量进行中；完成前不显示汇总。'
  document.getElementById('recorded-environment')!.textContent = ''
  setDebug(false)
  setBusy(true)
  try {
    await document.fonts.ready
    run.signal.throwIfAborted()
    const initialEnvironment = environment()
    for (const mode of roundOrder(0)) {
      status.textContent = `预热：${labels[mode]}，本轮不计入结果…`
      await measure(mode, 0, 0, run.signal)
    }
    const samples: Sample[] = []
    for (let round = 0; round < 3; round++) {
      const order = roundOrder(round)
      for (let index = 0; index < order.length; index++) {
        status.textContent = `第 ${round + 1}/3 轮：${labels[order[index]]}…`
        samples.push(await measure(order[index], round + 1, index + 1, run.signal))
      }
    }
    report = makeReport(samples, initialEnvironment)
    showResults()
    status.textContent = '对照完成。表内是中位数（最小–最大）；保留全部 6 次原始记录。'
  } catch (error) {
    report = null
    resultContext.textContent = '本次未完成，没有生成可导出的结果。'
    status.textContent = error instanceof Error ? error.message : '测量中断，请重新运行。'
  } finally {
    controller = null
    if (!disposed) {
      setBusy(false)
      renderSelected()
    }
  }
}

countSelect.addEventListener('change', () => {
  data = createDataset(Number(countSelect.value))
  refreshControls()
  renderSelected()
  status.textContent = report
    ? '数据量已改变；下方保留上一次结果及其数据量，重新运行可替换。'
    : '选择规模后开始对照，或滚动列表观察节点复用。'
})
modeSelect.addEventListener('change', renderSelected)
debugButton.addEventListener('click', () => setDebug(!isDebug))
runButton.addEventListener('click', () => void compare())
stopButton.addEventListener('click', () =>
  controller?.abort(new Error('已停止；未完成的结果不会导出。')),
)
const abortChangedEnvironment = () =>
  controller?.abort(new Error('窗口或页面可见性已改变，本次测量已取消；请保持环境不变后重试。'))
const onWindowResize = () => {
  abortChangedEnvironment()
  refreshFullHeight()
}
window.addEventListener('resize', onWindowResize)
const onSampleScroll = () => {
  if (viewport.scrollTop !== 0) {
    controller?.abort(new Error('测量时列表发生滚动，本次已取消；请重新运行。'))
  }
}
viewport.addEventListener('scroll', onSampleScroll, { passive: true })
const onVisibility = () => {
  if (document.visibilityState !== 'visible') abortChangedEnvironment()
}
document.addEventListener('visibilitychange', onVisibility)
exportButton.addEventListener('click', () => {
  if (!report) return
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' }),
  )
  const link = document.createElement('a')
  link.href = url
  link.download = `virtual-list-${report.dataset.count}-${report.createdAt.replaceAll(/[:.]/g, '-')}.json`
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1_000)
})
refreshControls()
renderSelected()

if (import.meta.hot)
  import.meta.hot.dispose(() => {
    disposed = true
    controller?.abort(new Error('页面代码已更新；请重新测量。'))
    clearList()
    window.removeEventListener('resize', onWindowResize)
    document.removeEventListener('visibilitychange', onVisibility)
    viewport.removeEventListener('scroll', onSampleScroll)
  })
