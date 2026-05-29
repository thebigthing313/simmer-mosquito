import type React from 'react';
import { PermissionPill, OrganizationRouteTabs } from './layout';
import type { OrgRole, OrganizationSectionId } from '../types';

export function OrganizationWorkspaceShell({
	canManage,
	children,
	role,
	section,
}: {
	readonly canManage: boolean;
	readonly children: React.ReactNode;
	readonly role: OrgRole;
	readonly section: OrganizationSectionId;
}) {
	return (
		<div className="mx-auto grid w-full max-w-[1120px] gap-2.5">
			<div className="-mx-1 sticky top-0 z-8 grid gap-2 bg-[color-mix(in_oklch,var(--app-stage)_94%,transparent)] px-1 pt-0 pb-2 backdrop-blur-sm">
				<header className="flex items-center justify-between gap-4">
					<div className="grid max-w-[68ch] gap-1">
						<p className="eyebrow">Organization workspace</p>
						<h1 className="m-0 text-[1.38rem] leading-tight font-extrabold text-foreground">
							My Organization
						</h1>
						<p className="m-0 text-[0.92rem] leading-snug text-muted-foreground">
							Agency setup is split by workflow so each domain has room for its own decisions.
						</p>
					</div>
					<PermissionPill role={role} canManage={canManage} />
				</header>

				<OrganizationRouteTabs section={section} />
			</div>

			<div className="grid gap-2">{children}</div>
		</div>
	);
}
