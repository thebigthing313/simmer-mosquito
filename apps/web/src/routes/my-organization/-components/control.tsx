import type { EquipmentRow, OrganizationRow, VehicleRow } from '@simmer-mosquito/sync';
import {
	useAppForm,
	validateJsonSchemaValue,
	validateMetadataValue,
} from '@simmer-mosquito/ui-web/components/form';
import { Button } from '@simmer-mosquito/ui-web/components/ui/button';
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
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from '@simmer-mosquito/ui-web/components/ui/table';
import { type Collection, eq, useLiveSuspenseQuery } from '@tanstack/react-db';
import { Link } from '@tanstack/react-router';
import { useState } from 'react';
import { toast } from 'sonner';
import { catalogFields, catalogFormValues, commitCatalogSave } from '../../../components/catalog';
import { CustomFieldsCell } from '../../../components/custom-fields-cell';
import type { CatalogMutations } from '../../../hooks/mutations/use-catalog-mutations';
import type {
	CatalogRecords,
	ControlMethodRecord,
} from '../../../hooks/queries/use-catalog-records';
import {
	useApplicationMethodRecords,
	useBiocontrolMethodRecords,
	useSourceReductionMethodRecords,
} from '../../../hooks/queries/use-catalog-records';
import {
	AddIcon,
	ArrowRightIcon,
	CloseIcon,
	controlAssetListConfigs,
	controlMethodListConfigs,
	EditIcon,
} from './constants';
import {
	controlAssetFormValues,
	controlAssetName,
	createControlAssetFromValues,
	errorMessageForSave,
	hasMetadata,
	isEquipmentRow,
	updateControlAssetFromValues,
	watchPersistence,
} from './helpers';
import { LookupListFrame } from './layout/layout';
import type {
	ControlAssetCollectionKey,
	ControlAssetRow,
	ControlMethodCollectionKey,
} from './types';

export function ControlOperationsSettings({
	canManageAssets,
	organization,
	vehicles,
	equipment,
}: {
	/**
	 * Vehicles and equipment are `MANAGER` on the server, not `ADMIN` — every
	 * one of `controlOperations.createVehicle` through `deleteEquipment`. The
	 * method entries beside them are links rather than editors, so this is the
	 * only floor this section needs.
	 */
	readonly canManageAssets: boolean;
	readonly organization: OrganizationRow | null;
	readonly vehicles: Collection<VehicleRow, string | number>;
	readonly equipment: Collection<EquipmentRow, string | number>;
}) {
	const applicationMethods = useApplicationMethodRecords();
	const sourceReductionMethods = useSourceReductionMethodRecords();
	const biocontrolMethods = useBiocontrolMethodRecords();

	return (
		<div className="grid gap-3">
			<div className="grid gap-2">
				<h3 className="eyebrow mt-0.5 mb-0">Setup Lists</h3>
				<div className="grid gap-3">
					<ControlMethodLookupPointer
						collectionKey="applicationMethods"
						records={applicationMethods}
						to="/control-operations/chemical/methods"
					/>
					<ControlMethodLookupPointer
						collectionKey="sourceReductionMethods"
						records={sourceReductionMethods}
						to="/control-operations/source-reduction/methods"
					/>
					<ControlMethodLookupPointer
						collectionKey="biocontrolMethods"
						records={biocontrolMethods}
						to="/control-operations/biocontrol/methods"
					/>
					<ControlAssetLookupList
						assets={vehicles}
						canManage={canManageAssets}
						collectionKey="vehicles"
						organization={organization}
					/>
					<ControlAssetLookupList
						assets={equipment}
						canManage={canManageAssets}
						collectionKey="equipment"
						organization={organization}
					/>
				</div>
			</div>
		</div>
	);
}

/**
 * Methods are managed on the control operations routes, next to the work that uses them.
 * This keeps their counts visible in settings and points at the one place that edits them.
 */
function ControlMethodLookupPointer({
	collectionKey,
	records,
	to,
}: {
	readonly collectionKey: Exclude<ControlMethodCollectionKey, 'outreachMethods'>;
	readonly records: CatalogRecords<ControlMethodRecord>;
	readonly to:
		| '/control-operations/chemical/methods'
		| '/control-operations/source-reduction/methods'
		| '/control-operations/biocontrol/methods';
}) {
	const config = controlMethodListConfigs[collectionKey];

	return (
		<LookupListFrame
			activeCount={records.activeRecords.length}
			inactiveCount={records.inactiveRecords.length}
			detail={config.detail}
			title={config.title}
			action={
				<Button asChild size="sm" variant="outline">
					<Link to={to}>
						Manage Methods
						<ArrowRightIcon aria-hidden="true" />
					</Link>
				</Button>
			}
		>
			<p className="m-0 rounded-md bg-background/60 px-2.5 py-2 text-sm text-muted-foreground">
				{config.title} are managed in Control Operations, alongside the work that uses them.
			</p>
		</LookupListFrame>
	);
}

