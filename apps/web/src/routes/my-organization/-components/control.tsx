import type { OrganizationSettings } from '@simmer-mosquito/domain';
import type {
	ControlMethodRow,
	EquipmentRow,
	OrganizationRow,
	VehicleRow,
} from '@simmer-mosquito/sync';
import { Badge } from '@simmer-mosquito/ui-web/components/ui/badge';
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
import { useState } from 'react';
import { toast } from 'sonner';
import { useAppForm } from '../../../forms';
import { validateJsonSchemaValue, validateMetadataValue } from '../../../forms/field-components';
import { useActiveNamedCollectionRows } from '../../../sync/useCollectionRows';
import {
	AddIcon,
	CloseIcon,
	controlAssetListConfigs,
	controlMethodListConfigs,
	EditIcon,
} from './constants';
import {
	controlAssetFormValues,
	controlAssetName,
	controlMethodFormValues,
	createControlAssetFromValues,
	createControlMethodFromValues,
	errorMessageForSave,
	hasMetadata,
	isEquipmentRow,
	saveControlSettingsFromValues,
	updateControlAssetFromValues,
	updateControlMethodFromValues,
	watchPersistence,
} from './helpers';
import { EditSettingsSheet, LookupListFrame } from './layout';
import type {
	ControlAssetCollectionKey,
	ControlAssetRow,
	ControlMethodCollectionKey,
} from './types';

export function ControlOperationsSettings({
	applicationMethods,
	biocontrolMethods,
	canManage,
	organization,
	settings,
	sourceReductionMethods,
	vehicles,
	equipment,
}: {
	readonly applicationMethods: Collection<ControlMethodRow, string | number>;
	readonly biocontrolMethods: Collection<ControlMethodRow, string | number>;
	readonly canManage: boolean;
	readonly organization: OrganizationRow | null;
	readonly settings: OrganizationSettings;
	readonly sourceReductionMethods: Collection<ControlMethodRow, string | number>;
	readonly vehicles: Collection<VehicleRow, string | number>;
	readonly equipment: Collection<EquipmentRow, string | number>;
}) {
	return (
		<div className="grid gap-3">
			<BatchTrackingGuide enabled={settings.controlOperations.trackInsecticideBatches} />
			<div className="grid gap-2">
				<h3 className="eyebrow mt-0.5 mb-0">Setup lists</h3>
				<div className="grid gap-3">
					<ControlMethodLookupList
						canManage={canManage}
						collectionKey="applicationMethods"
						methods={applicationMethods}
						organization={organization}
					/>
					<ControlMethodLookupList
						canManage={canManage}
						collectionKey="sourceReductionMethods"
						methods={sourceReductionMethods}
						organization={organization}
					/>
					<ControlMethodLookupList
						canManage={canManage}
						collectionKey="biocontrolMethods"
						methods={biocontrolMethods}
						organization={organization}
					/>
					<ControlAssetLookupList
						assets={vehicles}
						canManage={canManage}
						collectionKey="vehicles"
						organization={organization}
					/>
					<ControlAssetLookupList
						assets={equipment}
						canManage={canManage}
						collectionKey="equipment"
						organization={organization}
					/>
				</div>
			</div>
		</div>
	);
}

export function BatchTrackingGuide({ enabled }: { readonly enabled: boolean }) {
	return (
		<section className="grid gap-1 rounded-md border border-border/30 bg-muted/30 p-2.5">
			<div className="flex flex-wrap items-center justify-between gap-2">
				<strong className="text-[0.92rem] text-foreground">Batch tracking</strong>
				<Badge tone={enabled ? 'success' : 'neutral'} variant="outline">
					{enabled ? 'Enabled' : 'Disabled'}
				</Badge>
			</div>
			<p className="m-0 text-[0.84rem] leading-snug text-muted-foreground">
				Batch tracking controls whether treatment records ask crews to capture insecticide lot or
				batch details for traceability.
			</p>
		</section>
	);
}

export function ControlSettingsDrawer({
	canManage,
	organization,
	settings,
}: {
	readonly canManage: boolean;
	readonly organization: OrganizationRow | null;
	readonly settings: OrganizationSettings;
}) {
	return (
		<EditSettingsSheet
			description="Choose whether treatment records should capture insecticide lot or batch details."
			fields={[
				{
					kind: 'switch',
					label: 'Track insecticide batches',
					checked: settings.controlOperations.trackInsecticideBatches,
					editable: canManage,
				},
			]}
			onSave={(formData) =>
				saveControlSettingsFromValues(organization, settings, {
					trackInsecticideBatches: formData.get('Track insecticide batches') === 'true',
				})
			}
			title="Edit Control operations"
		/>
	);
}

