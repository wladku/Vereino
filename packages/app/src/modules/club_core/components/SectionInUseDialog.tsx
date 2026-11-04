'use client'
// The answer to a refused deactivation or delete of a section (UX parity spec J-U02, DD-U04): the 409
// `section_has_active_groups` lists the section's active groups, each linked to its group page, with "Deactivate these
// groups first". The section stays as it was.
import Link from 'next/link'
import { Button } from '@open-mercato/ui/primitives/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@open-mercato/ui/primitives/dialog'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import type { SectionUsageView } from './sections-shared'

const GROUPS_HREF = '/backend/groups/groups'

export function SectionInUseDialog({ usage, onClose }: { usage: SectionUsageView | null; onClose: () => void }) {
  const t = useT()
  if (!usage) return null
  const hidden = usage.total - usage.groups.length
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <DialogContent
        closeAriaLabel={t('club_core.sections.inUse.close')}
        data-testid="section-in-use-dialog"
        onKeyDown={(event) => {
          // Escape closes through the dialog; Cmd/Ctrl+Enter runs the primary action, which is closing too.
          if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) onClose()
        }}
      >
        <DialogHeader>
          <DialogTitle>{t('club_core.sections.inUse.title', { count: usage.total })}</DialogTitle>
          <DialogDescription>{t('club_core.sections.inUse.help')}</DialogDescription>
        </DialogHeader>
        <ul className="flex max-h-72 flex-col gap-1 overflow-y-auto" data-testid="section-in-use-groups">
          {usage.groups.map((group) => (
            <li key={group.id}>
              <Link className="underline underline-offset-4" href={`${GROUPS_HREF}/${group.id}`}>
                {group.name}
              </Link>
            </li>
          ))}
          {hidden > 0 ? (
            <li className="text-muted-foreground text-sm">{t('club_core.sections.inUse.more', { count: hidden })}</li>
          ) : null}
        </ul>
        <DialogFooter>
          <Button type="button" onClick={onClose}>
            {t('club_core.sections.inUse.close')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
