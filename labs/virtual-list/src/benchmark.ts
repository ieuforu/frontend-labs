export type RenderMode = 'full' | 'virtual'

export interface Sample {
  round: number
  order: number
  mode: RenderMode
  mountMs: number
  layoutReadMs: number
  secondFrameMs: number
  rowNodes: number
  descendantNodes: number
  scrollHeight: number
}

export function roundOrder(round: number): RenderMode[] {
  return round % 2 === 0 ? ['full', 'virtual'] : ['virtual', 'full']
}

export function summarize(samples: Sample[], mode: RenderMode) {
  const rows = samples.filter((sample) => sample.mode === mode)
  if (rows.length === 0) return null
  const distribution = (key: 'mountMs' | 'layoutReadMs' | 'secondFrameMs') => {
    const values = rows.map((sample) => sample[key]).sort((a, b) => a - b)
    const middle = Math.floor(values.length / 2)
    return {
      median: values.length % 2 ? values[middle] : (values[middle - 1] + values[middle]) / 2,
      min: values[0],
      max: values[values.length - 1],
    }
  }
  return {
    count: rows.length,
    mountMs: distribution('mountMs'),
    layoutReadMs: distribution('layoutReadMs'),
    secondFrameMs: distribution('secondFrameMs'),
    rowNodes: {
      min: Math.min(...rows.map((s) => s.rowNodes)),
      max: Math.max(...rows.map((s) => s.rowNodes)),
    },
  }
}

export function nextFrame(signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason)
      return
    }
    const cleanup = () => {
      clearTimeout(timeout)
      signal?.removeEventListener('abort', abort)
    }
    const abort = () => {
      cancelAnimationFrame(frame)
      cleanup()
      reject(signal?.reason ?? new Error('Frame callback did not arrive; keep the page visible'))
    }
    const frame = requestAnimationFrame(() => {
      cleanup()
      resolve()
    })
    const timeout = setTimeout(abort, 5_000)
    signal?.addEventListener('abort', abort, { once: true })
  })
}
