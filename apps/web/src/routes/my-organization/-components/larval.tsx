import type {
	LarvalDensityRange,
	LarvalDensityRanges,
	LarvalInspectionEntryMode,
	OrganizationSettings,
	ResolvedLarvalInspectionEntryPolicy,
} from '@simmer-mosquito/domain';
import type { OrganizationRow } from '@simmer-mosquito/sync';
import { useAppForm, validateJsonSchemaValue } from '@simmer-mosquito/ui-web/components/form';
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
import { Field, FieldLabel } from '@simmer-mosquito/ui-web/components/ui/field';
import { Input } from '@simmer-mosquito/ui-web/components/ui/input';
import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '@simmer-mosquito/ui-web/components/ui/select';
import {
	Sheet,
	SheetClose,
	SheetContent,
	SheetDescription,
	SheetFooter,
	SheetHeader,
	SheetTitle,
	SheetTrigger,
} from '@simmer-mosquito/ui-web/components/ui/sheet';
import { Switch } from '@simmer-mosquito/ui-web/components/ui/switch';
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from '@simmer-mosquito/ui-web/components/ui/table';
import type { Collection } from '@tanstack/react-db';
import { useState } from 'react';
import { toast } from 'sonner';
import { catalogFields, catalogFormValues, commitCatalogSave } from '../../../components/catalog';
import { CustomFieldsCell } from '../../../components/custom-fields-cell';
import { EmptyValue } from '../../../components/empty-value';
import {
	type CatalogMutations,
	useHabitatTypeMutations,
} from '../../../hooks/mutations/use-catalog-mutations';
import {
	type SchemaCatalogRecord,
	useHabitatTypeRecords,
} from '../../../hooks/queries/use-catalog-records';
import {
	AddIcon,
	CloseIcon,
	densityRangeKeys,
	EditIcon,
	larvalEntryModeOptions,
	SaveIcon,
} from './constants';
import {
	densityKeyForSettings,
	densityLabel,
	densityRangeFormValues,
	densityRangesFromFormValues,
	errorMessageForSave,
	formatDensityRange,
	safeDensityRangesFromFormValues,
	saveLarvalSettingsFromValues,
	watchPersistence,
} from './helpers';
import { LookupListFrame, SettingChoiceCard } from './layout/layout';
import type {
	DensityRangeFormValue,
	DensityRangeFormValues,
	DensityRangeKey,
	LarvalDensityDisplayKey,
} from './types';

export function LarvalSurveillanceSettings({
	canManage,
	policy,
}: {
	readonly canManage: boolean;
	readonly policy: ResolvedLarvalInspectionEntryPolicy;
}) {
	return (
		<div className="grid gap-3">
			<LarvalEntryPolicyGuide policy={policy} />
			<div className="grid gap-2">
				<h3 className="eyebrow mt-0.5 mb-0">Setup Lists</h3>
				<HabitatTypeLookupList canManage={canManage} />
			</div>
		</div>
	);
}

function LarvalEntryPolicyGuide({
	policy,
	showDensityRanges = true,
}: {
	readonly policy: ResolvedLarvalInspectionEntryPolicy;
	readonly showDensityRanges?: boolean;
}) {
	return (
		<section className="grid gap-2 rounded-md border border-border/30 bg-muted/30 p-2.5">
			<div className="grid gap-1">
				<span className="font-medium text-sm text-foreground">Inspection entry mode</span>
				<p className="m-0 text-sm leading-snug text-muted-foreground">
					This controls whether larval inspection forms collect a density category, a dip count, or
					both.
				</p>
			</div>
			<div className="grid gap-2 md:grid-cols-3">
				<SettingChoiceCard
					active={policy.mode === 'density_only'}
					description="Crews choose a density category without entering larvae counts."
					title="Density Only"
				>
					<Field className="gap-1">
						<FieldLabel>Density</FieldLabel>
						<Input disabled readOnly value="Medium" />
					</Field>
				</SettingChoiceCard>
				<SettingChoiceCard
					active={policy.mode === 'count_and_dips_required'}
					description="Crews enter larvae counts and dip counts; density can be inferred."
					title="Count and Dips Required"
				>
					<div className="grid grid-cols-2 gap-2">
						<Field className="gap-1">
							<FieldLabel>Larvae</FieldLabel>
							<Input disabled readOnly value="12" />
						</Field>
						<Field className="gap-1">
							<FieldLabel>Dips</FieldLabel>
							<Input disabled readOnly value="6" />
						</Field>
					</div>
				</SettingChoiceCard>
				<SettingChoiceCard
					active={policy.mode === 'hybrid'}
					description="Crews can record density, counts and dips, or both depending on the inspection."
					title="Hybrid"
				/>
			</div>
			{showDensityRanges ? <DensityRangesDisplay ranges={policy.densityRanges} /> : null}
		</section>
	);
}

