import type {
	InsecticideBatchRow,
	InsecticideRow,
	OrganizationRow,
	UnitRow,
} from '@simmer-mosquito/sync';
import { OutletSimpleLayout } from '@simmer-mosquito/ui-web/components/app-shell';
import { useAppForm, validateMetadataValue } from '@simmer-mosquito/ui-web/components/form';
import { ListEmpty, PageHeader } from '@simmer-mosquito/ui-web/components/page';
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
import { Skeleton } from '@simmer-mosquito/ui-web/components/ui/skeleton';
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
import { eq, useLiveQuery } from '@tanstack/react-db';
import { createFileRoute } from '@tanstack/react-router';
import type React from 'react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { useCollectionRows } from '../../../hooks/use-collection-rows';
import { useOrganizationWorkspace } from '../../../hooks/use-organization-workspace';
import { webCollections } from '../../../sync/webCollections';
import { insecticideTypeOptions } from '../../my-organization/-components/constants';
import {
	createInsecticideBatchFromValues,
	createInsecticideFromValues,
	deleteInsecticide,
	deleteInsecticideBatch,
	errorMessageForSave,
	formatMode,
	hasMetadata,
	insecticideBatchFormValues,
	insecticideFormValues,
	updateInsecticideBatchFromValues,
	updateInsecticideFromValues,
	watchPersistence,
} from '../../my-organization/-components/helpers';
import { insecticideDisplayName } from '../-control-display';

export const Route = createFileRoute('/control-operations/chemical/insecticides')({
	component: InsecticidesRoute,
});

const InsecticideIcon = iconRegistry.entities.insecticide.icon;
const AddIcon = iconRegistry.actions.add.icon;
const CheckIcon = iconRegistry.actions.check.icon;
const CloseIcon = iconRegistry.actions.close.icon;
const DeleteIcon = iconRegistry.actions.delete.icon;
const EditIcon = iconRegistry.actions.edit.icon;
const ChevronIcon = iconRegistry.arrows.chevronRight.icon;

const batchesGcTimeMs = 30_000;

/** Amounts are recorded per product, so only these unit types are offered. */
const USAGE_UNIT_TYPES = new Set<UnitRow['unitType']>(['volume', 'weight', 'count']);

