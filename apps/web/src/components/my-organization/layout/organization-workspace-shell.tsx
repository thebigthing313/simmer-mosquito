import { pageContainer } from '@simmer-mosquito/ui-web/components/page-container';
import type React from 'react';
import type { SimmerRole } from '../types';
import { PermissionPill } from './permission-pill';

/**
 * The frame every my-organization section draws in. Section navigation is the
 * sidebar's, so the shell sets the measure and puts the permission state above
 * the active section. The measure is `record`, the cap the route-loading
 * skeleton reserves.
 */
export function OrganizationWorkspaceShell({
	canManage,
	children,
	role,
}: {
	readonly canManage: boolean;
	readonly children: React.ReactNode;
	readonly role: SimmerRole;
}) {
	return (
		<div className={pageContainer({ gap: 'compact', measure: 'record', padding: 'none' })}>
			<div className="flex justify-end">
				<PermissionPill canManage={canManage} role={role} />
			</div>
			<div className="grid gap-2">{children}</div>
		</div>
	);
}
