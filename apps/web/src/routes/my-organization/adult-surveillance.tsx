import { createFileRoute } from '@tanstack/react-router';
import { useOrganizationWorkspace } from '../../hooks/use-organization-workspace';
import { AdultSurveillanceSettings } from './-components/adult';
import { collections } from './-components/constants';
import { saveAdultSettings, selectField } from './-components/helpers';
import { DomainSection } from './-components/layout/layout';
import { OrganizationWorkspaceShell } from './-components/layout/organization-workspace-shell';
import type { SettingField } from './-components/types';

export const Route = createFileRoute('/my-organization/adult-surveillance')({
	component: MyOrganizationAdultSurveillanceRoute,
});

function MyOrganizationAdultSurveillanceRoute() {
	const { auth } = Route.useRouteContext();
	const workspace = useOrganizationWorkspace(auth.snapshot);
	const adultFields: readonly SettingField[] = [
		selectField('Collection timing', workspace.settings.adultSurveillance.collectionTimingMode, [
			{ label: 'Exact timestamps', value: 'exact_timestamps' },
			{ label: 'Collection date and duration', value: 'collection_date_duration' },
		]),
	];

	return (
		<OrganizationWorkspaceShell canManage={workspace.canManage} role={workspace.role}>
			<DomainSection
				canManage={workspace.canManage}
				editDescription="Choose how adult collection timing is recorded by this agency."
				fields={adultFields}
				id="adult"
				meta="Trap collection methods, lures, and adult surveillance references"
				onSave={(formData) =>
					saveAdultSettings(workspace.organization, workspace.settings, formData)
				}
				setupItems={[]}
				title="Adult surveillance"
			>
				<AdultSurveillanceSettings
					canManage={workspace.canManage}
					collectionLures={collections.collectionLures}
					collectionMethods={collections.collectionMethods}
					fields={adultFields}
					organization={workspace.organization}
				/>
			</DomainSection>
		</OrganizationWorkspaceShell>
	);
}
