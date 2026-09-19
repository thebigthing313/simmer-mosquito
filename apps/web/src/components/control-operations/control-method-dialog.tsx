import { useAppForm, validateJsonSchemaValue } from '@simmer-mosquito/ui-web/components/form';
import { useCatalogDialogOpen } from '../../hooks/catalog/use-catalog-dialog-open';
import { useResetOnOpen } from '../../hooks/catalog/use-reset-on-open';
import type { CatalogMutations } from '../../hooks/mutations/catalog-fields';
import type { ControlMethodRecord } from '../../hooks/queries/catalog-record-view';
import { useAcknowledgedWrite } from '../../hooks/use-acknowledged-write';
import {
	CatalogDialogCancel,
	CatalogRecordDialog,
	catalogFields,
	catalogFormValues,
	commitCatalogSave,
} from '../catalog';

export interface MethodDialogContext {
	readonly mutations: CatalogMutations;
	readonly singularLabel: string;
	readonly namePlaceholder: string;
	readonly customFieldsDescription: string;
}

export function ControlMethodDialog({
	customFieldsDescription,
	method,
	mutations,
	namePlaceholder,
	onOpenChange,
	open: controlledOpen,
	singularLabel,
	trigger,
}: MethodDialogContext & {
	readonly method?: ControlMethodRecord | undefined;
	/** Controlled open handler — pair with `open` when there is no `trigger`. */
	readonly onOpenChange?: ((open: boolean) => void) | undefined;
	readonly open?: boolean | undefined;
	/** Uncontrolled mode: the element that opens the dialog (Add button, empty-state CTA). */
	readonly trigger?: React.ReactNode;
}) {
	const [open, setOpen] = useCatalogDialogOpen(controlledOpen, onOpenChange);
	const isEditing = method !== undefined;
	const { run, dialog } = useAcknowledgedWrite({ askable: mutations.refusals, ask: true });

	const form = useAppForm({
		defaultValues: catalogFormValues(method),
		validators: {
			onSubmit: () => (mutations.canWrite ? undefined : 'Organization details are still loading.'),
		},
		onSubmit: ({ value }) => {
			commitCatalogSave({
				failureMessage: isEditing
					? `Unable to save ${method.name}.`
					: `Unable to create ${singularLabel}.`,
				// Closing is inside `run` rather than `onWritten`: `run` resolves on a
				// refusal too, so dismissing on the way past would take the form away
				// before the question could be asked.
				save: () =>
					run(async (acknowledgements) => {
						if (isEditing) {
							await mutations.save(
								method.id,
								catalogFields(value),
								catalogFormRecord(method),
								acknowledgements,
							);
						} else {
							await mutations.create(catalogFields(value));
						}
						setOpen(false);
					}),
			});
		},
	});

	useResetOnOpen(open, method, () => form.reset(catalogFormValues(method)));

	return (
		<>
			<form.AppForm>
				<CatalogRecordDialog
					actions={
						<form.FormActions>
							<form.SubmitButton disabled={!mutations.canWrite} />
							<CatalogDialogCancel />
						</form.FormActions>
					}
					description="Manage the label, lifecycle state, and optional custom fields."
					onOpenChange={setOpen}
					onSubmit={() => void form.handleSubmit()}
					open={open}
					title={isEditing ? `Edit ${method.name}` : `Add ${singularLabel}`}
					trigger={trigger}
				>
					<form.FormErrorAlert />
					<form.AppField
						name="name"
						validators={{
							onSubmit: ({ value }) =>
								value.trim().length === 0 ? 'Method name is required.' : undefined,
						}}
					>
						{(field) => <field.TextField label="Method name" placeholder={namePlaceholder} />}
					</form.AppField>
					<form.AppField name="isActive">
						{(field) => <field.SwitchField label="Active" />}
					</form.AppField>
					<form.AppField name="customSchema" validators={{ onSubmit: validateJsonSchemaValue }}>
						{(field) => (
							<field.JsonSchemaField description={customFieldsDescription} label="Custom fields" />
						)}
					</form.AppField>
				</CatalogRecordDialog>
			</form.AppForm>
			{dialog}
		</>
	);
}

/**
 * The record as the save compares against.
 *
 * `save` decides which commands it means from what moved, so it needs the record
 * in the same vocabulary the form produces — which is what `catalogFields` of the
 * record's own values is.
 */
function catalogFormRecord(method: ControlMethodRecord) {
	return catalogFields(catalogFormValues(method));
}