export function ControlMethodLookupList({
	canManage,
	canEditMethods,
	collectionKey,
	mutations,
	records,
}: {
	/** Owner/admin: adding a method, and flipping one active or inactive. */
	readonly canManage: boolean;
	/**
	 * Manager-and-above: renaming a method and editing its custom fields. The
	 * server splits these two floors (`update*Method` is `MANAGER`, everything
	 * else about a method is `ADMIN`), so this list needs both.
	 */
	readonly canEditMethods: boolean;
	readonly collectionKey: ControlMethodCollectionKey;
	readonly mutations: CatalogMutations;
	readonly records: CatalogRecords<ControlMethodRecord>;
}) {
	const config = controlMethodListConfigs[collectionKey];
	const activeMethods = records.activeRecords;
	const inactiveMethods = records.inactiveRecords;

	return (
		<LookupListFrame
			activeCount={activeMethods.length}
			inactiveCount={inactiveMethods.length}
			detail={config.detail}
			title={config.title}
			action={
				// Hidden rather than disabled, per `components/write-only.tsx`: a
				// greyed-out Add asks the reader to work out why on every visit.
				canManage ? (
					<ControlMethodDrawer
						canEdit={canEditMethods}
						canManage={canManage}
						collectionKey={collectionKey}
						mutations={mutations}
						trigger={
							<Button type="button" variant="outline" size="sm">
								<AddIcon aria-hidden="true" />
								{config.addLabel}
							</Button>
						}
					/>
				) : null
			}
		>
			<ControlMethodTable
				canEditMethods={canEditMethods}
				canManage={canManage}
				collectionKey={collectionKey}
				methods={activeMethods}
				mutations={mutations}
			/>
			{inactiveMethods.length > 0 ? (
				<ControlMethodTable
					canEditMethods={canEditMethods}
					canManage={canManage}
					collectionKey={collectionKey}
					methods={inactiveMethods}
					mutations={mutations}
				/>
			) : null}
		</LookupListFrame>
	);
}

function ControlMethodTable({
	canEditMethods,
	canManage,
	collectionKey,
	methods,
	mutations,
}: {
	readonly canEditMethods: boolean;
	readonly canManage: boolean;
	readonly collectionKey: ControlMethodCollectionKey;
	readonly methods: readonly ControlMethodRecord[];
	readonly mutations: CatalogMutations;
}) {
	const config = controlMethodListConfigs[collectionKey];
	return (
		<div className="overflow-x-auto rounded-md border border-border/40">
			<Table>
				<TableHeader>
					<TableRow>
						<TableHead>{config.fieldLabel}</TableHead>
						<TableHead className="w-28">Status</TableHead>
						<TableHead className="w-[30%]">Custom Fields</TableHead>
						{canEditMethods ? <TableHead className="w-16 text-right">Edit</TableHead> : null}
					</TableRow>
				</TableHeader>
				<TableBody>
					{methods.map((method) => (
						<TableRow key={method.id}>
							<TableCell className="font-medium">{method.name}</TableCell>
							<TableCell>{method.isActive ? 'Active' : 'Inactive'}</TableCell>
							<TableCell>
								<CustomFieldsCell schema={method.customSchema} />
							</TableCell>
							{canEditMethods ? (
								<TableCell className="text-right">
									<ControlMethodDrawer
										canEdit={canEditMethods}
										canManage={canManage}
										collectionKey={collectionKey}
										method={method}
										mutations={mutations}
										trigger={
											<Button type="button" variant="outline" size="icon">
												<EditIcon aria-hidden="true" />
												<span className="sr-only">Edit {method.name}</span>
											</Button>
										}
									/>
								</TableCell>
							) : null}
						</TableRow>
					))}
				</TableBody>
			</Table>
		</div>
	);
}

