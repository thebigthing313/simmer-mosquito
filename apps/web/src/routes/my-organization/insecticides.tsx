import { createFileRoute } from '@tanstack/react-router';
import {
	InsecticideBatchTrackingDrawer,
	InsecticideLookupPointer,
} from '../../components/my-organization/insecticides';
import { DomainSection } from '../../components/my-organization/layout/domain-section';
import { OrganizationWorkspaceShell } from '../../components/my-organization/layout/organization-workspace-shell';
import { useOrganizationWorkspace } from '../../hooks/use-organization-workspace';

export const Route = createFileRoute('/my-organization/insecticides')({
	component: MyOrganizationInsecticidesRoute,
});

function MyOrganizationInsecticidesRoute() {
	const { auth } = Route.useRouteContext();
	const workspace = useOrganizationWorkspace(auth.snapshot);

	return (
		<OrganizationWorkspaceShell canManage={workspace.canManage} role={workspace.role}>
			<DomainSection
				canManage={workspace.canManage}
				editDescription="Adjust insecticide products, batches, and traceability settings."
				editAction={
					<InsecticideBatchTrackingDrawer
						canManage={workspace.canManage}
						settings={workspace.settings}
					/>
				}
				fields={[]}
				id="insecticides"
				meta="Chemical products, labels, registration, and batch traceability"
				setupItems={[]}
				title="Insecticides"
			>
				<InsecticideLookupPointer />
			</DomainSection>
		</OrganizationWorkspaceShell>
	);
}
