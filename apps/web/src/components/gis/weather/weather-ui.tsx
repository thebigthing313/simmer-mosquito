import { Badge } from '@simmer-mosquito/ui-web/components/ui/badge';

/** A weather station's active/inactive badge, shared by the list, the map card and the detail header. */
export function StationStatusBadge({ isActive }: { readonly isActive: boolean }) {
	return (
		<Badge tone={isActive ? 'success' : 'neutral'} variant="outline">
			{isActive ? 'Active' : 'Inactive'}
		</Badge>
	);
}
