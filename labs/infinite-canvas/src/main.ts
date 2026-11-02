import '../../../shared/shell.ts'
import '../../../shared/experiments.css'
import './style.css'
import { QuadTree, type Shape, type Rect } from './quadtree.ts'
import {
  screenToWorld as toWorld,
  zoomAt,
  constrainTranslation,
  normalizeRect,
  type Viewport,
} from './viewport.ts'

const canvas = document.getElementById('canvas') as HTMLCanvasElement
const ctx = canvas.getContext('2d')!

const container = document.getElementById('canvas-container')!
const viewport: Viewport = { x: 0, y: 0, scale: 1 }
let viewWidth = 0
let viewHeight = 0
const metric = (id: string) => document.getElementById(id)!
const visibleMetric = metric('visible-count')
const selectedMetric = metric('selected-count')
const queryMetric = metric('query-time')
const renderMetric = metric('render-time')
const zoomMetric = metric('zoom-value')
const debugButton = document.getElementById('toggle-debug') as HTMLButtonElement

// 1. 初始化空间
const WORLD_SIZE = 12_000
const quadTree = new QuadTree(
  { x: -WORLD_SIZE / 2, y: -WORLD_SIZE / 2, w: WORLD_SIZE, h: WORLD_SIZE },
  24,
  8,
)

const TOTAL_SHAPES = 10_000
let hoveredShape: Shape | null = null
const selectedShapes = new Set<Shape>() // 支持批量多选
let showDebugTree = false

function populateShapes() {
  const colors = [
    '#ef4444',
    '#f97316',
    '#eab308',
    '#10b981',
    '#06b6d4',
    '#3b82f6',
    '#8b5cf6',
    '#ec4899',
  ]
  const range = 10_000

  for (let i = 0; i < TOTAL_SHAPES; i++) {
    const w = 20 + Math.random() * 80
    const h = 20 + Math.random() * 80
    const shape: Shape = {
      id: i,
      x: (Math.random() - 0.5) * range,
      y: (Math.random() - 0.5) * range,
      w,
      h,
      color: colors[Math.floor(Math.random() * colors.length)],
    }
    quadTree.insert(shape)
  }
}
populateShapes()

// 2. 坐标转换工具
function screenToWorld(sx: number, sy: number) {
  return toWorld(viewport, sx, sy)
}

function getVisibleWorldBounds(): Rect {
  return {
    x: -viewport.x / viewport.scale,
    y: -viewport.y / viewport.scale,
    w: viewWidth / viewport.scale,
    h: viewHeight / viewport.scale,
  }
}

// 3. rAF 脏标记调度
let isPendingFrame = false
function requestRender() {
  if (isPendingFrame) return
  isPendingFrame = true
  requestAnimationFrame(() => {
    render()
    isPendingFrame = false
  })
}

// 4. 渲染主循环
let renderedCount = 0
let queryTimeMs = 0
const visibleShapesBuffer: Shape[] = []

// 橡皮筋选框 (屏幕坐标)
interface SelectionBox {
  startX: number
  startY: number
  currentX: number
  currentY: number
}
let selectionBox: SelectionBox | null = null

function render() {
  const frameStart = performance.now()
  const dpr = window.devicePixelRatio || 1
  const viewBounds = getVisibleWorldBounds()

  visibleShapesBuffer.length = 0
  const t0 = performance.now()
  quadTree.queryRange(viewBounds, visibleShapesBuffer)
  queryTimeMs = performance.now() - t0

  ctx.save()
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.clearRect(0, 0, canvas.width, canvas.height)

  ctx.scale(dpr, dpr)
  ctx.translate(viewport.x, viewport.y)
  ctx.scale(viewport.scale, viewport.scale)

  drawAdaptiveGrid()

  if (showDebugTree) {
    quadTree.drawDebug(ctx, viewBounds, viewport.scale)
  }

  // 绘制可见图元
  renderedCount = 0
  for (let i = 0; i < visibleShapesBuffer.length; i++) {
    const shape = visibleShapesBuffer[i]

    if (shape.w * viewport.scale < 0.5 || shape.h * viewport.scale < 0.5) {
      continue
    }

    renderedCount++
    ctx.fillStyle = shape.color
    ctx.fillRect(shape.x, shape.y, shape.w, shape.h)

    // 悬停未选中的图元绘制白色弱外框
    if (hoveredShape && hoveredShape.id === shape.id && !selectedShapes.has(shape)) {
      ctx.lineWidth = 2 / viewport.scale
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)'
      ctx.strokeRect(shape.x, shape.y, shape.w, shape.h)
    }
  }

  // 绘制所有被选中的图元外轮廓与角标
  for (const selected of selectedShapes) {
    ctx.lineWidth = 2 / viewport.scale
    ctx.strokeStyle = '#38bdf8' // 天蓝高亮
    ctx.strokeRect(selected.x - 2, selected.y - 2, selected.w + 4, selected.h + 4)

    const handleSize = 5 / viewport.scale
    ctx.fillStyle = '#ffffff'
    const corners = [
      { x: selected.x - 2, y: selected.y - 2 },
      { x: selected.x + selected.w + 2, y: selected.y - 2 },
      { x: selected.x - 2, y: selected.y + selected.h + 2 },
      { x: selected.x + selected.w + 2, y: selected.y + selected.h + 2 },
    ]
    for (const c of corners) {
      ctx.fillRect(c.x - handleSize / 2, c.y - handleSize / 2, handleSize, handleSize)
    }
  }

  ctx.restore()

  // 在屏幕最顶层直接绘制橡皮筋框选框 (避免受缩放比例影响线宽)
  if (selectionBox) {
    drawMarqueeBox(selectionBox)
  }

  visibleMetric.textContent = renderedCount.toLocaleString()
  selectedMetric.textContent = selectedShapes.size.toLocaleString()
  queryMetric.textContent = `${queryTimeMs.toFixed(3)} ms`
  renderMetric.textContent = `${(performance.now() - frameStart).toFixed(2)} ms`
  zoomMetric.textContent = `${Math.round(viewport.scale * 100)}%`
}

