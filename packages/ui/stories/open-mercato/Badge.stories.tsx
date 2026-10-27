// Open Mercato's Badge in its status variants — the StatusBadge colours Vereino uses for charges, sessions and requests.
import type { Meta, StoryObj } from '@storybook/react-vite'
import { Badge } from '@open-mercato/ui/primitives/badge'
import { useT } from '@open-mercato/shared/lib/i18n/context'

type Args = React.ComponentProps<typeof Badge> & { labelKey: string }

function Labelled({ labelKey, ...props }: Args) {
  const t = useT()
  return <Badge {...props}>{t(labelKey)}</Badge>
}

const meta = {
  title: 'Open Mercato/Badge',
  component: Labelled,
  args: { labelKey: 'stories.badge.paid', variant: 'success' },
  argTypes: {
    variant: { control: 'select', options: ['success', 'warning', 'error', 'info', 'neutral', 'default', 'secondary', 'outline'] },
    labelKey: {
      control: 'select',
      options: ['stories.badge.paid', 'stories.badge.open', 'stories.badge.overdue', 'stories.badge.planned', 'stories.badge.request'],
    },
  },
} satisfies Meta<typeof Labelled>

export default meta
type Story = StoryObj<typeof meta>

export const Status: Story = {}

// Each status pairs its colour with a word, so colour is never the only carrier of the state (WCAG 1.4.1).
export const StatusSet: Story = {
  render: () => (
    <div className="flex flex-wrap gap-2">
      <Labelled variant="success" labelKey="stories.badge.paid" />
      <Labelled variant="warning" labelKey="stories.badge.open" />
      <Labelled variant="error" labelKey="stories.badge.overdue" />
      <Labelled variant="neutral" labelKey="stories.badge.planned" />
      <Labelled variant="info" labelKey="stories.badge.request" />
    </div>
  ),
}
