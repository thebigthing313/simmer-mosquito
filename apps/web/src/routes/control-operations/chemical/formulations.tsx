import { useAppForm } from '@simmer-mosquito/ui-web/components/form';
import { Badge } from '@simmer-mosquito/ui-web/components/ui/badge';
import { Button } from '@simmer-mosquito/ui-web/components/ui/button';
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from '@simmer-mosquito/ui-web/components/ui/table';
import { iconRegistry } from '@simmer-mosquito/ui-web/icons/registry';
import { createFileRoute } from '@tanstack/react-router';
import type React from 'react';
import { useMemo, useState } from 'react';
import {
	CatalogDeleteDialog,
	CatalogDetailPanel,
	CatalogDrawerCancel,
	CatalogExpandButton,
	CatalogGroupHeader,
	CatalogInactiveDisclosure,
	CatalogLifecycleButton,
	CatalogNote,
	CatalogPage,
	CatalogRecordDrawer,
	commitCatalogSave,
	toggleCatalogActive,
} from '../../../components/catalog';
import {
	type FormulationComponentFields,
	type FormulationFields,
	type FormulationMutations,
	useFormulationMutations,
} from '../../../hooks/mutations/use-formulation-mutations';
import {
	type FormulationComponentRecord,
	type FormulationRecord,
	useFormulationComponents,
	useFormulationRecords,
} from '../../../hooks/queries/use-formulation-records';
import {
	type InsecticideRecord,
	useInsecticideRecords,
} from '../../../hooks/queries/use-insecticide-records';
import {
	type UnitLabel,
	type UnitType,
	useUnitLabels,
} from '../../../hooks/queries/use-unit-labels';
import { useOrganizationWorkspace } from '../../../hooks/use-organization-workspace';
import { lifecycleOptions } from '../../../lib/lifecycle-options';
import { unitOptions } from '../../../lib/unit-options';
import { insecticideDisplayName } from '../-control-display';
import { formatAmountValue, formatAmountWithUnit, sortedComponents } from './-formulation-math';

export const Route = createFileRoute('/control-operations/chemical/formulations')({
	component: FormulationsRoute,
});

const FormulationIcon = iconRegistry.entities.formulation.icon;
const AddIcon = iconRegistry.actions.add.icon;
const DeleteIcon = iconRegistry.actions.delete.icon;
const EditIcon = iconRegistry.actions.edit.icon;

/** A mix and its products are measured the way a treatment is measured. */
function isRecipeUnitType(unitType: UnitType): boolean {
	return unitType === 'volume' || unitType === 'weight' || unitType === 'count';
}

interface FormulationFormValues {
	readonly formulationName: string;
	readonly description: string;
	readonly batchSize: number | null;
	readonly batchUnitId: string;
	readonly isActive: boolean;
}

interface FormulationComponentFormValues {
	readonly insecticideId: string;
	readonly amount: number | null;
	readonly unitId: string;
}

function FormulationsRoute() {
	const { auth } = Route.useRouteContext();
	const { canManage } = useOrganizationWorkspace(auth.snapshot);

	// formulations, their components, insecticides, and units all sync eagerly, so
	// the whole catalog is a client-side grouping rather than a per-row subscription.
	const formulations = useFormulationRecords();
	const componentsByFormulation = useFormulationComponents();
	const insecticideRows = useInsecticideRecords();
	const mutations = useFormulationMutations();
	const { all: unitRows } = useUnitLabels();

	const insecticideById = useMemo(
		() => new Map(insecticideRows.map((row) => [row.id, row] as const)),
		[insecticideRows],
	);
	const unitById = useMemo(
		() => new Map(unitRows.map((row) => [row.id, row] as const)),
		[unitRows],
	);

	const activeFormulations = formulations.filter((row) => row.isActive);
	const inactiveFormulations = formulations.filter((row) => !row.isActive);

	const table = (rows: readonly FormulationRecord[]) => (
		<FormulationTable
			canManage={canManage}
			componentsByFormulation={componentsByFormulation}
			formulations={rows}
			insecticideById={insecticideById}
			insecticides={insecticideRows}
			mutations={mutations}
			unitById={unitById}
			units={unitRows}
		/>
	);

	// The header and the empty state offer the same way in, so they mount the
	// same drawer rather than each spelling out its own trigger.
	const addFormulationDrawer = (
		<FormulationDrawer
			canManage={canManage}
			mutations={mutations}
			trigger={
				<Button type="button">
					<AddIcon aria-hidden="true" />
					Add Formulation
				</Button>
			}
			units={unitRows}
		/>
	);

	return (
		<CatalogPage
			action={canManage ? addFormulationDrawer : undefined}
			canEdit={canManage}
			description="Tank mixes your crews apply — what one batch makes, and how much of each product goes into it."
			emptyDescription={
				<>
					A formulation records a mix once — 0.5 lb of product into 26 gallons of water — so an
					application can be entered as the amount of mix that went out.
					{canManage
						? ' Add your first mix to get started.'
						: ' An owner or admin can add mixes for your agency.'}
				</>
			}
			emptyTitle="No Formulations Yet"
			icon={FormulationIcon}
			isEmpty={formulations.length === 0}
			title="Formulations"
		>
			<section className="grid gap-2">
				<CatalogGroupHeader
					active={activeFormulations.length}
					description="Expand a mix to manage the products in it."
					inactive={inactiveFormulations.length}
					title="Mixes"
				/>
				{activeFormulations.length === 0 ? (
					<CatalogNote>No active formulations.</CatalogNote>
				) : (
					table(activeFormulations)
				)}
				{inactiveFormulations.length > 0 ? (
					<CatalogInactiveDisclosure count={inactiveFormulations.length}>
						{table(inactiveFormulations)}
					</CatalogInactiveDisclosure>
				) : null}
			</section>
		</CatalogPage>
	);
}

