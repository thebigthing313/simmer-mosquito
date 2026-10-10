import { createFileRoute } from '@tanstack/react-router';
import { DomainSection } from '../../components/my-organization/layout/domain-section';
import { OrganizationWorkspaceShell } from '../../components/my-organization/layout/organization-workspace-shell';
import { SettingsSectionSheet } from '../../components/my-organization/layout/settings-section-sheet';
import { PublicEngagementSettings } from '../../components/my-organization/public';
import { serviceRequestContextSection } from '../../components/my-organization/settings-sections';
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
				editAction={
					<SettingsSectionSheet
						section={serviceRequestContextSection}
						settings={workspace.settings}
					/>
				}
				id="public"
				meta="Service request context, outreach, and resident notifications"
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
