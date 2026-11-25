import { loadDictionary } from '@open-mercato/shared/lib/i18n/server'
import { OutlinePrintPage, type PrintLabels } from '../../../../../../components/club/OutlinePrintPage'

const PREFIX = 'training.print.sheet.'

/** The sheet's labels in both outline languages: a Polish outline prints in Polish whatever the reader's language. */
async function printLabels(): Promise<PrintLabels> {
  const pick = async (locale: 'pl' | 'en') => {
    const dict = await loadDictionary(locale)
    return Object.fromEntries(
      Object.entries(dict)
        .filter(([key]) => key.startsWith(PREFIX))
        .map(([key, value]) => [key.slice(PREFIX.length), value]),
    )
  }
  const [pl, en] = await Promise.all([pick('pl'), pick('en')])
  return { pl, en }
}

export default async function TrainingOutlinePrintRoute({ params }: { params?: { id?: string } }) {
  const id = params?.id
  if (!id) return null
  return <OutlinePrintPage id={id} labels={await printLabels()} />
}
