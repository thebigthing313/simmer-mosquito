import type { OrganizationSettings } from '@simmer-mosquito/domain';
import type {
	InsecticideBatchRow,
	InsecticideRow,
	OrganizationRow,
	UnitRow,
} from '@simmer-mosquito/sync';
import {
	Accordion,
	AccordionContent,
	AccordionItem,
	AccordionTrigger,
} from '@simmer-mosquito/ui-web/components/ui/accordion';
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
import { type Collection, eq, inArray, useLiveSuspenseQuery } from '@tanstack/react-db';
import type React from 'react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { useAppForm } from '../../../forms';
import { validateMetadataValue } from '../../../forms/field-components';
import { AddIcon, CloseIcon, EditIcon, insecticideTypeOptions } from './constants';
import {
	createInsecticideBatchFromValues,
	createInsecticideFromValues,
	errorMessageForSave,
	formatMode,
	hasMetadata,
	insecticideBatchFormValues,
	insecticideFormValues,
	saveControlSettingsFromValues,
	updateInsecticideBatchFromValues,
	updateInsecticideFromValues,
	watchPersistence,
} from './helpers';
import { EditSettingsSheet, LookupListFrame } from './layout';

export function InsecticideSettings({
	canManage,
	createBatchCollection,
	insecticides,
	organization,
	settings,
	units,
}: {
	readonly canManage: boolean;
	readonly createBatchCollection: (
		insecticideId: string,
	) => Collection<InsecticideBatchRow, string | number>;
	readonly insecticides: Collection<InsecticideRow, string | number>;
	readonly organization: OrganizationRow | null;
	readonly settings: OrganizationSettings;
	readonly units: Collection<UnitRow, string | number>;
}) {
	const { activeRows: activeInsecticides, inactiveRows: inactiveInsecticides } =
		useActiveInsecticideRows(insecticides);
	const unitRows = useUnitRows(units);
	const allInsecticides = [...activeInsecticides, ...inactiveInsecticides];
	const batchTrackingEnabled = settings.controlOperations.trackInsecticideBatches;

	return (
		<div className="grid gap-3">
			<BatchTrackingGuide enabled={batchTrackingEnabled} />
			<div className="grid gap-2">
				<h3 className="eyebrow mt-0.5 mb-0">Setup lists</h3>
				<div className="grid gap-3">
					<LookupListFrame
						activeCount={activeInsecticides.length}
						inactiveCount={inactiveInsecticides.length}
						detail="Products used for chemical control, including active ingredient, registration, and default usage unit."
						title="Insecticides"
						action={
							<InsecticideDrawer
								canManage={canManage}
								organization={organization}
								trigger={
									<Button type="button" variant="outline" size="sm" disabled={!canManage}>
										<AddIcon aria-hidden="true" />
										Add insecticide
									</Button>
								}
								units={unitRows}
							/>
						}
					>
						<InsecticideTable
							canManage={canManage}
							insecticides={activeInsecticides}
							organization={organization}
							units={unitRows}
						/>
						{inactiveInsecticides.length > 0 ? (
							<InsecticideTable
								canManage={canManage}
								insecticides={inactiveInsecticides}
								organization={organization}
								units={unitRows}
							/>
						) : null}
					</LookupListFrame>
					<LookupListFrame
						detail="Lot or batch labels tied to insecticides for traceability on treatment records."
						title="Batches"
					>
						{batchTrackingEnabled ? null : <BatchTrackingDisabledNotice />}
						<InsecticideBatchAccordion
							canManage={canManage && batchTrackingEnabled}
							createBatchCollection={createBatchCollection}
							disabled={!batchTrackingEnabled}
							insecticides={allInsecticides}
							organization={organization}
						/>
					</LookupListFrame>
				</div>
			</div>
		</div>
	);
}

export function InsecticideBatchTrackingDrawer({
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
			title="Edit batch tracking"
		/>
	);
}

function BatchTrackingGuide({ enabled }: { readonly enabled: boolean }) {
	return (
		<section className="grid gap-1 rounded-md border border-border/30 bg-muted/30 p-2.5">
			<div className="flex flex-wrap items-center justify-between gap-2">
				<strong className="text-[0.92rem] text-foreground">Batch tracking</strong>
				<Badge tone={enabled ? 'success' : 'neutral'} variant="outline">
					{enabled ? 'Enabled' : 'Disabled'}
				</Badge>
			</div>
			<p className="m-0 text-[0.84rem] leading-snug text-muted-foreground">
				Controls whether treatment records ask crews to capture insecticide lot or batch details for
				traceability.
			</p>
		</section>
	);
}

