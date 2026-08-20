import { pageContainer } from '@simmer-mosquito/ui-web/components/page-container';
import type React from 'react';
import type { SimmerRole } from '../types';
import { PermissionPill } from './layout';

/**
 * Organization workspace content frame. Section navigation now lives in the
 * global dual-pane header (driven by `organizationHeaderTabs`), so the shell just
 * constrains width and surfaces the permission state above the active section.
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
		<div className={pageContainer({ gap: 'compact', padding: 'none' })}>
			<div className="flex justify-end">
				<PermissionPill canManage={canManage} role={role} />
			</div>
			<div className="grid gap-2">{children}</div>
		</div>
	);
}
