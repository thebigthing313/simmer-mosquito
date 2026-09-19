import { createFileRoute } from '@tanstack/react-router';
import { DomainSection } from '../../components/my-organization/-components/layout/layout';
import { OrganizationWorkspaceShell } from '../../components/my-organization/-components/layout/organization-workspace-shell';
import {
	PublicEngagementSettings,
	PublicSettingsDrawer,
} from '../../components/my-organization/public';
import { useOrganizationWorkspace } from '../../hooks/use-organization-workspace';

export const Route = createFileRoute('/my-organization/public-engagement')({
	component: MyOrganizationPublicEngagementRoute,
});

function MyOrganizationPublicEngagementRoute() {
	const { auth } = Route.useRouteContext();
	const workspace = useOrganizationWorkspace(auth.snapshot);

	return (
		<OrganizationWorkspaceShell canManage={workspace.canManage} role={workspace.role}>
			<DomainSection
				canManage={workspace.canManage}
				editDescription="Set public engagement context defaults and resident communication lookup lists."
				editAction={
					<PublicSettingsDrawer canManage={workspace.canManage} settings={workspace.settings} />
				}
				fields={[]}
				id="public"
				meta="Service request context, outreach, and resident notifications"
				setupItems={[]}
				title="Public Engagement"
			>
				<PublicEngagementSettings
					canEditMethods={workspace.canManageOperational}
					canManage={workspace.canManage}
					settings={workspace.settings}
				/>
			</DomainSection>
		</OrganizationWorkspaceShell>
	);
}