function BatchTrackingDisabledNotice() {
	return (
		<div className="grid gap-1 rounded-md border border-border/40 bg-muted/40 px-2.5 py-2">
			<div className="flex flex-wrap items-center gap-2">
				<strong className="text-[0.86rem] text-foreground">Batch table disabled</strong>
				<Badge tone="neutral" variant="outline">
					Tracking off
				</Badge>
			</div>
			<p className="m-0 text-[0.8rem] leading-snug text-muted-foreground">
				Saved batches are retained here, but treatment records will not ask crews to select a batch
				until tracking is enabled.
			</p>
		</div>
	);
}

function useActiveInsecticideRows(collection: Collection<InsecticideRow, string | number>) {
	const activeResult = useLiveSuspenseQuery(
		(query) =>
			query
				.from({ insecticide: collection })
				.where(({ insecticide }) => eq(insecticide.isActive, true))
				.orderBy(({ insecticide }) => insecticide.tradeName, 'asc'),
		[collection],
	);
	const inactiveResult = useLiveSuspenseQuery(
		(query) =>
			query
				.from({ insecticide: collection })
				.where(({ insecticide }) => eq(insecticide.isActive, false))
				.orderBy(({ insecticide }) => insecticide.tradeName, 'asc'),
		[collection],
	);

	return {
		activeRows: activeResult.data,
		inactiveRows: inactiveResult.data,
	};
}

function useUnitRows(collection: Collection<UnitRow, string | number>) {
	return useLiveSuspenseQuery(
		(query) =>
			query
				.from({ unit: collection })
				.where(({ unit }) => inArray(unit.unitType, ['volume', 'weight', 'count']))
				.orderBy(({ unit }) => unit.unitType, 'asc')
				.orderBy(({ unit }) => unit.unitName, 'asc'),
		[collection],
	).data;
}

