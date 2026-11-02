import { icon } from '../../../shared/shell.ts'
import './style.css'

document.querySelectorAll<HTMLElement>('[data-icon]').forEach((element) => {
  element.innerHTML = icon(element.dataset.icon!)
})
