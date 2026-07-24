import { createFileRoute } from '@tanstack/react-router';
import { useOrganizationWorkspace } from '../../hooks/use-organization-workspace';
import { collections } from './-components/constants';
import { DomainSection } from './-components/layout/layout';
import { OrganizationWorkspaceShell } from './-components/layout/organization-workspace-shell';
import { PublicEngagementSettings, PublicSettingsDrawer } from './-components/public';

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
					<PublicSettingsDrawer
						canManage={workspace.canManage}
						organization={workspace.organization}
						settings={workspace.settings}
					/>
				}
				fields={[]}
				id="public"
				meta="Service request context, outreach, and resident notifications"
				setupItems={[]}
				title="Public Engagement"
			>
				<PublicEngagementSettings
					canManage={workspace.canManage}
					notificationTypes={collections.notificationTypes}
					organization={workspace.organization}
					outreachMethods={collections.outreachMethods}
					settings={workspace.settings}
				/>
			</DomainSection>
		</OrganizationWorkspaceShell>
	);
}
