// Fixtures of the `DeliveryStatusList` tests (P-32): labels, one delivery row and one page.

export const deliveryLabels = {
  title: 'Recipients',
  problemsOnly: 'Problems only',
  columns: {
    recipient: 'Recipient',
    reason: 'Reason',
    channel: 'Channel',
    status: 'Status',
    lastAttempt: 'Last attempt',
  },
  status: { queued: 'Queued', sent: 'Sent', failed: 'Not delivered', skipped: 'Skipped' },
  channel: { in_app: 'In app', email: 'E-mail' },
  reason: (reason) => reason.charAt(0).toUpperCase() + reason.slice(1),
  skipReason: (code) => `Skipped: ${code}`,
  failureCode: (code) => `Failure: ${code}`,
  unknownRecipient: 'Unknown recipient',
  empty: 'No deliveries yet',
  emptyProblems: 'Every message was delivered',
  loading: 'Loading deliveries…',
  error: 'Deliveries could not be loaded',
  retry: 'Try again',
  previous: 'Previous',
  next: 'Next',
  pageOf: (page, totalPages) => `Page ${page} of ${totalPages}`,
  tableLabel: 'Delivery status',
}

export function deliveryRow(overrides = {}) {
  return {
    id: 'd1',
    personId: 'p1',
    name: 'Anna Nowak',
    channel: 'email',
    reasons: ['guardian', 'participant'],
    status: 'sent',
    skipReason: null,
    failureCode: null,
    attempts: 1,
    lastAttemptAt: '2026-11-02T10:00:00Z',
    ...overrides,
  }
}

export function deliveryPage(overrides = {}) {
  return { items: [deliveryRow()], total: 1, page: 1, pageSize: 50, totalPages: 1, ...overrides }
}
