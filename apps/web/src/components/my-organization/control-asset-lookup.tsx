import type { MetadataValue } from '@simmer-mosquito/ui-web/components/form';
import { useAppForm, validateMetadataValue } from '@simmer-mosquito/ui-web/components/form';
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
import { useState } from 'react';
import type {
	ControlAssetFields,
	ControlAssetMutations,
} from '../../hooks/mutations/control-asset-fields';
import { useEquipmentMutations } from '../../hooks/mutations/use-equipment-mutations';
import { useVehicleMutations } from '../../hooks/mutations/use-vehicle-mutations';
import type { CatalogRecords } from '../../hooks/queries/catalog-record-view';
import type { ControlAssetRecord } from '../../hooks/queries/control-asset-record-view';
import { useEquipmentRecords } from '../../hooks/queries/use-equipment-records';
import { useVehicleRecords } from '../../hooks/queries/use-vehicle-records';
import { useAcknowledgedWrite } from '../../hooks/use-acknowledged-write';
import { EQUIPMENT_SAVE_REFUSALS, VEHICLE_SAVE_REFUSALS } from '../../lib/acknowledgement-copy';
import { hasMetadata } from '../../lib/record-display';
import { commitCatalogSave } from '../catalog';
import { AddIcon, CloseIcon, controlAssetListConfigs, EditIcon } from './constants';
import { LookupListFrame } from './layout/lookup-list-frame';
import type { ControlAssetCollectionKey } from './types';

export function VehicleLookupList({ canManage }: { readonly canManage: boolean }) {
	return (
		<ControlAssetLookupContent
			canManage={canManage}
			collectionKey="vehicles"
			mutations={useVehicleMutations()}
			records={useVehicleRecords()}
		/>
	);
}

export function EquipmentLookupList({ canManage }: { readonly canManage: boolean }) {
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
	// One drawer serves both kinds, and each takes its own flag, so the map is
	// picked by the kind rather than shared: a vehicle's page must not be able to
	// offer an answer about equipment. Held out here rather than inside the
	// drawer's content, which unmounts — `commitCatalogSave` closes on the way
	// past, before the server has answered.
	const { run, dialog } = useAcknowledgedWrite({
		askable: collectionKey === 'vehicles' ? VEHICLE_SAVE_REFUSALS : EQUIPMENT_SAVE_REFUSALS,
		ask: true,
	});
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
				// A create has no history to relabel, so only the edit goes through
				// `run`. `run` swallows a refusal a flag can answer and turns it into
				// the dialog; anything else still reaches the toast here.
				save: () =>
					asset === undefined
						? mutations.create(controlAssetFields(value)).then(() => undefined)
						: run((acknowledgements) =>
								mutations.save(
									asset.id,
									controlAssetFields(value),
									controlAssetFields(controlAssetFormValues(asset)),
									acknowledgements,
								),
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
		<>
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
			{dialog}
		</>
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
