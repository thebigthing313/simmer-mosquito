import { createFileRoute } from '@tanstack/react-router';
import { collections } from './-components/constants';
import { InsecticideBatchTrackingDrawer, InsecticideSettings } from './-components/insecticides';
import { DomainSection, OrganizationWorkspaceShell } from './-components/layout';
import { useOrganizationWorkspace } from './-components/organization-workspace';

export const Route = createFileRoute('/my-organization/insecticides')({
	component: MyOrganizationInsecticidesRoute,
});

function MyOrganizationInsecticidesRoute() {
	const { auth } = Route.useRouteContext();
	const workspace = useOrganizationWorkspace(auth.snapshot);

	return (
		<OrganizationWorkspaceShell
			canManage={workspace.canManage}
			role={workspace.role}
			section="insecticides"
		>
			<DomainSection
				canManage={workspace.canManage}
				editDescription="Adjust insecticide products, batches, and traceability settings."
				editAction={
					<InsecticideBatchTrackingDrawer
						canManage={workspace.canManage}
						organization={workspace.organization}
						settings={workspace.settings}
					/>
				}
				fields={[]}
				id="insecticides"
				meta="Chemical products, labels, registration, and batch traceability"
				setupItems={[]}
				title="Insecticides"
			>
				<InsecticideSettings
					batches={collections.insecticideBatches}
					canManage={workspace.canManage}
					insecticides={collections.insecticides}
					organization={workspace.organization}
					settings={workspace.settings}
					units={collections.units}
				/>
			</DomainSection>
		</OrganizationWorkspaceShell>
	);
}