function DensityRangesDisplay({ ranges }: { readonly ranges: LarvalDensityRanges | null }) {
	return (
		<SettingChoiceCard
			badge={
				<Badge tone={ranges === null ? 'neutral' : 'info'} variant="outline">
					{ranges === null ? 'Disabled' : 'Configured'}
				</Badge>
			}
			description="The app uses larvae per dip to infer density. Zero larvae is always None."
			title="Density inference"
		>
			<div className="grid gap-2 md:grid-cols-5">
				<DensityRangeTile density="none" range={null} />
				{densityRangeKeys.map((density) => (
					<DensityRangeTile
						density={density}
						key={density}
						range={ranges?.[densityKeyForSettings(density)] ?? null}
					/>
				))}
			</div>
		</SettingChoiceCard>
	);
}

function DensityRangeTile({
	density,
	range,
}: {
	readonly density: LarvalDensityDisplayKey;
	readonly range: LarvalDensityRange | null;
}) {
	const label = densityLabel(density);
	return (
		<div className="grid gap-1 rounded-md border border-border/30 bg-muted/30 p-2">
			<span className="text-xs font-medium text-muted-foreground">{label}</span>
			<span className="font-medium text-sm text-foreground">
				{density === 'none' ? '0 larvae' : formatDensityRange(range)}
			</span>
		</div>
	);
}

export function LarvalSettingsDrawer({
	canManage,
	organization,
	settings,
}: {
	readonly canManage: boolean;
	readonly organization: OrganizationRow | null;
	readonly settings: OrganizationSettings;
}) {
	const policy = settings.larvalSurveillance.inspectionEntryPolicy;
	const [open, setOpen] = useState(false);
	const [mode, setMode] = useState<LarvalInspectionEntryMode>(policy.mode);
	const [densityEnabled, setDensityEnabled] = useState(policy.densityRanges !== null);
	const [ranges, setRanges] = useState<DensityRangeFormValues>(() =>
		densityRangeFormValues(policy.densityRanges),
	);
	const [error, setError] = useState<string | null>(null);
	const previewDensityRanges = densityEnabled ? safeDensityRangesFromFormValues(ranges) : null;

	function updateOpen(nextOpen: boolean) {
		if (nextOpen) {
			setMode(policy.mode);
			setDensityEnabled(policy.densityRanges !== null);
			setRanges(densityRangeFormValues(policy.densityRanges));
			setError(null);
		}
		setOpen(nextOpen);
	}

	function submit(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setError(null);
		try {
			const transaction = saveLarvalSettingsFromValues(organization, settings, {
				mode,
				densityRanges: densityEnabled ? densityRangesFromFormValues(ranges) : null,
			});
			setOpen(false);
			watchPersistence(transaction, 'Unable to save larval settings.');
		} catch (saveError) {
			setError(errorMessageForSave(saveError));
		}
	}

	return (
		<Sheet open={open} onOpenChange={updateOpen}>
			<SheetTrigger asChild>
				<Button type="button" variant="outline" size="sm">
					<EditIcon aria-hidden="true" />
					Edit
				</Button>
			</SheetTrigger>
			<SheetContent className="w-[min(680px,100%)] sm:max-w-[680px]">
				<SheetHeader>
					<SheetTitle>Edit Larval Surveillance</SheetTitle>
					<SheetDescription>
						Adjust inspection entry rules and optional density inference ranges.
					</SheetDescription>
				</SheetHeader>
				<form className="grid gap-3.5 px-4" onSubmit={submit}>
					<Field className="min-w-0 gap-1">
						<FieldLabel>Entry mode</FieldLabel>
						<Select
							value={mode}
							disabled={!canManage}
							onValueChange={(value) => setMode(value as LarvalInspectionEntryMode)}
						>
							<SelectTrigger size="sm" className="w-full">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectGroup>
									{larvalEntryModeOptions.map((option) => (
										<SelectItem key={option.value} value={option.value}>
											{option.label}
										</SelectItem>
									))}
								</SelectGroup>
							</SelectContent>
						</Select>
					</Field>
					<LarvalEntryPolicyGuide
						policy={{ mode, densityRanges: previewDensityRanges }}
						showDensityRanges={false}
					/>
					<div className="grid gap-2 rounded-md border border-border/30 bg-muted/30 p-2.5">
						<div className="flex items-center justify-between gap-3">
							<div>
								<span className="font-medium text-sm text-foreground">
									Density inference ranges
								</span>
								<p className="m-0 text-xs leading-snug text-muted-foreground">
									Configure larvae per dip ranges for inferred densities.
								</p>
							</div>
							<Switch
								checked={densityEnabled}
								disabled={!canManage}
								onCheckedChange={setDensityEnabled}
							/>
						</div>
						<div className="grid gap-2 md:grid-cols-2">
							{densityRangeKeys.map((density) => (
								<DensityRangeEditor
									disabled={!canManage || !densityEnabled}
									key={density}
									density={density}
									value={ranges[density]}
									onChange={(value) => setRanges({ ...ranges, [density]: value })}
								/>
							))}
						</div>
					</div>
					{error === null ? null : (
						<p className="m-0 text-sm leading-snug text-destructive">{error}</p>
					)}
					<SheetFooter className="px-0">
						<Button type="submit" disabled={!canManage || organization === null}>
							<SaveIcon aria-hidden="true" />
							Save Changes
						</Button>
						<SheetClose asChild>
							<Button type="button" variant="outline">
								<CloseIcon data-icon="inline-start" aria-hidden="true" />
								Cancel
							</Button>
						</SheetClose>
					</SheetFooter>
				</form>
			</SheetContent>
		</Sheet>
	);
}

