/** The add/edit surface for a mix, and the delete inside it. */

import { useAppForm } from '@simmer-mosquito/ui-web/components/form';
import { Button } from '@simmer-mosquito/ui-web/components/ui/button';
import { iconRegistry } from '@simmer-mosquito/ui-web/icons/registry';
import type React from 'react';
import { useCatalogDialogOpen } from '../../../hooks/catalog/use-catalog-dialog-open';
import { useResetOnOpen } from '../../../hooks/catalog/use-reset-on-open';
import type {
	FormulationFields,
	FormulationMutations,
} from '../../../hooks/mutations/use-formulation-mutations';
import type { FormulationRecord } from '../../../hooks/queries/use-formulation-records';
import type { UnitLabel } from '../../../hooks/queries/use-unit-labels';
import { unitOptions } from '../../../lib/unit-options';
import {
	CatalogDeleteDialog,
	CatalogDrawerCancel,
	CatalogRecordDrawer,
	commitCatalogSave,
} from '../../catalog';
import { isRecipeUnitType } from './formulation-catalog';

const DeleteIcon = iconRegistry.actions.delete.icon;

interface FormulationFormValues {
	readonly formulationName: string;
	readonly description: string;
	readonly batchSize: number | null;
	readonly batchUnitId: string;
	readonly isActive: boolean;
}

/**
 * Opened by its own `trigger` (the Add button) or, from a row menu's Edit, by
 * the controlled `open` and `onOpenChange` pair.
 */
export function FormulationDrawer({
	canManage,
	formulation,
	mutations,
	onOpenChange,
	open: controlledOpen,
	trigger,
	units,
}: {
	readonly canManage: boolean;
	readonly formulation?: FormulationRecord | undefined;
	readonly mutations: FormulationMutations;
	readonly onOpenChange?: ((open: boolean) => void) | undefined;
	readonly open?: boolean | undefined;
	readonly trigger?: React.ReactNode;
	readonly units: readonly UnitLabel[];
}) {
	const [open, setOpen] = useCatalogDialogOpen(controlledOpen, onOpenChange);
	const unitChoices = unitOptions(units, isRecipeUnitType);
	const defaultValues = formulationFormValues(formulation, defaultBatchUnitId(units));
	const form = useAppForm({
		defaultValues,
		validators: {
			onSubmit: () => (mutations.canWrite ? undefined : 'Organization details are still loading.'),
		},
		onSubmit: ({ value }) => {
			commitCatalogSave({
				failureMessage:
					formulation === undefined
						? 'Unable to create formulation.'
						: `Unable to save ${formulation.formulationName}.`,
				onWritten: () => setOpen(false),
				save: () =>
					formulation === undefined
						? mutations.create(formulationFields(value)).then(() => undefined)
						: mutations.save(
								formulation.id,
								formulationFields(value),
								formulationFields(formulationFormValues(formulation, formulation.batchUnitId)),
							),
			});
		},
	});

	useResetOnOpen(open, formulation, () => form.reset(defaultValues));

	return (
		<form.AppForm>
			<CatalogRecordDrawer
				actions={
					<form.FormActions>
						<form.SubmitButton
							disabled={!canManage || !mutations.canWrite || unitChoices.length === 0}
						/>
						<CatalogDrawerCancel />
					</form.FormActions>
				}
				description="Name the mix and set what one batch of it makes. Products are managed on the row itself."
				destructiveAction={
					formulation === undefined ? undefined : (
						<DeleteFormulationDialog formulation={formulation} mutations={mutations} />
					)
				}
				onOpenChange={setOpen}
				onSubmit={() => void form.handleSubmit()}
				open={open}
				title={
					formulation === undefined ? 'Add Formulation' : `Edit ${formulation.formulationName}`
				}
				trigger={trigger}
				width="lg"
			>
				<form.FormErrorAlert />
				{/* A new mix is created active by the server, and it has no products
				    to apply yet — lifecycle is a decision for the row afterwards. */}
				{formulation === undefined ? null : (
					<form.AppField name="isActive">
						{(field) => <field.SwitchField disabled={!canManage} label="Active" />}
					</form.AppField>
				)}
				<form.AppField
					name="formulationName"
					validators={{
						onSubmit: ({ value }) => (value.trim().length === 0 ? 'Name is required.' : undefined),
					}}
				>
					{(field) => (
						<field.TextField
							disabled={!canManage}
							label="Name"
							placeholder="e.g. Adulticide tank mix"
						/>
					)}
				</form.AppField>
				<form.AppField name="description">
					{(field) => (
						<field.TextareaField
							disabled={!canManage}
							label="Description"
							placeholder="Optional notes for the crew"
							rows={3}
						/>
					)}
				</form.AppField>
				<div className="grid gap-3.5 sm:grid-cols-2">
					<form.AppField
						name="batchSize"
						validators={{
							onSubmit: ({ value }) =>
								value === null || !Number.isFinite(value) || value <= 0
									? 'Batch size must be greater than zero.'
									: undefined,
						}}
					>
						{(field) => (
							<field.NumberField
								description="How much finished mix one batch makes."
								disabled={!canManage}
								label="One batch makes"
								min={0}
								placeholder="e.g. 26"
								required
							/>
						)}
					</form.AppField>
					<form.AppField
						name="batchUnitId"
						validators={{
							onSubmit: ({ value }) =>
								value.trim().length === 0 ? 'Batch unit is required.' : undefined,
						}}
					>
						{(field) => (
							<field.SelectField
								disabled={!canManage || unitChoices.length === 0}
								label="Batch unit"
								options={unitChoices}
								placeholder="Select unit"
								required
							/>
						)}
					</form.AppField>
				</div>
			</CatalogRecordDrawer>
		</form.AppForm>
	);
}

