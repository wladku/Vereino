// The one asynchronous pattern behind the admin components (foundation III P-32): a request started by a React effect
// after an optional debounce, whose answer is dropped once the effect is cleaned up (the value, page or filter it was
// for has changed, or the component unmounted). Framework-free and with injectable timers, so `node --test` drives the
// debounce and the stale-response rule directly; the `.tsx` views only pass what these factories return to
// `React.useEffect`.

export type TimerHandle = ReturnType<typeof globalThis.setTimeout>

/** The timer functions a request effect uses; tests pass fakes, the browser uses the global ones. */
export type Timers = {
  readonly setTimeout: (callback: () => void, ms: number) => TimerHandle
  readonly clearTimeout: (handle: TimerHandle) => void
}

export const globalTimers: Timers = {
  setTimeout: (callback, ms) => globalThis.setTimeout(callback, ms),
  clearTimeout: (handle) => {
    globalThis.clearTimeout(handle)
  },
}

/** What `React.useEffect` accepts: a callback that may return its cleanup. */
export type EffectCallback = () => (() => void) | undefined

/** The effect of a component that has nothing to request in its current state. */
export const noEffect: EffectCallback = () => undefined

export type RequestEffectInput<T> = {
  /** Debounce before the request starts; 0 still waits for a timer tick so a quick change cancels it. */
  readonly delayMs: number
  readonly request: () => Promise<T>
  readonly onSuccess: (result: T) => void
  readonly onFailure: () => void
  readonly timers?: Timers
}

/**
 * An effect that starts `request` after `delayMs` and reports its result unless the effect was cleaned up first: the
 * cleanup cancels a pending timer and marks a request in flight as stale, so a late answer never overwrites a newer
 * state. A request that throws synchronously counts as a failure.
 */
export function requestEffect<T>({
  delayMs,
  request,
  onSuccess,
  onFailure,
  timers = globalTimers,
}: RequestEffectInput<T>): EffectCallback {
  return () => {
    let active = true
    const handle = timers.setTimeout(() => {
      Promise.resolve()
        .then(request)
        .then(
          (result) => {
            if (active) onSuccess(result)
          },
          () => {
            if (active) onFailure()
          },
        )
    }, delayMs)
    return () => {
      active = false
      timers.clearTimeout(handle)
    }
  }
}
