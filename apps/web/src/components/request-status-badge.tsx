import { Badge } from '@simmer-mosquito/ui-web/components/ui/badge';
import type { RequestStatus } from '../hooks/queries/operations-view';

/**
 * A request is open or it is not. Open takes the louder tone: a queue is read to
 * find what still needs doing.
 *
 * Shared rather than section-local because two sections show it. The operations
 * queue is where a request lives, and the habitat's History card is where a crew
 * lead finds out somebody has already asked for work at the site in front of
 * them. The badge sits here so those two never disagree about which state is the
 * loud one.
 */
export function RequestStatusBadge({ status }: { readonly status: RequestStatus }) {
	return (
		<Badge className="shrink-0" tone={status === 'open' ? 'info' : 'success'} variant="outline">
			{status === 'open' ? 'Open' : 'Resolved'}
		</Badge>
	);
}
