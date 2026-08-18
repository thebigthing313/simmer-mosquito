import { createFileRoute } from '@tanstack/react-router';
import { useUnitLabels } from '../../hooks/queries/use-unit-labels';
import { useOrganizationWorkspace } from '../../hooks/use-organization-workspace';
import { US_STATE_SELECT_OPTIONS, US_TIMEZONE_OPTIONS } from './-components/constants';
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
	const { all: units } = useUnitLabels();
	const agencyFields: readonly SettingField[] = [
		textField('Organization name', workspace.organization.name),
		textField('Slug', workspace.organization.slug ?? '', {
			editable: false,
		}),
		textField('Main contact', workspace.organization.main_contact_email ?? '', {
			inputType: 'email',
		}),
		textField('Phone', workspace.organization.phone_number ?? '', { inputType: 'tel' }),
		textField('Street address', workspace.organization.mailing_address_line_1 ?? ''),
		textField('Apt, suite, etc.', workspace.organization.mailing_address_line_2 ?? ''),
		textField('City', workspace.organization.mailing_locality ?? ''),
		selectField('State', workspace.organization.mailing_region ?? '', US_STATE_SELECT_OPTIONS),
		textField('ZIP code', workspace.organization.mailing_postal_code ?? ''),
		selectField('Timezone', workspace.settings.timezone, US_TIMEZONE_OPTIONS),
	];
	const unitFields = unitDefaultFields(workspace.settings.unitDefaults, units);

	return (
		<OrganizationWorkspaceShell canManage={workspace.canManage} role={workspace.role}>
			<GeneralOrganizationSection
				agencyFields={agencyFields}
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
