// P-27 the order of an audited read (foundation II DD-G06): the log row is written and committed first; the mirror to
// the platform access log is best effort (its rows rotate after hours, so it is never the record); the read runs only
// after the log row exists. A failed log write leaves the read uncalled, so no data leaves without its record.
export type AuditedReadSteps<T> = {
  writeLog: () => Promise<void>
  mirror: () => Promise<void>
  onMirrorFailed: (error: unknown) => void
  read: () => Promise<T>
}

export async function runAuditedRead<T>(steps: AuditedReadSteps<T>): Promise<T> {
  await steps.writeLog()
  try {
    await steps.mirror()
  } catch (error: unknown) {
    steps.onMirrorFailed(error)
  }
  return steps.read()
}
