import type { MetadataValue } from '@simmer-mosquito/ui-web/components/form';
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
import { Link } from '@tanstack/react-router';
import { useState } from 'react';
import { catalogFields, catalogFormValues, commitCatalogSave } from '../../../components/catalog';
import { CustomFieldsCell } from '../../../components/custom-fields-cell';
import type { CatalogMutations } from '../../../hooks/mutations/use-catalog-mutations';
import {
	type ControlAssetFields,
	type ControlAssetMutations,
	useEquipmentMutations,
	useVehicleMutations,
} from '../../../hooks/mutations/use-control-asset-mutations';
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
	type ControlAssetRecord,
	useEquipmentRecords,
	useVehicleRecords,
} from '../../../hooks/queries/use-control-asset-records';
import { hasMetadata } from '../../../lib/record-display';
import {
	AddIcon,
	ArrowRightIcon,
	CloseIcon,
	controlAssetListConfigs,
	controlMethodListConfigs,
	EditIcon,
} from './constants';
import { LookupListFrame } from './layout/layout';
import type { ControlAssetCollectionKey, ControlMethodCollectionKey } from './types';

export function ControlOperationsSettings({
	canManageAssets,
}: {
	/**
	 * Vehicles and equipment are `MANAGER` on the server, not `ADMIN` — every
	 * one of `controlOperations.createVehicle` through `deleteEquipment`. The
	 * method entries beside them are links rather than editors, so this is the
	 * only floor this section needs.
	 */
	readonly canManageAssets: boolean;
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
					<VehicleLookupList canManage={canManageAssets} />
					<EquipmentLookupList canManage={canManageAssets} />
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

function VehicleLookupList({ canManage }: { readonly canManage: boolean }) {
	return (
		<ControlAssetLookupContent
			canManage={canManage}
			collectionKey="vehicles"
			mutations={useVehicleMutations()}
			records={useVehicleRecords()}
		/>
	);
}

function EquipmentLookupList({ canManage }: { readonly canManage: boolean }) {
	return (
		<ControlAssetLookupContent
			canManage={canManage}
			collectionKey="equipment"
			mutations={useEquipmentMutations()}
			records={useEquipmentRecords()}
		/>
	);
}

function ControlAssetLookupContent({
	canManage,
	collectionKey,
	mutations,
	records,
}: {
	readonly canManage: boolean;
	readonly collectionKey: ControlAssetCollectionKey;
	readonly mutations: ControlAssetMutations;
	readonly records: CatalogRecords<ControlAssetRecord>;
}) {
	const config = controlAssetListConfigs[collectionKey];
	const activeAssets = records.activeRecords;
	const inactiveAssets = records.inactiveRecords;

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
			<ControlAssetTable
				assets={activeAssets}
				canManage={canManage}
				collectionKey={collectionKey}
				mutations={mutations}
			/>
			{inactiveAssets.length > 0 ? (
				<ControlAssetTable
					assets={inactiveAssets}
					canManage={canManage}
					collectionKey={collectionKey}
					mutations={mutations}
				/>
			) : null}
		</LookupListFrame>
	);
}

function ControlAssetTable({
	assets,
	canManage,
	collectionKey,
	mutations,
}: {
	readonly assets: readonly ControlAssetRecord[];
	readonly canManage: boolean;
	readonly collectionKey: ControlAssetCollectionKey;
	readonly mutations: ControlAssetMutations;
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
							<TableCell className="font-medium">{asset.name}</TableCell>
							{collectionKey === 'equipment' ? (
								<TableCell>{asset.serialNumber ?? 'Not set'}</TableCell>
							) : null}
							<TableCell>{asset.isActive ? 'Active' : 'Inactive'}</TableCell>
							<TableCell>{hasMetadata(asset.metadata) ? 'Configured' : 'None'}</TableCell>
							{canManage ? (
								<TableCell className="text-right">
									<ControlAssetDrawer
										asset={asset}
										canManage={canManage}
										collectionKey={collectionKey}
										mutations={mutations}
										trigger={
											<Button type="button" variant="outline" size="icon">
												<EditIcon aria-hidden="true" />
												<span className="sr-only">Edit {asset.name}</span>
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
	mutations,
	trigger,
}: {
	readonly asset?: ControlAssetRecord | undefined;
	readonly canManage: boolean;
	readonly collectionKey: ControlAssetCollectionKey;
	readonly mutations: ControlAssetMutations;
	readonly trigger: React.ReactNode;
}) {
	const [open, setOpen] = useState(false);
	const config = controlAssetListConfigs[collectionKey];
	const defaultValues = controlAssetFormValues(asset);
	const form = useAppForm({
		defaultValues,
		validators: {
			onSubmit: () => (mutations.canWrite ? undefined : 'Organization details are still loading.'),
		},
		onSubmit: ({ value }) => {
			commitCatalogSave({
				failureMessage:
					asset === undefined
						? `Unable to create ${config.singularLabel}.`
						: `Unable to save ${asset.name}.`,
				onWritten: () => setOpen(false),
				save: () =>
					asset === undefined
						? mutations.create(controlAssetFields(value)).then(() => undefined)
						: mutations.save(
								asset.id,
								controlAssetFields(value),
								controlAssetFields(controlAssetFormValues(asset)),
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
						{asset === undefined ? `Add ${config.singularLabel}` : `Edit ${asset.name}`}
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
								<form.SubmitButton disabled={!canManage || !mutations.canWrite} />
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

/**
 * The drawer's values as the write hook takes them.
 *
 * A blank serial number is `null` rather than `''`, for the reason
 * `catalogFields` trims a description: a column that can hold both has two
 * spellings of "not set".
 */
function controlAssetFields(values: {
	readonly name: string;
	readonly serialNumber: string;
	readonly metadata: unknown;
	readonly isActive: boolean;
}): ControlAssetFields {
	const name = values.name.trim();
	if (name.length === 0) {
		throw new Error('Name is required.');
	}
	const serialNumber = values.serialNumber.trim();
	return {
		name,
		serialNumber: serialNumber.length === 0 ? null : serialNumber,
		metadata: values.metadata,
		isActive: values.isActive,
	};
}

/** Open the asset drawer on a record, or on a blank one. */
function controlAssetFormValues(asset: ControlAssetRecord | undefined): {
	readonly name: string;
	readonly serialNumber: string;
	readonly metadata: MetadataValue;
	readonly isActive: boolean;
} {
	const metadata = asset?.metadata;
	return {
		name: asset?.name ?? '',
		serialNumber: asset?.serialNumber ?? '',
		metadata:
			typeof metadata === 'object' && metadata !== null && !Array.isArray(metadata)
				? (metadata as MetadataValue)
				: null,
		isActive: asset?.isActive ?? true,
	};
}
