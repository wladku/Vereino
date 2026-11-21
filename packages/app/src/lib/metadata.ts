import type { Metadata } from 'next'
import { resolveTranslations } from '@open-mercato/shared/lib/i18n/server'

/** The product name in every browser tab (#485): "Vereino", and "{page} — Vereino" through the root layout's template. */
export const PRODUCT_NAME = 'Vereino'

export async function resolveLocalizedAppMetadata(): Promise<Metadata> {
  const { t } = await resolveTranslations()
  const product = t('app.metadata.title', PRODUCT_NAME)
  return {
    title: { default: product, template: `%s — ${product}` },
    description: t('app.metadata.description', 'Vereino — the app for running a sports club'),
  }
}

/**
 * A page title. Without one the root layout's default ("Vereino") applies; with one its template makes it
 * "{page} — Vereino". A public club page names its club instead of the product: "{club} — {page}" (#485).
 */
export async function resolveLocalizedTitleMetadata(input: {
  title?: string | null
  titleKey?: string | null
  fallback?: string
  clubName?: string | null
}): Promise<Metadata> {
  const { t } = await resolveTranslations()
  const fallbackTitle = input.title || input.fallback || ''
  const title = input.titleKey ? t(input.titleKey, fallbackTitle) : fallbackTitle
  if (!title) return input.clubName ? { title: { absolute: input.clubName } } : {}
  return input.clubName ? { title: { absolute: `${input.clubName} — ${title}` } } : { title }
}
