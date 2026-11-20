// The localised "Former member" an anonymised person reads as on every screen (people life-cycle spec *Anonymised
// person*, REQ-L05; #308), in the reader's language (the request's locale; the default catalog in a job).
import { resolveTranslations } from '@open-mercato/shared/lib/i18n/server'

export async function formerMemberLabel(): Promise<string> {
  const { translate } = await resolveTranslations()
  return translate('people.person.formerMember', 'Former member')
}
