import { createFileRoute } from '@tanstack/react-router';
import { collections } from './-components/constants';
import { ControlOperationsSettings } from './-components/control';
import { DomainSection, OrganizationWorkspaceShell } from './-components/layout';
import { useOrganizationWorkspace } from './-components/organization-workspace';

export const Route = createFileRoute('/my-organization/control-methods')({
	component: MyOrganizationControlMethodsRoute,
});

function MyOrganizationControlMethodsRoute() {
	const { auth } = Route.useRouteContext();
	const workspace = useOrganizationWorkspace(auth.snapshot);

	return (
		<OrganizationWorkspaceShell
			canManage={workspace.canManage}
			role={workspace.role}
			section="control"
		>
			<DomainSection
				canManage={workspace.canManage}
				editDescription="Adjust control defaults and related operational setup lists."
				fields={[]}
				id="control"
				meta="Chemical, source reduction, biological control, and resources"
				setupItems={[]}
				title="Control operations"
			>
				<ControlOperationsSettings
					applicationMethods={collections.applicationMethods}
					biocontrolMethods={collections.biocontrolMethods}
					canManage={workspace.canManage}
					organization={workspace.organization}
					sourceReductionMethods={collections.sourceReductionMethods}
					vehicles={collections.vehicles}
					equipment={collections.equipment}
				/>
			</DomainSection>
		</OrganizationWorkspaceShell>
	);
}
