import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { stripTypeScriptTypes } from 'node:module'
import { test } from 'node:test'
import { runInNewContext } from 'node:vm'
import { QuadTree } from '../labs/infinite-canvas/src/quadtree.ts'
import {
  screenToWorld as toWorld,
  zoomAt,
  constrainTranslation,
  normalizeRect,
} from '../labs/infinite-canvas/src/viewport.ts'

const source = stripTypeScriptTypes(
  readFileSync(new URL('../labs/infinite-canvas/src/main.ts', import.meta.url), 'utf8')
    .replace(/^import '[^']+'\n/gm, '')
    .replace(/^import[\s\S]*?from '[^']+'\n/gm, ''),
)

function fixture() {
  const elements = new Map()
  const frames = []
  const capture = new Set()
  const context = new Proxy({}, { get: (target, key) => target[key] ?? (() => {}) })
  class Element extends EventTarget {
    style = {}
    attributes = new Map()
    clientWidth = 640
    clientHeight = 360
    textContent = ''
    setAttribute(key, value) {
      this.attributes.set(key, value)
    }
    getBoundingClientRect() {
      return { left: 224, top: 400, width: this.clientWidth, height: this.clientHeight }
    }
    getContext() {
      return context
    }
    focus() {}
    setPointerCapture(id) {
      capture.add(id)
    }
    hasPointerCapture(id) {
      return capture.has(id)
    }
    releasePointerCapture(id) {
      capture.delete(id)
    }
  }
  const get = (id) => {
    if (!elements.has(id)) elements.set(id, new Element())
    return elements.get(id)
  }
  const window = Object.assign(new EventTarget(), { devicePixelRatio: 2 })
  let observer
  // All 10,000 objects overlap at (0, 0), producing a known hit target and query result.
  const math = Object.create(Math)
  math.random = () => 0.5
  runInNewContext(source, {
    document: { getElementById: get },
    window,
    Math: math,
    performance,
    requestAnimationFrame: (callback) => frames.push(callback),
    ResizeObserver: class {
      constructor(callback) {
        observer = callback
      }
      observe() {}
    },
    QuadTree,
    toWorld,
    zoomAt,
    constrainTranslation,
    normalizeRect,
  })
  const flush = () => {
    for (const frame of frames.splice(0)) frame()
  }
  const send = (target, type, props = {}) => {
    const event = Object.assign(new Event(type, { cancelable: true }), props)
    target.dispatchEvent(event)
    flush()
    return event
  }
  flush()
  return {
    get,
    window,
    send,
    capture,
    resize: () => {
      observer()
      flush()
    },
  }
}

test('canvas input uses its page offset while outside wheel and key events remain untouched', () => {
  const { get, window, send } = fixture()
  const canvas = get('canvas')
  assert.equal(canvas.width, 1280)
  assert.equal(canvas.height, 720)
  const atShape = { pointerId: 1, button: 0, clientX: 224 + 320 + 30, clientY: 400 + 180 + 30 }
  send(canvas, 'pointerdown', atShape)
  assert.equal(get('selected-count').textContent, '1')
  send(canvas, 'pointerup', atShape)
  assert.equal(send(window, 'wheel', { deltaY: -1 }).defaultPrevented, false)
  send(window, 'keydown', { key: '+' })
  assert.equal(get('zoom-value').textContent, '100%')
  assert.equal(send(canvas, 'wheel', { ...atShape, deltaY: -1 }).defaultPrevented, true)
  assert.equal(get('zoom-value').textContent, '108%')
})

test('marquee uses local coordinates and canceled or lost pointers cannot keep dragging', () => {
  const { get, send, capture } = fixture()
  const canvas = get('canvas')
  const start = { pointerId: 7, button: 0, shiftKey: true, clientX: 224 + 310, clientY: 400 + 170 }
  send(canvas, 'pointerdown', start)
  send(canvas, 'pointermove', { ...start, clientX: 224 + 390, clientY: 400 + 250 })
  assert.equal(get('selected-count').textContent, '10,000')
  assert.equal(capture.has(7), true)
  send(canvas, 'pointercancel', start)
  assert.equal(capture.size, 0)
  send(canvas, 'pointermove', { ...start, clientX: 0, clientY: 0 })
  assert.equal(get('selected-count').textContent, '10,000')
  send(canvas, 'keydown', { key: 'Escape' })
  assert.equal(get('selected-count').textContent, '0')
  send(canvas, 'pointerdown', { ...start, shiftKey: false, button: 1 })
  assert.equal(canvas.style.cursor, 'grabbing')
  send(canvas, 'lostpointercapture', start)
  assert.equal(canvas.style.cursor, 'default')
  assert.equal(capture.size, 0)
})

test('container resize preserves the world center and updates HiDPI backing pixels', () => {
  const { get, send, resize } = fixture()
  const container = get('canvas-container')
  container.clientWidth = 320
  container.clientHeight = 200
  resize()
  const canvas = get('canvas')
  assert.equal(canvas.width, 640)
  assert.equal(canvas.height, 400)
  const event = { pointerId: 1, button: 0, clientX: 224 + 160 + 30, clientY: 400 + 100 + 30 }
  send(canvas, 'pointerdown', event)
  assert.equal(get('selected-count').textContent, '1')
  send(canvas, 'blur')
  send(get('zoom-in'), 'click')
  assert.equal(get('zoom-value').textContent, '125%')
  send(get('reset-view'), 'click')
  assert.equal(get('zoom-value').textContent, '100%')
  assert.equal(get('selected-count').textContent, '0')
  send(get('toggle-debug'), 'click')
  assert.equal(get('toggle-debug').attributes.get('aria-pressed'), 'true')
})
