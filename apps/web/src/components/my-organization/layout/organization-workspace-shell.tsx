import { useActiveShellLocation } from '@simmer-mosquito/ui-web/components/app-shell';
import { PageHeader } from '@simmer-mosquito/ui-web/components/page';
import { pageContainer } from '@simmer-mosquito/ui-web/components/page-container';
import type React from 'react';
import type { SimmerRole } from '../types';
import { PermissionPill } from './permission-pill';

/**
 * The frame every my-organization section draws in: a page header naming the
 * section, with the permission state in its actions, over the section's cards.
 * The title and icon are the sidebar entry's, read off the shell, so the page
 * and the navigation name the section the same way. The measure is `record`,
 * the cap the route-loading skeleton reserves.
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
	const { domain, item } = useActiveShellLocation();

	return (
		<div className={pageContainer({ gap: 'snug', measure: 'record', padding: 'page' })}>
			<PageHeader
				actions={<PermissionPill canManage={canManage} role={role} />}
				icon={item?.icon ?? domain.icon}
				title={item?.label ?? domain.label}
			/>
			<div className="grid gap-2">{children}</div>
		</div>
	);
}