function DensityRangeEditor({
	density,
	disabled,
	onChange,
	value,
}: {
	readonly density: DensityRangeKey;
	readonly disabled: boolean;
	readonly onChange: (value: DensityRangeFormValue) => void;
	readonly value: DensityRangeFormValue;
}) {
	return (
		<div className="grid gap-2 rounded-md border border-border/30 bg-background p-2.5">
			<span className="font-medium text-sm text-foreground">{densityLabel(density)}</span>
			<div className="grid grid-cols-2 gap-2">
				<Field className="gap-1">
					<FieldLabel>Greater than</FieldLabel>
					<Input
						disabled={disabled || density === 'light'}
						min={0}
						onChange={(event) => onChange({ ...value, minInclusive: event.target.value })}
						type="number"
						value={density === 'light' ? '0' : value.minInclusive}
					/>
				</Field>
				<Field className="gap-1">
					<FieldLabel>Up to and including</FieldLabel>
					<Input
						disabled={disabled || density === 'very_heavy'}
						min={0}
						onChange={(event) => onChange({ ...value, maxExclusive: event.target.value })}
						placeholder={density === 'very_heavy' ? 'No limit' : undefined}
						type="number"
						value={density === 'very_heavy' ? '' : value.maxExclusive}
					/>
				</Field>
			</div>
		</div>
	);
}

function HabitatTypeLookupList({ canManage }: { readonly canManage: boolean }) {
	const { activeRecords: activeHabitatTypes, inactiveRecords: inactiveHabitatTypes } =
		useHabitatTypeRecords();
	const mutations = useHabitatTypeMutations();

	return (
		<LookupListFrame
			activeCount={activeHabitatTypes.length}
			inactiveCount={inactiveHabitatTypes.length}
			detail="Habitat types define larval habitat labels and optional custom fields."
			title="Habitat Types"
			action={
				<HabitatTypeDrawer
					canManage={canManage}
					mutations={mutations}
					trigger={
						<Button type="button" variant="outline" size="sm" disabled={!canManage}>
							<AddIcon aria-hidden="true" />
							Add Habitat Type
						</Button>
					}
				/>
			}
		>
			<HabitatTypeTable
				canManage={canManage}
				emptyLabel="No active habitat types."
				habitatTypes={activeHabitatTypes}
				mutations={mutations}
				title="Active Habitat Types"
			/>
			<HabitatTypeTable
				canManage={canManage}
				emptyLabel="No inactive habitat types."
				habitatTypes={inactiveHabitatTypes}
				mutations={mutations}
				title="Inactive Habitat Types"
			/>
		</LookupListFrame>
	);
}

