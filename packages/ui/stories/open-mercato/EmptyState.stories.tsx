// Open Mercato's EmptyState with a lucide line icon (the platform's icon set) and an action.
import type { Meta, StoryObj } from '@storybook/react-vite'
import { Button } from '@open-mercato/ui/primitives/button'
import { EmptyState } from '@open-mercato/ui/primitives/empty-state'
import { useT } from '@open-mercato/shared/lib/i18n/context'

// lucide "inbox" (ISC licence), inlined so the package needs no icon dependency for one story.
function InboxIcon() {
  return (
    <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="22 12 16 12 14 15 10 15 8 12 2 12" />
      <path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
    </svg>
  )
}

function NoSessionsToday({ variant, withAction }: { variant: 'default' | 'subtle'; withAction: boolean }) {
  const t = useT()
  return (
    <EmptyState
      variant={variant}
      icon={<InboxIcon />}
      title={t('stories.empty.title')}
      description={t('stories.empty.description')}
      actions={withAction ? <Button variant="outline">{t('stories.empty.action')}</Button> : undefined}
    />
  )
}

const meta = {
  title: 'Open Mercato/EmptyState',
  component: NoSessionsToday,
  args: { variant: 'subtle', withAction: true },
  argTypes: { variant: { control: 'inline-radio', options: ['default', 'subtle'] } },
} satisfies Meta<typeof NoSessionsToday>

export default meta
type Story = StoryObj<typeof meta>

export const WithAction: Story = {}
export const WithoutAction: Story = { args: { withAction: false } }
