import { createFileRoute } from '@tanstack/react-router';
import { EditLarvalSettingsSheet } from '../../components/my-organization/edit-larval-settings-sheet';
import { LarvalSurveillanceSettings } from '../../components/my-organization/larval';
import { DomainSection } from '../../components/my-organization/layout/domain-section';
import { OrganizationWorkspaceShell } from '../../components/my-organization/layout/organization-workspace-shell';
import { useOrganizationWorkspace } from '../../hooks/use-organization-workspace';

export const Route = createFileRoute('/my-organization/larval-surveillance')({
	component: MyOrganizationLarvalSurveillanceRoute,
});

function MyOrganizationLarvalSurveillanceRoute() {
	const { auth } = Route.useRouteContext();
	const workspace = useOrganizationWorkspace(auth.snapshot);

	return (
		<OrganizationWorkspaceShell canManage={workspace.canManage} role={workspace.role}>
			<DomainSection
				canManage={workspace.canManage}
				editAction={<EditLarvalSettingsSheet settings={workspace.settings} />}
				id="larval"
				meta="Inspection entry policy and habitat classification"
				title="Larval Surveillance"
			>
				<LarvalSurveillanceSettings
					canManage={workspace.canManage}
					policy={workspace.settings.larvalSurveillance.inspectionEntryPolicy}
				/>
			</DomainSection>
		</OrganizationWorkspaceShell>
	);
}
