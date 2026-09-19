import { useAppForm } from '@simmer-mosquito/ui-web/components/form';
import {
	type CreateFoundation,
	FoundationFormShell,
	requiredName,
	type SubmitFoundation,
} from './foundation-form-shell';

export function RegionFolderForm({
	create,
	onSubmit,
}: {
	readonly create: CreateFoundation;
	readonly onSubmit: SubmitFoundation;
}) {
	const form = useAppForm({
		defaultValues: { name: '', description: '' },
		onSubmit: async ({ value }) => {
			await onSubmit('Folder', () =>
				create.regionFolder.mutateAsync({
					name: value.name.trim(),
					description: value.description,
				}),
			);
		},
	});

	return (
		<form.AppForm>
			<FoundationFormShell onSubmit={() => void form.handleSubmit()}>
				<form.FormErrorAlert title="Unable to add the folder" />
				<form.AppField name="name" validators={{ onSubmit: requiredName('Folder name') }}>
					{(field) => (
						<field.TextField label="Folder name" placeholder="e.g. North district" required />
					)}
				</form.AppField>
				<form.AppField name="description">
					{(field) => <field.TextareaField label="Description" rows={2} />}
				</form.AppField>
				<form.FormActions>
					<form.SubmitButton>Add</form.SubmitButton>
				</form.FormActions>
			</FoundationFormShell>
		</form.AppForm>
	);
}
