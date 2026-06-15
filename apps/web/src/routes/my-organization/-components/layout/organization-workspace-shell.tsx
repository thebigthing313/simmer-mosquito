import type React from 'react';
import type { OrgRole } from '../types';
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
	readonly role: OrgRole;
}) {
	return (
		<div className="mx-auto grid w-full max-w-[1200px] content-start gap-3">
			<div className="flex justify-end">
				<PermissionPill canManage={canManage} role={role} />
			</div>
			<div className="grid gap-2">{children}</div>
		</div>
	);
}
