'use client'
// The view of "Sessions needing a coach" (README B-01; E06-S13 #95): the shared `SessionsWidget` for `?unassigned=1`.
import * as React from 'react'
import type { DashboardWidgetComponentProps } from '@open-mercato/shared/modules/dashboard/widgets'
import { SessionsWidget } from '../../../components/SessionsWidget'

const SessionsNeedingCoachWidget: React.FC<DashboardWidgetComponentProps<Record<string, never>>> = (props) => (
  <SessionsWidget {...props} kind="sessionsNeedingCoach" />
)

export default SessionsNeedingCoachWidget
