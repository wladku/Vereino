'use client'
// The score of a match or sparring (groups and activities parity spec REQ-A15, Q-A21; E10-S07 #272), shared by the
// coach block of `/club/occurrences/[id]` (M-04) and the panel session record: the club's team and the opponent (the
// club's team first, whether it played at home or away), an optional note, "Save score" and "Clear score". It saves
// against the session version; a save by someone else meanwhile shows the shared conflict bar and refreshes.
import * as React from 'react'
import { surfaceRecordConflict } from '@open-mercato/ui/backend/conflicts'
import { Button } from '@open-mercato/ui/primitives/button'
import { Input } from '@open-mercato/ui/primitives/input'
import { Label } from '@open-mercato/ui/primitives/label'
import { Textarea } from '@open-mercato/ui/primitives/textarea'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { RESULT_NOTE_MAX, SCORE_MAX, clubFirstScore, type ScoreView } from '../lib/score'
import { errorText, saveScore } from './club/club-client'

/** "3" → 3; blank or out of range → null (the form then says what is wrong). */
function goals(value: string): number | null {
  if (!/^\d{1,2}$/.test(value.trim())) return null
  const parsed = Number(value.trim())
  return parsed <= SCORE_MAX ? parsed : null
}

export function ScoreForm({
  occurrenceId,
  updatedAt,
  score,
  isAway,
  onSaved,
}: {
  occurrenceId: string
  /** The session version the page showed (the lock token). */
  updatedAt: string
  score: ScoreView | null
  isAway: boolean
  /** Called after a save or a conflict, so the page reads the session again. */
  onSaved: (message: string) => Promise<void>
}) {
  const t = useT()
  const ids = { club: React.useId(), opponent: React.useId(), note: React.useId(), problem: React.useId() }
  // The form shows the club's team first; the API stores "home" and "away".
  const clubGoals = score ? (isAway ? score.away : score.home) : null
  const opponentGoals = score ? (isAway ? score.home : score.away) : null
  const [club, setClub] = React.useState(clubGoals === null ? '' : String(clubGoals))
  const [opponent, setOpponent] = React.useState(opponentGoals === null ? '' : String(opponentGoals))
  const [note, setNote] = React.useState(score?.note ?? '')
  const [problem, setProblem] = React.useState<string | null>(null)
  const [pending, setPending] = React.useState(false)

  const submit = async (clear: boolean) => {
    const ours = goals(club)
    const theirs = goals(opponent)
    if (!clear && (ours === null || theirs === null)) {
      setProblem(t('activities.score.invalid', { max: SCORE_MAX }))
      return
    }
    setPending(true)
    setProblem(null)
    try {
      const input = clear
        ? { scoreHome: null, scoreAway: null, note: null }
        : {
            scoreHome: isAway ? theirs : ours,
            scoreAway: isAway ? ours : theirs,
            note: note.trim() || null,
          }
      const saved = await saveScore(occurrenceId, input, t('activities.score.errors.save'), updatedAt)
      if (clear) {
        setClub('')
        setOpponent('')
        setNote('')
      }
      await onSaved(
        saved?.score
          ? t('activities.score.saved', { score: clubFirstScore(saved.score, isAway) })
          : t('activities.score.cleared'),
      )
    } catch (error: unknown) {
      if (surfaceRecordConflict(error, t, { onRefresh: () => void onSaved('') })) return
      setProblem(errorText(error, t('activities.score.errors.save')))
    } finally {
      setPending(false)
    }
  }

  return (
    <form
      className="flex flex-col gap-3"
      data-testid="score-form"
      onSubmit={(event) => {
        event.preventDefault()
        void submit(false)
      }}
    >
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1">
          <Label htmlFor={ids.club}>{t('activities.score.club')}</Label>
          <Input
            id={ids.club}
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={2}
            className="min-h-11"
            value={club}
            disabled={pending}
            aria-invalid={problem ? true : undefined}
            aria-describedby={problem ? ids.problem : undefined}
            data-testid="score-club"
            onChange={(event) => {
              setClub(event.target.value)
            }}
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor={ids.opponent}>{t('activities.score.opponent')}</Label>
          <Input
            id={ids.opponent}
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={2}
            className="min-h-11"
            value={opponent}
            disabled={pending}
            aria-invalid={problem ? true : undefined}
            aria-describedby={problem ? ids.problem : undefined}
            data-testid="score-opponent"
            onChange={(event) => {
              setOpponent(event.target.value)
            }}
          />
        </div>
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor={ids.note}>{t('activities.score.note')}</Label>
        <Textarea
          id={ids.note}
          rows={2}
          maxLength={RESULT_NOTE_MAX}
          value={note}
          disabled={pending}
          data-testid="score-note"
          onChange={(event) => {
            setNote(event.target.value)
          }}
        />
      </div>
      {problem ? (
        <p id={ids.problem} className="text-destructive text-sm" role="alert" data-testid="score-problem">
          {problem}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" className="min-h-11" disabled={pending} data-testid="score-save">
          {t('activities.score.save')}
        </Button>
        {score ? (
          <Button
            type="button"
            variant="outline"
            className="min-h-11"
            disabled={pending}
            data-testid="score-clear"
            onClick={() => {
              void submit(true)
            }}
          >
            {t('activities.score.clear')}
          </Button>
        ) : null}
      </div>
    </form>
  )
}
