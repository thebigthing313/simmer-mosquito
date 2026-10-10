import { createFileRoute } from '@tanstack/react-router';
import { GeneralOrganizationSection } from '../../components/my-organization/general';
import { unitDefaultFields } from '../../components/my-organization/helpers';
import { OrganizationWorkspaceShell } from '../../components/my-organization/layout/organization-workspace-shell';
import { useUnitLabels } from '../../hooks/queries/use-unit-labels';
import { useOrganizationWorkspace } from '../../hooks/use-organization-workspace';

export const Route = createFileRoute('/my-organization/')({
	component: MyOrganizationGeneralRoute,
});

function MyOrganizationGeneralRoute() {
	const { auth } = Route.useRouteContext();
	const workspace = useOrganizationWorkspace(auth.snapshot);
	const { all: units } = useUnitLabels();
	const unitFields = unitDefaultFields(workspace.settings.unitDefaults, units);

	return (
		<OrganizationWorkspaceShell canManage={workspace.canManage} role={workspace.role}>
			<GeneralOrganizationSection
				canManage={workspace.canManage}
				canManageTags={workspace.canManageOperational}
				organization={workspace.organization}
				organizationName={workspace.organizationName}
				settings={workspace.settings}
				timezone={workspace.settings.timezone}
				unitFields={unitFields}
				units={units}
			/>
		</OrganizationWorkspaceShell>
	);
}
