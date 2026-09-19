import type { AdultCollectionTimingMode } from '@simmer-mosquito/domain';
import { createFileRoute } from '@tanstack/react-router';
import { AdultSurveillanceSettings } from '../../components/my-organization/adult';
import { requiredFormText, selectField } from '../../components/my-organization/helpers';
import { DomainSection } from '../../components/my-organization/layout/domain-section';
import { OrganizationWorkspaceShell } from '../../components/my-organization/layout/organization-workspace-shell';
import type { SettingField } from '../../components/my-organization/types';
import { useOrganizationSettingsMutations } from '../../hooks/mutations/use-organization-settings-mutations';
import { useOrganizationWorkspace } from '../../hooks/use-organization-workspace';

export const Route = createFileRoute('/my-organization/adult-surveillance')({
	component: MyOrganizationAdultSurveillanceRoute,
});

function MyOrganizationAdultSurveillanceRoute() {
	const { auth } = Route.useRouteContext();
	const workspace = useOrganizationWorkspace(auth.snapshot);
	const { setAdultCollectionTimingMode } = useOrganizationSettingsMutations();
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
				editDescription="Choose how adult collection timing is recorded."
				fields={adultFields}
				id="adult"
				meta="Trap collection methods, lures, and adult surveillance references"
				onSave={(formData) =>
					setAdultCollectionTimingMode(
						requiredFormText(formData, 'Collection timing') as AdultCollectionTimingMode,
					)
				}
				setupItems={[]}
				title="Adult Surveillance"
			>
				<AdultSurveillanceSettings canManage={workspace.canManage} fields={adultFields} />
			</DomainSection>
		</OrganizationWorkspaceShell>
	);
}
