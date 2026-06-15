import { createFileRoute } from '@tanstack/react-router';
import { useCollectionRows } from '../../hooks/use-collection-rows';
import { useOrganizationWorkspace } from '../../hooks/use-organization-workspace';
import { collections, US_STATE_SELECT_OPTIONS, US_TIMEZONE_OPTIONS } from './-components/constants';
import { GeneralOrganizationSection } from './-components/general';
import { selectField, textField, unitDefaultFields } from './-components/helpers';
import { OrganizationWorkspaceShell } from './-components/layout/organization-workspace-shell';
import type { SettingField } from './-components/types';

export const Route = createFileRoute('/my-organization/')({
	component: MyOrganizationGeneralRoute,
});

function MyOrganizationGeneralRoute() {
	const { auth } = Route.useRouteContext();
	const workspace = useOrganizationWorkspace(auth.snapshot);
	const { rows: units } = useCollectionRows(collections.units);
	const { rows: tags } = useCollectionRows(collections.tags);
	const agencyFields: readonly SettingField[] = [
		textField('Organization name', workspace.organization?.name ?? ''),
		textField('Slug', workspace.organization?.slug ?? '', {
			editable: false,
		}),
		textField('Main contact', workspace.organization?.mainContactEmail ?? '', {
			inputType: 'email',
		}),
		textField('Phone', workspace.organization?.phoneNumber ?? '', { inputType: 'tel' }),
		textField('Street address', workspace.organization?.mailingAddressLine1 ?? ''),
		textField('Apt, suite, etc.', workspace.organization?.mailingAddressLine2 ?? ''),
		textField('City', workspace.organization?.mailingLocality ?? ''),
		selectField('State', workspace.organization?.mailingRegion ?? '', US_STATE_SELECT_OPTIONS),
		textField('ZIP code', workspace.organization?.mailingPostalCode ?? ''),
		selectField('Timezone', workspace.settings.timezone, US_TIMEZONE_OPTIONS),
	];
	const unitFields = unitDefaultFields(workspace.settings.unitDefaults, units);

	return (
		<OrganizationWorkspaceShell canManage={workspace.canManage} role={workspace.role}>
			<GeneralOrganizationSection
				agencyFields={agencyFields}
				canManage={workspace.canManage}
				organization={workspace.organization}
				organizationName={workspace.organizationName}
				settings={workspace.settings}
				status={workspace.status}
				tags={tags}
				timezone={workspace.settings.timezone}
				unitFields={unitFields}
				units={units}
			/>
		</OrganizationWorkspaceShell>
	);
}
