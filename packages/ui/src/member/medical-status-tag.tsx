// `MedicalStatusTag` (training outlines and medical expiry spec M-O1…M-O3, DD-O02; #682): a person's medical certificate
// status as a `StatusTag` — red an error, orange a warning, green a success — with the word and the date, so colour
// never carries the meaning alone; the word is the accessible name. The wrapper carries the caller's `data-testid` and
// `data-medical-status` (red / orange / green) for tests and styling hooks. All logic lives in `medical-status-model.ts`.
import * as React from 'react'
import { StatusTag } from '#tsx/status/status-tag'
import { MEDICAL_STATUS_TONE, medicalStatusText } from '#src/member/medical-status-model'
import type { MedicalStatusItem, MedicalStatusLabels } from '#src/member/medical-status-model'

export type MedicalStatusTagProps = {
  item: Pick<MedicalStatusItem, 'status' | 'state' | 'validUntil'>
  labels: MedicalStatusLabels
  /** Formats the `YYYY-MM-DD` day for the reader's locale; the raw day without it. */
  formatDate?: (day: string) => string
  className?: string
  'data-testid'?: string
  /** The person the chip belongs to, as `data-person-id`. */
  personId?: string
}

export function MedicalStatusTag({
  item,
  labels,
  formatDate,
  className,
  personId,
  'data-testid': testId,
}: MedicalStatusTagProps) {
  return (
    <span
      className={['inline-flex max-w-full', className].filter(Boolean).join(' ')}
      data-testid={testId}
      data-medical-status={item.status}
      data-medical-state={item.state}
      data-person-id={personId}
    >
      <StatusTag status={MEDICAL_STATUS_TONE[item.status]}>{medicalStatusText(item, labels, formatDate)}</StatusTag>
    </span>
  )
}
