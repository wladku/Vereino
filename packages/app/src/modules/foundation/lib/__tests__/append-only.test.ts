// TEST-G05 (unit part; foundation II P-27, P-28): the guard refuses updates and deletes of append-only rows only, and
// an audited read writes its log first, survives a failed mirror and never reads when the log write fails.
import { describe, expect, it, jest } from '@jest/globals'
import { appendOnlyGuard, type AppendOnlyViolation, type GuardEventArgs } from '../append-only'
import { runAuditedRead } from '../audited-read'

class LogRow {
  readonly kind = 'log'
}
class OtherRow {
  readonly kind = 'other'
}

function args(entity: unknown, className?: string): GuardEventArgs {
  return { entity, ...(className ? { meta: { className } } : {}) }
}

describe('appendOnlyGuard', () => {
  const refused: AppendOnlyViolation[] = []
  const guard = appendOnlyGuard({
    isAppendOnly: (entity) => entity instanceof LogRow,
    refuse: (violation) => {
      refused.push(violation)
      return Promise.reject(new Error('append_only'))
    },
  })

  it('refuses an update and a delete of an append-only row', async () => {
    await expect(guard.beforeUpdate(args(new LogRow(), 'ContactAccessLog'))).rejects.toThrow('append_only')
    await expect(guard.beforeDelete(args(new LogRow()))).rejects.toThrow('append_only')
    expect(refused).toEqual([
      { operation: 'update', entityName: 'ContactAccessLog' },
      { operation: 'delete', entityName: 'unknown' },
    ])
  })

  it('lets any other row through', async () => {
    await expect(guard.beforeUpdate(args(new OtherRow(), 'Attendance'))).resolves.toBeUndefined()
    await expect(guard.beforeDelete(args(new OtherRow(), 'Attendance'))).resolves.toBeUndefined()
  })
})

describe('runAuditedRead', () => {
  it('writes the log, mirrors it, then reads', async () => {
    const order: string[] = []
    const result = await runAuditedRead({
      writeLog: () => Promise.resolve(void order.push('log')),
      mirror: () => Promise.resolve(void order.push('mirror')),
      onMirrorFailed: () => order.push('mirror-failed'),
      read: () => {
        order.push('read')
        return Promise.resolve(42)
      },
    })
    expect(result).toBe(42)
    expect(order).toEqual(['log', 'mirror', 'read'])
  })

  it('still reads when only the mirror fails', async () => {
    const onMirrorFailed = jest.fn()
    const result = await runAuditedRead({
      writeLog: () => Promise.resolve(),
      mirror: () => Promise.reject(new Error('mirror down')),
      onMirrorFailed,
      read: () => Promise.resolve('data'),
    })
    expect(result).toBe('data')
    expect(onMirrorFailed).toHaveBeenCalledTimes(1)
  })

  it('never reads when the log write fails', async () => {
    const read = jest.fn(() => Promise.resolve('data'))
    const mirror = jest.fn(() => Promise.resolve())
    await expect(
      runAuditedRead({
        writeLog: () => Promise.reject(new Error('log down')),
        mirror,
        onMirrorFailed: () => undefined,
        read,
      }),
    ).rejects.toThrow('log down')
    expect(read).not.toHaveBeenCalled()
    expect(mirror).not.toHaveBeenCalled()
  })
})
