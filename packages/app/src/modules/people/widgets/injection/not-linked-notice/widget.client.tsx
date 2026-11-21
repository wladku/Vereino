'use client'
// The banner of `widget.ts`: shown while the URL carries `?notice=person-not-linked`, until the user dismisses it or
// leaves the page. The text comes from the catalog, never from the URL.
import * as React from 'react'
import { useSearchParams } from 'next/navigation'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { Notice } from '@vereino/ui'
import { hasNotLinkedNotice } from '../../../lib/member-rules'

export default function NotLinkedNotice() {
  const t = useT()
  const search = useSearchParams()
  const [dismissed, setDismissed] = React.useState(false)
  if (dismissed || !hasNotLinkedNotice(search)) return null
  return (
    <Notice
      className="mb-4"
      dismissible
      onDismiss={() => {
        setDismissed(true)
      }}
      data-testid="people-not-linked-notice"
    >
      {t('people.club.notLinked.notice')}
    </Notice>
  )
}