function ControlMethodDrawer({
	canEdit,
	canManage,
	collectionKey,
	method,
	mutations,
	trigger,
}: {
	/** Manager-and-above: the name and the custom fields. */
	readonly canEdit: boolean;
	/** Owner/admin: creating a method, and the Active switch. */
	readonly canManage: boolean;
	readonly collectionKey: ControlMethodCollectionKey;
	readonly method?: ControlMethodRecord | undefined;
	readonly mutations: CatalogMutations;
	readonly trigger: React.ReactNode;
}) {
	// Creating is admin-only; editing an existing method is open to managers.
	const canSubmit = method === undefined ? canManage : canEdit;
	const [open, setOpen] = useState(false);
	const config = controlMethodListConfigs[collectionKey];
	const defaultValues = catalogFormValues(method);
	const form = useAppForm({
		defaultValues,
		validators: {
			onSubmit: () => (mutations.canWrite ? undefined : 'Organization details are still loading.'),
		},
		onSubmit: ({ value }) => {
			commitCatalogSave({
				failureMessage:
					method === undefined
						? `Unable to create ${config.singularLabel}.`
						: `Unable to save ${method.name}.`,
				onWritten: () => setOpen(false),
				save: () =>
					method === undefined
						? mutations.create(catalogFields(value)).then(() => undefined)
						: mutations.save(
								method.id,
								catalogFields(value),
								catalogFields(catalogFormValues(method)),
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
		<Drawer direction="right" open={open} onOpenChange={updateOpen}>
			<DrawerTrigger asChild>{trigger}</DrawerTrigger>
			<DrawerContent className="w-[min(680px,100%)] sm:max-w-[680px]">
				<DrawerHeader>
					<DrawerTitle>
						{method === undefined ? `Add ${config.singularLabel}` : `Edit ${method.name}`}
					</DrawerTitle>
					<DrawerDescription>
						Manage the label, lifecycle state, and optional custom fields.
					</DrawerDescription>
				</DrawerHeader>
				<form.AppForm>
					<form
						className="grid min-h-0 gap-3.5 overflow-y-auto px-4"
						onSubmit={(event) => {
							event.preventDefault();
							void form.handleSubmit();
						}}
					>
						<form.FormErrorAlert />
						<form.AppField
							name="name"
							validators={{
								onSubmit: ({ value }) =>
									value.trim().length === 0 ? `${config.fieldLabel} is required.` : undefined,
							}}
						>
							{(field) => (
								<field.TextField
									label={config.fieldLabel}
									disabled={!canSubmit}
									placeholder={config.placeholder}
								/>
							)}
						</form.AppField>
						{/* The lifecycle switch stays at the admin floor even inside an edit a
						    manager may make: flipping it emits `deactivate*Method` /
						    `reactivate*Method`, which the server holds at `ADMIN`. */}
						<form.AppField name="isActive">
							{(field) => <field.SwitchField label="Active" disabled={!canManage} />}
						</form.AppField>
						<form.AppField name="customSchema" validators={{ onSubmit: validateJsonSchemaValue }}>
							{(field) => <field.JsonSchemaField label="Custom Fields" disabled={!canSubmit} />}
						</form.AppField>
						<DrawerFooter className="px-0">
							<form.FormActions>
								<form.SubmitButton disabled={!canSubmit || !mutations.canWrite} />
								<DrawerClose asChild>
									<Button type="button" variant="outline">
										<CloseIcon data-icon="inline-start" aria-hidden="true" />
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

function ControlAssetLookupList({
	assets,
	canManage,
	collectionKey,
	organization,
}:
	| {
			readonly assets: Collection<VehicleRow, string | number>;
			readonly canManage: boolean;
			readonly collectionKey: 'vehicles';
			readonly organization: OrganizationRow | null;
	  }
	| {
			readonly assets: Collection<EquipmentRow, string | number>;
			readonly canManage: boolean;
			readonly collectionKey: 'equipment';
			readonly organization: OrganizationRow | null;
	  }) {
	if (collectionKey === 'vehicles') {
		return (
			<VehicleAssetLookupList assets={assets} canManage={canManage} organization={organization} />
		);
	}

	return (
		<EquipmentAssetLookupList assets={assets} canManage={canManage} organization={organization} />
	);
}

function VehicleAssetLookupList({
	assets,
	canManage,
	organization,
}: {
	readonly assets: Collection<VehicleRow, string | number>;
	readonly canManage: boolean;
	readonly organization: OrganizationRow | null;
}) {
	const { activeRows, inactiveRows } = useActiveVehicleRows(assets);

	return (
		<ControlAssetLookupContent
			activeAssets={activeRows}
			canManage={canManage}
			collectionKey="vehicles"
			inactiveAssets={inactiveRows}
			organization={organization}
		/>
	);
}

function EquipmentAssetLookupList({
	assets,
	canManage,
	organization,
}: {
	readonly assets: Collection<EquipmentRow, string | number>;
	readonly canManage: boolean;
	readonly organization: OrganizationRow | null;
}) {
	const { activeRows, inactiveRows } = useActiveEquipmentRows(assets);

	return (
		<ControlAssetLookupContent
			activeAssets={activeRows}
			canManage={canManage}
			collectionKey="equipment"
			inactiveAssets={inactiveRows}
			organization={organization}
		/>
	);
}

function ControlAssetLookupContent({
	activeAssets,
	canManage,
	collectionKey,
	inactiveAssets,
	organization,
}: {
	readonly activeAssets: readonly ControlAssetRow[];
	readonly canManage: boolean;
	readonly collectionKey: ControlAssetCollectionKey;
	readonly inactiveAssets: readonly ControlAssetRow[];
	readonly organization: OrganizationRow | null;
}) {
	const config = controlAssetListConfigs[collectionKey];

	return (
		<LookupListFrame
			activeCount={activeAssets.length}
			inactiveCount={inactiveAssets.length}
			detail={config.detail}
			title={config.title}
			action={
				// Hidden rather than disabled, per `components/write-only.tsx`. A
				// collector on this page used to see a greyed-out Add vehicle with
				// nothing saying why, which every other catalog surface avoids.
				canManage ? (
					<ControlAssetDrawer
						canManage={canManage}
						collectionKey={collectionKey}
						organization={organization}
						trigger={
							<Button type="button" variant="outline" size="sm">
								<AddIcon aria-hidden="true" />
								{config.addLabel}
							</Button>
						}
					/>
				) : null
			}
		>
			<ControlAssetTable
				assets={activeAssets}
				canManage={canManage}
				collectionKey={collectionKey}
				organization={organization}
			/>
			{inactiveAssets.length > 0 ? (
				<ControlAssetTable
					assets={inactiveAssets}
					canManage={canManage}
					collectionKey={collectionKey}
					organization={organization}
				/>
			) : null}
		</LookupListFrame>
	);
}

function useActiveVehicleRows(collection: Collection<VehicleRow, string | number>) {
	const activeResult = useLiveSuspenseQuery(
		(query) =>
			query
				.from({ vehicle: collection })
				.where(({ vehicle }) => eq(vehicle.isActive, true))
				.orderBy(({ vehicle }) => vehicle.vehicleName, 'asc'),
		[collection],
	);
	const inactiveResult = useLiveSuspenseQuery(
		(query) =>
			query
				.from({ vehicle: collection })
				.where(({ vehicle }) => eq(vehicle.isActive, false))
				.orderBy(({ vehicle }) => vehicle.vehicleName, 'asc'),
		[collection],
	);

	return {
		activeRows: activeResult.data,
		inactiveRows: inactiveResult.data,
	};
}

function useActiveEquipmentRows(collection: Collection<EquipmentRow, string | number>) {
	const activeResult = useLiveSuspenseQuery(
		(query) =>
			query
				.from({ equipment: collection })
				.where(({ equipment }) => eq(equipment.isActive, true))
				.orderBy(({ equipment }) => equipment.equipmentName, 'asc'),
		[collection],
	);
	const inactiveResult = useLiveSuspenseQuery(
		(query) =>
			query
				.from({ equipment: collection })
				.where(({ equipment }) => eq(equipment.isActive, false))
				.orderBy(({ equipment }) => equipment.equipmentName, 'asc'),
		[collection],
	);

	return {
		activeRows: activeResult.data,
		inactiveRows: inactiveResult.data,
	};
}

function ControlAssetTable({
	assets,
	canManage,
	collectionKey,
	organization,
}: {
	readonly assets: readonly ControlAssetRow[];
	readonly canManage: boolean;
	readonly collectionKey: ControlAssetCollectionKey;
	readonly organization: OrganizationRow | null;
}) {
	const config = controlAssetListConfigs[collectionKey];
	return (
		<div className="overflow-x-auto rounded-md border border-border/40">
			<Table>
				<TableHeader>
					<TableRow>
						<TableHead>{config.fieldLabel}</TableHead>
						{collectionKey === 'equipment' ? <TableHead>Serial Number</TableHead> : null}
						<TableHead className="w-28">Status</TableHead>
						<TableHead className="w-28">Metadata</TableHead>
						{canManage ? <TableHead className="w-16 text-right">Edit</TableHead> : null}
					</TableRow>
				</TableHeader>
				<TableBody>
					{assets.map((asset) => (
						<TableRow key={asset.id}>
							<TableCell className="font-medium">{controlAssetName(asset)}</TableCell>
							{collectionKey === 'equipment' ? (
								<TableCell>
									{isEquipmentRow(asset) ? (asset.serialNumber ?? 'Not set') : 'Not set'}
								</TableCell>
							) : null}
							<TableCell>{asset.isActive ? 'Active' : 'Inactive'}</TableCell>
							<TableCell>{hasMetadata(asset.metadata) ? 'Configured' : 'None'}</TableCell>
							{canManage ? (
								<TableCell className="text-right">
									<ControlAssetDrawer
										asset={asset}
										canManage={canManage}
										collectionKey={collectionKey}
										organization={organization}
										trigger={
											<Button type="button" variant="outline" size="icon">
												<EditIcon aria-hidden="true" />
												<span className="sr-only">Edit {controlAssetName(asset)}</span>
											</Button>
										}
									/>
								</TableCell>
							) : null}
						</TableRow>
					))}
				</TableBody>
			</Table>
		</div>
	);
}

function ControlAssetDrawer({
	asset,
	canManage,
	collectionKey,
	organization,
	trigger,
}: {
	readonly asset?: ControlAssetRow | undefined;
	readonly canManage: boolean;
	readonly collectionKey: ControlAssetCollectionKey;
	readonly organization: OrganizationRow | null;
	readonly trigger: React.ReactNode;
}) {
	const [open, setOpen] = useState(false);
	const config = controlAssetListConfigs[collectionKey];
	const defaultValues = controlAssetFormValues(asset);
	const form = useAppForm({
		defaultValues,
		validators: {
			onSubmit: () =>
				organization === null ? 'Organization details are still loading.' : undefined,
		},
		onSubmit: ({ value }) => {
			try {
				const transaction =
					asset === undefined
						? createControlAssetFromValues(collectionKey, organization, value)
						: updateControlAssetFromValues(collectionKey, asset, value);
				setOpen(false);
				watchPersistence(
					transaction,
					asset === undefined
						? `Unable to create ${config.singularLabel}.`
						: `Unable to save ${controlAssetName(asset)}.`,
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
		<Drawer direction="right" open={open} onOpenChange={updateOpen}>
			<DrawerTrigger asChild>{trigger}</DrawerTrigger>
			<DrawerContent className="w-[min(680px,100%)] sm:max-w-[680px]">
				<DrawerHeader>
					<DrawerTitle>
						{asset === undefined
							? `Add ${config.singularLabel}`
							: `Edit ${controlAssetName(asset)}`}
					</DrawerTitle>
					<DrawerDescription>
						Manage the label, lifecycle state, and optional metadata fields.
					</DrawerDescription>
				</DrawerHeader>
				<form.AppForm>
					<form
						className="grid min-h-0 gap-3.5 overflow-y-auto px-4"
						onSubmit={(event) => {
							event.preventDefault();
							void form.handleSubmit();
						}}
					>
						<form.FormErrorAlert />
						<form.AppField
							name="name"
							validators={{
								onSubmit: ({ value }) =>
									value.trim().length === 0 ? `${config.fieldLabel} is required.` : undefined,
							}}
						>
							{(field) => (
								<field.TextField
									label={config.fieldLabel}
									disabled={!canManage}
									placeholder={config.placeholder}
								/>
							)}
						</form.AppField>
						{collectionKey === 'equipment' ? (
							<form.AppField name="serialNumber">
								{(field) => (
									<field.TextField
										label="Serial number"
										disabled={!canManage}
										placeholder="e.g. SN-1042"
									/>
								)}
							</form.AppField>
						) : null}
						<form.AppField name="isActive">
							{(field) => <field.SwitchField label="Active" disabled={!canManage} />}
						</form.AppField>
						<form.AppField name="metadata" validators={{ onSubmit: validateMetadataValue }}>
							{(field) => (
								<field.MetadataField
									description={config.metadataDescription}
									disabled={!canManage}
									label="Metadata"
									mode={{ kind: 'manual' }}
								/>
							)}
						</form.AppField>
						<DrawerFooter className="px-0">
							<form.FormActions>
								<form.SubmitButton disabled={!canManage || organization === null} />
								<DrawerClose asChild>
									<Button type="button" variant="outline">
										<CloseIcon data-icon="inline-start" aria-hidden="true" />
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
