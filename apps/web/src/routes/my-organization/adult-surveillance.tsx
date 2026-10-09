import { createFileRoute } from '@tanstack/react-router';
import { AdultSurveillanceSettings } from '../../components/my-organization/adult';
import { DomainSection } from '../../components/my-organization/layout/domain-section';
import { OrganizationWorkspaceShell } from '../../components/my-organization/layout/organization-workspace-shell';
import { SettingsSectionSheet } from '../../components/my-organization/layout/settings-section-sheet';
import { collectionTimingSection } from '../../components/my-organization/settings-sections';
import { useOrganizationWorkspace } from '../../hooks/use-organization-workspace';

export const Route = createFileRoute('/my-organization/adult-surveillance')({
	component: MyOrganizationAdultSurveillanceRoute,
});

function MyOrganizationAdultSurveillanceRoute() {
	const { auth } = Route.useRouteContext();
	const workspace = useOrganizationWorkspace(auth.snapshot);

	return (
		<OrganizationWorkspaceShell canManage={workspace.canManage} role={workspace.role}>
			<DomainSection
				canManage={workspace.canManage}
				editAction={
					<SettingsSectionSheet
						canManage={workspace.canManage}
						section={collectionTimingSection}
						settings={workspace.settings}
					/>
				}
				id="adult"
				meta="Trap collection methods, lures, and adult surveillance references"
				title="Adult Surveillance"
			>
				<AdultSurveillanceSettings
					canManage={workspace.canManage}
					timingMode={workspace.settings.adultSurveillance.collectionTimingMode}
				/>
			</DomainSection>
		</OrganizationWorkspaceShell>
	);
}