function DeleteFormulationDialog({
	formulation,
	mutations,
}: {
	readonly formulation: FormulationRecord;
	readonly mutations: FormulationMutations;
}) {
	return (
		<CatalogDeleteDialog
			confirmLabel="Delete"
			description={
				<>
					This removes {formulation.formulationName} from the mix list. A formulation that still
					lists products cannot be deleted; take them out first, or deactivate it instead.
				</>
			}
			onConfirm={() =>
				commitCatalogSave({
					failureMessage: `Unable to delete ${formulation.formulationName}.`,
					save: () => mutations.remove(formulation.id),
				})
			}
			record={{ type: 'formulation', id: formulation.id }}
			title="Delete Formulation?"
			trigger={
				<Button type="button" variant="destructive">
					<DeleteIcon aria-hidden="true" />
					Delete Formulation
				</Button>
			}
		/>
	);
}

function formulationFormValues(
	formulation: FormulationRecord | undefined,
	fallbackUnitId: string,
): FormulationFormValues {
	return {
		formulationName: formulation?.formulationName ?? '',
		description: formulation?.description ?? '',
		batchSize: formulation?.batchSize ?? null,
		batchUnitId: formulation?.batchUnitId ?? fallbackUnitId,
		isActive: formulation?.isActive ?? true,
	};
}

/** Mixes are carried in a tank, so a new one starts on a volume unit. */
function defaultBatchUnitId(units: readonly UnitLabel[]): string {
	const gallon = units.find((unit) => unit.code === 'gallon');
	return (gallon ?? units.find((unit) => unit.unitType === 'volume'))?.id ?? '';
}

/** The drawer's values as the write hook takes them: trimmed, empty means absent. */
function formulationFields(values: FormulationFormValues): FormulationFields {
	const formulationName = values.formulationName.trim();
	if (formulationName.length === 0) {
		throw new Error('Name is required.');
	}
	const description = values.description.trim();
	if (values.batchSize === null || !Number.isFinite(values.batchSize) || values.batchSize <= 0) {
		throw new Error('Batch size must be greater than zero.');
	}
	if (values.batchUnitId.trim().length === 0) {
		throw new Error('Batch unit is required.');
	}
	return {
		formulationName,
		description: description.length === 0 ? null : description,
		batchSize: values.batchSize,
		batchUnitId: values.batchUnitId,
		isActive: values.isActive,
	};
}
