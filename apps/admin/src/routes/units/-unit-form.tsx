import { UNIT_TYPES } from '@simmer-mosquito/domain';
import { useAppForm } from '@simmer-mosquito/ui-web/components/form';
import { Button } from '@simmer-mosquito/ui-web/components/ui/button';
import type { UnitSystem, UnitType } from '../../lib/collections/writes';

/** The quantities SIMMER measures, alphabetical, which is how the page reads them. */
const UNIT_TYPE_OPTIONS = [...UNIT_TYPES].sort().map((unitType) => ({
	value: unitType,
	label: titleCase(unitType),
}));

export const UNIT_SYSTEM_OPTIONS: readonly {
	readonly value: UnitSystem;
	readonly label: string;
}[] = [
	{ value: 'si', label: 'SI' },
	{ value: 'imperial', label: 'Imperial' },
	{ value: 'us_customary', label: 'US customary' },
];

export interface UnitFormValues {
	readonly code: string;
	readonly unitName: string;
	readonly abbreviation: string;
	readonly unitType: UnitType;
	readonly unitSystem: UnitSystem;
}

export const EMPTY_UNIT: UnitFormValues = {
	code: '',
	unitName: '',
	abbreviation: '',
	unitType: 'count',
	unitSystem: 'si',
};

function titleCase(value: string): string {
	return value.charAt(0).toUpperCase() + value.slice(1);
}

/** The unit create-and-edit form, mounted inside the catalog dialog. */
export function UnitForm({
	values,
	submitLabel,
	onCancel,
	onSubmit,
}: {
	readonly values: UnitFormValues;
	readonly submitLabel: string;
	readonly onCancel: () => void;
	readonly onSubmit: (values: UnitFormValues) => Promise<void>;
}) {
	const form = useAppForm({
		defaultValues: values,
		/*
		 * The rejection is left to escape. `useAppForm` records it as a
		 * `SaveFailure` and `form.FormErrorAlert` renders it, which is what keeps
		 * Save pressable so a dropped write can be tried again (#754).
		 */
		onSubmit: async ({ value }) => {
			await onSubmit(value);
		},
	});

	return (
		<form.AppForm>
			<form
				className="grid gap-4"
				onSubmit={(event) => {
					event.preventDefault();
					void form.handleSubmit();
				}}
			>
				<form.FormErrorAlert title="Unable to save the unit" />
				<form.AppField
					name="unitName"
					validators={{
						onSubmit: ({ value }: { readonly value: string }) =>
							value.trim() === '' ? 'Name is required.' : undefined,
					}}
				>
					{(field) => (
						<field.TextField label="Name" maxLength={120} placeholder="e.g. hectare" required />
					)}
				</form.AppField>
				<div className="grid gap-4 sm:grid-cols-2">
					<form.AppField
						name="code"
						validators={{
							onSubmit: ({ value }: { readonly value: string }) =>
								value.trim() === '' ? 'Code is required.' : undefined,
						}}
					>
						{(field) => (
							<field.TextField label="Code" maxLength={32} placeholder="e.g. hectare" required />
						)}
					</form.AppField>
					<form.AppField
						name="abbreviation"
						validators={{
							onSubmit: ({ value }: { readonly value: string }) =>
								value.trim() === '' ? 'Abbreviation is required.' : undefined,
						}}
					>
						{(field) => (
							<field.TextField label="Abbreviation" maxLength={16} placeholder="e.g. ha" required />
						)}
					</form.AppField>
					<form.AppField name="unitType">
						{(field) => <field.SelectField label="Measures" options={UNIT_TYPE_OPTIONS} required />}
					</form.AppField>
					<form.AppField name="unitSystem">
						{(field) => <field.SelectField label="System" options={UNIT_SYSTEM_OPTIONS} required />}
					</form.AppField>
				</div>
				<form.FormActions>
					<Button onClick={onCancel} type="button" variant="outline">
						Cancel
					</Button>
					<form.SubmitButton>{submitLabel}</form.SubmitButton>
				</form.FormActions>
			</form>
		</form.AppForm>
	);
}
