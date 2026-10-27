// Open Mercato's Button as Vereino uses it: semantic tokens only, no Vereino overrides (S7.1).
import type { Meta, StoryObj } from '@storybook/react-vite'
import { Button } from '@open-mercato/ui/primitives/button'
import { useT } from '@open-mercato/shared/lib/i18n/context'

type Args = React.ComponentProps<typeof Button> & { labelKey: string }

function Labelled({ labelKey, ...props }: Args) {
  const t = useT()
  return <Button {...props}>{t(labelKey)}</Button>
}

const meta = {
  title: 'Open Mercato/Button',
  component: Labelled,
  args: { labelKey: 'stories.button.save', variant: 'default', size: 'default', disabled: false },
  argTypes: {
    variant: { control: 'select', options: ['default', 'destructive', 'outline', 'secondary', 'ghost', 'muted', 'link'] },
    size: { control: 'select', options: ['sm', 'default', 'lg'] },
    labelKey: { control: 'select', options: ['stories.button.save', 'stories.button.cancel', 'stories.button.delete'] },
  },
} satisfies Meta<typeof Labelled>

export default meta
type Story = StoryObj<typeof meta>

export const Primary: Story = {}

export const Variants: Story = {
  render: (args) => (
    <div className="flex flex-wrap gap-2">
      <Labelled {...args} variant="default" labelKey="stories.button.save" />
      <Labelled {...args} variant="outline" labelKey="stories.button.cancel" />
      <Labelled {...args} variant="secondary" labelKey="stories.button.cancel" />
      <Labelled {...args} variant="destructive" labelKey="stories.button.delete" />
      <Labelled {...args} variant="ghost" labelKey="stories.button.more" />
      <Labelled {...args} variant="link" labelKey="stories.button.more" />
    </div>
  ),
}

export const Disabled: Story = { args: { disabled: true } }
