import { useOrganizationSettingsMutations } from '../../hooks/mutations/use-organization-settings-mutations';
import { US_STATE_SELECT_OPTIONS, US_TIMEZONE_OPTIONS } from './constants';
import { organizationDetailsFieldsFrom, validateEmail } from './helpers';
import { SettingsSheet } from './layout/settings-sheet';
import type { OrganizationDetailsFormValues } from './types';

/** The sheet that edits the Organization's name, contact, mailing address and timezone. */
export function EditOrganizationDetailsSheet({
	defaultValues,
	description,
	title,
}: {
	readonly defaultValues: OrganizationDetailsFormValues;
	readonly description?: string | undefined;
	readonly title: string;
}) {
	const { canWrite, saveOrganizationDetails } = useOrganizationSettingsMutations();

	return (
		<SettingsSheet
			canSave={canWrite}
			convert={organizationDetailsFieldsFrom}
			description={description}
			failureMessage="Unable to save organization details."
			title={title}
			values={defaultValues}
			write={saveOrganizationDetails}
		>
			{(form) => (
				<>
					<form.AppField
						name="name"
						validators={{
							onSubmit: ({ value }) =>
								value.trim().length === 0 ? 'Organization name is required.' : undefined,
						}}
					>
						{(field) => <field.TextField label="Organization name" />}
					</form.AppField>
					<form.AppField name="mainContactEmail" validators={{ onSubmit: validateEmail }}>
						{(field) => <field.TextField label="Main contact" type="email" />}
					</form.AppField>
					<form.AppField name="phoneNumber">
						{(field) => <field.TextField label="Phone" type="tel" />}
					</form.AppField>
					<form.AppField name="mailingAddressLine1">
						{(field) => <field.TextField label="Street address" />}
					</form.AppField>
					<form.AppField name="mailingAddressLine2">
						{(field) => <field.TextField label="Apt, suite, etc." />}
					</form.AppField>
					<form.AppField name="mailingLocality">
						{(field) => <field.TextField label="City" />}
					</form.AppField>
					<form.AppField name="mailingRegion">
						{(field) => (
							<field.SelectField
								label="State"
								options={US_STATE_SELECT_OPTIONS}
								placeholder="Not set"
							/>
						)}
					</form.AppField>
					<form.AppField name="mailingPostalCode">
						{(field) => <field.TextField label="ZIP code" />}
					</form.AppField>
					<form.AppField
						name="timezone"
						validators={{
							onSubmit: ({ value }) =>
								value.trim().length === 0 ? 'Timezone is required.' : undefined,
						}}
					>
						{(field) => <field.SelectField label="Timezone" options={US_TIMEZONE_OPTIONS} />}
					</form.AppField>
				</>
			)}
		</SettingsSheet>
	);
}
