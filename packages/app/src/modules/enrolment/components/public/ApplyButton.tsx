'use client'
// P-J1 (sign-up form spec; #799): the "Apply" button of a public section page, rendered by the `enrolment` widget on
// the spot `vereino:public:section:actions` of `club_core`'s page, once in the section's header and once after the
// classes. It reads the section's form (the same query the form page uses, so the page opens from the cache) and
// shows nothing unless the section takes applications (REQ-J03): no disabled button, no error.
import * as React from 'react'
import Link from 'next/link'
import { Button } from '@open-mercato/ui/primitives/button'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { applyPath } from '../../lib/paths'
import { usePublicForm } from './public-client'

export type ApplyButtonPlacement = 'header' | 'footer'

export function ApplyButton({
  clubSlug,
  sectionSlug,
  placement,
}: {
  clubSlug: string
  sectionSlug: string
  placement: ApplyButtonPlacement
}) {
  const t = useT()
  const query = usePublicForm(clubSlug, sectionSlug)
  const load = query.data
  if (!clubSlug || !sectionSlug || !load || load.status !== 'ok') return null
  return (
    <div className="flex flex-col items-start gap-1" data-testid="enrolment-apply" data-placement={placement}>
      <Button asChild className="h-auto min-h-11 max-w-full whitespace-normal">
        <Link href={applyPath(clubSlug, sectionSlug)} data-testid="enrolment-apply-button" data-placement={placement}>
          {t('enrolment.public.apply.button')}
        </Link>
      </Button>
      <p className="text-muted-foreground text-sm">
        {t('enrolment.public.apply.answerTime', { days: load.form.answerDays })}
      </p>
    </div>
  )
}
