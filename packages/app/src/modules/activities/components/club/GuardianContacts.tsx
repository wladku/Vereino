'use client'
// The "Contacts" section of the coach's attendance list (club spec REQ-037, DD-39, UI row
// `/club/occurrences/[id]/attendance`; #34): the phone and e-mail of the guardians who consented, read only when the
// coach asks — each read is recorded — with the children each guardian is responsible for. A guardian who withdrew the
// consent is gone from the next read.
import * as React from 'react'
import { ErrorMessage, LoadingMessage } from '@open-mercato/ui/backend/detail'
import { Alert } from '@open-mercato/ui/primitives/alert'
import { Button } from '@open-mercato/ui/primitives/button'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { fullName, useGuardianContacts, type GuardianContact } from './club-client'

function ContactItem({ contact }: { contact: GuardianContact }) {
  const t = useT()
  return (
    <li className="bg-card flex flex-col gap-1 rounded-lg border p-4" data-testid="club-contact">
      <span className="font-semibold">{fullName(contact)}</span>
      {contact.wards.length > 0 ? (
        <span className="text-muted-foreground text-sm">
          {t('activities.club.contacts.guardianOf', { names: contact.wards.map(fullName).join(', ') })}
        </span>
      ) : null}
      {contact.phone ? (
        <a
          href={`tel:${contact.phone.replace(/\s+/g, '')}`}
          className="text-primary inline-flex min-h-11 items-center text-sm break-all underline"
          data-testid="club-contact-phone"
        >
          {contact.phone}
        </a>
      ) : null}
      {contact.email ? (
        <a
          href={`mailto:${contact.email}`}
          className="text-primary inline-flex min-h-11 items-center text-sm break-all underline"
          data-testid="club-contact-email"
        >
          {contact.email}
        </a>
      ) : null}
      {!contact.phone && !contact.email ? (
        <span className="text-muted-foreground text-sm">{t('activities.club.contacts.noDetails')}</span>
      ) : null}
    </li>
  )
}

export function GuardianContacts({ occurrenceId }: { occurrenceId: string }) {
  const t = useT()
  const [requested, setRequested] = React.useState(false)
  const query = useGuardianContacts(occurrenceId, requested)
  let body: React.ReactNode = null
  if (!requested) {
    body = (
      <div className="flex flex-col gap-2">
        <p className="text-muted-foreground max-w-prose text-sm">{t('activities.club.contacts.intro')}</p>
        <Button
          type="button"
          variant="outline"
          className="min-h-11 self-start"
          data-testid="club-contacts-show"
          onClick={() => {
            setRequested(true)
          }}
        >
          {t('activities.club.contacts.show')}
        </Button>
      </div>
    )
  } else if (!query.data && query.isFetching) {
    body = <LoadingMessage label={t('activities.club.contacts.loading')} />
  } else if (!query.data) {
    body = (
      <ErrorMessage
        label={t('activities.club.contacts.error')}
        action={
          <Button type="button" variant="outline" className="min-h-11" onClick={() => void query.refetch()}>
            {t('activities.club.actions.retry')}
          </Button>
        }
      />
    )
  } else if (query.data.status === 'forbidden') {
    body = (
      <Alert status="warning" data-testid="club-contacts-forbidden">
        <p className="max-w-prose">{t('activities.club.contacts.forbidden')}</p>
      </Alert>
    )
  } else if (query.data.items.length === 0) {
    body = (
      <p className="text-muted-foreground text-sm" data-testid="club-contacts-empty">
        {t('activities.club.contacts.empty')}
      </p>
    )
  } else {
    body = (
      <ul className="flex flex-col gap-3" data-testid="club-contacts-list">
        {query.data.items.map((contact) => (
          <ContactItem key={contact.personId} contact={contact} />
        ))}
      </ul>
    )
  }
  return (
    <section aria-labelledby="club-contacts" className="flex flex-col gap-3" data-testid="club-contacts">
      <h2 id="club-contacts" className="text-lg font-semibold">
        {t('activities.club.contacts.title')}
      </h2>
      {/* The "Show" button gives way to the result, which is announced. */}
      <div aria-live="polite">{body}</div>
    </section>
  )
}
