import { createFileRoute } from '@tanstack/react-router';
import { KeyBindingsSettings } from '../../components/my-organization/key-bindings';
import { DomainSection } from '../../components/my-organization/layout/domain-section';
import { OrganizationWorkspaceShell } from '../../components/my-organization/layout/organization-workspace-shell';
import { useOrganizationWorkspace } from '../../hooks/use-organization-workspace';

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
				editDescription="Assign a key to each species you identify."
				fields={[]}
				id="key-bindings"
				meta="Keys for tallying species during adult and larval identification"
				setupItems={[]}
				title="Key Bindings"
			>
				<KeyBindingsSettings canManage={workspace.canManage} settings={workspace.settings} />
			</DomainSection>
		</OrganizationWorkspaceShell>
	);
}