function InsecticideTable({
	canManage,
	insecticides,
	organization,
	units,
}: {
	readonly canManage: boolean;
	readonly insecticides: readonly InsecticideRow[];
	readonly organization: OrganizationRow | null;
	readonly units: readonly UnitRow[];
}) {
	return (
		<div className="overflow-x-auto rounded-md border border-border/40">
			<Table>
				<TableHeader>
					<TableRow>
						<TableHead>Trade name</TableHead>
						<TableHead>Active ingredient</TableHead>
						<TableHead className="w-28">Type</TableHead>
						<TableHead className="w-36">Default usage unit</TableHead>
						<TableHead className="w-28">Status</TableHead>
						<TableHead className="w-28">Metadata</TableHead>
						{canManage ? <TableHead className="w-16 text-right">Edit</TableHead> : null}
					</TableRow>
				</TableHeader>
				<TableBody>
					{insecticides.map((insecticide) => (
						<TableRow key={insecticide.id}>
							<TableCell className="font-medium">
								{insecticide.shorthand ?? insecticide.tradeName}
							</TableCell>
							<TableCell>{insecticide.activeIngredient}</TableCell>
							<TableCell>{formatMode(insecticide.type)}</TableCell>
							<TableCell>{unitLabel(units, insecticide.defaultUnitId)}</TableCell>
							<TableCell>{insecticide.isActive ? 'Active' : 'Inactive'}</TableCell>
							<TableCell>{hasMetadata(insecticide.metadata) ? 'Configured' : 'None'}</TableCell>
							{canManage ? (
								<TableCell className="text-right">
									<InsecticideDrawer
										canManage={canManage}
										insecticide={insecticide}
										organization={organization}
										trigger={
											<Button type="button" variant="outline" size="icon">
												<EditIcon aria-hidden="true" />
												<span className="sr-only">Edit {insecticide.tradeName}</span>
											</Button>
										}
										units={units}
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

function InsecticideDrawer({
	canManage,
	insecticide,
	organization,
	trigger,
	units,
}: {
	readonly canManage: boolean;
	readonly insecticide?: InsecticideRow | undefined;
	readonly organization: OrganizationRow | null;
	readonly trigger: React.ReactNode;
	readonly units: readonly UnitRow[];
}) {
	const [open, setOpen] = useState(false);
	const defaultValues = insecticideFormValues(insecticide, units[0]?.id ?? '');
	const unitOptions = useMemo(() => units.map(unitOption), [units]);
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
		<Drawer direction="right" open={open} onOpenChange={updateOpen}>
			<DrawerTrigger asChild>{trigger}</DrawerTrigger>
			<DrawerContent className="w-[min(720px,100%)] overflow-hidden sm:max-w-[720px]">
				<DrawerHeader className="sticky top-0 z-10 border-b border-border/40 bg-background/95 backdrop-blur">
					<DrawerTitle>
						{insecticide === undefined ? 'Add insecticide' : `Edit ${insecticide.tradeName}`}
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
								{(field) => <field.SwitchField label="Active" disabled={!canManage} />}
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
										label="Trade name"
										disabled={!canManage}
										placeholder="e.g. VectoBac 12AS"
									/>
								)}
							</form.AppField>
							<form.AppField name="shorthand">
								{(field) => (
									<field.TextField
										label="Shorthand"
										disabled={!canManage}
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
										label="Active ingredient"
										disabled={!canManage}
										placeholder="e.g. Bacillus thuringiensis israelensis"
									/>
								)}
							</form.AppField>
							<form.AppField name="type">
								{(field) => (
									<field.SelectField
										label="Type"
										disabled={!canManage}
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
										label="Registration"
										disabled={!canManage}
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
										label="Default usage unit"
										disabled={!canManage || unitOptions.length === 0}
										options={unitOptions}
									/>
								)}
							</form.AppField>
							<form.AppField name="labelUrl">
								{(field) => (
									<field.UrlField
										label="Label URL"
										disabled={!canManage}
										placeholder="https://..."
									/>
								)}
							</form.AppField>
							<form.AppField name="msdsUrl">
								{(field) => (
									<field.UrlField label="SDS URL" disabled={!canManage} placeholder="https://..." />
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
							<form.FormActions>
								<form.SubmitButton
									disabled={!canManage || organization === null || unitOptions.length === 0}
								/>
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

function InsecticideBatchAccordion({
	canManage,
	createBatchCollection,
	disabled,
	insecticides,
	organization,
}: {
	readonly canManage: boolean;
	readonly createBatchCollection: (
		insecticideId: string,
	) => Collection<InsecticideBatchRow, string | number>;
	readonly disabled: boolean;
	readonly insecticides: readonly InsecticideRow[];
	readonly organization: OrganizationRow | null;
}) {
	const defaultValue = insecticides.slice(0, 4).map((insecticide) => insecticide.id);

	if (insecticides.length === 0) {
		return (
			<div className="rounded-md border border-border/40 bg-background px-3 py-2.5 text-[0.84rem] text-muted-foreground">
				Add an insecticide before tracking batches.
			</div>
		);
	}

	return (
		<Accordion
			type="multiple"
			defaultValue={defaultValue}
			aria-disabled={disabled}
			className="rounded-md border border-border/40 bg-background data-[disabled=true]:bg-muted/30 data-[disabled=true]:opacity-80"
			data-disabled={disabled}
		>
			{insecticides.map((insecticide) => (
				<InsecticideBatchAccordionItem
					key={insecticide.id}
					canManage={canManage}
					createBatchCollection={createBatchCollection}
					disabled={disabled}
					insecticide={insecticide}
					insecticides={insecticides}
					organization={organization}
				/>
			))}
		</Accordion>
	);
}

function InsecticideBatchAccordionItem({
	canManage,
	createBatchCollection,
	disabled,
	insecticide,
	insecticides,
	organization,
}: {
	readonly canManage: boolean;
	readonly createBatchCollection: (
		insecticideId: string,
	) => Collection<InsecticideBatchRow, string | number>;
	readonly disabled: boolean;
	readonly insecticide: InsecticideRow;
	readonly insecticides: readonly InsecticideRow[];
	readonly organization: OrganizationRow | null;
}) {
	const collection = useMemo(
		() => createBatchCollection(insecticide.id),
		[createBatchCollection, insecticide.id],
	);
	const batches = useInsecticideBatches(collection, insecticide.id);

	return (
		<AccordionItem value={insecticide.id} className="border-border/40 px-2">
			<AccordionTrigger className="py-3 hover:no-underline">
				<span className="grid min-w-0 gap-1">
					<span className="flex flex-wrap items-center gap-2">
						<span className="wrap-anywhere text-[0.9rem] font-semibold text-foreground">
							{insecticideLabel(insecticides, insecticide.id)}
						</span>
						{insecticide.isActive ? null : (
							<Badge tone="neutral" variant="outline">
								Inactive
							</Badge>
						)}
					</span>
					<span className="text-[0.78rem] font-normal text-muted-foreground">
						{batchGroupSummary(batches)}
					</span>
				</span>
			</AccordionTrigger>
			<AccordionContent className="grid gap-2 pb-3">
				<div className="flex justify-end">
					<InsecticideBatchDrawer
						canManage={canManage}
						collection={collection}
						defaultInsecticideId={insecticide.id}
						insecticides={insecticides}
						lockInsecticide
						organization={organization}
						trigger={
							<Button type="button" variant="outline" size="sm" disabled={!canManage}>
								<AddIcon aria-hidden="true" />
								Add batch
							</Button>
						}
					/>
				</div>
				<InsecticideBatchTable
					batches={batches}
					canManage={canManage}
					collection={collection}
					disabled={disabled}
					insecticides={insecticides}
					organization={organization}
				/>
			</AccordionContent>
		</AccordionItem>
	);
}

function useInsecticideBatches(
	collection: Collection<InsecticideBatchRow, string | number>,
	insecticideId: string,
) {
	return useLiveSuspenseQuery(
		(query) =>
			query
				.from({ batch: collection })
				.where(({ batch }) => eq(batch.insecticideId, insecticideId))
				.orderBy(({ batch }) => batch.isActive, 'desc')
				.orderBy(({ batch }) => batch.batchName, 'asc'),
		[collection, insecticideId],
	).data;
}

function InsecticideBatchTable({
	batches,
	canManage,
	collection,
	disabled,
	insecticides,
	organization,
}: {
	readonly batches: readonly InsecticideBatchRow[];
	readonly canManage: boolean;
	readonly collection: Collection<InsecticideBatchRow, string | number>;
	readonly disabled: boolean;
	readonly insecticides: readonly InsecticideRow[];
	readonly organization: OrganizationRow | null;
}) {
	if (batches.length === 0) {
		return (
			<div className="rounded-md border border-dashed border-border/50 px-3 py-2 text-[0.82rem] text-muted-foreground">
				No batches recorded.
			</div>
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
						<TableHead className="w-28">Status</TableHead>
						{canManage ? <TableHead className="w-16 text-right">Edit</TableHead> : null}
					</TableRow>
				</TableHeader>
				<TableBody>
					{batches.map((batch) => (
						<TableRow key={batch.id}>
							<TableCell className="font-medium">{batch.batchName}</TableCell>
							<TableCell>
								{disabled ? (
									<span className="font-medium text-muted-foreground">Tracking off</span>
								) : batch.isActive ? (
									'Active'
								) : (
									'Inactive'
								)}
							</TableCell>
							{canManage ? (
								<TableCell className="text-right">
									<InsecticideBatchDrawer
										batch={batch}
										canManage={canManage}
										collection={collection}
										insecticides={insecticides}
										organization={organization}
										trigger={
											<Button type="button" variant="outline" size="icon">
												<EditIcon aria-hidden="true" />
												<span className="sr-only">Edit {batch.batchName}</span>
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

function InsecticideBatchDrawer({
	batch,
	canManage,
	collection,
	defaultInsecticideId,
	insecticides,
	lockInsecticide = false,
	organization,
	trigger,
}: {
	readonly batch?: InsecticideBatchRow | undefined;
	readonly canManage: boolean;
	readonly collection: Collection<InsecticideBatchRow, string | number>;
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
	const insecticideOptions = useMemo(
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
						? createInsecticideBatchFromValues(collection, organization, value)
						: updateInsecticideBatchFromValues(collection, batch, value);
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
		<Drawer direction="right" open={open} onOpenChange={updateOpen}>
			<DrawerTrigger asChild>{trigger}</DrawerTrigger>
			<DrawerContent className="w-[min(560px,100%)] overflow-hidden sm:max-w-[560px]">
				<DrawerHeader className="sticky top-0 z-10 border-b border-border/40 bg-background/95 backdrop-blur">
					<DrawerTitle>{batch === undefined ? 'Add batch' : `Edit ${batch.batchName}`}</DrawerTitle>
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
								{(field) => <field.SwitchField label="Active" disabled={!canManage} />}
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
										label="Insecticide"
										disabled={
											!canManage ||
											batch !== undefined ||
											lockInsecticide ||
											insecticideOptions.length === 0
										}
										options={insecticideOptions}
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
										label="Batch name"
										disabled={!canManage}
										placeholder="e.g. Lot 24-018"
									/>
								)}
							</form.AppField>
						</div>
						<DrawerFooter>
							<form.FormActions>
								<form.SubmitButton
									disabled={!canManage || organization === null || insecticideOptions.length === 0}
								/>
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

function unitOption(unit: UnitRow) {
	return {
		label:
			unit.abbreviation.length === 0 ? unit.unitName : `${unit.unitName} (${unit.abbreviation})`,
		value: unit.id,
	};
}

function insecticideOption(insecticide: InsecticideRow) {
	return {
		label: insecticide.shorthand ?? insecticide.tradeName,
		value: insecticide.id,
	};
}

function unitLabel(units: readonly UnitRow[], unitId: string): string {
	const unit = units.find((item) => item.id === unitId);
	return unit === undefined ? 'Not set' : unit.abbreviation || unit.unitName;
}

function insecticideLabel(insecticides: readonly InsecticideRow[], insecticideId: string): string {
	const insecticide = insecticides.find((item) => item.id === insecticideId);
	return insecticide === undefined ? 'Not set' : (insecticide.shorthand ?? insecticide.tradeName);
}

function batchGroupSummary(batches: readonly InsecticideBatchRow[]): string {
	if (batches.length === 0) {
		return 'No batches recorded';
	}
	const activeCount = batches.filter((batch) => batch.isActive).length;
	const inactiveCount = batches.length - activeCount;
	return `${activeCount} active, ${inactiveCount} inactive`;
}
