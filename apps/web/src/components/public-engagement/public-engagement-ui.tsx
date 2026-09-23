import { Badge } from '@simmer-mosquito/ui-web/components/ui/badge';
import { CheckCircle2Icon, CircleIcon } from '@simmer-mosquito/ui-web/icons/registry';

// Shared presentational bits for the public-engagement routes. Dash-prefixed so
// TanStack Router ignores this file as a route.

/** Open/closed status pill for a service request. */
export function RequestStatusBadge({ open }: { readonly open: boolean }) {
	return open ? (
		<Badge tone="info" variant="outline">
			<CircleIcon aria-hidden="true" />
			Open
		</Badge>
	) : (
		<Badge tone="neutral" variant="outline">
			<CheckCircle2Icon aria-hidden="true" />
			Closed
		</Badge>
	);
}
