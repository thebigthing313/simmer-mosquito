import { createFileRoute } from '@tanstack/react-router';
import { useOrganizationWorkspace } from '../../hooks/use-organization-workspace';
import { KeyBindingsSettings } from './-components/key-bindings';
import { DomainSection } from './-components/layout/layout';
import { OrganizationWorkspaceShell } from './-components/layout/organization-workspace-shell';

export const Route = createFileRoute('/my-organization/key-bindings')({
	component: MyOrganizationKeyBindingsRoute,
});

function MyOrganizationKeyBindingsRoute() {
	const { auth } = Route.useRouteContext();
	const workspace = useOrganizationWorkspace(auth.snapshot);

	return (
		<OrganizationWorkspaceShell canManage={workspace.canManage} role={workspace.role}>
			<DomainSection
				canManage={workspace.canManage}
				editDescription="Assign a key to each species this agency identifies."
				fields={[]}
				id="key-bindings"
				meta="Keys for tallying species during adult and larval identification"
				setupItems={[]}
				title="Key Bindings"
			>
				<KeyBindingsSettings
					canManage={workspace.canManage}
					organization={workspace.organization}
					settings={workspace.settings}
				/>
			</DomainSection>
		</OrganizationWorkspaceShell>
	);
}
