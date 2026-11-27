'use client'
// The gallery of the tournament page P-T1 (event photos spec REQ-I05, REQ-I12, DD-I09; #872): the event's public
// pictures below the description, as a grid of thumbnails (2 columns at 375 px, 4 from 768 px), each a button that opens
// a full-width viewer with the picture, its description as caption, Previous and Next, the position, ArrowLeft and
// ArrowRight to switch and Escape to close (focus goes back to the tile that opened it). The description is the
// alternative text. No pictures, or only broken ones, render no section; a broken image hides its tile.
import * as React from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@open-mercato/ui/primitives/button'
import { Dialog, DialogDescription, DialogTitle } from '@open-mercato/ui/primitives/dialog'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { DialogContent } from '@/components/ui/dialog'
import type { PublicClubEventPicture } from './public-client'

export function PublicClubEventGallery({ pictures }: { pictures: PublicClubEventPicture[] }) {
  const t = useT()
  const [broken, setBroken] = React.useState<ReadonlySet<string>>(() => new Set())
  // Closing keeps the id, so the content stays filled while the dialog plays its closing animation.
  const [viewer, setViewer] = React.useState<{ id: string; open: boolean }>({ id: '', open: false })
  const visible = pictures.filter((picture) => !broken.has(picture.id))
  const index = visible.findIndex((picture) => picture.id === viewer.id)
  const shown = index >= 0 ? visible[index] : null

  const markBroken = (id: string) => {
    setBroken((previous) => new Set(previous).add(id))
  }
  const showAt = (next: number) => {
    if (next >= 0 && next < visible.length) setViewer({ id: visible[next].id, open: true })
  }

  if (visible.length === 0) return null
  return (
    <section
      className="flex flex-col gap-3"
      aria-labelledby="club-event-gallery-title"
      data-testid="club-event-gallery"
    >
      <h2 id="club-event-gallery-title" className="text-lg font-semibold">
        {t('club_core.public.event.gallery.heading')}
      </h2>
      <ul className="grid grid-cols-2 gap-2 md:grid-cols-4">
        {visible.map((picture) => (
          <li key={picture.id}>
            <button
              type="button"
              className="bg-muted focus-visible:ring-ring block aspect-square w-full overflow-hidden rounded-lg focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
              aria-label={t('club_core.public.event.gallery.open', { description: picture.description })}
              data-testid="club-event-gallery-item"
              onClick={() => {
                setViewer({ id: picture.id, open: true })
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- native lazy loading of a private-cached stream */}
              <img
                src={picture.url}
                alt={picture.description}
                loading="lazy"
                className="h-full w-full object-cover"
                onError={() => {
                  markBroken(picture.id)
                }}
              />
            </button>
          </li>
        ))}
      </ul>
      <Dialog
        open={viewer.open && shown !== null}
        onOpenChange={(open) => {
          if (!open) setViewer((previous) => ({ ...previous, open: false }))
        }}
      >
        {shown ? (
          <DialogContent
            size="xl"
            closeAriaLabel={t('club_core.public.event.gallery.close')}
            data-testid="club-event-gallery-viewer"
            onKeyDown={(event) => {
              if (event.key === 'ArrowLeft' && index > 0) {
                event.preventDefault()
                showAt(index - 1)
              } else if (event.key === 'ArrowRight' && index < visible.length - 1) {
                event.preventDefault()
                showAt(index + 1)
              }
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- the picture at its own size, no optimizer */}
            <img
              src={shown.url}
              alt={shown.description}
              className="bg-muted mt-6 max-h-[70vh] w-full rounded-lg object-contain"
              onError={() => {
                markBroken(shown.id)
              }}
            />
            <DialogTitle className="text-base font-medium">{shown.description}</DialogTitle>
            <div className="flex items-center justify-between gap-2">
              <Button
                type="button"
                variant="outline"
                className="min-h-11"
                disabled={index <= 0}
                data-testid="club-event-gallery-prev"
                onClick={() => {
                  showAt(index - 1)
                }}
              >
                <ChevronLeft aria-hidden="true" className="h-4 w-4" />
                {t('club_core.public.event.gallery.previous')}
              </Button>
              <DialogDescription className="text-muted-foreground text-sm" aria-live="polite">
                {t('club_core.public.event.gallery.position', { index: index + 1, total: visible.length })}
              </DialogDescription>
              <Button
                type="button"
                variant="outline"
                className="min-h-11"
                disabled={index >= visible.length - 1}
                data-testid="club-event-gallery-next"
                onClick={() => {
                  showAt(index + 1)
                }}
              >
                {t('club_core.public.event.gallery.next')}
                <ChevronRight aria-hidden="true" className="h-4 w-4" />
              </Button>
            </div>
          </DialogContent>
        ) : null}
      </Dialog>
    </section>
  )
}
