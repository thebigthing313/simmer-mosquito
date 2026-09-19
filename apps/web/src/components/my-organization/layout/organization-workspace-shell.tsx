import { pageContainer } from '@simmer-mosquito/ui-web/components/page-container';
import type React from 'react';
import type { SimmerRole } from '../types';
import { PermissionPill } from './permission-pill';

/**
 * The frame every my-organization section draws in. Section navigation is
 * the sidebar's, one entry per route under `/my-organization` in
 * `navigation.ts`, so the shell sets the measure and puts the permission
 * state above the active section and does nothing else.
 *
 * The measure is `record`, the 112rem cap the route-loading skeleton
 * reserves, so a section arrives at the width the skeleton stood in for
 * rather than 416px narrower (#1043). What is inside keeps its own width: a
 * settings form's fields and the people table are laid out by the section,
 * and widening the frame moves neither.
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