function InsecticidesRoute() {
	const { auth } = Route.useRouteContext();
	const { canManage, organization, settings } = useOrganizationWorkspace(auth.snapshot);

	// insecticides and units sync eagerly; only the batches are on-demand.
	const { rows: insecticideRows } = useCollectionRows<InsecticideRow>(webCollections.insecticides);
	const { rows: unitRows } = useCollectionRows<UnitRow>(webCollections.units);

	const units = useMemo(
		() =>
			unitRows
				.filter((unit) => USAGE_UNIT_TYPES.has(unit.unitType))
				.slice()
				.sort(
					(first, second) =>
						first.unitType.localeCompare(second.unitType) ||
						first.unitName.localeCompare(second.unitName),
				),
		[unitRows],
	);
	const insecticides = useMemo(
		() =>
			[...insecticideRows].sort(
				(first, second) =>
					Number(second.isActive) - Number(first.isActive) ||
					first.tradeName.localeCompare(second.tradeName),
			),
		[insecticideRows],
	);
	const activeInsecticides = insecticides.filter((row) => row.isActive);
	const inactiveInsecticides = insecticides.filter((row) => !row.isActive);
	const batchTrackingEnabled = settings.controlOperations.trackInsecticideBatches;

	// The header and the empty state offer the same way in, so they mount the
	// same drawer rather than each spelling out its own trigger.
	const addInsecticideDrawer = (
		<InsecticideDrawer
			canManage={canManage}
			organization={organization}
			trigger={
				<Button type="button">
					<AddIcon aria-hidden="true" />
					Add Insecticide
				</Button>
			}
			units={units}
		/>
	);

	return (
		<OutletSimpleLayout className="grid content-start gap-5">
			<PageHeader
				actions={
					<>
						<Badge tone={canManage ? 'success' : 'neutral'} variant="outline">
							{canManage ? 'Editor access' : 'View only'}
						</Badge>
						{canManage ? addInsecticideDrawer : null}
					</>
				}
				description="The products your agency applies — active ingredient, EPA registration number, default usage unit, and the lots crews draw from."
				icon={InsecticideIcon}
				title="Insecticides"
			/>

			{insecticides.length === 0 ? (
				<ListEmpty
					action={canManage ? addInsecticideDrawer : undefined}
					description={
						<>
							Insecticides are the products behind every chemical application record.
							{canManage
								? ' Add your first product to get started.'
								: ' An owner or admin can add products for your agency.'}
						</>
					}
					icon={InsecticideIcon}
					title="No Insecticides Yet"
				/>
			) : (
				<section className="grid gap-2">
					<div className="flex flex-wrap items-center justify-between gap-2">
						<div className="grid gap-1">
							<h2 className="m-0 font-bold text-[0.78rem] text-muted-foreground uppercase tracking-wide">
								Products
							</h2>
							<p className="m-0 max-w-[60ch] text-muted-foreground text-sm leading-snug">
								Expand a product to manage the lots or batches crews draw from.
							</p>
						</div>
						<div className="flex items-center gap-2">
							<Badge tone="success" variant="outline">
								{activeInsecticides.length} active
							</Badge>
							<Badge tone="neutral" variant="outline">
								{inactiveInsecticides.length} inactive
							</Badge>
						</div>
					</div>
					{batchTrackingEnabled ? null : <BatchTrackingDisabledNotice />}
					{activeInsecticides.length === 0 ? (
						<p className="m-0 rounded-md border border-border/50 border-dashed px-3 py-3 text-muted-foreground text-sm">
							No active insecticides.
						</p>
					) : (
						<InsecticideTable
							allInsecticides={insecticides}
							batchTrackingEnabled={batchTrackingEnabled}
							canManage={canManage}
							insecticides={activeInsecticides}
							organization={organization}
							units={units}
						/>
					)}
					{inactiveInsecticides.length > 0 ? (
						<InactiveInsecticidesCollapsible
							allInsecticides={insecticides}
							batchTrackingEnabled={batchTrackingEnabled}
							canManage={canManage}
							insecticides={inactiveInsecticides}
							organization={organization}
							units={units}
						/>
					) : null}
				</section>
			)}
		</OutletSimpleLayout>
	);
}

function BatchTrackingDisabledNotice() {
	return (
		<div className="grid gap-1 rounded-md border border-border/40 bg-muted/40 px-3 py-2.5">
			<div className="flex flex-wrap items-center gap-2">
				<strong className="text-foreground text-sm">Batch tracking is off</strong>
				<Badge tone="neutral" variant="outline">
					Tracking off
				</Badge>
			</div>
			<p className="m-0 text-muted-foreground text-xs leading-snug">
				Saved batches are retained, but application records will not ask crews to select one until
				an owner or admin turns tracking on under My Organization → Insecticides.
			</p>
		</div>
	);
}

// --- products ----------------------------------------------------------------

