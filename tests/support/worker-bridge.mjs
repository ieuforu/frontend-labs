import { parentPort, workerData } from 'node:worker_threads'

// Adapt browser message delivery; the actual worker loop and Atomics run unchanged.
globalThis.self = {}
const pending = []
let ready = false
parentPort.on('message', (data) => {
  if (ready) self.onmessage({ data })
  else pending.push(data)
})
await import(workerData.url)
ready = true
for (const data of pending) self.onmessage({ data })
