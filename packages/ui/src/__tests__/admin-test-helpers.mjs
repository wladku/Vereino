// Shared helpers of the admin component tests (P-32): fake timers for the debounced effects, a promise flush and a
// search of a React element tree (the views use no hooks, so their trees can be built by calling them).
import * as React from 'react'

/** Timers that run only when told to; `delays()` lists the pending delays in scheduling order. */
export function fakeTimers() {
  let next = 1
  const pending = new Map()
  return {
    setTimeout(callback, ms) {
      const handle = next++
      pending.set(handle, { callback, ms })
      return handle
    },
    clearTimeout(handle) {
      pending.delete(handle)
    },
    delays() {
      return [...pending.values()].map((timer) => timer.ms)
    },
    runAll() {
      for (const [handle, timer] of [...pending]) {
        pending.delete(handle)
        timer.callback()
      }
    },
  }
}

/** Lets every settled promise run its callbacks. */
export async function flush() {
  for (let index = 0; index < 5; index += 1) await new Promise((resolve) => setImmediate(resolve))
}

/** Depth-first search of a React element tree through `children` (function components are not expanded). */
export function findElements(node, predicate, found = []) {
  if (Array.isArray(node)) {
    for (const child of node) findElements(child, predicate, found)
    return found
  }
  if (!React.isValidElement(node)) return found
  if (predicate(node)) found.push(node)
  return findElements(node.props.children, predicate, found)
}