// --- formulations -------------------------------------------------------------

interface CatalogProps {
	readonly canManage: boolean;
	readonly insecticideById: ReadonlyMap<string, InsecticideRecord>;
	readonly insecticides: readonly InsecticideRecord[];
	readonly mutations: FormulationMutations;
	readonly unitById: ReadonlyMap<string, UnitLabel>;
	readonly units: readonly UnitLabel[];
}

function FormulationTable({
	componentsByFormulation,
	formulations,
	...catalog
}: CatalogProps & {
	readonly componentsByFormulation: ReadonlyMap<string, readonly FormulationComponentRecord[]>;
	readonly formulations: readonly FormulationRecord[];
}) {
	// Expand toggle + mix columns (+ actions when the viewer can manage).
	const columnCount = 5 + (catalog.canManage ? 1 : 0);

	return (
		<div className="overflow-x-auto rounded-md border border-border/50">
			<Table>
				<TableHeader>
					<TableRow className="bg-muted/40 hover:bg-muted/40">
						<TableHead className="w-10">
							<span className="sr-only">Expand products</span>
						</TableHead>
						<TableHead>Name</TableHead>
						<TableHead>Products</TableHead>
						<TableHead className="w-32">One batch makes</TableHead>
						<TableHead className="w-28">Status</TableHead>
						{catalog.canManage ? (
							<TableHead className="w-24 text-right">
								<span className="sr-only">Actions</span>
							</TableHead>
						) : null}
					</TableRow>
				</TableHeader>
				<TableBody>
					{formulations.map((formulation) => (
						<FormulationTableRow
							{...catalog}
							columnCount={columnCount}
							components={componentsByFormulation.get(formulation.id) ?? []}
							formulation={formulation}
							key={formulation.id}
						/>
					))}
				</TableBody>
			</Table>
		</div>
	);
}

function FormulationTableRow({
	columnCount,
	components,
	formulation,
	...catalog
}: CatalogProps & {
	readonly columnCount: number;
	readonly components: readonly FormulationComponentRecord[];
	readonly formulation: FormulationRecord;
}) {
	const [expanded, setExpanded] = useState(false);

	return (
		<>
			<TableRow className="border-b-0">
				<TableCell className="align-middle">
					<CatalogExpandButton
						expanded={expanded}
						label={
							expanded
								? `Hide products in ${formulation.formulationName}`
								: `Show products in ${formulation.formulationName}`
						}
						onToggle={() => setExpanded((previous) => !previous)}
					/>
				</TableCell>
				<TableCell className="font-medium">{formulation.formulationName}</TableCell>
				<TableCell className="text-muted-foreground">
					{componentSummary(components, catalog.insecticideById)}
				</TableCell>
				<TableCell className="tabular-nums">
					{formatAmountWithUnit(
						formulation.batchSize,
						catalog.unitById.get(formulation.batchUnitId),
					)}
				</TableCell>
				<TableCell>
					{formulation.isActive ? (
						'Active'
					) : (
						<Badge tone="neutral" variant="outline">
							Inactive
						</Badge>
					)}
				</TableCell>
				{catalog.canManage ? (
					<TableCell className="text-right">
						<div className="flex justify-end gap-2">
							<FormulationDrawer
								canManage={catalog.canManage}
								formulation={formulation}
								mutations={catalog.mutations}
								tooltip="Edit"
								trigger={
									<Button size="icon" type="button" variant="outline">
										<EditIcon aria-hidden="true" />
										<span className="sr-only">Edit {formulation.formulationName}</span>
									</Button>
								}
								units={catalog.units}
							/>
							{/*
							 * An empty mix cannot be activated: a formulation with no products
							 * has nothing to expand into applications.
							 */}
							<CatalogLifecycleButton
								activateLabel="Activate"
								disabled={!formulation.isActive && components.length === 0}
								disabledHint="Add a product first"
								isActive={formulation.isActive}
								name={formulation.formulationName}
								onToggle={() =>
									toggleCatalogActive({
										activateVerb: 'activate',
										apply: (isActive) => catalog.mutations.setActive(formulation.id, isActive),
										isActive: formulation.isActive,
										name: formulation.formulationName,
									})
								}
							/>
						</div>
					</TableCell>
				) : null}
			</TableRow>
			{expanded ? (
				<TableRow className="hover:bg-transparent">
					<TableCell className="p-0" colSpan={columnCount}>
						<FormulationComponentPanel
							{...catalog}
							components={components}
							formulation={formulation}
						/>
					</TableCell>
				</TableRow>
			) : null}
		</>
	);
}

