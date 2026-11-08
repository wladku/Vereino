'use client'
// The import part of B-29 (payments spec REQ-030; issue #113): the statement file (CSV or MT940), the format
// (detected by default), the optional CSV column mapping (the header text of each column in the bank's file), the
// "Automatically record confident matches" switch, and after an import its summary — recorded, to confirm, unmatched,
// skipped and the lines that could not be read. A refused file shows its reason at the file field (for a CSV without
// the required columns: which columns are required).
import * as React from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { surfaceRecordConflict } from '@open-mercato/ui/backend/conflicts'
import { Button } from '@open-mercato/ui/primitives/button'
import { Input } from '@open-mercato/ui/primitives/input'
import { Label } from '@open-mercato/ui/primitives/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@open-mercato/ui/primitives/select'
import { SwitchField } from '@open-mercato/ui/primitives/switch-field'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { BANK_FORMATS, STATEMENT_COLUMNS, type ColumnProfile } from '../../lib/bank-statement'
import { errorMessage } from '../client-helpers'
import { BANK_QUERY_KEY, importStatement, saveAutoRecord, useAutoRecord, type BankImportSummary } from './bank-client'

const FORMAT_OPTIONS = ['auto', ...BANK_FORMATS] as const

export function BankImportPanel({ onImported }: { onImported: (summary: BankImportSummary) => void }) {
  const t = useT()
  const queryClient = useQueryClient()
  const ids = { file: React.useId(), format: React.useId(), problem: React.useId(), mapping: React.useId() }
  const fileRef = React.useRef<HTMLInputElement>(null)
  const [file, setFile] = React.useState<File | null>(null)
  const [format, setFormat] = React.useState<string>('auto')
  const [mappingOpen, setMappingOpen] = React.useState(false)
  const [mapping, setMapping] = React.useState<ColumnProfile>({})
  const [pending, setPending] = React.useState(false)
  const [problem, setProblem] = React.useState<string | null>(null)
  const [summary, setSummary] = React.useState<BankImportSummary | null>(null)
  const [savingAuto, setSavingAuto] = React.useState(false)
  const settings = useAutoRecord()

  const submit = async () => {
    if (!file) {
      setProblem(t('payments.bank.import.fileRequired'))
      return
    }
    setPending(true)
    setProblem(null)
    try {
      const profile = Object.fromEntries(
        Object.entries(mapping).filter(([, value]) => typeof value === 'string' && value.trim()),
      ) as ColumnProfile
      const result = await importStatement(
        { file, format, columnProfile: mappingOpen && Object.keys(profile).length > 0 ? profile : null },
        t('payments.bank.import.error'),
      )
      setSummary(result)
      setFile(null)
      if (fileRef.current) fileRef.current.value = ''
      flash(t('payments.bank.import.done'), 'success')
      onImported(result)
      await queryClient.invalidateQueries({ queryKey: [BANK_QUERY_KEY] })
    } catch (error: unknown) {
      setProblem(errorMessage(error, t('payments.bank.import.error')))
    } finally {
      setPending(false)
    }
  }

  const toggleAuto = async (value: boolean) => {
    setSavingAuto(true)
    try {
      await saveAutoRecord(value, settings.data?.updatedAt ?? null, t('payments.bank.auto.error'))
      flash(value ? t('payments.bank.auto.on') : t('payments.bank.auto.off'), 'success')
    } catch (error: unknown) {
      if (!surfaceRecordConflict(error, t, { onRefresh: () => void settings.refetch() })) {
        flash(errorMessage(error, t('payments.bank.auto.error')), 'error')
      }
    } finally {
      setSavingAuto(false)
      await queryClient.invalidateQueries({ queryKey: [BANK_QUERY_KEY, 'settings'] })
    }
  }

  return (
    <section className="flex flex-col gap-4 rounded-md border p-4" aria-labelledby={`${ids.file}-heading`}>
      <h2 id={`${ids.file}-heading`} className="text-base font-semibold">
        {t('payments.bank.import.title')}
      </h2>
      <div className="flex flex-col gap-4 md:flex-row md:items-end">
        <div className="flex flex-1 flex-col gap-2">
          <Label htmlFor={ids.file}>{t('payments.bank.import.file')}</Label>
          <Input
            ref={fileRef}
            id={ids.file}
            type="file"
            accept=".csv,.txt,.sta,.mt940,text/csv,text/plain"
            data-testid="bank-import-file"
            aria-invalid={problem ? true : undefined}
            aria-describedby={problem ? ids.problem : `${ids.file}-help`}
            disabled={pending}
            onChange={(event) => {
              setFile(event.target.files?.[0] ?? null)
              setProblem(null)
            }}
          />
          <p id={`${ids.file}-help`} className="text-muted-foreground text-xs">
            {t('payments.bank.import.fileHelp')}
          </p>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor={ids.format}>{t('payments.bank.import.format')}</Label>
          <Select value={format} onValueChange={setFormat} disabled={pending}>
            <SelectTrigger id={ids.format} className="w-48" data-testid="bank-import-format">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {FORMAT_OPTIONS.map((value) => (
                <SelectItem key={value} value={value}>
                  {t(`payments.bank.import.formats.${value}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button
          type="button"
          data-testid="bank-import-submit"
          disabled={pending}
          onClick={() => {
            void submit()
          }}
        >
          {pending ? t('payments.bank.import.pending') : t('payments.bank.import.action')}
        </Button>
      </div>
      {problem ? (
        <p id={ids.problem} className="text-destructive text-sm" role="alert" data-testid="bank-import-problem">
          {problem}
        </p>
      ) : null}
      <div className="flex flex-col gap-2">
        <Button
          type="button"
          variant="link"
          className="self-start px-0"
          aria-expanded={mappingOpen}
          aria-controls={ids.mapping}
          onClick={() => {
            setMappingOpen((open) => !open)
          }}
        >
          {t('payments.bank.import.mapping')}
        </Button>
        {mappingOpen ? (
          <fieldset id={ids.mapping} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <legend className="text-muted-foreground mb-2 text-sm">{t('payments.bank.import.mappingHelp')}</legend>
            {STATEMENT_COLUMNS.map((column) => (
              <div key={column} className="flex flex-col gap-1">
                <Label htmlFor={`${ids.mapping}-${column}`}>{t(`payments.bank.columns.${column}`)}</Label>
                <Input
                  id={`${ids.mapping}-${column}`}
                  data-testid={`bank-mapping-${column}`}
                  maxLength={100}
                  value={mapping[column] ?? ''}
                  disabled={pending}
                  onChange={(event) => {
                    setMapping((current) => ({ ...current, [column]: event.target.value }))
                  }}
                />
              </div>
            ))}
          </fieldset>
        ) : null}
      </div>
      <SwitchField
        id={`${ids.file}-auto`}
        label={t('payments.bank.auto.label')}
        description={t('payments.bank.auto.help')}
        checked={settings.data?.autoBookBankMatches ?? true}
        disabled={savingAuto || !settings.data}
        onCheckedChange={(checked) => {
          void toggleAuto(checked)
        }}
      />
      {summary ? (
        <div
          role="status"
          data-testid="bank-import-summary"
          className="border-status-success-border bg-status-success-bg text-status-success-text rounded-md border p-3 text-sm"
        >
          <p>
            {t('payments.bank.import.summary', {
              total: summary.total,
              booked: summary.booked,
              suggested: summary.suggested,
              unmatched: summary.unmatched,
              skipped: summary.skipped,
            })}
          </p>
          {summary.skipped > 0 ? (
            <p>{t('payments.bank.import.skippedDetail', { debits: summary.debits, duplicates: summary.duplicates })}</p>
          ) : null}
          {summary.unreadable.length > 0 ? (
            <p data-testid="bank-import-unreadable">
              {t('payments.bank.import.unreadable', { lines: summary.unreadable.join(', ') })}
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  )
}
