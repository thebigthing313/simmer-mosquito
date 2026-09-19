import { createFileRoute } from '@tanstack/react-router';
import { DomainSection } from '../../components/my-organization/-components/layout/layout';
import { OrganizationWorkspaceShell } from '../../components/my-organization/-components/layout/organization-workspace-shell';
import {
	LarvalSettingsDrawer,
	LarvalSurveillanceSettings,
} from '../../components/my-organization/larval';
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
				editDescription="Adjust larval inspection entry rules and the setup lists used during habitat inspections."
				editAction={
					<LarvalSettingsDrawer canManage={workspace.canManage} settings={workspace.settings} />
				}
				fields={[]}
				id="larval"
				meta="Inspection entry policy and habitat classification"
				setupItems={[]}
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
