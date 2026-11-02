import type { ItemData } from './virtualList.ts'

// Both renderers use the same elements and visible text in measurement mode.
export function createRow(slot: number, pooled = true): HTMLElement {
  const element = document.createElement('div')
  element.className = 'list-item'
  element.dataset.slotId = slot.toString()
  element.innerHTML = `
    <div class="list-item-header">
      <div>
        <span class="item-title"></span>
        <span class="slot-tag">${pooled ? 'Slot' : 'DOM'} #${slot}</span>
      </div>
      <span class="item-size"></span>
    </div>
    <div class="list-item-desc"></div>
  `
  return element
}

export function fillRow(element: HTMLElement, item: ItemData): void {
  const title = element.querySelector('.item-title') as HTMLElement
  const description = element.querySelector('.list-item-desc') as HTMLElement
  title.textContent = `#${item.id} ${item.title}`
  description.textContent = item.content
}
