import { createFileRoute } from '@tanstack/react-router';
import { OrganizationWorkspaceShell } from '../../components/my-organization/layout/organization-workspace-shell';
import { PeopleSection } from '../../components/my-organization/people';
import { useOrganizationWorkspace } from '../../hooks/use-organization-workspace';
import { canManagePeople } from '../../lib/write-access';

export const Route = createFileRoute('/my-organization/people')({
	component: MyOrganizationPeopleRoute,
});

function MyOrganizationPeopleRoute() {
	const { auth } = Route.useRouteContext();
	const workspace = useOrganizationWorkspace(auth.snapshot);

	return (
		<OrganizationWorkspaceShell canManage={workspace.canManage} role={workspace.role}>
			<PeopleSection
				auth={auth.snapshot}
				canManage={canManagePeople(auth.snapshot)}
				role={workspace.role}
			/>
		</OrganizationWorkspaceShell>
	);
}
