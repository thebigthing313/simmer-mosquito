import { createFileRoute } from '@tanstack/react-router';
import { useOrganizationWorkspace } from '../../hooks/use-organization-workspace';
import { collections } from './-components/constants';
import { LarvalSettingsDrawer, LarvalSurveillanceSettings } from './-components/larval';
import { DomainSection } from './-components/layout/layout';
import { OrganizationWorkspaceShell } from './-components/layout/organization-workspace-shell';

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
					<LarvalSettingsDrawer
						canManage={workspace.canManage}
						organization={workspace.organization}
						settings={workspace.settings}
					/>
				}
				fields={[]}
				id="larval"
				meta="Inspection entry policy and habitat classification"
				setupItems={[]}
				title="Larval surveillance"
			>
				<LarvalSurveillanceSettings
					canManage={workspace.canManage}
					habitatTypes={collections.habitatTypes}
					organization={workspace.organization}
					policy={workspace.settings.larvalSurveillance.inspectionEntryPolicy}
				/>
			</DomainSection>
		</OrganizationWorkspaceShell>
	);
}
