import type { MetadataValue } from '@simmer-mosquito/ui-web/components/form';
import { useAppForm, validateMetadataValue } from '@simmer-mosquito/ui-web/components/form';
import { Badge } from '@simmer-mosquito/ui-web/components/ui/badge';
import { Button } from '@simmer-mosquito/ui-web/components/ui/button';
import { Skeleton } from '@simmer-mosquito/ui-web/components/ui/skeleton';
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
	type InsecticideBatchFields,
	type InsecticideBatchMutations,
	type InsecticideFields,
	type InsecticideMutations,
	useInsecticideBatchMutations,
	useInsecticideMutations,
} from '../../../hooks/mutations/use-insecticide-mutations';
import {
	type InsecticideBatchRecord,
	type InsecticideRecord,
	useInsecticideBatches,
	useInsecticideRecords,
} from '../../../hooks/queries/use-insecticide-records';
import {
	type UnitLabel,
	type UnitType,
	useUnitLabels,
} from '../../../hooks/queries/use-unit-labels';
import { useOrganizationWorkspace } from '../../../hooks/use-organization-workspace';
import { insecticideTypeOptions } from '../../my-organization/-components/constants';
import { formatMode, hasMetadata } from '../../my-organization/-components/helpers';
import { insecticideDisplayName } from '../-control-display';

export const Route = createFileRoute('/control-operations/chemical/insecticides')({
	component: InsecticidesRoute,
});

const InsecticideIcon = iconRegistry.entities.insecticide.icon;
const AddIcon = iconRegistry.actions.add.icon;
const DeleteIcon = iconRegistry.actions.delete.icon;
const EditIcon = iconRegistry.actions.edit.icon;

/** Amounts are recorded per product, so only these unit types are offered. */
const USAGE_UNIT_TYPES = new Set<UnitType>(['volume', 'weight', 'count']);

function InsecticidesRoute() {
	const { auth } = Route.useRouteContext();
	const { canManage, settings } = useOrganizationWorkspace(auth.snapshot);

	// insecticides and units sync eagerly; only the batches are on-demand.
	const insecticides = useInsecticideRecords();
	const mutations = useInsecticideMutations();
	const batchMutations = useInsecticideBatchMutations();
	const { all: unitRows } = useUnitLabels();

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
	const activeInsecticides = insecticides.filter((row) => row.isActive);
	const inactiveInsecticides = insecticides.filter((row) => !row.isActive);
	const batchTrackingEnabled = settings.controlOperations.trackInsecticideBatches;

	// The header and the empty state offer the same way in, so they mount the
	// same drawer rather than each spelling out its own trigger.
	const addInsecticideDrawer = (
		<InsecticideDrawer
			canManage={canManage}
			mutations={mutations}
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
		<CatalogPage
			action={canManage ? addInsecticideDrawer : undefined}
			canEdit={canManage}
			description="The products your agency applies — active ingredient, EPA registration number, default usage unit, and the lots crews draw from."
			emptyDescription={
				<>
					Insecticides are the products behind every chemical application record.
					{canManage
						? ' Add your first product to get started.'
						: ' An owner or admin can add products for your agency.'}
				</>
			}
			emptyTitle="No Insecticides Yet"
			icon={InsecticideIcon}
			isEmpty={insecticides.length === 0}
			title="Insecticides"
		>
			<section className="grid gap-2">
				<CatalogGroupHeader
					active={activeInsecticides.length}
					description="Expand a product to manage the lots or batches crews draw from."
					inactive={inactiveInsecticides.length}
					title="Products"
				/>
				{batchTrackingEnabled ? null : <BatchTrackingDisabledNotice />}
				{activeInsecticides.length === 0 ? (
					<CatalogNote>No active insecticides.</CatalogNote>
				) : (
					<InsecticideTable
						allInsecticides={insecticides}
						batchMutations={batchMutations}
						batchTrackingEnabled={batchTrackingEnabled}
						canManage={canManage}
						insecticides={activeInsecticides}
						mutations={mutations}
						units={units}
					/>
				)}
				{inactiveInsecticides.length > 0 ? (
					<CatalogInactiveDisclosure count={inactiveInsecticides.length}>
						<InsecticideTable
							allInsecticides={insecticides}
							batchMutations={batchMutations}
							batchTrackingEnabled={batchTrackingEnabled}
							canManage={canManage}
							insecticides={inactiveInsecticides}
							mutations={mutations}
							units={units}
						/>
					</CatalogInactiveDisclosure>
				) : null}
			</section>
		</CatalogPage>
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
	batchMutations,
	mutations,
	units,
}: {
	/** Full product list — feeds the batch drawer's insecticide selector. */
	readonly allInsecticides: readonly InsecticideRecord[];
	readonly batchMutations: InsecticideBatchMutations;
	readonly batchTrackingEnabled: boolean;
	readonly canManage: boolean;
	/** The subset of products this table renders as rows. */
	readonly insecticides: readonly InsecticideRecord[];
	readonly mutations: InsecticideMutations;
	readonly units: readonly UnitLabel[];
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
							batchMutations={batchMutations}
							batchTrackingEnabled={batchTrackingEnabled}
							canManage={canManage}
							columnCount={columnCount}
							insecticide={insecticide}
							insecticides={allInsecticides}
							key={insecticide.id}
							mutations={mutations}
							units={units}
						/>
					))}
				</TableBody>
			</Table>
		</div>
	);
}

