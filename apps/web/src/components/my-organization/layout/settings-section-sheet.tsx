import type { OrganizationSettings } from '@simmer-mosquito/domain';
import { useOrganizationSettingsMutations } from '../../../hooks/mutations/use-organization-settings-mutations';
import type { SettingsSheetForm } from '../../../hooks/my-organization/use-settings-sheet';
import type { SettingsSection, SettingsSectionField } from '../types';
import { SettingsSheet } from './settings-sheet';

/**
 * A settings section's sheet, drawn from its descriptor: one input per field,
 * then the section's preview of the values as they stand.
 */
export function SettingsSectionSheet<Values, Payload>({
	canManage,
	section,
	settings,
}: {
	readonly canManage: boolean;
	readonly section: SettingsSection<Values, Payload>;
	readonly settings: OrganizationSettings;
}) {
	const mutations = useOrganizationSettingsMutations();
	const { preview } = section;

	return (
		<SettingsSheet
			canSave={canManage && mutations.canWrite}
			convert={section.convert}
			description={section.description}
			failureMessage={section.failureMessage}
			title={section.title}
			values={section.read(settings)}
			write={(payload) => section.save(mutations, payload)}
		>
			{(form) => (
				<>
					{section.fields.map((field) => (
						<SettingsFieldInput disabled={!canManage} field={field} form={form} key={field.key} />
					))}
					{preview === undefined ? null : (
						<form.Subscribe selector={(state) => state.values}>
							{(values) => preview(values)}
						</form.Subscribe>
					)}
				</>
			)}
		</SettingsSheet>
	);
}

/** One descriptor field, drawn as the form kit input its kind names. */
function SettingsFieldInput<Values>({
	disabled,
	field,
	form,
}: {
	readonly disabled: boolean;
	readonly field: SettingsSectionField<Values>;
	readonly form: SettingsSheetForm<Values>;
}) {
	// The key is a property of `Values`, which the form's own path type cannot
	// see through while `Values` is still generic.
	return (
		<form.AppField name={field.key as never}>
			{(input) => {
				switch (field.kind) {
					case 'number':
						return <input.NumberField disabled={disabled} label={field.label} />;
					case 'select':
						return (
							<input.SelectField
								disabled={disabled}
								label={field.label}
								options={field.options}
								placeholder="Not set"
							/>
						);
					case 'switch':
						return <input.SwitchField disabled={disabled} label={field.label} />;
					case 'text':
						return <input.TextField disabled={disabled} label={field.label} />;
				}
			}}
		</form.AppField>
	);
}
