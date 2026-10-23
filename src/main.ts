import { PersistentThreadPool } from './pool'
import { heavyWorkUnit } from './constants'

const btnBlock = document.getElementById('btn-block') as HTMLButtonElement
const btnSlice = document.getElementById('btn-slice') as HTMLButtonElement
const btnWorker = document.getElementById('btn-worker') as HTMLButtonElement

const progressFill = document.getElementById('progress') as HTMLDivElement
const statusText = document.getElementById('status') as HTMLDivElement
const logContainer = document.getElementById('log') as HTMLDivElement
const fpsVal = document.getElementById('fps-val') as HTMLDivElement
const isolationStatus = document.getElementById('isolation-status') as HTMLDivElement

const spinnerCanvas = document.getElementById('raf-spinner') as HTMLCanvasElement
const sCtx = spinnerCanvas.getContext('2d')!

// 初始化常驻线程池（单例常驻，只在页面启动时初始化一次）
const pool = new PersistentThreadPool()

if (window.crossOriginIsolated) {
  pool.init(500_000) // 预分配 50 万容量的共享物理内存
  isolationStatus.textContent = `跨源隔离已生效 | 常驻线程池已就绪 (${pool.concurrency} 核心处于休眠待命状态)`
  isolationStatus.style.color = '#10b981'
} else {
  isolationStatus.textContent = '未启用跨源隔离，SharedArrayBuffer 被禁用！'
  isolationStatus.style.color = '#ef4444'
}

// rAF 监控帧率
let angle = 0
let lastFrameTime = performance.now()
let frameCount = 0
function animateMonitor(now: number) {
  frameCount++
  if (now - lastFrameTime >= 500) {
    const currentFps = Math.round((frameCount * 1000) / (now - lastFrameTime))
    fpsVal.textContent = `${currentFps} FPS`
    fpsVal.style.color = currentFps < 30 ? '#ef4444' : '#38bdf8'
    frameCount = 0
    lastFrameTime = now
  }
  angle += 0.08
  sCtx.clearRect(0, 0, 48, 48)
  sCtx.save()
  sCtx.translate(24, 24)
  sCtx.rotate(angle)
  sCtx.beginPath()
  sCtx.arc(0, 0, 18, 0, Math.PI * 1.4)
  sCtx.lineWidth = 4
  sCtx.strokeStyle = '#38bdf8'
  sCtx.lineCap = 'round'
  sCtx.stroke()
  sCtx.restore()
  requestAnimationFrame(animateMonitor)
}
requestAnimationFrame(animateMonitor)

function log(msg: string) {
  logContainer.textContent =
    `[${new Date().toLocaleTimeString()}] ${msg}\n` + logContainer.textContent
}

function setButtonsDisabled(disabled: boolean) {
  btnBlock.disabled = disabled
  btnSlice.disabled = disabled
  btnWorker.disabled = disabled
}

const TOTAL_TASKS = 300_000
let globalSink = 0

// 1. 单线程同步阻塞
btnBlock.addEventListener('click', () => {
  setButtonsDisabled(true)
  progressFill.style.width = '0%'
  statusText.textContent = '同步执行中（主线程冻结）...'
  log(`[Mode 1] 开始单线程同步阻塞计算...`)

  setTimeout(() => {
    const t0 = performance.now()
    let localAcc = 0
    for (let i = 0; i < TOTAL_TASKS; i++) {
      localAcc += heavyWorkUnit(i)
    }
    globalSink += localAcc

    const elapsed = performance.now() - t0
    progressFill.style.width = '100%'
    statusText.textContent = `同步执行完成，耗时: ${elapsed.toFixed(1)} ms`
    log(`[Mode 1] 同步执行结束，耗时: ${elapsed.toFixed(1)} ms (主线程卡死)`)
    setButtonsDisabled(false)
  }, 50)
})

// 2. 5ms 协作切片调度
btnSlice.addEventListener('click', async () => {
  setButtonsDisabled(true)
  progressFill.style.width = '0%'
  statusText.textContent = '切片调度中（UI 丝滑）...'
  log(`[Mode 2] 开始单线程协作切片调度 (5ms 预算)...`)

  const t0 = performance.now()
  let index = 0
  let localAcc = 0

  const yieldToMain = () => {
    if ('scheduler' in window && typeof (window as any).scheduler?.yield === 'function') {
      return (window as any).scheduler.yield()
    }
    return new Promise<void>((resolve) => {
      const ch = new MessageChannel()
      ch.port1.onmessage = () => resolve()
      ch.port2.postMessage(null)
    })
  }

  while (index < TOTAL_TASKS) {
    const sliceStart = performance.now()
    while (index < TOTAL_TASKS) {
      localAcc += heavyWorkUnit(index)
      index++
      if (performance.now() - sliceStart >= 5) break
    }

    const ratio = index / TOTAL_TASKS
    progressFill.style.width = `${(ratio * 100).toFixed(1)}%`
    statusText.textContent = `切片执行中: ${(ratio * 100).toFixed(0)}%`

    if (index < TOTAL_TASKS) {
      await yieldToMain()
    }
  }

  globalSink += localAcc
  const elapsed = performance.now() - t0
  statusText.textContent = `切片执行完成，总耗时: ${elapsed.toFixed(1)} ms`
  log(`[Mode 2] 切片调度完成，耗时: ${elapsed.toFixed(1)} ms (主线程维持流畅)`)
  setButtonsDisabled(false)
})

// 3. 常驻线程池：Atomics.notify 唤醒已休眠的 Worker
btnWorker.addEventListener('click', async () => {
  if (!window.crossOriginIsolated) {
    log(`❌ 错误：未处于 crossOriginIsolated 环境，无法分配 SharedArrayBuffer`)
    return
  }

  setButtonsDisabled(true)
  progressFill.style.width = '0%'
  statusText.textContent = `常驻线程池秒级唤醒中 (${pool.concurrency} 核心)...`
  log(`[Mode 3] 触发 Atomics.notify 唤醒常驻线程池...`)

  const { elapsed, results } = await pool.run(TOTAL_TASKS, (completed, total) => {
    const ratio = completed / total
    progressFill.style.width = `${(ratio * 100).toFixed(1)}%`
    statusText.textContent = `多核常驻推进: ${(ratio * 100).toFixed(0)}% (${completed}/${total})`
  })

  globalSink += results[0] + results[TOTAL_TASKS - 1]

  statusText.textContent = `多核计算完成（线程已归位休眠），耗时: ${elapsed.toFixed(1)} ms`
  log(`[Mode 3] 计算结束！耗时仅: ${elapsed.toFixed(1)} ms (零线程创建开销，算完自动休眠)`)
  setButtonsDisabled(false)
})
