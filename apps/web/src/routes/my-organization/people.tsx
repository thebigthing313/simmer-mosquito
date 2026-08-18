import { createFileRoute } from '@tanstack/react-router';
import { useOrganizationWorkspace } from '../../hooks/use-organization-workspace';
import { canManagePeople } from '../../lib/write-access';
import { webCollections } from '../../sync/webCollections';
import { OrganizationWorkspaceShell } from './-components/layout/organization-workspace-shell';
import { PeopleSection } from './-components/people';

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
				organization={workspace.organization}
				memberships={webCollections.memberships}
				profiles={webCollections.profiles}
				role={workspace.role}
			/>
		</OrganizationWorkspaceShell>
	);
}
