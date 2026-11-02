import { execFileSync } from 'node:child_process'
import { cp, mkdir, rm, access } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'

const root = fileURLToPath(new URL('../', import.meta.url))
const output = join(root, 'dist')
const pnpm = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm'
const sourceRevision =
  process.env.VITE_SOURCE_REVISION?.trim() ||
  execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim()

const pages = [
  { directory: 'home', package: 'frontend-labs-home', base: '/' },
  { directory: 'virtual-list', package: 'virtual-list-lab', base: '/virtual-list/' },
  { directory: 'task-slicer', package: 'task-slicer-lab', base: '/task-slicer/' },
  { directory: 'thread-pool', package: 'thread-pool-lab', base: '/thread-pool/' },
]

// Finish every build before replacing the assembled deployment directory.
for (const page of pages) {
  execFileSync(pnpm, ['--filter', page.package, 'exec', 'vite', 'build', `--base=${page.base}`], {
    cwd: root,
    stdio: 'inherit',
    env: { ...process.env, VITE_SOURCE_REVISION: sourceRevision },
  })
  await access(join(root, 'labs', page.directory, 'dist', 'index.html'))
}

await rm(output, { recursive: true, force: true })
await mkdir(output, { recursive: true })
for (const page of pages) {
  const destination = page.directory === 'home' ? output : join(output, page.directory)
  await cp(join(root, 'labs', page.directory, 'dist'), destination, { recursive: true })
}

console.log(`Built landing page and three labs in ${output} (revision ${sourceRevision}).`)