function HabitatTypeTable({
	canManage,
	emptyLabel,
	habitatTypes,
	mutations,
	title,
}: {
	readonly canManage: boolean;
	readonly emptyLabel: string;
	readonly habitatTypes: readonly SchemaCatalogRecord[];
	readonly mutations: CatalogMutations;
	readonly title: string;
}) {
	return (
		<div className="grid gap-2">
			<div className="flex items-center justify-between gap-2 border-t border-border/40 pt-2">
				<span className="text-xs font-medium text-muted-foreground">{title}</span>
				<span className="text-xs font-medium text-muted-foreground">{habitatTypes.length}</span>
			</div>
			{habitatTypes.length === 0 ? (
				<p className="m-0 rounded-md bg-background/60 px-2.5 py-2 text-sm text-muted-foreground">
					{emptyLabel}
				</p>
			) : (
				<div className="overflow-hidden rounded-md border border-border/30 bg-background/70 [--habitat-actions-column:76px] [--habitat-fields-column:112px] [--habitat-name-column:28%]">
					<Table className="w-full table-fixed">
						<TableHeader>
							<TableRow>
								<TableHead className="w-(--habitat-name-column)">Habitat Type</TableHead>
								<TableHead>Description</TableHead>
								<TableHead className="w-(--habitat-fields-column)">Custom Fields</TableHead>
								{canManage ? (
									<TableHead className="w-(--habitat-actions-column) text-right">Actions</TableHead>
								) : null}
							</TableRow>
						</TableHeader>
						<TableBody>
							{habitatTypes.map((habitatType) => (
								<TableRow key={habitatType.id}>
									<TableCell className="w-(--habitat-name-column) font-medium">
										<span className="wrap-anywhere">{habitatType.name}</span>
									</TableCell>
									<TableCell className="whitespace-normal text-muted-foreground wrap-anywhere">
										{habitatType.description ?? <EmptyValue />}
									</TableCell>
									<TableCell className="w-(--habitat-fields-column)">
										<CustomFieldsCell schema={habitatType.customSchema} />
									</TableCell>
									{canManage ? (
										<TableCell className="w-(--habitat-actions-column) text-right">
											<HabitatTypeDrawer
												canManage={canManage}
												habitatType={habitatType}
												mutations={mutations}
												trigger={
													<Button type="button" variant="outline" size="icon">
														<EditIcon aria-hidden="true" />
														<span className="sr-only">Edit {habitatType.name}</span>
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
			)}
		</div>
	);
}

function HabitatTypeDrawer({
	canManage,
	habitatType,
	mutations,
	trigger,
}: {
	readonly canManage: boolean;
	readonly habitatType?: SchemaCatalogRecord | undefined;
	readonly mutations: CatalogMutations;
	readonly trigger: React.ReactNode;
}) {
	const [open, setOpen] = useState(false);
	const defaultValues = catalogFormValues(habitatType);
	const form = useAppForm({
		defaultValues,
		validators: {
			onSubmit: () => (mutations.canWrite ? undefined : 'Organization details are still loading.'),
		},
		onSubmit: ({ value }) => {
			commitCatalogSave({
				failureMessage:
					habitatType === undefined
						? 'Unable to create habitat type.'
						: `Unable to save ${habitatType.name}.`,
				onWritten: () => setOpen(false),
				save: () =>
					habitatType === undefined
						? mutations.create(catalogFields(value)).then(() => undefined)
						: mutations.save(
								habitatType.id,
								catalogFields(value),
								catalogFields(catalogFormValues(habitatType)),
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
						{habitatType === undefined ? 'Add habitat type' : `Edit ${habitatType.name}`}
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
									value.trim().length === 0 ? 'Habitat type name is required.' : undefined,
							}}
						>
							{(field) => (
								<field.TextField
									label="Habitat type name"
									disabled={!canManage}
									placeholder="e.g. Catch basin"
								/>
							)}
						</form.AppField>
						<form.AppField name="description">
							{(field) => (
								<field.TextareaField
									label="Description"
									disabled={!canManage}
									className="min-h-24"
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
