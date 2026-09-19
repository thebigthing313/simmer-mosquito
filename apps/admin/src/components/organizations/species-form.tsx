import { useAppForm } from '@simmer-mosquito/ui-web/components/form';
import type { OrganizationFoundations } from '../../api';
import {
	type CreateFoundation,
	FoundationFormShell,
	type SubmitFoundation,
} from './foundation-form-shell';

export function SpeciesForm({
	available,
	create,
	onSubmit,
}: {
	readonly available: OrganizationFoundations['species'];
	readonly create: CreateFoundation;
	readonly onSubmit: SubmitFoundation;
}) {
	const form = useAppForm({
		defaultValues: { speciesId: '' },
		onSubmit: async ({ value }) => {
			await onSubmit('Species', () => create.species.mutateAsync(value.speciesId));
		},
	});

	const options = available.map((species) => ({
		value: species.id,
		label:
			species.commonName === null
				? species.displayName
				: `${species.displayName}, ${species.commonName}`,
	}));

	return (
		<form.AppForm>
			<FoundationFormShell onSubmit={() => void form.handleSubmit()}>
				<form.FormErrorAlert title="Unable to enable the species" />
				<form.AppField
					name="speciesId"
					validators={{
						onSubmit: ({ value }: { readonly value: string }) =>
							value === '' ? 'Choose a species.' : undefined,
					}}
				>
					{(field) => (
						<field.SelectField
							label="Species"
							options={options}
							placeholder="Choose a species"
							required
						/>
					)}
				</form.AppField>
				<form.FormActions>
					<form.SubmitButton>Add</form.SubmitButton>
				</form.FormActions>
			</FoundationFormShell>
		</form.AppForm>
	);
}