// 5. 绘制屏幕坐标系下的框选指示器
function drawMarqueeBox(box: SelectionBox) {
  const dpr = window.devicePixelRatio || 1
  const rect = normalizeRect(box.startX, box.startY, box.currentX, box.currentY)

  ctx.save()
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.scale(dpr, dpr)

  ctx.fillStyle = 'rgba(56, 189, 248, 0.15)'
  ctx.fillRect(rect.x, rect.y, rect.w, rect.h)

  ctx.lineWidth = 1
  ctx.setLineDash([4, 4])
  ctx.strokeStyle = '#38bdf8'
  ctx.strokeRect(rect.x, rect.y, rect.w, rect.h)

  ctx.restore()
}

// 6. 自适应网格
function drawAdaptiveGrid() {
  const bounds = getVisibleWorldBounds()
  const minScreenPx = 60
  let step = 100

  while (step * viewport.scale < minScreenPx) step *= 2
  while (step * viewport.scale > minScreenPx * 2) step /= 2

  const startX = Math.floor(bounds.x / step) * step
  const endX = Math.ceil((bounds.x + bounds.w) / step) * step
  const startY = Math.floor(bounds.y / step) * step
  const endY = Math.ceil((bounds.y + bounds.h) / step) * step

  ctx.lineWidth = 1 / viewport.scale
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)'
  ctx.beginPath()

  for (let x = startX; x <= endX; x += step) {
    ctx.moveTo(x, bounds.y)
    ctx.lineTo(x, bounds.y + bounds.h)
  }
  for (let y = startY; y <= endY; y += step) {
    ctx.moveTo(bounds.x, y)
    ctx.lineTo(bounds.x + bounds.w, y)
  }
  ctx.stroke()

  ctx.lineWidth = 2 / viewport.scale
  ctx.strokeStyle = 'rgba(239, 68, 68, 0.8)'
  ctx.beginPath()
  ctx.moveTo(Math.max(-100, bounds.x), 0)
  ctx.lineTo(Math.min(100, bounds.x + bounds.w), 0)
  ctx.moveTo(0, Math.max(-100, bounds.y))
  ctx.lineTo(0, Math.min(100, bounds.y + bounds.h))
  ctx.stroke()
}

// Pointer coordinates are relative to the canvas, not the browser window.
function canvasPoint(event: PointerEvent | WheelEvent) {
  const rect = canvas.getBoundingClientRect()
  return { x: event.clientX - rect.left, y: event.clientY - rect.top }
}

type DragMode = 'NONE' | 'PAN_VIEWPORT' | 'DRAG_SHAPES' | 'MARQUEE_SELECT'
let dragMode: DragMode = 'NONE'
let activePointer: number | null = null
let lastPointer = { x: 0, y: 0 }
let activeDragShape: Shape | null = null
let shapeDragOffset = { x: 0, y: 0 }

canvas.addEventListener('pointerdown', (event) => {
  if (activePointer !== null || (event.button !== 0 && event.button !== 1)) return
  event.preventDefault()
  canvas.focus({ preventScroll: true })
  canvas.setPointerCapture(event.pointerId)
  activePointer = event.pointerId
  const point = canvasPoint(event)
  const world = screenToWorld(point.x, point.y)
  const hit = quadTree.hitTest(world.x, world.y)
  if (event.button === 1) {
    dragMode = 'PAN_VIEWPORT'
    canvas.style.cursor = 'grabbing'
  } else if (event.shiftKey) {
    dragMode = 'MARQUEE_SELECT'
    selectionBox = { startX: point.x, startY: point.y, currentX: point.x, currentY: point.y }
    canvas.style.cursor = 'crosshair'
  } else if (hit) {
    dragMode = 'DRAG_SHAPES'
    activeDragShape = hit
    if (!selectedShapes.has(hit)) {
      selectedShapes.clear()
      selectedShapes.add(hit)
    }
    shapeDragOffset = { x: world.x - hit.x, y: world.y - hit.y }
    canvas.style.cursor = 'move'
  } else {
    dragMode = 'PAN_VIEWPORT'
    selectedShapes.clear()
    canvas.style.cursor = 'grabbing'
  }
  lastPointer = point
  requestRender()
})

