import assert from 'node:assert/strict'
import { test } from 'node:test'
import { QuadTree } from '../labs/infinite-canvas/src/quadtree.ts'
import {
  constrainTranslation,
  normalizeRect,
  screenToWorld,
  zoomAt,
} from '../labs/infinite-canvas/src/viewport.ts'

const shape = (id, x, y, w = 10, h = 10) => ({ id, x, y, w, h, color: '#ffffff' })
const bounds = { x: -100, y: -100, w: 200, h: 200 }
const ids = (items) => items.map((item) => item.id).sort((a, b) => a - b)

test('quadtree queries match a linear scan, including overlapping partitions', () => {
  const tree = new QuadTree(bounds, 2, 5)
  const shapes = Array.from({ length: 80 }, (_, id) =>
    shape(id, ((id * 31) % 170) - 85, ((id * 47) % 170) - 85, 30, 20),
  )
  for (const item of shapes) tree.insert(item)
  for (const range of [
    bounds,
    { x: -17, y: -21, w: 50, h: 40 },
    { x: 0, y: 0, w: 1, h: 1 },
    { x: 200, y: 200, w: 20, h: 20 },
  ]) {
    const expected = shapes.filter(
      (item) =>
        item.x < range.x + range.w &&
        item.x + item.w > range.x &&
        item.y < range.y + range.h &&
        item.y + item.h > range.y,
    )
    const result = tree.queryRange(range)
    assert.deepEqual(ids(result), ids(expected))
    assert.equal(new Set(result).size, result.length)
    assert.deepEqual(
      ids(tree.queryRange(range)),
      ids(expected),
      'successive query stamps must not hide items',
    )
  }
})

test('remove and reinsert clear every old partition and preserve edge hit testing', () => {
  const tree = new QuadTree(bounds, 1, 4)
  const moving = shape(1, -15, -15, 30, 30)
  tree.insert(moving)
  tree.insert(shape(2, 60, 60))
  assert.equal(tree.remove(moving), true)
  assert.equal(tree.hitTest(0, 0), null)
  moving.x = 70
  moving.y = -100
  assert.equal(tree.insert(moving), true)
  assert.deepEqual(ids(tree.queryRange(bounds)), [1, 2])
  assert.equal(tree.hitTest(100, -100), moving)
  assert.equal(tree.remove(moving), true)
  assert.deepEqual(ids(tree.queryRange(bounds)), [2])
  assert.equal(tree.remove(moving), false)
})

test('a shared drag delta keeps the whole group inside the scene without losing indexed shapes', () => {
  const shapes = [shape(1, -90, -50), shape(2, 70, 80)]
  const tree = new QuadTree(bounds, 1, 4)
  for (const item of shapes) tree.insert(item)
  const delta = constrainTranslation(shapes, bounds, 1000, 1000)
  assert.deepEqual(delta, { x: 20, y: 10 })
  for (const item of shapes) {
    tree.remove(item)
    item.x += delta.x
    item.y += delta.y
    assert.equal(tree.insert(item), true)
  }
  assert.equal(shapes[1].x - shapes[0].x, 160)
  assert.equal(shapes[1].y - shapes[0].y, 130)
  assert.deepEqual(ids(tree.queryRange(bounds)), [1, 2])
  assert.deepEqual(constrainTranslation(shapes, bounds, -1000, -1000), { x: -30, y: -60 })
})

test('zoom keeps the local pointer anchored, including both scale limits', () => {
  const viewport = { x: 120, y: 65, scale: 1 }
  const pointer = { x: 317, y: 211 }
  const original = screenToWorld(viewport, pointer.x, pointer.y)
  for (const factor of [1.25, 0.8, 10000, 0.000001, 20]) {
    zoomAt(viewport, pointer.x, pointer.y, factor)
    const point = screenToWorld(viewport, pointer.x, pointer.y)
    assert.ok(Math.abs(point.x - original.x) < 1e-8)
    assert.ok(Math.abs(point.y - original.y) < 1e-8)
    assert.ok(viewport.scale >= 0.02 && viewport.scale <= 30)
  }
})

test('marquee selection works in every drag direction under a translated and scaled viewport', () => {
  const viewport = { x: 50, y: -80, scale: 2 }
  const a = screenToWorld(viewport, 70, -60)
  const b = screenToWorld(viewport, 110, -20)
  const expected = { x: 10, y: 10, w: 20, h: 20 }
  assert.deepEqual(normalizeRect(a.x, a.y, b.x, b.y), expected)
  assert.deepEqual(normalizeRect(b.x, b.y, a.x, a.y), expected)
  assert.deepEqual(normalizeRect(a.x, b.y, b.x, a.y), expected)
})
