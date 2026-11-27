'use client'
// The "Apply" button of the public section page (sign-up form spec P-J1; #799) on the spot
// `vereino:public:section:actions` of `club_core`'s page; the context names the club, the section and the placement.
import * as React from 'react'
import type { InjectionWidgetComponentProps } from '@open-mercato/shared/modules/widgets/injection'
import { ApplyButton } from '../../../components/public/ApplyButton'

export type SectionApplyContext = {
  clubSlug?: unknown
  sectionSlug?: unknown
  placement?: unknown
}

const text = (value: unknown): string => (typeof value === 'string' ? value : '')

export default function SectionApplyWidget({
  context,
}: InjectionWidgetComponentProps<SectionApplyContext, Record<string, unknown>>) {
  return (
    <ApplyButton
      clubSlug={text(context.clubSlug)}
      sectionSlug={text(context.sectionSlug)}
      placement={context.placement === 'footer' ? 'footer' : 'header'}
    />
  )
}