canvas.addEventListener('pointermove', (event) => {
  if (activePointer !== null && event.pointerId !== activePointer) return
  const point = canvasPoint(event)
  if (dragMode === 'PAN_VIEWPORT') {
    viewport.x += point.x - lastPointer.x
    viewport.y += point.y - lastPointer.y
    lastPointer = point
    requestRender()
  } else if (dragMode === 'DRAG_SHAPES' && activeDragShape) {
    const world = screenToWorld(point.x, point.y)
    const delta = constrainTranslation(
      selectedShapes,
      quadTree.bounds,
      world.x - shapeDragOffset.x - activeDragShape.x,
      world.y - shapeDragOffset.y - activeDragShape.y,
    )
    if (delta.x !== 0 || delta.y !== 0) {
      for (const shape of selectedShapes) {
        quadTree.remove(shape)
        shape.x += delta.x
        shape.y += delta.y
        quadTree.insert(shape)
      }
    }
    requestRender()
  } else if (dragMode === 'MARQUEE_SELECT' && selectionBox) {
    selectionBox.currentX = point.x
    selectionBox.currentY = point.y
    const p1 = screenToWorld(selectionBox.startX, selectionBox.startY)
    const p2 = screenToWorld(point.x, point.y)
    selectedShapes.clear()
    for (const shape of quadTree.queryRange(normalizeRect(p1.x, p1.y, p2.x, p2.y))) {
      selectedShapes.add(shape)
    }
    requestRender()
  } else {
    const world = screenToWorld(point.x, point.y)
    const hit = quadTree.hitTest(world.x, world.y)
    if (hit !== hoveredShape) {
      hoveredShape = hit
      canvas.style.cursor = event.shiftKey ? 'crosshair' : hit ? 'pointer' : 'default'
      requestRender()
    }
  }
})

function finishDrag() {
  const pointer = activePointer
  activePointer = null
  dragMode = 'NONE'
  activeDragShape = null
  selectionBox = null
  hoveredShape = null
  canvas.style.cursor = 'default'
  if (pointer !== null && canvas.hasPointerCapture(pointer)) canvas.releasePointerCapture(pointer)
  requestRender()
}
for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
  canvas.addEventListener(type, (event) => {
    if ((event as PointerEvent).pointerId === activePointer) finishDrag()
  })
}
canvas.addEventListener('blur', finishDrag)
canvas.addEventListener('pointerleave', () => {
  if (activePointer !== null) return
  hoveredShape = null
  canvas.style.cursor = 'default'
  requestRender()
})

canvas.addEventListener(
  'wheel',
  (event) => {
    event.preventDefault()
    if (activePointer !== null || event.deltaY === 0) return
    const point = canvasPoint(event)
    zoomAt(viewport, point.x, point.y, event.deltaY < 0 ? 1.08 : 1 / 1.08)
    requestRender()
  },
  { passive: false },
)

function resetView() {
  finishDrag()
  viewport.x = viewWidth / 2
  viewport.y = viewHeight / 2
  viewport.scale = 1
  selectedShapes.clear()
  requestRender()
}
function toggleDebug() {
  showDebugTree = !showDebugTree
  debugButton.setAttribute('aria-pressed', String(showDebugTree))
  requestRender()
}
debugButton.addEventListener('click', toggleDebug)
document.getElementById('reset-view')!.addEventListener('click', resetView)
for (const [id, factor] of [
  ['zoom-in', 1.25],
  ['zoom-out', 1 / 1.25],
] as const) {
  document.getElementById(id)!.addEventListener('click', () => {
    zoomAt(viewport, viewWidth / 2, viewHeight / 2, factor)
    requestRender()
  })
}
canvas.addEventListener('keydown', (event) => {
  if (event.ctrlKey || event.metaKey || event.altKey) return
  if (event.key === 'Escape') {
    finishDrag()
    selectedShapes.clear()
  } else if (activePointer !== null) return
  else if (event.key.toLowerCase() === 'd') toggleDebug()
  else if (event.key === 'Home') resetView()
  else if (event.key === '+' || event.key === '=')
    zoomAt(viewport, viewWidth / 2, viewHeight / 2, 1.25)
  else if (event.key === '-') zoomAt(viewport, viewWidth / 2, viewHeight / 2, 1 / 1.25)
  else if (event.key === 'ArrowLeft') viewport.x += 40
  else if (event.key === 'ArrowRight') viewport.x -= 40
  else if (event.key === 'ArrowUp') viewport.y += 40
  else if (event.key === 'ArrowDown') viewport.y -= 40
  else return
  event.preventDefault()
  requestRender()
})

function resize() {
  const width = container.clientWidth
  const height = container.clientHeight
  viewport.x += (width - viewWidth) / 2
  viewport.y += (height - viewHeight) / 2
  viewWidth = width
  viewHeight = height
  const dpr = window.devicePixelRatio || 1
  canvas.width = Math.floor(width * dpr)
  canvas.height = Math.floor(height * dpr)
  requestRender()
}
new ResizeObserver(resize).observe(container)
window.addEventListener('resize', resize)
resize()
