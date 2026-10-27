import type { Decorator, Preview } from '@storybook/react-vite'
import { withThemeByClassName } from '@storybook/addon-themes'
import { I18nProvider, type Dict } from '@open-mercato/shared/lib/i18n/context'
import type { Locale } from '@open-mercato/shared/lib/i18n/config'
import en from '../stories/i18n/en.json'
import pl from '../stories/i18n/pl.json'
import './preview.css'

const dictionaries: Record<string, Dict> = { en, pl }

// Every story renders in both languages from the toolbar (S7.5, S7.8); text comes from the stories' catalogs.
const withLocale: Decorator = (Story, context) => {
  const locale: Locale = context.globals.locale === 'en' ? 'en' : 'pl'
  const supportedLocales: Locale[] = ['en', 'pl']
  return (
    <I18nProvider locale={locale} dict={dictionaries[locale] ?? {}} supportedLocales={supportedLocales}>
      <div lang={locale}>
        <Story />
      </div>
    </I18nProvider>
  )
}

const preview: Preview = {
  decorators: [
    withLocale,
    // Dark mode follows the app: the `.dark` class (`@custom-variant dark` in globals.css).
    withThemeByClassName({ themes: { light: '', dark: 'dark' }, defaultTheme: 'light' }),
  ],
  globalTypes: {
    locale: {
      description: 'Interface language',
      toolbar: {
        title: 'Language',
        icon: 'globe',
        items: [
          { value: 'pl', title: 'Polski' },
          { value: 'en', title: 'English' },
        ],
        dynamicTitle: true,
      },
    },
  },
  initialGlobals: { locale: 'pl' },
  parameters: {
    layout: 'padded',
    controls: { matchers: { color: /(background|color)$/i } },
    // Widths used in reviews: 320 px (smallest phone), 375 px (S7.8 evidence), 768 px, 1440 px.
    viewport: {
      options: {
        phoneSmall: { name: 'Phone 320', styles: { width: '320px', height: '640px' } },
        phone: { name: 'Phone 375 (S7.8)', styles: { width: '375px', height: '812px' } },
        tablet: { name: 'Tablet 768', styles: { width: '768px', height: '1024px' } },
        desktop: { name: 'Desktop 1440', styles: { width: '1440px', height: '900px' } },
      },
    },
    // WCAG 2.2 AA (ADR-020, S7.4).
    a11y: {
      options: { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] } },
    },
  },
}

export default preview
