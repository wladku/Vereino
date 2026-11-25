'use client'
// "Sign-in methods" on the person record's Account tab (social sign-in spec person-record UI row; REQ-S02; J-S01 step
// 3; #566), on the spot `vereino:people:person-record:sign-in` that `people` renders: the person's linked identities
// and "Unlink" for the club administrator (`foundation.identity.manage`).
import * as React from 'react'
import { SectionHeader } from '@open-mercato/ui/backend/SectionHeader'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import type { InjectionWidgetComponentProps } from '@open-mercato/shared/modules/widgets/injection'
import { IdentityLinks } from '../../../components/IdentityLinks'

export type PersonIdentitiesContext = { personId?: string }

export default function PersonIdentitiesWidget({
  context,
}: InjectionWidgetComponentProps<PersonIdentitiesContext, Record<string, unknown>>) {
  const t = useT()
  if (!context.personId) return null
  return (
    <section className="mt-6 flex flex-col gap-3" data-testid="person-identities">
      <SectionHeader title={t('foundation.identity.admin.title')} />
      <IdentityLinks url={`/api/foundation/identity?personId=${encodeURIComponent(context.personId)}`} own={false} />
    </section>
  )
}
