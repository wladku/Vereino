'use client'
// The upload and column mapping of a bulk import (club spec UI table `/backend/people/imports`, REQ-036; #28): the
// administrator picks the club's CSV or XLSX; the page reads its header in the browser with the same reader the
// server uses and suggests a mapping from the column names (English or Polish); the administrator corrects it once
// and asks for the preview, which uploads the file with the mapping and opens the import with every row classified.
// The server reads the file again from its bytes and refuses what it cannot use (422 `import_mapping_invalid`).
import * as React from 'react'
import { useRouter } from 'next/navigation'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { readApiResultOrThrow } from '@open-mercato/ui/backend/utils/apiCall'
import { Alert, AlertDescription } from '@open-mercato/ui/primitives/alert'
import { Button } from '@open-mercato/ui/primitives/button'
import { FileUploadArea } from '@open-mercato/ui/primitives/file-upload'
import { Label } from '@open-mercato/ui/primitives/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@open-mercato/ui/primitives/select'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { IMPORT_MAX_FILE_BYTES, IMPORT_MAX_ROWS, readImportFile } from '../../lib/import-file'
import {
  IMPORT_PERSON_FIELDS,
  IMPORT_SLOTS,
  checkMapping,
  slotField,
  suggestMapping,
  type ImportField,
  type ImportMapping,
} from '../../lib/import-mapping'
import { errorMessage } from '../client-helpers'
import { IMPORTS_HREF, codeOf, type ImportRow } from './import-client'

/** The select value for "not imported" (Radix `Select` items cannot carry an empty value). */
const NOT_MAPPED = '__none__'

type ReadFile = { file: File; header: string[]; rowCount: number; mapping: ImportMapping }

const FIELD_GROUPS: { id: string; fields: ImportField[] }[] = [
  ...IMPORT_SLOTS.map((slot) => ({ id: slot, fields: IMPORT_PERSON_FIELDS.map((field) => slotField(slot, field)) })),
  { id: 'group', fields: ['group'] },
]

function columnLabel(header: readonly string[], index: number, t: ReturnType<typeof useT>): string {
  const name = header[index]
  return name
    ? t('people.imports.upload.column', { number: index + 1, name })
    : t('people.imports.upload.columnUnnamed', { number: index + 1 })
}

export function ImportUpload() {
  const t = useT()
  const router = useRouter()
  const [read, setRead] = React.useState<ReadFile | null>(null)
  const [problem, setProblem] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState(false)
  const fieldId = React.useId()

  const select = async (files: File[]) => {
    const file = files.at(0)
    if (!file) return
    setProblem(null)
    setRead(null)
    const result = await readImportFile(new Uint8Array(await file.arrayBuffer()))
    if (!result.ok) {
      setProblem(t(`people.imports.fileProblems.${result.problem}`))
      return
    }
    if (result.sheet.rows.length === 0) {
      setProblem(t('people.imports.fileProblems.empty'))
      return
    }
    setRead({
      file,
      header: result.sheet.header,
      rowCount: result.sheet.rows.length,
      mapping: suggestMapping(result.sheet.header),
    })
  }

  const check = read ? checkMapping(read.mapping, read.header.length) : null

  const preview = async () => {
    if (!read || !check?.ok) return
    setBusy(true)
    try {
      const body = new FormData()
      body.append('file', read.file)
      body.append('mapping', JSON.stringify(read.mapping))
      const created = await readApiResultOrThrow<ImportRow>(
        '/api/people/imports',
        { method: 'POST', body },
        { errorMessage: t('people.imports.errors.upload') },
      )
      flash(t('people.imports.flash.previewed'), 'success')
      router.push(`${IMPORTS_HREF}/${created.id}`)
    } catch (error: unknown) {
      const problemCode = (error as { problem?: unknown }).problem
      setProblem(
        codeOf(error) === 'import_mapping_invalid' && typeof problemCode === 'string'
          ? t(`people.imports.fileProblems.${problemCode}`)
          : errorMessage(error, t('people.imports.errors.upload')),
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="flex flex-col gap-4 rounded-lg border p-4" data-testid="people-import-upload">
      <h2 className="text-lg font-semibold">{t('people.imports.upload.title')}</h2>
      <p className="text-muted-foreground max-w-prose text-sm">
        {t('people.imports.upload.description', { rows: IMPORT_MAX_ROWS })}
      </p>
      <FileUploadArea
        accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        multiple={false}
        maxSizeBytes={IMPORT_MAX_FILE_BYTES}
        disabled={busy}
        heading={t('people.imports.upload.heading')}
        description={t('people.imports.upload.hint')}
        browseLabel={t('people.imports.upload.browse')}
        onFilesSelected={(files) => void select(files)}
      />
      {problem ? (
        <Alert status="error" data-testid="people-import-problem">
          <AlertDescription>{problem}</AlertDescription>
        </Alert>
      ) : null}
      {read ? (
        <form
          className="flex flex-col gap-4"
          data-testid="people-import-mapping"
          onSubmit={(event) => {
            event.preventDefault()
            void preview()
          }}
        >
          <p className="text-sm" data-testid="people-import-file-summary">
            {t('people.imports.upload.fileSummary', {
              name: read.file.name,
              rows: read.rowCount,
              columns: read.header.length,
            })}
          </p>
          <p className="text-muted-foreground max-w-prose text-sm">{t('people.imports.upload.mappingHelp')}</p>
          {FIELD_GROUPS.map((group) => (
            <fieldset key={group.id} className="flex min-w-0 flex-col gap-3">
              <legend className="mb-2 text-sm font-semibold">{t(`people.imports.slots.${group.id}`)}</legend>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {group.fields.map((field) => {
                  const id = `${fieldId}-${field}`
                  const value = read.mapping[field]
                  return (
                    <div key={field} className="flex min-w-0 flex-col gap-1">
                      <Label htmlFor={id}>{t(`people.imports.fields.${field.split('.').at(-1) ?? field}`)}</Label>
                      <Select
                        value={value === undefined ? NOT_MAPPED : String(value)}
                        disabled={busy}
                        onValueChange={(next) => {
                          setRead((current) => {
                            if (!current) return current
                            const mapping: ImportMapping = Object.fromEntries(
                              Object.entries(current.mapping).filter(([key]) => key !== field),
                            )
                            if (next !== NOT_MAPPED) mapping[field] = Number(next)
                            return { ...current, mapping }
                          })
                        }}
                      >
                        <SelectTrigger id={id} className="min-h-11" data-testid={`people-import-map-${field}`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={NOT_MAPPED}>{t('people.imports.upload.notImported')}</SelectItem>
                          {read.header.map((_, index) => (
                            <SelectItem key={index} value={String(index)}>
                              {columnLabel(read.header, index, t)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )
                })}
              </div>
            </fieldset>
          ))}
          {check && !check.ok ? (
            <p className="text-destructive text-sm" role="alert" data-testid="people-import-mapping-problem">
              {t(`people.imports.fileProblems.${check.problem}`, {
                field: t(`people.imports.fields.${check.field.split('.').at(-1) ?? check.field}`),
              })}
            </p>
          ) : null}
          <div className="flex flex-wrap items-center gap-2">
            <Button type="submit" disabled={busy || !check?.ok} data-testid="people-import-preview">
              {busy ? t('people.imports.upload.previewing') : t('people.imports.upload.preview')}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => {
                setRead(null)
                setProblem(null)
              }}
            >
              {t('people.imports.upload.reset')}
            </Button>
          </div>
        </form>
      ) : null}
    </section>
  )
}