export function ControlMethodLookupList({
	canManage,
	collectionKey,
	methods,
	organization,
}: {
	readonly canManage: boolean;
	readonly collectionKey: ControlMethodCollectionKey;
	readonly methods: Collection<ControlMethodRow, string | number>;
	readonly organization: OrganizationRow | null;
}) {
	const config = controlMethodListConfigs[collectionKey];
	const { activeRows: activeMethods, inactiveRows: inactiveMethods } =
		useActiveNamedCollectionRows(methods);

	return (
		<LookupListFrame
			activeCount={activeMethods.length}
			inactiveCount={inactiveMethods.length}
			detail={config.detail}
			title={config.title}
			action={
				<ControlMethodDrawer
					canManage={canManage}
					collectionKey={collectionKey}
					organization={organization}
					trigger={
						<Button type="button" variant="outline" size="sm" disabled={!canManage}>
							<AddIcon aria-hidden="true" />
							{config.addLabel}
						</Button>
					}
				/>
			}
		>
			<ControlMethodTable
				canManage={canManage}
				collectionKey={collectionKey}
				methods={activeMethods}
				organization={organization}
			/>
			{inactiveMethods.length > 0 ? (
				<ControlMethodTable
					canManage={canManage}
					collectionKey={collectionKey}
					methods={inactiveMethods}
					organization={organization}
				/>
			) : null}
		</LookupListFrame>
	);
}

export function ControlMethodTable({
	canManage,
	collectionKey,
	methods,
	organization,
}: {
	readonly canManage: boolean;
	readonly collectionKey: ControlMethodCollectionKey;
	readonly methods: readonly ControlMethodRow[];
	readonly organization: OrganizationRow | null;
}) {
	const config = controlMethodListConfigs[collectionKey];
	return (
		<div className="overflow-x-auto rounded-md border border-border/40">
			<Table>
				<TableHeader>
					<TableRow>
						<TableHead>{config.fieldLabel}</TableHead>
						<TableHead className="w-28">Status</TableHead>
						<TableHead className="w-32">Custom fields</TableHead>
						{canManage ? <TableHead className="w-16 text-right">Edit</TableHead> : null}
					</TableRow>
				</TableHeader>
				<TableBody>
					{methods.map((method) => (
						<TableRow key={method.id}>
							<TableCell className="font-medium">{method.name}</TableCell>
							<TableCell>{method.isActive ? 'Active' : 'Inactive'}</TableCell>
							<TableCell>{hasMetadata(method.customSchema) ? 'Configured' : 'None'}</TableCell>
							{canManage ? (
								<TableCell className="text-right">
									<ControlMethodDrawer
										canManage={canManage}
										collectionKey={collectionKey}
										method={method}
										organization={organization}
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

export function ControlMethodDrawer({
	canManage,
	collectionKey,
	method,
	organization,
	trigger,
}: {
	readonly canManage: boolean;
	readonly collectionKey: ControlMethodCollectionKey;
	readonly method?: ControlMethodRow | undefined;
	readonly organization: OrganizationRow | null;
	readonly trigger: React.ReactNode;
}) {
	const [open, setOpen] = useState(false);
	const config = controlMethodListConfigs[collectionKey];
	const defaultValues = controlMethodFormValues(method);
	const form = useAppForm({
		defaultValues,
		validators: {
			onSubmit: () =>
				organization === null ? 'Organization details are still loading.' : undefined,
		},
		onSubmit: ({ value }) => {
			try {
				const transaction =
					method === undefined
						? createControlMethodFromValues(collectionKey, organization, value)
						: updateControlMethodFromValues(collectionKey, method, value);
				setOpen(false);
				watchPersistence(
					transaction,
					method === undefined
						? `Unable to create ${config.singularLabel}.`
						: `Unable to save ${method.name}.`,
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
									disabled={!canManage}
									placeholder={config.placeholder}
								/>
							)}
						</form.AppField>
						<form.AppField name="isActive">
							{(field) => <field.SwitchField label="Active" disabled={!canManage} />}
						</form.AppField>
						<form.AppField name="customSchema" validators={{ onSubmit: validateJsonSchemaValue }}>
							{(field) => <field.JsonSchemaField label="Custom Fields" disabled={!canManage} />}
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

export function ControlAssetLookupList({
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
				<ControlAssetDrawer
					canManage={canManage}
					collectionKey={collectionKey}
					organization={organization}
					trigger={
						<Button type="button" variant="outline" size="sm" disabled={!canManage}>
							<AddIcon aria-hidden="true" />
							{config.addLabel}
						</Button>
					}
				/>
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

export function ControlAssetTable({
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
						{collectionKey === 'equipment' ? <TableHead>Serial number</TableHead> : null}
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

export function ControlAssetDrawer({
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
