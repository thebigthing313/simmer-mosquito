import { Badge } from '@simmer-mosquito/ui-web/components/ui/badge';

/**
 * A weather station's active/inactive badge, shared by the stations list, the
 * station map card, and the station detail header so one station reads the same
 * way wherever it appears.
 */
export function StationStatusBadge({ isActive }: { readonly isActive: boolean }) {
	return (
		<Badge tone={isActive ? 'success' : 'neutral'} variant="outline">
			{isActive ? 'Active' : 'Inactive'}
		</Badge>
	);
}
