import { Worker } from 'node:worker_threads'

export class BrowserWorker {
  onerror = null
  onmessageerror = null

  constructor(url) {
    this.worker = new Worker(new URL('./worker-bridge.mjs', import.meta.url), {
      workerData: { url: url.href },
    })
    this.worker.on('error', (error) => this.onerror?.(error))
    this.worker.on('messageerror', (error) => this.onmessageerror?.(error))
  }

  postMessage(data) {
    this.worker.postMessage(data)
  }

  terminate() {
    return this.worker.terminate()
  }
}