function FormulationDrawer({
	canManage,
	formulation,
	mutations,
	tooltip,
	trigger,
	units,
}: {
	readonly canManage: boolean;
	readonly formulation?: FormulationRecord | undefined;
	readonly mutations: FormulationMutations;
	/** When set, the trigger gets a hover/focus tooltip with this label. */
	readonly tooltip?: string | undefined;
	readonly trigger: React.ReactNode;
	readonly units: readonly UnitLabel[];
}) {
	const [open, setOpen] = useState(false);
	const unitChoices = useMemo(() => unitOptions(units, isRecipeUnitType), [units]);
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
				onOpenChange={updateOpen}
				onSubmit={() => void form.handleSubmit()}
				open={open}
				title={
					formulation === undefined ? 'Add Formulation' : `Edit ${formulation.formulationName}`
				}
				tooltip={tooltip}
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
					<DeleteIcon aria-hidden="true" data-icon="inline-start" />
					Delete Formulation
				</Button>
			}
		/>
	);
}

// --- components ---------------------------------------------------------------

/** The products in one mix, revealed when its row is expanded. */
function FormulationComponentPanel({
	components,
	formulation,
	...catalog
}: CatalogProps & {
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
					{...catalog}
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
				<div className="overflow-x-auto rounded-md border border-border/40">
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>Insecticide</TableHead>
								<TableHead className="w-40">Per batch</TableHead>
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
														{...catalog}
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
				</div>
			)}
		</CatalogDetailPanel>
	);
}

function FormulationComponentDrawer({
	canManage,
	component,
	formulation,
	insecticides,
	mutations,
	trigger,
	unitById,
	units,
	usedInsecticideIds,
}: CatalogProps & {
	readonly component?: FormulationComponentRecord | undefined;
	readonly formulation: FormulationRecord;
	readonly trigger: React.ReactNode;
	/** Products already in this mix — one row per insecticide is allowed. */
	readonly usedInsecticideIds: readonly string[];
}) {
	const [open, setOpen] = useState(false);
	// A mix may only carry active products, and only one row per product.
	const choices = useMemo(() => {
		const taken = new Set(usedInsecticideIds.filter((id) => id !== component?.insecticideId));
		return lifecycleOptions(
			insecticides.filter(
				(insecticide) =>
					!taken.has(insecticide.id) &&
					(insecticide.isActive || insecticide.id === component?.insecticideId),
			),
			(insecticide) => insecticide.isActive,
			insecticideDisplayName,
		);
	}, [component?.insecticideId, insecticides, usedInsecticideIds]);
	const insecticideById = useMemo(
		() => new Map(insecticides.map((row) => [row.id, row] as const)),
		[insecticides],
	);
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

// --- helpers ------------------------------------------------------------------

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

function _positiveNumberValue(value: number | null, label: string): number {
	if (value === null || !Number.isFinite(value) || value <= 0) {
		throw new Error(`${label} must be greater than zero.`);
	}
	return value;
}

function componentSummary(
	components: readonly FormulationComponentRecord[],
	insecticideById: ReadonlyMap<string, InsecticideRecord>,
): string {
	if (components.length === 0) {
		return 'No products';
	}
	return sortedComponents(components)
		.map((component) => {
			const insecticide = insecticideById.get(component.insecticideId);
			const name = insecticide === undefined ? 'Unknown' : insecticideDisplayName(insecticide);
			return `${name} (${formatAmountValue(component.amount)})`;
		})
		.join(', ');
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
