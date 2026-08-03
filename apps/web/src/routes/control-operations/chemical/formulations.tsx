import type {
	FormulationInsecticideRow,
	FormulationRow,
	InsecticideRow,
	OrganizationRow,
	UnitRow,
} from '@simmer-mosquito/sync';
import { stickyHeader } from '@simmer-mosquito/ui-web/components/sticky-header';
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	AlertDialogTrigger,
} from '@simmer-mosquito/ui-web/components/ui/alert-dialog';
import { Badge } from '@simmer-mosquito/ui-web/components/ui/badge';
import { Button } from '@simmer-mosquito/ui-web/components/ui/button';
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from '@simmer-mosquito/ui-web/components/ui/collapsible';
import {
	Drawer,
	DrawerClose,
	DrawerContent,
	DrawerDescription,
	DrawerFooter,
	DrawerHeader,
	DrawerTitle,
	DrawerTrigger,
} from '@simmer-mosquito/ui-web/components/ui/drawer';
import {
	Empty,
	EmptyContent,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from '@simmer-mosquito/ui-web/components/ui/empty';
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from '@simmer-mosquito/ui-web/components/ui/table';
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from '@simmer-mosquito/ui-web/components/ui/tooltip';
import { iconRegistry } from '@simmer-mosquito/ui-web/icons/registry';
import { createFileRoute } from '@tanstack/react-router';
import type React from 'react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { OutletSimpleLayout } from '../../../components/app-shell/outlet/simple-layout';
import { useAppForm } from '../../../forms';
import { useCollectionRows } from '../../../hooks/use-collection-rows';
import { useOrganizationWorkspace } from '../../../hooks/use-organization-workspace';
import { lifecycleOptions } from '../../../lib/lifecycle-options';
import { unitOptions } from '../../../lib/unit-options';
import { webCollections } from '../../../sync/webCollections';
import {
	errorMessageForSave,
	nullableTextValue,
	requiredTextValue,
	watchPersistence,
} from '../../my-organization/-components/helpers';
import type { PersistenceTransaction } from '../../my-organization/-components/types';
import { insecticideDisplayName } from '../-control-display';
import { formatAmountValue, formatAmountWithUnit, sortedComponents } from './-formulation-math';

export const Route = createFileRoute('/control-operations/chemical/formulations')({
	component: FormulationsRoute,
});

const FormulationIcon = iconRegistry.entities.formulation.icon;
const AddIcon = iconRegistry.actions.add.icon;
const CheckIcon = iconRegistry.actions.check.icon;
const CloseIcon = iconRegistry.actions.close.icon;
const DeleteIcon = iconRegistry.actions.delete.icon;
const EditIcon = iconRegistry.actions.edit.icon;
const ChevronIcon = iconRegistry.arrows.chevronRight.icon;

/** A mix and its products are measured the way a treatment is measured. */
function isRecipeUnitType(unitType: UnitRow['unitType']): boolean {
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
	const { canManage, organization } = useOrganizationWorkspace(auth.snapshot);
	const actorProfileId =
		auth.snapshot?.authenticated === true ? auth.snapshot.localIdentity.profileId : null;

	// formulations, their components, insecticides, and units all sync eagerly, so
	// the whole catalog is a client-side grouping rather than a per-row subscription.
	const { rows: formulationRows } = useCollectionRows<FormulationRow>(webCollections.formulations);
	const { rows: componentRows } = useCollectionRows<FormulationInsecticideRow>(
		webCollections.formulationInsecticides,
	);
	const { rows: insecticideRows } = useCollectionRows<InsecticideRow>(webCollections.insecticides);
	const { rows: unitRows } = useCollectionRows<UnitRow>(webCollections.units);

	const formulations = useMemo(
		() =>
			[...formulationRows].sort(
				(first, second) =>
					Number(second.isActive) - Number(first.isActive) ||
					first.formulationName.localeCompare(second.formulationName),
			),
		[formulationRows],
	);
	const componentsByFormulation = useMemo(() => {
		const grouped = new Map<string, FormulationInsecticideRow[]>();
		for (const component of componentRows) {
			const bucket = grouped.get(component.formulationId);
			if (bucket === undefined) {
				grouped.set(component.formulationId, [component]);
			} else {
				bucket.push(component);
			}
		}
		return grouped;
	}, [componentRows]);
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

	const table = (rows: readonly FormulationRow[]) => (
		<FormulationTable
			actorProfileId={actorProfileId}
			canManage={canManage}
			componentsByFormulation={componentsByFormulation}
			formulations={rows}
			insecticideById={insecticideById}
			insecticides={insecticideRows}
			organization={organization}
			unitById={unitById}
			units={unitRows}
		/>
	);

	const addTrigger = (
		<Button type="button">
			<AddIcon aria-hidden="true" />
			Add Formulation
		</Button>
	);

	return (
		<OutletSimpleLayout className="grid content-start gap-5">
			<header className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
				<div className="flex min-w-0 items-start gap-3">
					<span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
						<FormulationIcon aria-hidden="true" className="size-5" />
					</span>
					<div className="grid min-w-0 gap-1">
						<h1 className="text-pretty font-semibold text-foreground text-xl leading-tight">
							Formulations
						</h1>
						<p className="max-w-[60ch] text-pretty text-muted-foreground text-sm leading-snug">
							Tank mixes your crews apply — what one batch makes, and how much of each product goes
							into it.
						</p>
					</div>
				</div>
				<div className="flex shrink-0 items-center gap-2">
					<Badge tone={canManage ? 'success' : 'neutral'} variant="outline">
						{canManage ? 'Editor access' : 'View only'}
					</Badge>
					{canManage ? (
						<FormulationDrawer
							actorProfileId={actorProfileId}
							canManage={canManage}
							organization={organization}
							trigger={addTrigger}
							units={unitRows}
						/>
					) : null}
				</div>
			</header>

			{formulations.length === 0 ? (
				<Empty className="border-border/60">
					<EmptyHeader>
						<EmptyMedia variant="icon">
							<FormulationIcon aria-hidden="true" />
						</EmptyMedia>
						<EmptyTitle>No Formulations Yet</EmptyTitle>
						<EmptyDescription>
							A formulation records a mix once — 0.5 lb of product into 26 gallons of water — so an
							application can be entered as the amount of mix that went out.
							{canManage
								? ' Add your first mix to get started.'
								: ' An owner or admin can add mixes for your agency.'}
						</EmptyDescription>
					</EmptyHeader>
					{canManage ? (
						<EmptyContent>
							<FormulationDrawer
								actorProfileId={actorProfileId}
								canManage={canManage}
								organization={organization}
								trigger={addTrigger}
								units={unitRows}
							/>
						</EmptyContent>
					) : null}
				</Empty>
			) : (
				<section className="grid gap-2">
					<div className="flex flex-wrap items-center justify-between gap-2">
						<div className="grid gap-1">
							<h2 className="m-0 font-bold text-[0.78rem] text-muted-foreground uppercase tracking-wide">
								Mixes
							</h2>
							<p className="m-0 max-w-[60ch] text-muted-foreground text-sm leading-snug">
								Expand a mix to manage the products in it.
							</p>
						</div>
						<div className="flex items-center gap-2">
							<Badge tone="success" variant="outline">
								{activeFormulations.length} active
							</Badge>
							<Badge tone="neutral" variant="outline">
								{inactiveFormulations.length} inactive
							</Badge>
						</div>
					</div>
					{activeFormulations.length === 0 ? (
						<p className="m-0 rounded-md border border-border/50 border-dashed px-3 py-3 text-muted-foreground text-sm">
							No active formulations.
						</p>
					) : (
						table(activeFormulations)
					)}
					{inactiveFormulations.length > 0 ? (
						<InactiveFormulationsCollapsible count={inactiveFormulations.length}>
							{table(inactiveFormulations)}
						</InactiveFormulationsCollapsible>
					) : null}
				</section>
			)}
		</OutletSimpleLayout>
	);
}

// --- formulations -------------------------------------------------------------

interface CatalogProps {
	readonly actorProfileId: string | null;
	readonly canManage: boolean;
	readonly insecticideById: ReadonlyMap<string, InsecticideRow>;
	readonly insecticides: readonly InsecticideRow[];
	readonly organization: OrganizationRow | null;
	readonly unitById: ReadonlyMap<string, UnitRow>;
	readonly units: readonly UnitRow[];
}

function FormulationTable({
	componentsByFormulation,
	formulations,
	...catalog
}: CatalogProps & {
	readonly componentsByFormulation: ReadonlyMap<string, readonly FormulationInsecticideRow[]>;
	readonly formulations: readonly FormulationRow[];
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

function InactiveFormulationsCollapsible({
	count,
	children,
}: {
	readonly count: number;
	readonly children: React.ReactNode;
}) {
	const [open, setOpen] = useState(false);

	return (
		<Collapsible onOpenChange={setOpen} open={open}>
			<CollapsibleTrigger asChild>
				<Button className="w-fit" size="sm" type="button" variant="ghost">
					<ChevronIcon
						aria-hidden="true"
						className="transition-transform data-[open=true]:rotate-90"
						data-icon="inline-start"
						data-open={open}
					/>
					{open ? 'Hide' : 'Show'} {count} inactive
				</Button>
			</CollapsibleTrigger>
			<CollapsibleContent className="pt-2">{children}</CollapsibleContent>
		</Collapsible>
	);
}

function FormulationTableRow({
	columnCount,
	components,
	formulation,
	...catalog
}: CatalogProps & {
	readonly columnCount: number;
	readonly components: readonly FormulationInsecticideRow[];
	readonly formulation: FormulationRow;
}) {
	const [expanded, setExpanded] = useState(false);

	return (
		<>
			<TableRow className="border-b-0">
				<TableCell className="align-middle">
					<Button
						aria-expanded={expanded}
						aria-label={
							expanded
								? `Hide products in ${formulation.formulationName}`
								: `Show products in ${formulation.formulationName}`
						}
						onClick={() => setExpanded((previous) => !previous)}
						size="icon"
						type="button"
						variant="ghost"
					>
						<ChevronIcon
							aria-hidden="true"
							className="transition-transform data-[open=true]:rotate-90"
							data-open={expanded}
						/>
					</Button>
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
								actorProfileId={catalog.actorProfileId}
								canManage={catalog.canManage}
								formulation={formulation}
								organization={catalog.organization}
								tooltip="Edit"
								trigger={
									<Button size="icon" type="button" variant="outline">
										<EditIcon aria-hidden="true" />
										<span className="sr-only">Edit {formulation.formulationName}</span>
									</Button>
								}
								units={catalog.units}
							/>
							<ToggleFormulationActiveButton
								componentCount={components.length}
								formulation={formulation}
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

/**
 * Reversible lifecycle toggle. An empty mix cannot be activated: a formulation
 * with no products has nothing to expand into applications.
 */
function ToggleFormulationActiveButton({
	componentCount,
	formulation,
}: {
	readonly componentCount: number;
	readonly formulation: FormulationRow;
}) {
	const label = formulation.isActive ? 'Deactivate' : 'Activate';
	const ToggleIcon = formulation.isActive ? CloseIcon : CheckIcon;
	const blocked = !formulation.isActive && componentCount === 0;

	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<Button
					disabled={blocked}
					onClick={(event) => {
						// Drop focus before the row re-sorts into the inactive group.
						event.currentTarget.blur();
						toggleFormulationActive(formulation);
					}}
					size="icon"
					type="button"
					variant="outline"
				>
					<ToggleIcon aria-hidden="true" />
					<span className="sr-only">
						{label} {formulation.formulationName}
					</span>
				</Button>
			</TooltipTrigger>
			<TooltipContent>{blocked ? 'Add a product first' : label}</TooltipContent>
		</Tooltip>
	);
}

function toggleFormulationActive(formulation: FormulationRow): void {
	const nextActive = !formulation.isActive;
	try {
		const transaction = updateFormulation(formulation, {
			formulationName: formulation.formulationName,
			description: formulation.description ?? '',
			batchSize: formulation.batchSize,
			batchUnitId: formulation.batchUnitId,
			isActive: nextActive,
		});
		watchPersistence(
			transaction,
			nextActive
				? `Unable to activate ${formulation.formulationName}.`
				: `Unable to deactivate ${formulation.formulationName}.`,
		);
	} catch (saveError) {
		toast.error(errorMessageForSave(saveError));
	}
}

function FormulationDrawer({
	actorProfileId,
	canManage,
	formulation,
	organization,
	tooltip,
	trigger,
	units,
}: {
	readonly actorProfileId: string | null;
	readonly canManage: boolean;
	readonly formulation?: FormulationRow | undefined;
	readonly organization: OrganizationRow | null;
	/** When set, the trigger gets a hover/focus tooltip with this label. */
	readonly tooltip?: string | undefined;
	readonly trigger: React.ReactNode;
	readonly units: readonly UnitRow[];
}) {
	const [open, setOpen] = useState(false);
	const unitChoices = useMemo(() => unitOptions(units, isRecipeUnitType), [units]);
	const defaultValues = formulationFormValues(formulation, defaultBatchUnitId(units));
	const form = useAppForm({
		defaultValues,
		validators: {
			onSubmit: () =>
				organization === null ? 'Organization details are still loading.' : undefined,
		},
		onSubmit: ({ value }) => {
			try {
				const transaction =
					formulation === undefined
						? createFormulation(organization, actorProfileId, value)
						: updateFormulation(formulation, value);
				setOpen(false);
				watchPersistence(
					transaction,
					formulation === undefined
						? 'Unable to create formulation.'
						: `Unable to save ${formulation.formulationName}.`,
				);
			} catch (saveError) {
				toast.error(errorMessageForSave(saveError));
			}
		},
	});

	function updateOpen(nextOpen: boolean) {
		if (nextOpen) {
			form.reset(defaultValues);
		}
		setOpen(nextOpen);
	}

	return (
		<Drawer direction="right" onOpenChange={updateOpen} open={open}>
			{tooltip === undefined ? (
				<DrawerTrigger asChild>{trigger}</DrawerTrigger>
			) : (
				<Tooltip>
					<TooltipTrigger asChild>
						<DrawerTrigger asChild>{trigger}</DrawerTrigger>
					</TooltipTrigger>
					<TooltipContent>{tooltip}</TooltipContent>
				</Tooltip>
			)}
			<DrawerContent className="w-[min(640px,100%)] overflow-hidden sm:max-w-[640px]">
				<DrawerHeader className={stickyHeader({ padding: 'none' })}>
					<DrawerTitle>
						{formulation === undefined ? 'Add Formulation' : `Edit ${formulation.formulationName}`}
					</DrawerTitle>
					<DrawerDescription>
						Name the mix and set what one batch of it makes. Products are managed on the row itself.
					</DrawerDescription>
				</DrawerHeader>
				<form.AppForm>
					<form
						className="flex min-h-0 flex-1 flex-col"
						onSubmit={(event) => {
							event.preventDefault();
							void form.handleSubmit();
						}}
					>
						<div className="grid min-h-0 gap-3.5 overflow-y-auto px-4 py-3.5">
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
									onSubmit: ({ value }) =>
										value.trim().length === 0 ? 'Name is required.' : undefined,
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
						</div>
						<DrawerFooter>
							<div className="flex flex-wrap items-center justify-end gap-2">
								{formulation === undefined ? null : (
									<DeleteFormulationDialog className="mr-auto" formulation={formulation} />
								)}
								<form.FormActions>
									<form.SubmitButton
										disabled={!canManage || organization === null || unitChoices.length === 0}
									/>
									<DrawerClose asChild>
										<Button type="button" variant="outline">
											<CloseIcon aria-hidden="true" data-icon="inline-start" />
											Cancel
										</Button>
									</DrawerClose>
								</form.FormActions>
							</div>
						</DrawerFooter>
					</form>
				</form.AppForm>
			</DrawerContent>
		</Drawer>
	);
}

function DeleteFormulationDialog({
	className,
	formulation,
}: {
	readonly className?: string | undefined;
	readonly formulation: FormulationRow;
}) {
	function removeFormulation() {
		try {
			const transaction = webCollections.formulations.delete(formulation.id);
			watchPersistence(transaction, `Unable to delete ${formulation.formulationName}.`);
		} catch (deleteError) {
			toast.error(errorMessageForSave(deleteError));
		}
	}

	return (
		<AlertDialog>
			<AlertDialogTrigger asChild>
				<Button className={className} type="button" variant="destructive">
					<DeleteIcon aria-hidden="true" data-icon="inline-start" />
					Delete Formulation
				</Button>
			</AlertDialogTrigger>
			<AlertDialogContent size="sm">
				<AlertDialogHeader>
					<AlertDialogTitle>Delete Formulation?</AlertDialogTitle>
					<AlertDialogDescription>
						This removes {formulation.formulationName} and the products in it. Applications already
						recorded from this mix are unaffected — they store their own product and amount.
					</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter>
					<AlertDialogCancel>Cancel</AlertDialogCancel>
					<AlertDialogAction onClick={removeFormulation} variant="destructive">
						Delete
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}

// --- components ---------------------------------------------------------------

/** The products in one mix, revealed when its row is expanded. */
function FormulationComponentPanel({
	components,
	formulation,
	...catalog
}: CatalogProps & {
	readonly components: readonly FormulationInsecticideRow[];
	readonly formulation: FormulationRow;
}) {
	const ordered = sortedComponents(components);
	const batchLabel = formatAmountWithUnit(
		formulation.batchSize,
		catalog.unitById.get(formulation.batchUnitId),
	);

	return (
		<div className="grid gap-2 border-border/40 border-t bg-muted/20 px-4 py-3">
			<div className="flex flex-wrap items-center justify-between gap-2">
				<div className="flex flex-wrap items-baseline gap-2">
					<span className="font-semibold text-foreground text-sm">Products</span>
					<span className="text-muted-foreground text-xs">
						{ordered.length === 0 ? 'No products yet' : `Per ${batchLabel} of finished mix`}
					</span>
				</div>
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
			</div>
			{ordered.length === 0 ? (
				<p className="m-0 rounded-md border border-border/50 border-dashed px-3 py-2 text-muted-foreground text-xs">
					A mix needs at least one product before it can be applied.
				</p>
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
													<RemoveComponentDialog component={component} label={label} />
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
		</div>
	);
}

function FormulationComponentDrawer({
	actorProfileId,
	canManage,
	component,
	formulation,
	insecticides,
	organization,
	trigger,
	unitById,
	units,
	usedInsecticideIds,
}: CatalogProps & {
	readonly component?: FormulationInsecticideRow | undefined;
	readonly formulation: FormulationRow;
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
			onSubmit: () =>
				organization === null ? 'Organization details are still loading.' : undefined,
		},
		onSubmit: ({ value }) => {
			try {
				const transaction =
					component === undefined
						? addFormulationComponent(organization, actorProfileId, formulation.id, value)
						: updateFormulationComponent(component, value);
				setOpen(false);
				watchPersistence(transaction, 'Unable to save the product.');
			} catch (saveError) {
				toast.error(errorMessageForSave(saveError));
			}
		},
	});

	function updateOpen(nextOpen: boolean) {
		if (nextOpen) {
			form.reset(defaultValues);
		}
		setOpen(nextOpen);
	}

	return (
		<Drawer direction="right" onOpenChange={updateOpen} open={open}>
			<DrawerTrigger asChild>{trigger}</DrawerTrigger>
			<DrawerContent className="w-[min(560px,100%)] overflow-hidden sm:max-w-[560px]">
				<DrawerHeader className={stickyHeader({ padding: 'none' })}>
					<DrawerTitle>{component === undefined ? 'Add Product' : 'Edit Product'}</DrawerTitle>
					<DrawerDescription>
						How much of this product goes into one batch of {formulation.formulationName}.
					</DrawerDescription>
				</DrawerHeader>
				<form.AppForm>
					<form
						className="flex min-h-0 flex-1 flex-col"
						onSubmit={(event) => {
							event.preventDefault();
							void form.handleSubmit();
						}}
					>
						<div className="grid min-h-0 gap-3.5 overflow-y-auto px-4 py-3.5">
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
											form.setFieldValue(
												'unitId',
												insecticideById.get(next ?? '')?.defaultUnitId ?? '',
											);
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
								<p className="m-0 rounded-md border border-border/50 border-dashed px-3 py-2 text-muted-foreground text-xs">
									Every active insecticide is already in this mix.
								</p>
							) : null}
						</div>
						<DrawerFooter>
							<form.FormActions>
								<form.SubmitButton
									disabled={!canManage || organization === null || choices.length === 0}
								/>
								<DrawerClose asChild>
									<Button type="button" variant="outline">
										<CloseIcon aria-hidden="true" data-icon="inline-start" />
										Cancel
									</Button>
								</DrawerClose>
							</form.FormActions>
						</DrawerFooter>
					</form>
				</form.AppForm>
			</DrawerContent>
		</Drawer>
	);
}

function RemoveComponentDialog({
	component,
	label,
}: {
	readonly component: FormulationInsecticideRow;
	readonly label: string;
}) {
	function removeComponent() {
		try {
			const transaction = webCollections.formulationInsecticides.delete(component.id);
			watchPersistence(transaction, `Unable to remove ${label}.`);
		} catch (deleteError) {
			toast.error(errorMessageForSave(deleteError));
		}
	}

	return (
		<AlertDialog>
			<AlertDialogTrigger asChild>
				<Button size="icon" type="button" variant="destructive">
					<DeleteIcon aria-hidden="true" />
					<span className="sr-only">Remove {label}</span>
				</Button>
			</AlertDialogTrigger>
			<AlertDialogContent size="sm">
				<AlertDialogHeader>
					<AlertDialogTitle>Remove Product?</AlertDialogTitle>
					<AlertDialogDescription>
						This takes {label} out of the mix. Removing the last product deactivates the
						formulation.
					</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter>
					<AlertDialogCancel>Cancel</AlertDialogCancel>
					<AlertDialogAction onClick={removeComponent} variant="destructive">
						Remove
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}

// --- writes -------------------------------------------------------------------

function createFormulation(
	organization: OrganizationRow | null,
	actorProfileId: string | null,
	values: FormulationFormValues,
): PersistenceTransaction {
	if (organization === null) {
		throw new Error('Organization details are still loading.');
	}

	const now = new Date().toISOString();
	return webCollections.formulations.insert({
		id: crypto.randomUUID(),
		organizationId: organization.id,
		formulationName: requiredTextValue(values.formulationName, 'Name'),
		description: nullableTextValue(values.description),
		batchSize: positiveNumberValue(values.batchSize, 'Batch size'),
		batchUnitId: requiredTextValue(values.batchUnitId, 'Batch unit'),
		isActive: values.isActive,
		createdByProfileId: actorProfileId,
		updatedByProfileId: actorProfileId,
		createdAt: now,
		updatedAt: now,
	} satisfies FormulationRow);
}

function updateFormulation(
	formulation: FormulationRow,
	values: FormulationFormValues,
): PersistenceTransaction {
	const formulationName = requiredTextValue(values.formulationName, 'Name');
	const description = nullableTextValue(values.description);
	const batchSize = positiveNumberValue(values.batchSize, 'Batch size');
	const batchUnitId = requiredTextValue(values.batchUnitId, 'Batch unit');
	return webCollections.formulations.update(formulation.id, (draft) => {
		const mutable = draft as { -readonly [K in keyof FormulationRow]: FormulationRow[K] };
		mutable.formulationName = formulationName;
		mutable.description = description;
		mutable.batchSize = batchSize;
		mutable.batchUnitId = batchUnitId;
		mutable.isActive = values.isActive;
		mutable.updatedAt = new Date().toISOString();
	});
}

function addFormulationComponent(
	organization: OrganizationRow | null,
	actorProfileId: string | null,
	formulationId: string,
	values: FormulationComponentFormValues,
): PersistenceTransaction {
	if (organization === null) {
		throw new Error('Organization details are still loading.');
	}

	const now = new Date().toISOString();
	return webCollections.formulationInsecticides.insert({
		id: crypto.randomUUID(),
		organizationId: organization.id,
		formulationId,
		insecticideId: requiredTextValue(values.insecticideId, 'Insecticide'),
		amount: positiveNumberValue(values.amount, 'Amount'),
		unitId: requiredTextValue(values.unitId, 'Unit'),
		createdByProfileId: actorProfileId,
		updatedByProfileId: actorProfileId,
		createdAt: now,
		updatedAt: now,
	} satisfies FormulationInsecticideRow);
}

function updateFormulationComponent(
	component: FormulationInsecticideRow,
	values: FormulationComponentFormValues,
): PersistenceTransaction {
	const insecticideId = requiredTextValue(values.insecticideId, 'Insecticide');
	const amount = positiveNumberValue(values.amount, 'Amount');
	const unitId = requiredTextValue(values.unitId, 'Unit');
	return webCollections.formulationInsecticides.update(component.id, (draft) => {
		const mutable = draft as {
			-readonly [K in keyof FormulationInsecticideRow]: FormulationInsecticideRow[K];
		};
		mutable.insecticideId = insecticideId;
		mutable.amount = amount;
		mutable.unitId = unitId;
		mutable.updatedAt = new Date().toISOString();
	});
}

// --- helpers ------------------------------------------------------------------

function formulationFormValues(
	formulation: FormulationRow | undefined,
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
function defaultBatchUnitId(units: readonly UnitRow[]): string {
	const gallon = units.find((unit) => unit.code === 'gallon');
	return (gallon ?? units.find((unit) => unit.unitType === 'volume'))?.id ?? '';
}

function positiveNumberValue(value: number | null, label: string): number {
	if (value === null || !Number.isFinite(value) || value <= 0) {
		throw new Error(`${label} must be greater than zero.`);
	}
	return value;
}

function componentSummary(
	components: readonly FormulationInsecticideRow[],
	insecticideById: ReadonlyMap<string, InsecticideRow>,
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
