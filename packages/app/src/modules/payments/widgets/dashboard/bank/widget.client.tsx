'use client'
// The view of "Bank statements and cash" (README B-01; #297): the shared `PaymentsDashboardWidget`.
import * as React from 'react'
import type { DashboardWidgetComponentProps } from '@open-mercato/shared/modules/dashboard/widgets'
import { PaymentsDashboardWidget } from '../../../components/PaymentsDashboardWidget'

const BankWidget: React.FC<DashboardWidgetComponentProps<Record<string, never>>> = (props) => (
  <PaymentsDashboardWidget {...props} kind="bank" />
)

export default BankWidget
