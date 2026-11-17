// `payments:guardianship-payer-updated` (#295): the `people.guardianship.updated` half of `guardianship-payer.ts` — a
// guardian marked as the ward's primary payer is assigned to the ward's charges without a payer. Same handler.
import { assignWardPayer } from './guardianship-payer'

export const metadata = {
  event: 'people.guardianship.updated',
  persistent: true,
  id: 'payments:guardianship-payer-updated',
}

export default assignWardPayer
