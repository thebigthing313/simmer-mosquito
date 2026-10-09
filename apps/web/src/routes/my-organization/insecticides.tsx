import { createFileRoute } from '@tanstack/react-router';
import { InsecticideLookupPointer } from '../../components/my-organization/insecticides';
import { DomainSection } from '../../components/my-organization/layout/domain-section';
import { OrganizationWorkspaceShell } from '../../components/my-organization/layout/organization-workspace-shell';
import { SettingsSectionSheet } from '../../components/my-organization/layout/settings-section-sheet';
import { batchTrackingSection } from '../../components/my-organization/settings-sections';
import { useOrganizationWorkspace } from '../../hooks/use-organization-workspace';

export const Route = createFileRoute('/my-organization/insecticides')({
	component: MyOrganizationInsecticidesRoute,
});

function MyOrganizationInsecticidesRoute() {
	const { auth } = Route.useRouteContext();
	const workspace = useOrganizationWorkspace(auth.snapshot);

	return (
		<OrganizationWorkspaceShell canManage={workspace.canManage} role={workspace.role}>
			<DomainSection
				canManage={workspace.canManage}
				editAction={
					<SettingsSectionSheet
						canManage={workspace.canManage}
						section={batchTrackingSection}
						settings={workspace.settings}
					/>
				}
				id="insecticides"
				meta="Chemical products, labels, registration, and batch traceability"
				title="Insecticides"
			>
				<InsecticideLookupPointer />
			</DomainSection>
		</OrganizationWorkspaceShell>
	);
}
