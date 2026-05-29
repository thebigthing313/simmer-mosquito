import { createFileRoute } from '@tanstack/react-router';
import { collections } from './-components/constants';
import { OrganizationWorkspaceShell } from './-components/layout/organization-workspace-shell';
import { useOrganizationWorkspace } from '../../hooks/use-organization-workspace';
import { PeopleSection } from './-components/people';

export const Route = createFileRoute('/my-organization/people')({
	component: MyOrganizationPeopleRoute,
});

function MyOrganizationPeopleRoute() {
	const { auth } = Route.useRouteContext();
	const workspace = useOrganizationWorkspace(auth.snapshot);

	return (
		<OrganizationWorkspaceShell
			canManage={workspace.canManage}
			role={workspace.role}
			section="people"
		>
			<PeopleSection
				auth={auth.snapshot}
				canManage={workspace.role === 'owner'}
				organization={workspace.organization}
				memberships={collections.memberships}
				profiles={collections.profiles}
				role={workspace.role}
			/>
		</OrganizationWorkspaceShell>
	);
}
