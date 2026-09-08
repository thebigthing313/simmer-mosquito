import { useAppForm } from '@simmer-mosquito/ui-web/components/form';
import { Button } from '@simmer-mosquito/ui-web/components/ui/button';
import type { GenusListing } from '../../hooks/queries/use-genus-roster';

/** Non-empty sentinel: an optional select cannot carry an empty option value. */
export const NO_GENUS = 'none';

export interface SpeciesFormValues {
	readonly genusId: string;
	readonly epithet: string;
	readonly commonName: string;
	readonly displayName: string;
}

export const EMPTY_SPECIES: SpeciesFormValues = {
	genusId: NO_GENUS,
	epithet: '',
	commonName: '',
	displayName: '',
};

/**
 * The species create-and-edit form, mounted inside the catalog dialog.
 *
 * `suggestDisplayName` is the page's, because only the page holds the genus
 * roster the binomial is built from. It is read on every keystroke so the
 * placeholder names the value that will be stored when the field is left blank.
 */
export function SpeciesForm({
	values,
	genera,
	submitLabel,
	suggestDisplayName,
	onCancel,
	onSubmit,
}: {
	readonly values: SpeciesFormValues;
	readonly genera: readonly GenusListing[];
	readonly submitLabel: string;
	readonly suggestDisplayName: (values: SpeciesFormValues) => string;
	readonly onCancel: () => void;
	readonly onSubmit: (values: SpeciesFormValues) => Promise<void>;
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

	const genusOptions = [
		{ value: NO_GENUS, label: 'No genus' },
		...genera.map((genus) => ({ value: genus.id, label: genus.name })),
	];

	return (
		<form.AppForm>
			<form
				className="grid gap-4"
				onSubmit={(event) => {
					event.preventDefault();
					void form.handleSubmit();
				}}
			>
				<form.FormErrorAlert title="Unable to save the species" />
				<div className="grid gap-4 sm:grid-cols-2">
					<form.AppField name="genusId">
						{(field) => <field.SelectField label="Genus" options={genusOptions} />}
					</form.AppField>
					<form.AppField
						name="epithet"
						validators={{
							onSubmit: ({ value }: { readonly value: string }) =>
								value.trim() === '' ? 'Epithet is required.' : undefined,
						}}
					>
						{(field) => (
							<field.TextField
								label="Epithet"
								maxLength={120}
								placeholder="e.g. aegypti"
								required
							/>
						)}
					</form.AppField>
				</div>
				<form.AppField name="commonName">
					{(field) => (
						<field.TextField
							label="Common name"
							maxLength={160}
							placeholder="e.g. Yellow fever mosquito"
						/>
					)}
				</form.AppField>
				<form.Subscribe selector={(state) => suggestDisplayName(state.values)}>
					{(suggestion) => (
						<form.AppField name="displayName">
							{(field) => (
								<field.TextField
									description={
										suggestion === ''
											? 'Defaults to the genus and epithet.'
											: `Leave blank to store “${suggestion}”.`
									}
									label="Display name"
									maxLength={200}
									placeholder={suggestion === '' ? 'Genus epithet' : suggestion}
								/>
							)}
						</form.AppField>
					)}
				</form.Subscribe>
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
