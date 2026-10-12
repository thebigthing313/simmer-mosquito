import { createFileRoute } from '@tanstack/react-router';
import { InsecticidesSection } from '../../components/my-organization/insecticides';
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
			<InsecticidesSection canManage={workspace.canManage} settings={workspace.settings} />
		</OrganizationWorkspaceShell>
	);
}
