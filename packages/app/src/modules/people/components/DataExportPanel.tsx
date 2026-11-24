'use client'
// The "Data requests" panel on the person record's Details tab (person data export spec *UI and Interaction
// Contracts*, J-X01, phase X3; #527): one button downloads the person's data for an access or portability request
// (`GET /api/people/persons/{id}/data-export`). Shown only with `people.persons.export`; the route also requires the
// club administrator's grant. No confirmation: the export changes nothing, and every download is logged.
import * as React from 'react'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { Button } from '@open-mercato/ui/primitives/button'
import { useT } from '@open-mercato/shared/lib/i18n/context'

type ExportDocument = { reviewRequired?: unknown[] }

const FALLBACK_FILE_NAME = 'person-data.json'

/** The file name the route sent (`attachment; filename="person-data-YYYY-MM-DD.json"`). */
function fileNameOf(response: Response): string {
  const match = /filename="([^"]+)"/.exec(response.headers.get('content-disposition') ?? '')
  return match?.[1] ?? FALLBACK_FILE_NAME
}

function download(document: ExportDocument, fileName: string): void {
  const blob = new Blob([JSON.stringify(document, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = window.document.createElement('a')
  link.href = url
  link.download = fileName
  window.document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

export function DataExportPanel({ personId }: { personId: string }) {
  const t = useT()
  const [busy, setBusy] = React.useState(false)

  const exportData = async () => {
    if (busy) return
    setBusy(true)
    try {
      const call = await apiCall<ExportDocument>(`/api/people/persons/${encodeURIComponent(personId)}/data-export`)
      if (call.ok && call.result) {
        download(call.result, fileNameOf(call.response))
        flash(t('people.dataExport.flash.done', { count: call.result.reviewRequired?.length ?? 0 }), 'success')
        return
      }
      if (call.status === 404) flash(t('people.dataExport.errors.notFound'), 'error')
      else if (call.status === 403) flash(t('people.dataExport.errors.denied'), 'error')
      else flash(t('people.dataExport.errors.failed'), 'error')
    } catch {
      flash(t('people.dataExport.errors.failed'), 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section
      className="bg-card flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between"
      aria-labelledby="people-data-export-title"
      data-testid="people-data-export-panel"
    >
      <div className="flex flex-col gap-1">
        <h2 id="people-data-export-title" className="text-base font-semibold">
          {t('people.dataExport.title')}
        </h2>
        <p className="text-muted-foreground text-sm">{t('people.dataExport.description')}</p>
      </div>
      <Button
        type="button"
        variant="outline"
        className="self-start sm:self-auto"
        onClick={() => {
          void exportData()
        }}
        disabled={busy}
        aria-busy={busy}
        data-testid="people-data-export-button"
      >
        {t('people.dataExport.action')}
      </Button>
    </section>
  )
}
