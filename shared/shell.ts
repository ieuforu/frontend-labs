import './shell.css'

const icons: Record<string, string> = {
  home: '<path d="M3 10 12 3l9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1Z"/>',
  'virtual-list':
    '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/>',
  'task-slicer': '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  'thread-pool':
    '<rect x="3" y="3" width="6" height="6" rx="1"/><rect x="15" y="3" width="6" height="6" rx="1"/><rect x="9" y="15" width="6" height="6" rx="1"/><path d="M6 9v3h12V9M12 12v3"/>',
}

export const icon = (name: string, className = '') =>
  `<svg class="${className}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name] ?? icons.home}</svg>`

const pages = [
  { id: 'home', title: '概览', href: '/' },
  { id: 'virtual-list', title: '虚拟列表', href: '/virtual-list/' },
  { id: 'task-slicer', title: '任务切片', href: '/task-slicer/' },
  { id: 'thread-pool', title: '线程池', href: '/thread-pool/' },
]
const active = document.body.dataset.page ?? 'home'
const page = pages.find((item) => item.id === active) ?? pages[0]
const content = document.querySelector<HTMLElement>('[data-page-content]')
if (!content) throw new Error('Missing page content')

const navLink = (item: (typeof pages)[number]) =>
  `<a class="nav-link${item.id === active ? ' is-current' : ''}" href="${item.href}"${item.id === active ? ' aria-current="page"' : ''}>${icon(item.id)}<span>${item.title}</span>${item.id !== 'home' ? '<span class="nav-dot" aria-hidden="true"></span>' : ''}</a>`

const layout = document.createElement('div')
layout.className = 'site-layout'
layout.innerHTML = `
  <a class="skip-link" href="#main-content">跳到内容</a>
  <aside class="sidebar" id="site-navigation" aria-label="工作区导航">
    <a class="workspace-brand" href="/"><span class="brand-mark" aria-hidden="true">f.</span><span>Frontend Labs<span class="brand-caption">ieuforu 的实验笔记</span></span></a>
    <button class="sidebar-close" aria-label="关闭导航">×</button><nav aria-label="页面导航">
      ${navLink(pages[0])}
      <p class="nav-section-label">实验</p>
      ${pages.slice(1).map(navLink).join('')}
    </nav>
    <div class="sidebar-bottom">
      <a href="https://github.com/ieuforu/frontend-labs" target="_blank" rel="noreferrer"><span aria-hidden="true">↗</span> GitHub 仓库</a>
      <p>把前端原理，变成可以动手的小实验。</p>
      <a class="author-link" href="https://github.com/ieuforu" target="_blank" rel="noreferrer"><span class="author-avatar" aria-hidden="true">i</span><span>ieuforu<span>持续记录，慢慢完善</span></span></a>
    </div>
  </aside>
  <button class="nav-backdrop" aria-label="关闭导航" tabindex="-1" hidden></button>
  <div class="workspace">
    <header class="topbar">
      <div class="breadcrumb"><button class="menu-toggle" aria-label="打开导航" aria-expanded="false" aria-controls="site-navigation"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16"/></svg></button><a href="/">Frontend Labs</a><span class="breadcrumb-divider">/</span><span>${page.title}</span></div>
      <a class="source-link" href="https://github.com/ieuforu/frontend-labs${active === 'home' ? '' : `/tree/main/labs/${active}`}" target="_blank" rel="noreferrer">查看源码 <span aria-hidden="true">↗</span></a>
    </header>
    <main class="page-content" id="main-content" tabindex="-1"></main>
  </div>`
layout.querySelector('main')!.append(content)
document.body.prepend(layout)

const sidebar = layout.querySelector<HTMLElement>('.sidebar')!
const toggle = layout.querySelector<HTMLButtonElement>('.menu-toggle')!
const backdrop = layout.querySelector<HTMLButtonElement>('.nav-backdrop')!
const workspace = layout.querySelector<HTMLElement>('.workspace')!
const mobile = matchMedia('(max-width: 760px)')
let open = false
function setNavigation(next: boolean, restoreFocus = false) {
  open = next && mobile.matches
  document.body.classList.toggle('nav-open', open)
  toggle.setAttribute('aria-expanded', String(open))
  toggle.setAttribute('aria-label', open ? '关闭导航' : '打开导航')
  sidebar.inert = mobile.matches && !open
  workspace.inert = open
  backdrop.hidden = !open
  if (open) sidebar.querySelector<HTMLElement>('a')!.focus()
  else if (restoreFocus) toggle.focus()
}
toggle.addEventListener('click', () => setNavigation(!open))
backdrop.addEventListener('click', () => setNavigation(false, true))
layout.querySelector('.sidebar-close')!.addEventListener('click', () => setNavigation(false, true))
document.addEventListener('keydown', (event) => {
  if (!open) return
  if (event.key === 'Escape') setNavigation(false, true)
  if (event.key === 'Tab') {
    const links = Array.from(sidebar.querySelectorAll<HTMLElement>('a[href], button'))
    const first = links[0]
    const last = links[links.length - 1]
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first.focus()
    }
  }
})
mobile.addEventListener('change', () => setNavigation(false))
setNavigation(false)