function InsecticideTable({
	allInsecticides,
	batchTrackingEnabled,
	canManage,
	insecticides,
	organization,
	units,
}: {
	/** Full product list — feeds the batch drawer's insecticide selector. */
	readonly allInsecticides: readonly InsecticideRow[];
	readonly batchTrackingEnabled: boolean;
	readonly canManage: boolean;
	/** The subset of products this table renders as rows. */
	readonly insecticides: readonly InsecticideRow[];
	readonly organization: OrganizationRow | null;
	readonly units: readonly UnitRow[];
}) {
	// Expand toggle + product columns (+ actions when the viewer can manage).
	const columnCount = 7 + (canManage ? 1 : 0);

	return (
		<div className="overflow-x-auto rounded-md border border-border/50">
			<Table>
				<TableHeader>
					<TableRow className="bg-muted/40 hover:bg-muted/40">
						<TableHead className="w-10">
							<span className="sr-only">Expand batches</span>
						</TableHead>
						<TableHead>Trade Name</TableHead>
						<TableHead>Active Ingredient</TableHead>
						<TableHead className="w-28">Type</TableHead>
						<TableHead className="w-36">Default Usage Unit</TableHead>
						<TableHead className="w-28">Status</TableHead>
						<TableHead className="w-28">Metadata</TableHead>
						{canManage ? (
							<TableHead className="w-24 text-right">
								<span className="sr-only">Actions</span>
							</TableHead>
						) : null}
					</TableRow>
				</TableHeader>
				<TableBody>
					{insecticides.map((insecticide) => (
						<InsecticideTableRow
							batchTrackingEnabled={batchTrackingEnabled}
							canManage={canManage}
							columnCount={columnCount}
							insecticide={insecticide}
							insecticides={allInsecticides}
							key={insecticide.id}
							organization={organization}
							units={units}
						/>
					))}
				</TableBody>
			</Table>
		</div>
	);
}

/**
 * Inactive products, tucked behind a collapsed disclosure so the active list
 * stays the focus. Mirrors {@link InactiveBatchesCollapsible} for batches.
 */
function InactiveInsecticidesCollapsible({
	allInsecticides,
	batchTrackingEnabled,
	canManage,
	insecticides,
	organization,
	units,
}: {
	readonly allInsecticides: readonly InsecticideRow[];
	readonly batchTrackingEnabled: boolean;
	readonly canManage: boolean;
	readonly insecticides: readonly InsecticideRow[];
	readonly organization: OrganizationRow | null;
	readonly units: readonly UnitRow[];
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
					{open ? 'Hide' : 'Show'} {insecticides.length} inactive
				</Button>
			</CollapsibleTrigger>
			<CollapsibleContent className="pt-2">
				<InsecticideTable
					allInsecticides={allInsecticides}
					batchTrackingEnabled={batchTrackingEnabled}
					canManage={canManage}
					insecticides={insecticides}
					organization={organization}
					units={units}
				/>
			</CollapsibleContent>
		</Collapsible>
	);
}

function InsecticideTableRow({
	batchTrackingEnabled,
	canManage,
	columnCount,
	insecticide,
	insecticides,
	organization,
	units,
}: {
	readonly batchTrackingEnabled: boolean;
	readonly canManage: boolean;
	readonly columnCount: number;
	readonly insecticide: InsecticideRow;
	readonly insecticides: readonly InsecticideRow[];
	readonly organization: OrganizationRow | null;
	readonly units: readonly UnitRow[];
}) {
	const [expanded, setExpanded] = useState(false);
	const productLabel = insecticide.tradeName;

	return (
		<>
			<TableRow className="border-b-0">
				<TableCell className="align-middle">
					<Button
						aria-expanded={expanded}
						aria-label={
							expanded ? `Hide batches for ${productLabel}` : `Show batches for ${productLabel}`
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
				<TableCell className="font-medium">{productLabel}</TableCell>
				<TableCell>{insecticide.activeIngredient}</TableCell>
				<TableCell>{formatMode(insecticide.type)}</TableCell>
				<TableCell>{unitLabel(units, insecticide.defaultUnitId)}</TableCell>
				<TableCell>
					{insecticide.isActive ? (
						'Active'
					) : (
						<Badge tone="neutral" variant="outline">
							Inactive
						</Badge>
					)}
				</TableCell>
				<TableCell>{hasMetadata(insecticide.metadata) ? 'Configured' : 'None'}</TableCell>
				{canManage ? (
					<TableCell className="text-right">
						<div className="flex justify-end gap-2">
							<InsecticideDrawer
								canManage={canManage}
								insecticide={insecticide}
								organization={organization}
								tooltip="Edit"
								trigger={
									<Button size="icon" type="button" variant="outline">
										<EditIcon aria-hidden="true" />
										<span className="sr-only">Edit {insecticide.tradeName}</span>
									</Button>
								}
								units={units}
							/>
							<ToggleInsecticideActiveButton insecticide={insecticide} />
						</div>
					</TableCell>
				) : null}
			</TableRow>
			{expanded ? (
				<TableRow className="hover:bg-transparent">
					<TableCell className="p-0" colSpan={columnCount}>
						<InsecticideBatchPanel
							batchTrackingEnabled={batchTrackingEnabled}
							canManage={canManage}
							insecticide={insecticide}
							insecticides={insecticides}
							organization={organization}
						/>
					</TableCell>
				</TableRow>
			) : null}
		</>
	);
}

/**
 * Reversible lifecycle toggle — the common per-row action. No confirm step; the
 * server rejects a deactivation it disallows and surfaces that error.
 */
function ToggleInsecticideActiveButton({ insecticide }: { readonly insecticide: InsecticideRow }) {
	const label = insecticide.isActive ? 'Deactivate' : 'Reactivate';
	const ToggleIcon = insecticide.isActive ? CloseIcon : CheckIcon;

	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<Button
					onClick={(event) => {
						// Drop focus before the row re-sorts into the inactive group: a focused
						// button that travels with the row would scroll the viewport away from
						// where the user was working.
						event.currentTarget.blur();
						toggleInsecticideActive(insecticide);
					}}
					size="icon"
					type="button"
					variant="outline"
				>
					<ToggleIcon aria-hidden="true" />
					<span className="sr-only">
						{label} {insecticide.tradeName}
					</span>
				</Button>
			</TooltipTrigger>
			<TooltipContent>{label}</TooltipContent>
		</Tooltip>
	);
}

