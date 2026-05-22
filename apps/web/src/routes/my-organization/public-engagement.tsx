import { createFileRoute } from '@tanstack/react-router';
import { collections } from './-components/constants';
import { DomainSection, OrganizationWorkspaceShell } from './-components/layout';
import { useOrganizationWorkspace } from './-components/organization-workspace';
import { PublicEngagementSettings, PublicSettingsDrawer } from './-components/public';

export const Route = createFileRoute('/my-organization/public-engagement')({
	component: MyOrganizationPublicEngagementRoute,
});

function MyOrganizationPublicEngagementRoute() {
	const { auth } = Route.useRouteContext();
	const workspace = useOrganizationWorkspace(auth.snapshot);

	return (
		<OrganizationWorkspaceShell
			canManage={workspace.canManage}
			role={workspace.role}
			section="public"
		>
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
				title="Public engagement"
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
