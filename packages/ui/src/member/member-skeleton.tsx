// `MemberSkeleton` (navigation spec REQ-N15, phase 10; #264): what a member or public page shows while its content
// loads, in the shape of that content — `tiles` (the cards of Today), `rows` (a list) or `fields` (a form) — so the page
// does not jump when the content arrives. The grey pieces are the platform's `Skeleton` primitive inside an
// `aria-hidden` box; the region carries `aria-busy` and a visually hidden status line names what is loading (the text
// comes in through `label`, from the module's catalog).
import * as React from 'react'
import { Skeleton } from '@open-mercato/ui/primitives/skeleton'

export type MemberSkeletonShape = 'tiles' | 'rows' | 'fields'

export type MemberSkeletonProps = {
  shape: MemberSkeletonShape
  /** The status line read by assistive technology, e.g. "Loading payments…". */
  label: string
  /** How many tiles, rows or fields; defaults to the shape's usual page (4 tiles, 5 rows, 4 fields). */
  count?: number
  className?: string
  'data-testid'?: string
}

const DEFAULT_COUNT: Record<MemberSkeletonShape, number> = { tiles: 4, rows: 5, fields: 4 }

const LAYOUT: Record<MemberSkeletonShape, string> = {
  tiles: 'grid grid-cols-1 gap-3 sm:grid-cols-2',
  rows: 'flex flex-col gap-3',
  fields: 'flex flex-col gap-4',
}

function Piece({ shape }: { shape: MemberSkeletonShape }) {
  switch (shape) {
    case 'tiles':
      return (
        <div className="bg-card flex flex-col gap-2 rounded-lg border p-4">
          <Skeleton className="h-5 w-1/2" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-2/3" />
        </div>
      )
    case 'rows':
      return (
        <div className="flex flex-col gap-2 border-b pb-3 last:border-b-0 last:pb-0">
          <Skeleton className="h-5 w-2/3" />
          <Skeleton className="h-4 w-1/3" />
        </div>
      )
    case 'fields':
      return (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-11 w-full" />
        </div>
      )
  }
}

export function MemberSkeleton({ shape, label, count, className, 'data-testid': testId }: MemberSkeletonProps) {
  const pieces = Math.max(1, count ?? DEFAULT_COUNT[shape])
  return (
    <div aria-busy="true" className={className} data-testid={testId} data-skeleton={shape}>
      <span role="status" className="sr-only">
        {label}
      </span>
      <div aria-hidden="true" className={LAYOUT[shape]}>
        {Array.from({ length: pieces }, (_, index) => (
          <Piece key={index} shape={shape} />
        ))}
      </div>
    </div>
  )
}
