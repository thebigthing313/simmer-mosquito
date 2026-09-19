import { useAppForm } from '@simmer-mosquito/ui-web/components/form';
import type { LookupKind } from '../../hooks/queries/use-organization-foundations';
import {
	type CreateFoundation,
	FoundationFormShell,
	requiredName,
	type SubmitFoundation,
} from './foundation-form-shell';

/** The three lookup families, as the dialog title and the toast name them. */
export const LOOKUP_LABELS: Readonly<Record<LookupKind, string>> = {
	collection_methods: 'Collection Method',
	collection_lures: 'Collection Lure',
	habitat_types: 'Habitat Type',
};

export function LookupForm({
	kind,
	create,
	onSubmit,
}: {
	readonly kind: LookupKind;
	readonly create: CreateFoundation;
	readonly onSubmit: SubmitFoundation;
}) {
	const form = useAppForm({
		defaultValues: {
			name: '',
			description: '',
			actionThreshold: null as number | null,
		},
		onSubmit: async ({ value }) => {
			// Truncated rather than rounded, because the column counts whole things
			// and the field this replaced read its value through `parseInt`.
			const threshold = value.actionThreshold === null ? null : Math.trunc(value.actionThreshold);
			await onSubmit(LOOKUP_LABELS[kind], () =>
				create.lookup.mutateAsync({
					kind,
					input: {
						name: value.name.trim(),
						description: value.description,
						actionThreshold: threshold !== null && threshold >= 0 ? threshold : null,
					},
				}),
			);
		},
	});

	return (
		<form.AppForm>
			<FoundationFormShell onSubmit={() => void form.handleSubmit()}>
				<form.FormErrorAlert title={`Unable to add the ${LOOKUP_LABELS[kind].toLowerCase()}`} />
				<form.AppField name="name" validators={{ onSubmit: requiredName('Name') }}>
					{(field) => <field.TextField label="Name" required />}
				</form.AppField>
				<form.AppField name="description">
					{(field) => <field.TextareaField label="Description" rows={2} />}
				</form.AppField>
				{/* No "Active" toggle: a catalog entry is created live and retired later,
			    which is an update the organization makes in its own workspace. */}
				<form.AppField name="actionThreshold">
					{(field) => (
						<field.NumberField
							emptyValue={null}
							label="Action threshold"
							min={0}
							placeholder="Optional"
							step={1}
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