function toggleInsecticideActive(insecticide: InsecticideRow): void {
	const nextActive = !insecticide.isActive;
	try {
		const transaction = updateInsecticideFromValues(insecticide, {
			...insecticideFormValues(insecticide, insecticide.defaultUnitId),
			isActive: nextActive,
		});
		watchPersistence(
			transaction,
			nextActive
				? `Unable to reactivate ${insecticide.tradeName}.`
				: `Unable to deactivate ${insecticide.tradeName}.`,
		);
	} catch (saveError) {
		toast.error(errorMessageForSave(saveError));
	}
}

function InsecticideDrawer({
	canManage,
	insecticide,
	organization,
	tooltip,
	trigger,
	units,
}: {
	readonly canManage: boolean;
	readonly insecticide?: InsecticideRow | undefined;
	readonly organization: OrganizationRow | null;
	/** When set, the trigger gets a hover/focus tooltip with this label. */
	readonly tooltip?: string | undefined;
	readonly trigger: React.ReactNode;
	readonly units: readonly UnitRow[];
}) {
	const [open, setOpen] = useState(false);
	const defaultValues = insecticideFormValues(insecticide, units[0]?.id ?? '');
	const unitChoices = useMemo(() => units.map(unitOption), [units]);
	const form = useAppForm({
		defaultValues,
		validators: {
			onSubmit: () =>
				organization === null ? 'Organization details are still loading.' : undefined,
		},
		onSubmit: ({ value }) => {
			try {
				const transaction =
					insecticide === undefined
						? createInsecticideFromValues(organization, value)
						: updateInsecticideFromValues(insecticide, value);
				setOpen(false);
				watchPersistence(
					transaction,
					insecticide === undefined
						? 'Unable to create insecticide.'
						: `Unable to save ${insecticide.tradeName}.`,
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
			<DrawerContent className="w-[min(720px,100%)] overflow-hidden sm:max-w-[720px]">
				<DrawerHeader className={stickyHeader({ padding: 'none' })}>
					<DrawerTitle>
						{insecticide === undefined ? 'Add Insecticide' : `Edit ${insecticide.tradeName}`}
					</DrawerTitle>
					<DrawerDescription>
						Manage product identity, label references, lifecycle state, and optional metadata.
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
							<form.AppField name="isActive">
								{(field) => <field.SwitchField disabled={!canManage} label="Active" />}
							</form.AppField>
							<form.AppField
								name="tradeName"
								validators={{
									onSubmit: ({ value }) =>
										value.trim().length === 0 ? 'Trade name is required.' : undefined,
								}}
							>
								{(field) => (
									<field.TextField
										disabled={!canManage}
										label="Trade name"
										placeholder="e.g. VectoBac 12AS"
									/>
								)}
							</form.AppField>
							<form.AppField name="shorthand">
								{(field) => (
									<field.TextField
										disabled={!canManage}
										label="Shorthand"
										placeholder="e.g. VectoBac"
									/>
								)}
							</form.AppField>
							<form.AppField
								name="activeIngredient"
								validators={{
									onSubmit: ({ value }) =>
										value.trim().length === 0 ? 'Active ingredient is required.' : undefined,
								}}
							>
								{(field) => (
									<field.TextField
										disabled={!canManage}
										label="Active ingredient"
										placeholder="e.g. Bacillus thuringiensis israelensis"
									/>
								)}
							</form.AppField>
							<form.AppField name="type">
								{(field) => (
									<field.SelectField
										disabled={!canManage}
										label="Type"
										options={insecticideTypeOptions}
									/>
								)}
							</form.AppField>
							<form.AppField
								name="registrationNumber"
								validators={{
									onSubmit: ({ value }) =>
										value.trim().length === 0 ? 'Registration number is required.' : undefined,
								}}
							>
								{(field) => (
									<field.TextField
										disabled={!canManage}
										label="Registration"
										placeholder="e.g. EPA Reg. No. 73049-38"
									/>
								)}
							</form.AppField>
							<form.AppField
								name="defaultUnitId"
								validators={{
									onSubmit: ({ value }) =>
										value.trim().length === 0 ? 'Default usage unit is required.' : undefined,
								}}
							>
								{(field) => (
									<field.SelectField
										description="Pre-fills the unit on every application of this product."
										disabled={!canManage || unitChoices.length === 0}
										label="Default usage unit"
										options={unitChoices}
									/>
								)}
							</form.AppField>
							<form.AppField name="labelUrl">
								{(field) => (
									<field.UrlField
										disabled={!canManage}
										label="Label URL"
										placeholder="https://..."
									/>
								)}
							</form.AppField>
							<form.AppField name="msdsUrl">
								{(field) => (
									<field.UrlField disabled={!canManage} label="SDS URL" placeholder="https://..." />
								)}
							</form.AppField>
							<form.AppField name="metadata" validators={{ onSubmit: validateMetadataValue }}>
								{(field) => (
									<field.MetadataField
										description="Add product-specific details such as signal word, storage notes, or restricted-use flags."
										disabled={!canManage}
										label="Metadata"
										mode={{ kind: 'manual' }}
									/>
								)}
							</form.AppField>
						</div>
						<DrawerFooter>
							<div className="flex flex-wrap items-center justify-end gap-2">
								{insecticide === undefined ? null : (
									<DeleteInsecticideDialog className="mr-auto" insecticide={insecticide} />
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

/**
 * Deletion is a rare, destructive action, so it lives inside the edit drawer
 * rather than as a per-row control. Reversible lifecycle changes belong to
 * {@link ToggleInsecticideActiveButton} instead.
 */
function DeleteInsecticideDialog({
	className,
	insecticide,
}: {
	readonly className?: string | undefined;
	readonly insecticide: InsecticideRow;
}) {
	function removeInsecticide() {
		try {
			const transaction = deleteInsecticide(insecticide);
			watchPersistence(transaction, `Unable to delete ${insecticide.tradeName}.`);
		} catch (deleteError) {
			toast.error(errorMessageForSave(deleteError));
		}
	}

	return (
		<AlertDialog>
			<AlertDialogTrigger asChild>
				<Button className={className} type="button" variant="destructive">
					<DeleteIcon aria-hidden="true" data-icon="inline-start" />
					Delete Insecticide
				</Button>
			</AlertDialogTrigger>
			<AlertDialogContent size="sm">
				<AlertDialogHeader>
					<AlertDialogTitle>Delete Insecticide?</AlertDialogTitle>
					<AlertDialogDescription>
						This removes {insecticide.tradeName} from the product list. If a server rule blocks the
						delete — an application already used it — the record will stay in place.
					</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter>
					<AlertDialogCancel>Cancel</AlertDialogCancel>
					<AlertDialogAction onClick={removeInsecticide} variant="destructive">
						Delete
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}

// --- batches ------------------------------------------------------------------

/**
 * Batches for one product, revealed when its row is expanded. Mounting lazily
 * (only while expanded) keeps the on-demand batch subscription scoped to the
 * products a user actually opens.
 */
function InsecticideBatchPanel({
	batchTrackingEnabled,
	canManage,
	insecticide,
	insecticides,
	organization,
}: {
	readonly batchTrackingEnabled: boolean;
	readonly canManage: boolean;
	readonly insecticide: InsecticideRow;
	readonly insecticides: readonly InsecticideRow[];
	readonly organization: OrganizationRow | null;
}) {
	const { batches, isReady, isError } = useInsecticideBatches(insecticide.id);
	const canManageBatches = canManage && batchTrackingEnabled;
	const activeBatches = batches.filter((batch) => batch.isActive);
	const inactiveBatches = batches.filter((batch) => !batch.isActive);

	return (
		<div className="grid gap-2 border-border/40 border-t bg-muted/20 px-4 py-3">
			<div className="flex flex-wrap items-center justify-between gap-2">
				<div className="flex flex-wrap items-baseline gap-2">
					<span className="font-semibold text-foreground text-sm">Batches</span>
					<span className="text-muted-foreground text-xs">
						{isError ? 'Unavailable' : !isReady ? 'Loading…' : batchGroupSummary(batches)}
					</span>
				</div>
				<InsecticideBatchDrawer
					canManage={canManageBatches}
					defaultInsecticideId={insecticide.id}
					insecticides={insecticides}
					lockInsecticide
					organization={organization}
					trigger={
						<Button disabled={!canManageBatches} size="sm" type="button" variant="outline">
							<AddIcon aria-hidden="true" />
							Add Batch
						</Button>
					}
				/>
			</div>
			{isError ? (
				<p className="m-0 rounded-md border border-border/50 border-dashed px-3 py-2 text-muted-foreground text-xs">
					Batches could not be loaded. Try again shortly.
				</p>
			) : !isReady ? (
				<Skeleton className="h-16 w-full" />
			) : (
				<>
					<InsecticideBatchList
						batches={activeBatches}
						canManage={canManageBatches}
						disabled={!batchTrackingEnabled}
						emptyLabel="No active batches."
						insecticides={insecticides}
						organization={organization}
					/>
					{inactiveBatches.length > 0 ? (
						<InactiveBatchesCollapsible
							batches={inactiveBatches}
							canManage={canManageBatches}
							disabled={!batchTrackingEnabled}
							insecticides={insecticides}
							organization={organization}
						/>
					) : null}
				</>
			)}
		</div>
	);
}

function InactiveBatchesCollapsible({
	batches,
	canManage,
	disabled,
	insecticides,
	organization,
}: {
	readonly batches: readonly InsecticideBatchRow[];
	readonly canManage: boolean;
	readonly disabled: boolean;
	readonly insecticides: readonly InsecticideRow[];
	readonly organization: OrganizationRow | null;
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
					{open ? 'Hide' : 'Show'} {batches.length} inactive
				</Button>
			</CollapsibleTrigger>
			<CollapsibleContent className="pt-2">
				<InsecticideBatchList
					batches={batches}
					canManage={canManage}
					disabled={disabled}
					emptyLabel="No inactive batches."
					insecticides={insecticides}
					organization={organization}
				/>
			</CollapsibleContent>
		</Collapsible>
	);
}

/**
 * insecticide_batches syncs on demand, so this scopes the subset to one product
 * and uses the status-gated `useLiveQuery` — the suspense variant hangs after a
 * navigation unmount over on-demand collections.
 */
function useInsecticideBatches(insecticideId: string): {
	readonly batches: readonly InsecticideBatchRow[];
	readonly isReady: boolean;
	readonly isError: boolean;
} {
	const result = useLiveQuery(
		{
			gcTime: batchesGcTimeMs,
			query: (query) =>
				query
					.from({ batch: webCollections.insecticideBatches })
					.where(({ batch }) => eq(batch.insecticideId, insecticideId))
					.orderBy(({ batch }) => batch.isActive, 'desc')
					.orderBy(({ batch }) => batch.batchName, 'asc'),
		},
		[insecticideId],
	);

	return {
		batches: (result.data ?? []) as unknown as readonly InsecticideBatchRow[],
		isReady: result.isReady,
		isError: result.isError,
	};
}

function InsecticideBatchList({
	batches,
	canManage,
	disabled,
	emptyLabel,
	insecticides,
	organization,
}: {
	readonly batches: readonly InsecticideBatchRow[];
	readonly canManage: boolean;
	readonly disabled: boolean;
	readonly emptyLabel: string;
	readonly insecticides: readonly InsecticideRow[];
	readonly organization: OrganizationRow | null;
}) {
	if (batches.length === 0) {
		return (
			<p className="m-0 rounded-md border border-border/50 border-dashed px-3 py-2 text-muted-foreground text-xs">
				{emptyLabel}
			</p>
		);
	}

	return (
		<div
			aria-disabled={disabled}
			className="overflow-x-auto rounded-md border border-border/40 data-[disabled=true]:bg-muted/30"
			data-disabled={disabled}
		>
			<Table>
				<TableHeader>
					<TableRow>
						<TableHead>Batch</TableHead>
						{canManage ? <TableHead className="w-24 text-right">Actions</TableHead> : null}
					</TableRow>
				</TableHeader>
				<TableBody>
					{batches.map((batch) => (
						<TableRow key={batch.id}>
							<TableCell className="font-medium">{batch.batchName}</TableCell>
							{canManage ? (
								<TableCell className="text-right">
									<div className="flex justify-end gap-2">
										<InsecticideBatchDrawer
											batch={batch}
											canManage={canManage}
											insecticides={insecticides}
											organization={organization}
											trigger={
												<Button size="icon" type="button" variant="outline">
													<EditIcon aria-hidden="true" />
													<span className="sr-only">Edit {batch.batchName}</span>
												</Button>
											}
										/>
										<DeleteInsecticideBatchDialog batch={batch} />
									</div>
								</TableCell>
							) : null}
						</TableRow>
					))}
				</TableBody>
			</Table>
		</div>
	);
}

function InsecticideBatchDrawer({
	batch,
	canManage,
	defaultInsecticideId,
	insecticides,
	lockInsecticide = false,
	organization,
	trigger,
}: {
	readonly batch?: InsecticideBatchRow | undefined;
	readonly canManage: boolean;
	readonly defaultInsecticideId?: string | undefined;
	readonly insecticides: readonly InsecticideRow[];
	readonly lockInsecticide?: boolean;
	readonly organization: OrganizationRow | null;
	readonly trigger: React.ReactNode;
}) {
	const [open, setOpen] = useState(false);
	const activeInsecticides = insecticides.filter(
		(item) => item.isActive || item.id === batch?.insecticideId,
	);
	const fallbackInsecticideId = defaultInsecticideId ?? activeInsecticides[0]?.id ?? '';
	const defaultValues = insecticideBatchFormValues(batch, fallbackInsecticideId);
	const insecticideChoices = useMemo(
		() => activeInsecticides.map(insecticideOption),
		[activeInsecticides],
	);
	const form = useAppForm({
		defaultValues,
		validators: {
			onSubmit: () =>
				organization === null ? 'Organization details are still loading.' : undefined,
		},
		onSubmit: ({ value }) => {
			try {
				const transaction =
					batch === undefined
						? createInsecticideBatchFromValues(
								webCollections.insecticideBatches,
								organization,
								value,
							)
						: updateInsecticideBatchFromValues(webCollections.insecticideBatches, batch, value);
				setOpen(false);
				watchPersistence(
					transaction,
					batch === undefined ? 'Unable to create batch.' : `Unable to save ${batch.batchName}.`,
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
			<DrawerTrigger asChild>{trigger}</DrawerTrigger>
			<DrawerContent className="w-[min(560px,100%)] overflow-hidden sm:max-w-[560px]">
				<DrawerHeader className={stickyHeader({ padding: 'none' })}>
					<DrawerTitle>{batch === undefined ? 'Add Batch' : `Edit ${batch.batchName}`}</DrawerTitle>
					<DrawerDescription>
						Manage lot or batch labels for an active insecticide product.
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
							<form.AppField name="isActive">
								{(field) => <field.SwitchField disabled={!canManage} label="Active" />}
							</form.AppField>
							<form.AppField
								name="insecticideId"
								validators={{
									onSubmit: ({ value }) =>
										value.trim().length === 0 ? 'Insecticide is required.' : undefined,
								}}
							>
								{(field) => (
									<field.SelectField
										disabled={
											!canManage ||
											batch !== undefined ||
											lockInsecticide ||
											insecticideChoices.length === 0
										}
										label="Insecticide"
										options={insecticideChoices}
									/>
								)}
							</form.AppField>
							<form.AppField
								name="batchName"
								validators={{
									onSubmit: ({ value }) =>
										value.trim().length === 0 ? 'Batch name is required.' : undefined,
								}}
							>
								{(field) => (
									<field.TextField
										disabled={!canManage}
										label="Batch name"
										placeholder="e.g. Lot 24-018"
									/>
								)}
							</form.AppField>
						</div>
						<DrawerFooter>
							<form.FormActions>
								<form.SubmitButton
									disabled={!canManage || organization === null || insecticideChoices.length === 0}
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

function DeleteInsecticideBatchDialog({ batch }: { readonly batch: InsecticideBatchRow }) {
	function removeBatch() {
		try {
			const transaction = deleteInsecticideBatch(webCollections.insecticideBatches, batch);
			watchPersistence(transaction, `Unable to delete ${batch.batchName}.`);
		} catch (deleteError) {
			toast.error(errorMessageForSave(deleteError));
		}
	}

	return (
		<AlertDialog>
			<AlertDialogTrigger asChild>
				<Button size="icon" type="button" variant="destructive">
					<DeleteIcon aria-hidden="true" />
					<span className="sr-only">Delete {batch.batchName}</span>
				</Button>
			</AlertDialogTrigger>
			<AlertDialogContent size="sm">
				<AlertDialogHeader>
					<AlertDialogTitle>Delete Batch?</AlertDialogTitle>
					<AlertDialogDescription>
						This removes {batch.batchName} from batch choices. If a server rule blocks the delete,
						the record will stay in place.
					</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter>
					<AlertDialogCancel>Cancel</AlertDialogCancel>
					<AlertDialogAction onClick={removeBatch} variant="destructive">
						Delete
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}

// --- helpers ------------------------------------------------------------------

function unitOption(unit: UnitRow) {
	return {
		label:
			unit.abbreviation.length === 0 ? unit.unitName : `${unit.unitName} (${unit.abbreviation})`,
		value: unit.id,
	};
}

function insecticideOption(insecticide: InsecticideRow) {
	return {
		label: insecticideDisplayName(insecticide),
		value: insecticide.id,
	};
}

function unitLabel(units: readonly UnitRow[], unitId: string): string {
	const unit = units.find((item) => item.id === unitId);
	return unit === undefined ? 'Not set' : unit.abbreviation || unit.unitName;
}

function batchGroupSummary(batches: readonly InsecticideBatchRow[]): string {
	if (batches.length === 0) {
		return 'No batches recorded';
	}
	const activeCount = batches.filter((batch) => batch.isActive).length;
	return `${activeCount} active, ${batches.length - activeCount} inactive`;
}
