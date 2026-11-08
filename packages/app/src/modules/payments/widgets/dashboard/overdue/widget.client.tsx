'use client'
// The view of "Overdue" (README B-01; #111): the shared `PaymentsDashboardWidget`.
import * as React from 'react'
import type { DashboardWidgetComponentProps } from '@open-mercato/shared/modules/dashboard/widgets'
import { PaymentsDashboardWidget } from '../../../components/PaymentsDashboardWidget'

const OverdueWidget: React.FC<DashboardWidgetComponentProps<Record<string, never>>> = (props) => (
  <PaymentsDashboardWidget {...props} kind="overdue" />
)

export default OverdueWidget
