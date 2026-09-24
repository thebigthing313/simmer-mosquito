import { Badge } from '@simmer-mosquito/ui-web/components/ui/badge';
import { CheckCircle2Icon, CircleIcon } from '@simmer-mosquito/ui-web/icons/registry';

// Shared presentational bits for the public-engagement routes. Dash-prefixed so
// TanStack Router ignores this file as a route.

/**
 * Open/closed status pill for a service request. Open wears the attention
 * family, the warning text on its pale tint, which is the pill form of the
 * Deep Pollen the map paints an open request in. Deep Pollen itself is too
 * light for 12px text.
 */
export function RequestStatusBadge({ open }: { readonly open: boolean }) {
	return open ? (
		<Badge tone="warning" variant="outline">
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
