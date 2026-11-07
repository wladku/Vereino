'use client'
// The view of "Unsettled sessions" (README B-01; E06-S13 #95): the shared `SessionsWidget` for `?unsettled=1`.
import * as React from 'react'
import type { DashboardWidgetComponentProps } from '@open-mercato/shared/modules/dashboard/widgets'
import { SessionsWidget } from '../../../components/SessionsWidget'

const UnsettledSessionsWidget: React.FC<DashboardWidgetComponentProps<Record<string, never>>> = (props) => (
  <SessionsWidget {...props} kind="unsettledSessions" />
)

export default UnsettledSessionsWidget
