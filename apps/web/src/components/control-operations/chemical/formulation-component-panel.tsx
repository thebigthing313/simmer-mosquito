/**
 * The products in one mix, revealed when its row is expanded: the table of
 * products and how much of each a batch takes, the drawer that adds or edits
 * one, and the dialog that takes one out.
 */

import { useAppForm } from '@simmer-mosquito/ui-web/components/form';
import { Badge } from '@simmer-mosquito/ui-web/components/ui/badge';
import { Button } from '@simmer-mosquito/ui-web/components/ui/button';
import { ScrollArea } from '@simmer-mosquito/ui-web/components/ui/scroll-area';
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from '@simmer-mosquito/ui-web/components/ui/table';
import { iconRegistry } from '@simmer-mosquito/ui-web/icons/registry';
import type React from 'react';
import { useState } from 'react';
import type {
	FormulationComponentFields,
	FormulationMutations,
} from '../../../hooks/mutations/use-formulation-mutations';
import type {
	FormulationComponentRecord,
	FormulationRecord,
} from '../../../hooks/queries/use-formulation-records';
import { lifecycleOptions } from '../../../lib/lifecycle-options';
import { unitOptions } from '../../../lib/unit-options';
import {
	CatalogDeleteDialog,
	CatalogDetailPanel,
	CatalogDrawerCancel,
	CatalogNote,
	CatalogRecordDrawer,
	commitCatalogSave,
} from '../../catalog';
import { insecticideDisplayName } from '../control-display';
import { type FormulationCatalog, isRecipeUnitType } from './formulation-catalog';
import { formatAmountWithUnit, sortedComponents } from './formulation-math';

const AddIcon = iconRegistry.actions.add.icon;
const DeleteIcon = iconRegistry.actions.delete.icon;
const EditIcon = iconRegistry.actions.edit.icon;

interface FormulationComponentFormValues {
	readonly insecticideId: string;
	readonly amount: number | null;
	readonly unitId: string;
}

export function FormulationComponentPanel({
	catalog,
	components,
	formulation,
}: {
	readonly catalog: FormulationCatalog;
	readonly components: readonly FormulationComponentRecord[];
	readonly formulation: FormulationRecord;
}) {
	const ordered = sortedComponents(components);
	const batchLabel = formatAmountWithUnit(
		formulation.batchSize,
		catalog.unitById.get(formulation.batchUnitId),
	);

	return (
		<CatalogDetailPanel
			action={
				<FormulationComponentDrawer
					catalog={catalog}
					formulation={formulation}
					trigger={
						<Button disabled={!catalog.canManage} size="sm" type="button" variant="outline">
							<AddIcon aria-hidden="true" />
							Add Product
						</Button>
					}
					usedInsecticideIds={ordered.map((component) => component.insecticideId)}
				/>
			}
			summary={ordered.length === 0 ? 'No products yet' : `Per ${batchLabel} of finished mix`}
			title="Products"
		>
			{ordered.length === 0 ? (
				<CatalogNote compact>
					A mix needs at least one product before it can be applied.
				</CatalogNote>
			) : (
				<ScrollArea
					className="rounded-md border border-border/40"
					orientation="horizontal"
					type="auto"
				>
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>Insecticide</TableHead>
								<TableHead className="w-40">Per Batch</TableHead>
								{catalog.canManage ? (
									<TableHead className="w-24 text-right">Actions</TableHead>
								) : null}
							</TableRow>
						</TableHeader>
						<TableBody>
							{ordered.map((component) => {
								const insecticide = catalog.insecticideById.get(component.insecticideId);
								const label =
									insecticide === undefined ? 'this product' : insecticideDisplayName(insecticide);
								return (
									<TableRow key={component.id}>
										<TableCell className="font-medium">
											{insecticide === undefined ? (
												'Unknown insecticide'
											) : (
												<span className="flex flex-wrap items-center gap-2">
													{label}
													{insecticide.isActive ? null : (
														<Badge tone="neutral" variant="outline">
															Inactive
														</Badge>
													)}
												</span>
											)}
										</TableCell>
										<TableCell className="tabular-nums">
											{formatAmountWithUnit(
												component.amount,
												catalog.unitById.get(component.unitId),
											)}
										</TableCell>
										{catalog.canManage ? (
											<TableCell className="text-right">
												<div className="flex justify-end gap-2">
													<FormulationComponentDrawer
														catalog={catalog}
														component={component}
														formulation={formulation}
														trigger={
															<Button size="icon" type="button" variant="outline">
																<EditIcon aria-hidden="true" />
																<span className="sr-only">Edit {label}</span>
															</Button>
														}
														usedInsecticideIds={ordered.map((other) => other.insecticideId)}
													/>
													<RemoveComponentDialog
														component={component}
														label={label}
														mutations={catalog.mutations}
													/>
												</div>
											</TableCell>
										) : null}
									</TableRow>
								);
							})}
						</TableBody>
					</Table>
				</ScrollArea>
			)}
		</CatalogDetailPanel>
	);
}

