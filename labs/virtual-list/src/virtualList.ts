export interface ItemData {
  id: number
  title: string
  content: string
}

export interface ItemPosition {
  index: number
  top: number
  bottom: number
  height: number
}

export interface VirtualListOptions {
  viewport: HTMLElement
  phantom: HTMLElement
  contentBox: HTMLElement
  data: ItemData[]
  estimatedHeight: number
  bufferCount?: number
  onMetricsUpdate?: (domCount: number, range: [number, number], totalHeight: number) => void
}

export class VirtualList {
  private viewport: HTMLElement
  private phantom: HTMLElement
  private contentBox: HTMLElement
  private data: ItemData[]
  private estimatedHeight: number
  private bufferCount: number

  private positions: ItemPosition[] = []
  private domPool: HTMLElement[] = []
  private resizeObserver: ResizeObserver

  private onMetricsUpdate?: (domCount: number, range: [number, number], totalHeight: number) => void
  private frame: number | null = null
  private destroyed = false
  private readonly onScroll = () => this.scheduleRender()

  constructor(options: VirtualListOptions) {
    this.viewport = options.viewport
    this.phantom = options.phantom
    this.contentBox = options.contentBox
    this.data = options.data
    this.estimatedHeight = options.estimatedHeight
    this.bufferCount = options.bufferCount ?? 5
    this.onMetricsUpdate = options.onMetricsUpdate
    if (!Number.isFinite(this.estimatedHeight) || this.estimatedHeight <= 0) {
      throw new RangeError('Estimated height must be positive')
    }
    if (!Number.isInteger(this.bufferCount) || this.bufferCount < 0) {
      throw new RangeError('Buffer count must be a nonnegative integer')
    }

    this.initPositions()
    this.resizeObserver = new ResizeObserver((entries) => {
      this.handleResize(entries)
    })

    this.initDomPool()
    this.resizeObserver.observe(this.viewport)
    this.viewport.addEventListener('scroll', this.onScroll, { passive: true })
    this.render()
  }

  private initPositions() {
    this.positions = new Array(this.data.length)
    for (let i = 0; i < this.data.length; i++) {
      this.positions[i] = {
        index: i,
        top: i * this.estimatedHeight,
        bottom: (i + 1) * this.estimatedHeight,
        height: this.estimatedHeight,
      }
    }
    this.updatePhantomHeight()
  }

  private updatePhantomHeight() {
    const totalHeight = this.positions[this.positions.length - 1]?.bottom || 0
    this.phantom.style.height = `${totalHeight}px`
    return totalHeight
  }

  private initDomPool() {
    const viewportHeight = this.viewport.clientHeight || 520
    const poolSize = Math.ceil(viewportHeight / this.estimatedHeight) + this.bufferCount * 2

    this.contentBox.innerHTML = ''
    this.domPool = []

    this.ensurePoolSize(Math.min(poolSize, this.data.length))
  }

  private ensurePoolSize(poolSize: number) {
    for (let i = this.domPool.length; i < poolSize; i++) {
      const el = document.createElement('div')
      el.className = 'list-item'
      el.dataset.slotId = i.toString()
      el.style.display = 'none'
      el.innerHTML = `
        <div class="list-item-header">
          <div>
            <span class="item-title"></span>
            <span class="slot-tag">Slot #${i}</span>
          </div>
          <span class="item-size"></span>
        </div>
        <div class="list-item-desc"></div>
      `
      this.contentBox.appendChild(el)
      this.domPool.push(el)
      this.resizeObserver.observe(el)
    }
  }

  private findStartIndex(scrollTop: number): number {
    let low = 0
    let high = this.positions.length - 1

    while (low <= high) {
      const mid = (low + high) >>> 1
      const midBottom = this.positions[mid].bottom

      if (midBottom === scrollTop) {
        return mid + 1
      } else if (midBottom < scrollTop) {
        low = mid + 1
      } else {
        high = mid - 1
      }
    }
    return low
  }

