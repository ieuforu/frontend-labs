import type { Rect } from './quadtree.ts'

export interface Viewport {
  x: number
  y: number
  scale: number
}

export function screenToWorld(viewport: Viewport, x: number, y: number) {
  return { x: (x - viewport.x) / viewport.scale, y: (y - viewport.y) / viewport.scale }
}

export function zoomAt(viewport: Viewport, x: number, y: number, factor: number) {
  const scale = Math.min(30, Math.max(0.02, viewport.scale * factor))
  viewport.x = x - ((x - viewport.x) * scale) / viewport.scale
  viewport.y = y - ((y - viewport.y) * scale) / viewport.scale
  viewport.scale = scale
}

// Apply one shared delta so a group keeps its relative positions at scene boundaries.
export function constrainTranslation(shapes: Iterable<Rect>, bounds: Rect, dx: number, dy: number) {
  let minX = -Infinity
  let maxX = Infinity
  let minY = -Infinity
  let maxY = Infinity
  for (const shape of shapes) {
    minX = Math.max(minX, bounds.x - shape.x)
    maxX = Math.min(maxX, bounds.x + bounds.w - shape.x - shape.w)
    minY = Math.max(minY, bounds.y - shape.y)
    maxY = Math.min(maxY, bounds.y + bounds.h - shape.y - shape.h)
  }
  return { x: Math.max(minX, Math.min(maxX, dx)), y: Math.max(minY, Math.min(maxY, dy)) }
}

export function normalizeRect(x1: number, y1: number, x2: number, y2: number): Rect {
  return { x: Math.min(x1, x2), y: Math.min(y1, y2), w: Math.abs(x1 - x2), h: Math.abs(y1 - y2) }
}
