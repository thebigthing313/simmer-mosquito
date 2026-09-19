import { useAppForm } from '@simmer-mosquito/ui-web/components/form';
import { Button } from '@simmer-mosquito/ui-web/components/ui/button';

export interface GenusFormValues {
	readonly abbreviation: string;
	readonly name: string;
}

export const EMPTY_GENUS: GenusFormValues = { abbreviation: '', name: '' };

/**
 * The genus create-and-edit form, mounted inside the catalog dialog.
 *
 * It owns the `useAppForm` rather than the dialog, the way
 * `apps/web/src/components/catalog/catalog-record-dialog.tsx` documents: the
 * fields are what a catalog is for, and the field and action nodes resolve
 * their context from the `form.AppForm` around them.
 *
 * It sits beside the route rather than in it because a route file's job here is
 * the query, the writes, and the dialog. The leading dash keeps it out of the
 * route tree.
 */
export function GenusForm({
	values,
	submitLabel,
	onCancel,
	onSubmit,
}: {
	readonly values: GenusFormValues;
	readonly submitLabel: string;
	readonly onCancel: () => void;
	readonly onSubmit: (values: GenusFormValues) => Promise<void>;
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
				<form.FormErrorAlert title="Unable to save the genus" />
				<form.AppField
					name="name"
					validators={{
						onSubmit: ({ value }: { readonly value: string }) =>
							value.trim() === '' ? 'Name is required.' : undefined,
					}}
				>
					{(field) => (
						<field.TextField label="Name" maxLength={120} placeholder="e.g. Aedes" required />
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
						<field.TextField label="Abbreviation" maxLength={16} placeholder="e.g. Ae." required />
					)}
				</form.AppField>
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