  private handleResize(entries: ResizeObserverEntry[]) {
    if (this.destroyed) return
    const anchor = this.findStartIndex(this.viewport.scrollTop)
    const anchorOffset = this.viewport.scrollTop - (this.positions[anchor]?.top ?? 0)
    let firstChanged = this.positions.length

    for (const entry of entries) {
      const target = entry.target as HTMLElement
      if (target === this.viewport) {
        this.scheduleRender()
        continue
      }
      const indexStr = target.dataset.index
      if (indexStr === undefined || target.style.display === 'none') continue

      const index = parseInt(indexStr, 10)
      const realHeight = entry.borderBoxSize?.[0]?.blockSize ?? target.offsetHeight

      const pos = this.positions[index]
      if (pos && Number.isFinite(realHeight) && realHeight > 0 && pos.height !== realHeight) {
        pos.height = realHeight
        firstChanged = Math.min(firstChanged, index)
      }
    }

    if (firstChanged < this.positions.length) {
      // Rebuild the affected suffix once per observer batch, rather than once per entry.
      for (let i = firstChanged; i < this.positions.length; i++) {
        const pos = this.positions[i]
        pos.top = i === 0 ? 0 : this.positions[i - 1].bottom
        pos.bottom = pos.top + pos.height
      }
      this.updatePhantomHeight()
      if (this.positions[anchor])
        this.viewport.scrollTop = this.positions[anchor].top + anchorOffset
      this.scheduleRender()
    }
  }

  private render() {
    const scrollTop = this.viewport.scrollTop
    const viewportHeight = this.viewport.clientHeight || 520

    let startIndex = this.findStartIndex(scrollTop)
    startIndex = Math.max(0, startIndex - this.bufferCount)

    let endIndex = startIndex
    const bottomLimit = scrollTop + viewportHeight

    while (endIndex < this.positions.length && this.positions[endIndex].top < bottomLimit) {
      endIndex++
    }
    endIndex = Math.min(this.data.length - 1, endIndex + this.bufferCount)

    const renderCount = Math.max(0, endIndex - startIndex + 1)
    this.ensurePoolSize(renderCount)

    for (let i = 0; i < this.domPool.length; i++) {
      const dom = this.domPool[i]
      const dataIndex = startIndex + i

      if (i < renderCount && dataIndex < this.data.length) {
        const item = this.data[dataIndex]
        const pos = this.positions[dataIndex]

        dom.dataset.index = dataIndex.toString()
        dom.style.transform = `translate3d(0, ${pos.top}px, 0)`
        dom.style.display = 'flex'

        const titleEl = dom.querySelector('.item-title') as HTMLElement
        const sizeEl = dom.querySelector('.item-size') as HTMLElement
        const descEl = dom.querySelector('.list-item-desc') as HTMLElement

        titleEl.textContent = `#${item.id} ${item.title}`
        sizeEl.textContent = `H: ${Math.round(pos.height)}px (Top: ${Math.round(pos.top)}px)`
        descEl.textContent = item.content
      } else {
        dom.style.display = 'none'
        delete dom.dataset.index
      }
    }

    if (this.onMetricsUpdate) {
      const totalH = this.positions[this.positions.length - 1]?.bottom || 0
      this.onMetricsUpdate(this.domPool.length, [startIndex, endIndex], totalH)
    }
  }

  private scheduleRender() {
    if (this.destroyed || this.frame !== null) return
    this.frame = requestAnimationFrame(() => {
      this.frame = null
      if (!this.destroyed) this.render()
    })
  }

  destroy(): void {
    if (this.destroyed) return
    this.destroyed = true
    this.viewport.removeEventListener('scroll', this.onScroll)
    if (this.frame !== null) cancelAnimationFrame(this.frame)
    this.resizeObserver.disconnect()
    for (const node of this.domPool) node.remove()
    this.domPool = []
  }
}
