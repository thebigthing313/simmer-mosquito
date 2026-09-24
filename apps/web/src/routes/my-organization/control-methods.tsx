import { createFileRoute } from '@tanstack/react-router';
import { ControlOperationsSettings } from '../../components/my-organization/control';
import { DomainSection } from '../../components/my-organization/layout/domain-section';
import { OrganizationWorkspaceShell } from '../../components/my-organization/layout/organization-workspace-shell';
import { useOrganizationWorkspace } from '../../hooks/use-organization-workspace';

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
				fields={[]}
				id="control"
				meta="Chemical, source reduction, biological control, and resources"
				setupItems={[]}
				title="Control Operations"
			>
				<ControlOperationsSettings canManageAssets={workspace.canManageOperational} />
			</DomainSection>
		</OrganizationWorkspaceShell>
	);
}
