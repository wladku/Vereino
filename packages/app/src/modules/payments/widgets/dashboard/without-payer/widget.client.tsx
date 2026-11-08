'use client'
// The view of "Charges without a payer" (README B-01; #111): the shared `PaymentsDashboardWidget`.
import * as React from 'react'
import type { DashboardWidgetComponentProps } from '@open-mercato/shared/modules/dashboard/widgets'
import { PaymentsDashboardWidget } from '../../../components/PaymentsDashboardWidget'

const WithoutPayerWidget: React.FC<DashboardWidgetComponentProps<Record<string, never>>> = (props) => (
  <PaymentsDashboardWidget {...props} kind="withoutPayer" />
)

export default WithoutPayerWidget
