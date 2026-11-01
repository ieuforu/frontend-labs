import assert from 'node:assert/strict'
import { test } from 'node:test'
import { VirtualList } from '../labs/virtual-list/src/virtualList.ts'

// These fixtures control ResizeObserver measurements; they do not simulate browser layout.
class Element extends EventTarget {
  style = {}
  dataset = {}
  children = []
  parts = new Map()
  clientHeight = 140
  scrollTop = 0
  set innerHTML(value) {
    this.children = []
    this.parts.clear()
    this.markup = value
  }
  appendChild(element) {
    this.children.push(element)
    element.parent = this
  }
  querySelector(selector) {
    if (!this.parts.has(selector)) this.parts.set(selector, { textContent: '' })
    return this.parts.get(selector)
  }
  remove() {
    if (this.parent) this.parent.children = this.parent.children.filter((node) => node !== this)
  }
}

function fixture(t, { size = 100, bufferCount = 0, estimatedHeight = 70 } = {}) {
  const frames = new Map()
  let frameId = 0
  let observer
  globalThis.document = { createElement: () => new Element() }
  globalThis.requestAnimationFrame = (callback) => {
    frames.set(++frameId, callback)
    return frameId
  }
  globalThis.cancelAnimationFrame = (id) => frames.delete(id)
  globalThis.ResizeObserver = class {
    observed = new Set()
    constructor(callback) {
      this.callback = callback
      observer = this
    }
    observe(element) {
      this.observed.add(element)
    }
    disconnect() {
      this.observed.clear()
    }
  }
  const viewport = new Element()
  const phantom = new Element()
  const contentBox = new Element()
  const list = new VirtualList({
    viewport,
    phantom,
    contentBox,
    estimatedHeight,
    bufferCount,
    data: Array.from({ length: size }, (_, id) => ({ id, title: 'Item', content: 'Text' })),
  })
  t.after(() => list.destroy())
  const flush = () => {
    const pending = [...frames.values()]
    frames.clear()
    for (const callback of pending) callback()
  }
  const measure = (values) =>
    observer.callback(
      values.map(([target, height]) => ({
        target,
        borderBoxSize: [{ blockSize: height }],
      })),
    )
  return { list, viewport, phantom, contentBox, observer, frames, flush, measure }
}

test('measured height changes reposition visible rows without another scroll event', (t) => {
  const { contentBox, phantom, measure, flush } = fixture(t)
  measure([[contentBox.children[0], 100]])
  flush()
  assert.equal(contentBox.children[1].style.transform, 'translate3d(0, 100px, 0)')
  assert.equal(phantom.style.height, '7030px')
})

test('height changes above the visible item preserve its scroll offset', (t) => {
  const { viewport, contentBox, measure, flush } = fixture(t, { bufferCount: 2 })
  viewport.scrollTop = 75
  viewport.dispatchEvent(new Event('scroll'))
  flush()
  measure([[contentBox.children[0], 100]])
  assert.equal(viewport.scrollTop, 105)
})

test('pool grows after viewport resize and ignores hidden or zero-height observations', (t) => {
  const { viewport, contentBox, phantom, measure, flush } = fixture(t)
  const initial = contentBox.children.length
  viewport.clientHeight = 700
  measure([[viewport, 700]])
  flush()
  assert.ok(contentBox.children.length > initial)
  measure([[contentBox.children[0], 0]])
  assert.equal(phantom.style.height, '7000px')
  contentBox.children[0].style.display = 'none'
  measure([[contentBox.children[0], 10]])
  assert.equal(phantom.style.height, '7000px')
})

test('empty data is supported and destroy clears observers, nodes, and queued frames', (t) => {
  const empty = fixture(t, { size: 0 })
  assert.equal(empty.phantom.style.height, '0px')
  assert.equal(empty.contentBox.children.length, 0)
  empty.list.destroy()
  const f = fixture(t)
  f.viewport.dispatchEvent(new Event('scroll'))
  assert.equal(f.frames.size, 1)
  f.list.destroy()
  assert.equal(f.frames.size, 0)
  assert.equal(f.observer.observed.size, 0)
  assert.equal(f.contentBox.children.length, 0)
  f.viewport.dispatchEvent(new Event('scroll'))
  assert.equal(f.frames.size, 0)
})