function FormulationComponentDrawer({
	catalog,
	component,
	formulation,
	trigger,
	usedInsecticideIds,
}: {
	readonly catalog: FormulationCatalog;
	readonly component?: FormulationComponentRecord | undefined;
	readonly formulation: FormulationRecord;
	readonly trigger: React.ReactNode;
	/** Products already in this mix — one row per insecticide is allowed. */
	readonly usedInsecticideIds: readonly string[];
}) {
	const { canManage, insecticides, mutations, unitById, units } = catalog;
	const [open, setOpen] = useState(false);
	// A mix may only carry active products, and only one row per product.
	const taken = new Set(usedInsecticideIds.filter((id) => id !== component?.insecticideId));
	const choices = lifecycleOptions(
		insecticides.filter(
			(insecticide) =>
				!taken.has(insecticide.id) &&
				(insecticide.isActive || insecticide.id === component?.insecticideId),
		),
		(insecticide) => insecticide.isActive,
		insecticideDisplayName,
	);
	const insecticideById = new Map(insecticides.map((row) => [row.id, row] as const));
	// A product is measured one way — a pound of granules is never four fluid
	// ounces — so the unit list narrows to the kind its own default unit is in.
	const unitChoicesFor = (insecticideId: string) => {
		const product = insecticideById.get(insecticideId);
		const unitType =
			product === undefined ? undefined : unitById.get(product.defaultUnitId)?.unitType;
		return unitType === undefined
			? unitOptions(units, isRecipeUnitType)
			: unitOptions(units, (candidate) => candidate === unitType);
	};

	const firstChoice = choices[0]?.value ?? '';
	const defaultValues: FormulationComponentFormValues = {
		insecticideId: component?.insecticideId ?? firstChoice,
		amount: component?.amount ?? null,
		unitId: component?.unitId ?? insecticideById.get(firstChoice)?.defaultUnitId ?? '',
	};
	const form = useAppForm({
		defaultValues,
		validators: {
			onSubmit: () => (mutations.canWrite ? undefined : 'Organization details are still loading.'),
		},
		onSubmit: ({ value }) => {
			commitCatalogSave({
				failureMessage: 'Unable to save the product.',
				onWritten: () => setOpen(false),
				save: () =>
					component === undefined
						? mutations.addComponent(formulation.id, componentFields(value))
						: mutations.saveComponent(component.id, componentFields(value)),
			});
		},
	});

	function updateOpen(nextOpen: boolean) {
		if (nextOpen) {
			form.reset(defaultValues);
		}
		setOpen(nextOpen);
	}

	return (
		<form.AppForm>
			<CatalogRecordDrawer
				actions={
					<form.FormActions>
						<form.SubmitButton
							disabled={!canManage || !mutations.canWrite || choices.length === 0}
						/>
						<CatalogDrawerCancel />
					</form.FormActions>
				}
				description={`How much of this product goes into one batch of ${formulation.formulationName}.`}
				onOpenChange={updateOpen}
				onSubmit={() => void form.handleSubmit()}
				open={open}
				title={component === undefined ? 'Add Product' : 'Edit Product'}
				trigger={trigger}
				width="md"
			>
				<form.FormErrorAlert />
				<form.AppField
					name="insecticideId"
					validators={{
						onSubmit: ({ value }) =>
							value.trim().length === 0 ? 'Insecticide is required.' : undefined,
					}}
				>
					{(field) => (
						<field.AutocompleteField
							disabled={!canManage || choices.length === 0}
							emptyValue=""
							label="Insecticide"
							onValueChange={(next, previousValue) => {
								if (next === previousValue) {
									return;
								}
								// The unit follows the product's own default usage unit —
								// the list it is offered from narrows to that kind anyway.
								form.setFieldValue('unitId', insecticideById.get(next ?? '')?.defaultUnitId ?? '');
							}}
							options={choices}
							placeholder="Search insecticides"
							required
						/>
					)}
				</form.AppField>
				<div className="grid gap-3.5 sm:grid-cols-2">
					<form.AppField
						name="amount"
						validators={{
							onSubmit: ({ value }) =>
								value === null || !Number.isFinite(value) || value <= 0
									? 'Amount must be greater than zero.'
									: undefined,
						}}
					>
						{(field) => (
							<field.NumberField
								disabled={!canManage}
								label="Amount per batch"
								min={0}
								placeholder="e.g. 0.5"
								required
							/>
						)}
					</form.AppField>
					<form.Subscribe selector={(state) => state.values.insecticideId}>
						{(insecticideId) => (
							<form.AppField
								name="unitId"
								validators={{
									onSubmit: ({ value }) =>
										value.trim().length === 0 ? 'Unit is required.' : undefined,
								}}
							>
								{(field) => (
									<field.SelectField
										disabled={!canManage}
										label="Unit"
										options={unitChoicesFor(insecticideId)}
										placeholder="Select unit"
										required
									/>
								)}
							</form.AppField>
						)}
					</form.Subscribe>
				</div>
				{choices.length === 0 ? (
					<CatalogNote compact>Every active insecticide is already in this mix.</CatalogNote>
				) : null}
			</CatalogRecordDrawer>
		</form.AppForm>
	);
}

function RemoveComponentDialog({
	component,
	label,
	mutations,
}: {
	readonly component: FormulationComponentRecord;
	readonly label: string;
	readonly mutations: FormulationMutations;
}) {
	return (
		<CatalogDeleteDialog
			confirmLabel="Remove"
			description={
				<>
					This takes {label} out of the mix. Removing the last product deactivates the formulation.
				</>
			}
			onConfirm={() =>
				commitCatalogSave({
					failureMessage: `Unable to remove ${label}.`,
					save: () => mutations.removeComponent(component.id),
				})
			}
			title="Remove Product?"
			trigger={
				<Button size="icon" type="button" variant="destructive">
					<DeleteIcon aria-hidden="true" />
					<span className="sr-only">Remove {label}</span>
				</Button>
			}
		/>
	);
}

function componentFields(values: FormulationComponentFormValues): FormulationComponentFields {
	if (values.insecticideId.trim().length === 0) {
		throw new Error('Insecticide is required.');
	}
	if (values.amount === null || !Number.isFinite(values.amount) || values.amount <= 0) {
		throw new Error('Amount must be greater than zero.');
	}
	if (values.unitId.trim().length === 0) {
		throw new Error('Unit is required.');
	}
	return { insecticideId: values.insecticideId, amount: values.amount, unitId: values.unitId };
}
