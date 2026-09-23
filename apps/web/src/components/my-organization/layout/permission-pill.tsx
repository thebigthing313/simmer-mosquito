import { Badge } from '@simmer-mosquito/ui-web/components/ui/badge';
import { titleCaseToken } from '../../../lib/record-display';
import type { SimmerRole } from '../types';

export function PermissionPill({
	canManage,
	role,
}: {
	readonly canManage: boolean;
	readonly role: SimmerRole;
}) {
	return (
		<Badge tone={canManage ? 'success' : 'neutral'} variant="outline">
			{canManage ? `${titleCaseToken(role)} access` : `${titleCaseToken(role)} view`}
		</Badge>
	);
}