function InsecticideTableRow({
	batchTrackingEnabled,
	canManage,
	columnCount,
	insecticide,
	insecticides,
	batchMutations,
	mutations,
	units,
}: {
	readonly batchMutations: InsecticideBatchMutations;
	readonly batchTrackingEnabled: boolean;
	readonly canManage: boolean;
	readonly columnCount: number;
	readonly insecticide: InsecticideRecord;
	readonly insecticides: readonly InsecticideRecord[];
	readonly mutations: InsecticideMutations;
	readonly units: readonly UnitLabel[];
}) {
	const [expanded, setExpanded] = useState(false);
	const productLabel = insecticide.tradeName;

	return (
		<>
			<TableRow className="border-b-0">
				<TableCell className="align-middle">
					<CatalogExpandButton
						expanded={expanded}
						label={
							expanded ? `Hide batches for ${productLabel}` : `Show batches for ${productLabel}`
						}
						onToggle={() => setExpanded((previous) => !previous)}
					/>
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
								mutations={mutations}
								tooltip="Edit"
								trigger={
									<Button size="icon" type="button" variant="outline">
										<EditIcon aria-hidden="true" />
										<span className="sr-only">Edit {insecticide.tradeName}</span>
									</Button>
								}
								units={units}
							/>
							{/* No confirm step; the server rejects a deactivation it disallows. */}
							<CatalogLifecycleButton
								isActive={insecticide.isActive}
								name={insecticide.tradeName}
								onToggle={() =>
									toggleCatalogActive({
										apply: (isActive) => mutations.setActive(insecticide.id, isActive),
										isActive: insecticide.isActive,
										name: insecticide.tradeName,
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
						<InsecticideBatchPanel
							batchTrackingEnabled={batchTrackingEnabled}
							canManage={canManage}
							insecticide={insecticide}
							insecticides={insecticides}
							mutations={batchMutations}
						/>
					</TableCell>
				</TableRow>
			) : null}
		</>
	);
}

function InsecticideDrawer({
	canManage,
	insecticide,
	mutations,
	tooltip,
	trigger,
	units,
}: {
	readonly canManage: boolean;
	readonly insecticide?: InsecticideRecord | undefined;
	readonly mutations: InsecticideMutations;
	/** When set, the trigger gets a hover/focus tooltip with this label. */
	readonly tooltip?: string | undefined;
	readonly trigger: React.ReactNode;
	readonly units: readonly UnitLabel[];
}) {
	const [open, setOpen] = useState(false);
	const defaultValues = insecticideFormValues(insecticide, units[0]?.id ?? '');
	const unitChoices = useMemo(() => units.map(unitOption), [units]);
	const form = useAppForm({
		defaultValues,
		validators: {
			onSubmit: () => (mutations.canWrite ? undefined : 'Organization details are still loading.'),
		},
		onSubmit: ({ value }) => {
			commitCatalogSave({
				failureMessage:
					insecticide === undefined
						? 'Unable to create insecticide.'
						: `Unable to save ${insecticide.tradeName}.`,
				onWritten: () => setOpen(false),
				save: () =>
					insecticide === undefined
						? mutations.create(insecticideFields(value)).then(() => undefined)
						: mutations.save(
								insecticide.id,
								insecticideFields(value),
								insecticideFields(insecticideFormValues(insecticide, insecticide.defaultUnitId)),
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
				description="Manage product identity, label references, lifecycle state, and optional metadata."
				destructiveAction={
					insecticide === undefined ? undefined : (
						<DeleteInsecticideDialog insecticide={insecticide} mutations={mutations} />
					)
				}
				onOpenChange={updateOpen}
				onSubmit={() => void form.handleSubmit()}
				open={open}
				title={insecticide === undefined ? 'Add Insecticide' : `Edit ${insecticide.tradeName}`}
				tooltip={tooltip}
				trigger={trigger}
				width="xl"
			>
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
						<field.TextField disabled={!canManage} label="Shorthand" placeholder="e.g. VectoBac" />
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
						<field.UrlField disabled={!canManage} label="Label URL" placeholder="https://..." />
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
			</CatalogRecordDrawer>
		</form.AppForm>
	);
}

/**
 * Deletion is a rare, destructive action, so it lives inside the edit drawer
 * rather than as a per-row control. Reversible lifecycle changes belong to the
 * row's own {@link CatalogLifecycleButton} instead.
 */
function DeleteInsecticideDialog({
	insecticide,
	mutations,
}: {
	readonly insecticide: InsecticideRecord;
	readonly mutations: InsecticideMutations;
}) {
	return (
		<CatalogDeleteDialog
			confirmLabel="Delete"
			description={
				<>
					This removes {insecticide.tradeName} from the product list. If a server rule blocks the
					delete — an application already used it — the record will stay in place.
				</>
			}
			onConfirm={() =>
				commitCatalogSave({
					failureMessage: `Unable to delete ${insecticide.tradeName}.`,
					save: () => mutations.remove(insecticide.id),
				})
			}
			title="Delete Insecticide?"
			trigger={
				<Button type="button" variant="destructive">
					<DeleteIcon aria-hidden="true" data-icon="inline-start" />
					Delete Insecticide
				</Button>
			}
		/>
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
	mutations,
}: {
	readonly batchTrackingEnabled: boolean;
	readonly canManage: boolean;
	readonly insecticide: InsecticideRecord;
	readonly insecticides: readonly InsecticideRecord[];
	readonly mutations: InsecticideBatchMutations;
}) {
	const { batches, isReady, isError } = useInsecticideBatches(insecticide.id);
	const canManageBatches = canManage && batchTrackingEnabled;
	const activeBatches = batches.filter((batch) => batch.isActive);
	const inactiveBatches = batches.filter((batch) => !batch.isActive);

	return (
		<CatalogDetailPanel
			action={
				<InsecticideBatchDrawer
					canManage={canManageBatches}
					defaultInsecticideId={insecticide.id}
					insecticides={insecticides}
					lockInsecticide
					mutations={mutations}
					trigger={
						<Button disabled={!canManageBatches} size="sm" type="button" variant="outline">
							<AddIcon aria-hidden="true" />
							Add Batch
						</Button>
					}
				/>
			}
			summary={isError ? 'Unavailable' : !isReady ? 'Loading…' : batchGroupSummary(batches)}
			title="Batches"
		>
			{isError ? (
				<CatalogNote compact>Batches could not be loaded. Try again shortly.</CatalogNote>
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
						mutations={mutations}
					/>
					{inactiveBatches.length > 0 ? (
						<CatalogInactiveDisclosure count={inactiveBatches.length}>
							<InsecticideBatchList
								batches={inactiveBatches}
								canManage={canManageBatches}
								disabled={!batchTrackingEnabled}
								emptyLabel="No inactive batches."
								insecticides={insecticides}
								mutations={mutations}
							/>
						</CatalogInactiveDisclosure>
					) : null}
				</>
			)}
		</CatalogDetailPanel>
	);
}

function InsecticideBatchList({
	batches,
	canManage,
	disabled,
	emptyLabel,
	insecticides,
	mutations,
}: {
	readonly batches: readonly InsecticideBatchRecord[];
	readonly canManage: boolean;
	readonly disabled: boolean;
	readonly emptyLabel: string;
	readonly insecticides: readonly InsecticideRecord[];
	readonly mutations: InsecticideBatchMutations;
}) {
	if (batches.length === 0) {
		return <CatalogNote compact>{emptyLabel}</CatalogNote>;
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
											mutations={mutations}
											trigger={
												<Button size="icon" type="button" variant="outline">
													<EditIcon aria-hidden="true" />
													<span className="sr-only">Edit {batch.batchName}</span>
												</Button>
											}
										/>
										<DeleteInsecticideBatchDialog batch={batch} mutations={mutations} />
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
	mutations,
	trigger,
}: {
	readonly batch?: InsecticideBatchRecord | undefined;
	readonly canManage: boolean;
	readonly defaultInsecticideId?: string | undefined;
	readonly insecticides: readonly InsecticideRecord[];
	readonly lockInsecticide?: boolean;
	readonly mutations: InsecticideBatchMutations;
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
			onSubmit: () => (mutations.canWrite ? undefined : 'Organization details are still loading.'),
		},
		onSubmit: ({ value }) => {
			commitCatalogSave({
				failureMessage:
					batch === undefined ? 'Unable to create batch.' : `Unable to save ${batch.batchName}.`,
				onWritten: () => setOpen(false),
				save: () =>
					batch === undefined
						? mutations.create(batchFields(value)).then(() => undefined)
						: mutations.save(
								batch.id,
								batchFields(value),
								batchFields(insecticideBatchFormValues(batch, batch.insecticideId)),
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
							disabled={!canManage || !mutations.canWrite || insecticideChoices.length === 0}
						/>
						<CatalogDrawerCancel />
					</form.FormActions>
				}
				description="Manage lot or batch labels for an active insecticide product."
				onOpenChange={updateOpen}
				onSubmit={() => void form.handleSubmit()}
				open={open}
				title={batch === undefined ? 'Add Batch' : `Edit ${batch.batchName}`}
				trigger={trigger}
				width="md"
			>
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
			</CatalogRecordDrawer>
		</form.AppForm>
	);
}

function DeleteInsecticideBatchDialog({
	batch,
	mutations,
}: {
	readonly batch: InsecticideBatchRecord;
	readonly mutations: InsecticideBatchMutations;
}) {
	return (
		<CatalogDeleteDialog
			confirmLabel="Delete"
			description={
				<>
					This removes {batch.batchName} from batch choices. If a server rule blocks the delete, the
					record will stay in place.
				</>
			}
			onConfirm={() =>
				commitCatalogSave({
					failureMessage: `Unable to delete ${batch.batchName}.`,
					save: () => mutations.remove(batch.id),
				})
			}
			title="Delete Batch?"
			trigger={
				<Button size="icon" type="button" variant="destructive">
					<DeleteIcon aria-hidden="true" />
					<span className="sr-only">Delete {batch.batchName}</span>
				</Button>
			}
		/>
	);
}

// --- helpers ------------------------------------------------------------------

function unitOption(unit: UnitLabel) {
	return {
		label:
			unit.abbreviation.length === 0 ? unit.unitName : `${unit.unitName} (${unit.abbreviation})`,
		value: unit.id,
	};
}

function insecticideOption(insecticide: InsecticideRecord) {
	return {
		label: insecticideDisplayName(insecticide),
		value: insecticide.id,
	};
}

function unitLabel(units: readonly UnitLabel[], unitId: string): string {
	const unit = units.find((item) => item.id === unitId);
	return unit === undefined ? 'Not set' : unit.abbreviation || unit.unitName;
}

function batchGroupSummary(batches: readonly InsecticideBatchRecord[]): string {
	if (batches.length === 0) {
		return 'No batches recorded';
	}
	const activeCount = batches.filter((batch) => batch.isActive).length;
	return `${activeCount} active, ${batches.length - activeCount} inactive`;
}

/**
 * Open the product drawer on a record, or on a blank one.
 *
 * `defaultUnitId` is the first offered unit when there is no record, because a
 * product without one cannot be applied and the field would otherwise open
 * empty on a list of one.
 */
function insecticideFormValues(insecticide: InsecticideRecord | undefined, defaultUnitId: string) {
	const metadata = insecticide?.metadata;
	return {
		tradeName: insecticide?.tradeName ?? '',
		activeIngredient: insecticide?.activeIngredient ?? '',
		type: insecticide?.type ?? ('adulticide' as InsecticideRecord['type']),
		registrationNumber: insecticide?.registrationNumber ?? '',
		defaultUnitId: insecticide?.defaultUnitId ?? defaultUnitId,
		labelUrl: insecticide?.labelUrl ?? '',
		msdsUrl: insecticide?.msdsUrl ?? '',
		shorthand: insecticide?.shorthand ?? '',
		metadata:
			typeof metadata === 'object' && metadata !== null && !Array.isArray(metadata)
				? (metadata as MetadataValue)
				: null,
		isActive: insecticide?.isActive ?? true,
	};
}

/** The drawer's values as the write hook takes them: trimmed, empty means absent. */
function insecticideFields(values: ReturnType<typeof insecticideFormValues>): InsecticideFields {
	return {
		tradeName: values.tradeName.trim(),
		activeIngredient: values.activeIngredient.trim(),
		type: values.type,
		registrationNumber: values.registrationNumber.trim(),
		defaultUnitId: values.defaultUnitId,
		labelUrl: emptyToNull(values.labelUrl),
		msdsUrl: emptyToNull(values.msdsUrl),
		shorthand: emptyToNull(values.shorthand),
		metadata: values.metadata,
		isActive: values.isActive,
	};
}

function insecticideBatchFormValues(
	batch: InsecticideBatchRecord | undefined,
	defaultInsecticideId: string,
) {
	return {
		insecticideId: batch?.insecticideId ?? defaultInsecticideId,
		batchName: batch?.batchName ?? '',
		isActive: batch?.isActive ?? true,
	};
}

function batchFields(
	values: ReturnType<typeof insecticideBatchFormValues>,
): InsecticideBatchFields {
	return {
		insecticideId: values.insecticideId,
		batchName: values.batchName.trim(),
		isActive: values.isActive,
	};
}

function emptyToNull(value: string): string | null {
	const text = value.trim();
	return text.length === 0 ? null : text;
}
