'use client'
// The create page waits for the feature check, so the PESEL field appears only for `people.pesel.view`.
import { LoadingMessage } from '@open-mercato/ui/backend/detail'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { PersonCreateForm } from './PersonForm'
import { useGrantedFeatures } from './useGrantedFeatures'

export function PersonCreatePage() {
  const t = useT()
  const features = useGrantedFeatures()
  if (!features.loaded) return <LoadingMessage label={t('people.common.loading')} />
  return <PersonCreateForm withPesel={features['people.pesel.view']} />
}
