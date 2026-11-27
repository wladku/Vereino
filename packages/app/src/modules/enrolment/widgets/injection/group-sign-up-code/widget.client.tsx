'use client'
// The group sign-up QR code (E29-S02, #869) on the spot `vereino:club:group:actions` of `groups`' page
// `/club/groups/[id]`; the context names the group.
import * as React from 'react'
import type { InjectionWidgetComponentProps } from '@open-mercato/shared/modules/widgets/injection'
import { GroupSignUpCode } from '../../../components/club/GroupSignUpCode'

export type GroupSignUpCodeContext = { groupId?: unknown }

export default function GroupSignUpCodeWidget({
  context,
}: InjectionWidgetComponentProps<GroupSignUpCodeContext, Record<string, unknown>>) {
  return <GroupSignUpCode groupId={typeof context.groupId === 'string' ? context.groupId : ''} />
}
