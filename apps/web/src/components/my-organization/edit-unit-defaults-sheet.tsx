import { useOrganizationSettingsMutations } from '../../hooks/mutations/use-organization-settings-mutations';
import type { UnitLabel } from '../../hooks/queries/use-unit-labels';
import { titleCaseToken } from '../../lib/record-display';
import { unitDefaultsFrom, unitOptionsForDefault } from './helpers';
import { SettingsSheet } from './layout/settings-sheet';
import type { UnitDefaultsFormValues } from './types';

/** The sheet that edits the default unit for each unit type, one select per type. */
export function EditUnitDefaultsSheet({
	defaultValues,
	description,
	title,
	units,
}: {
	readonly defaultValues: UnitDefaultsFormValues;
	readonly description?: string | undefined;
	readonly title: string;
	readonly units: readonly UnitLabel[];
}) {
	const { canWrite, setUnitDefaults } = useOrganizationSettingsMutations();
	const unitTypes = Object.keys(defaultValues) as Array<keyof UnitDefaultsFormValues>;

	return (
		<SettingsSheet
			canSave={canWrite}
			convert={unitDefaultsFrom}
			description={description}
			failureMessage="Unable to save unit defaults."
			title={title}
			values={defaultValues}
			write={setUnitDefaults}
		>
			{(form) =>
				unitTypes.map((unitType) => (
					<form.AppField
						key={unitType}
						name={unitType}
						validators={{
							onSubmit: ({ value }) =>
								value.trim().length === 0 ? `${titleCaseToken(unitType)} is required.` : undefined,
						}}
					>
						{(field) => (
							<field.SelectField
								label={titleCaseToken(unitType)}
								options={unitOptionsForDefault(
									defaultValues[unitType],
									units.filter((unit) => unit.unitType === unitType),
								)}
							/>
						)}
					</form.AppField>
				))
			}
		</SettingsSheet>
	);
}
