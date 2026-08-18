import { createFileRoute } from '@tanstack/react-router';
import { useOrganizationWorkspace } from '../../hooks/use-organization-workspace';
import { webCollections } from '../../sync/webCollections';
import { ControlOperationsSettings } from './-components/control';
import { DomainSection } from './-components/layout/layout';
import { OrganizationWorkspaceShell } from './-components/layout/organization-workspace-shell';

export const Route = createFileRoute('/my-organization/control-methods')({
	component: MyOrganizationControlMethodsRoute,
});

function MyOrganizationControlMethodsRoute() {
	const { auth } = Route.useRouteContext();
	const workspace = useOrganizationWorkspace(auth.snapshot);

	return (
		<OrganizationWorkspaceShell canManage={workspace.canManage} role={workspace.role}>
			<DomainSection
				canManage={workspace.canManage}
				editDescription="Adjust control defaults and related operational setup lists."
				fields={[]}
				id="control"
				meta="Chemical, source reduction, biological control, and resources"
				setupItems={[]}
				title="Control Operations"
			>
				<ControlOperationsSettings
					canManageAssets={workspace.canManageOperational}
					organization={workspace.organization}
					vehicles={webCollections.vehicles}
					equipment={webCollections.equipment}
				/>
			</DomainSection>
		</OrganizationWorkspaceShell>
	);
}
