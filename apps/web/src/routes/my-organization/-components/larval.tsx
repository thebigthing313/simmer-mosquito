import type {
	LarvalDensityRange,
	LarvalDensityRanges,
	LarvalInspectionEntryMode,
	OrganizationSettings,
	ResolvedLarvalInspectionEntryPolicy,
} from '@simmer-mosquito/domain';
import type { HabitatTypeRow, OrganizationRow } from '@simmer-mosquito/sync';
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
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { useAppForm } from '../../../forms';
import { validateJsonSchemaValue } from '../../../forms/field-components';
import {
	AddIcon,
	CloseIcon,
	densityRangeKeys,
	EditIcon,
	larvalEntryModeOptions,
	SaveIcon,
} from './constants';
import {
	createHabitatTypeFromValues,
	densityKeyForSettings,
	densityLabel,
	densityRangeFormValues,
	densityRangesFromFormValues,
	errorMessageForSave,
	formatDensityRange,
	habitatTypeFormValues,
	safeDensityRangesFromFormValues,
	saveLarvalSettingsFromValues,
	sortAdultLookupRows,
	updateHabitatTypeFromValues,
	watchPersistence,
} from './helpers';
import { LookupListFrame } from './layout';
import type {
	DensityRangeFormValue,
	DensityRangeFormValues,
	DensityRangeKey,
	LarvalDensityDisplayKey,
} from './types';

export function LarvalSurveillanceSettings({
	canManage,
	habitatTypes,
	organization,
	policy,
}: {
	readonly canManage: boolean;
	readonly habitatTypes: readonly HabitatTypeRow[];
	readonly organization: OrganizationRow | null;
	readonly policy: ResolvedLarvalInspectionEntryPolicy;
}) {
	return (
		<div className="grid gap-3">
			<LarvalEntryPolicyGuide policy={policy} />
			<div className="grid gap-2">
				<h3 className="eyebrow mt-0.5 mb-0">Setup lists</h3>
				<HabitatTypeLookupList
					canManage={canManage}
					habitatTypes={habitatTypes}
					organization={organization}
				/>
			</div>
		</div>
	);
}

export function LarvalEntryPolicyGuide({
	policy,
	showDensityRanges = true,
}: {
	readonly policy: ResolvedLarvalInspectionEntryPolicy;
	readonly showDensityRanges?: boolean;
}) {
	return (
		<section className="grid gap-2 rounded-md border border-border/30 bg-muted/30 p-2.5">
			<div className="grid gap-1">
				<strong className="text-[0.92rem] text-foreground">Inspection entry mode</strong>
				<p className="m-0 text-[0.84rem] leading-snug text-muted-foreground">
					This controls whether larval inspection forms collect density, counts and dips, or both.
				</p>
			</div>
			<div className="grid gap-2 md:grid-cols-3">
				<LarvalEntryModeExample
					active={policy.mode === 'density_only'}
					description="Crews choose a density category without entering larvae counts."
					title="Density only"
				>
					<Field className="gap-1">
						<FieldLabel>Density</FieldLabel>
						<Input disabled readOnly value="Medium" />
					</Field>
				</LarvalEntryModeExample>
				<LarvalEntryModeExample
					active={policy.mode === 'count_and_dips_required'}
					description="Crews enter larvae counts and dip counts; density can be inferred."
					title="Count and dips required"
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
				</LarvalEntryModeExample>
				<LarvalEntryModeExample
					active={policy.mode === 'hybrid'}
					description="Crews can record density, counts and dips, or both depending on the inspection."
					title="Hybrid"
				/>
			</div>
			{showDensityRanges ? <DensityRangesDisplay ranges={policy.densityRanges} /> : null}
		</section>
	);
}

export function LarvalEntryModeExample({
	active,
	children,
	description,
	title,
}: {
	readonly active: boolean;
	readonly children?: React.ReactNode;
	readonly description: string;
	readonly title: string;
}) {
	return (
		<div
			className="grid content-start gap-2 rounded-md border border-border/30 bg-background p-2.5 data-[active=true]:border-primary/35 data-[active=true]:bg-[color-mix(in_oklch,var(--simmer-green-100)_36%,var(--card))]"
			data-active={active}
		>
			<div className="flex flex-wrap items-start justify-between gap-2">
				<div className="grid gap-1">
					<strong className="text-[0.88rem] text-foreground">{title}</strong>
					<p className="m-0 text-[0.8rem] leading-snug text-muted-foreground">{description}</p>
				</div>
				{active ? (
					<Badge tone="success" variant="outline">
						Current
					</Badge>
				) : null}
			</div>
			<div className="grid gap-2">{children}</div>
		</div>
	);
}

export function DensityRangesDisplay({ ranges }: { readonly ranges: LarvalDensityRanges | null }) {
	return (
		<div className="grid gap-2 rounded-md border border-border/30 bg-background p-2.5">
			<div className="flex flex-wrap items-start justify-between gap-2">
				<div className="grid gap-1">
					<strong className="text-[0.88rem] text-foreground">Density inference</strong>
					<p className="m-0 text-[0.8rem] leading-snug text-muted-foreground">
						The app uses larvae per dip to infer density. Zero larvae is always None.
					</p>
				</div>
				<Badge tone={ranges === null ? 'neutral' : 'info'} variant="outline">
					{ranges === null ? 'Disabled' : 'Configured'}
				</Badge>
			</div>
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
		</div>
	);
}

export function DensityRangeTile({
	density,
	range,
}: {
	readonly density: LarvalDensityDisplayKey;
	readonly range: LarvalDensityRange | null;
}) {
	const label = densityLabel(density);
	return (
		<div className="grid gap-1 rounded-md border border-border/30 bg-muted/30 p-2">
			<span className="text-[0.74rem] font-bold text-muted-foreground">{label}</span>
			<strong className="text-[0.88rem] text-foreground">
				{density === 'none' ? '0 larvae' : formatDensityRange(range)}
			</strong>
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
					<SheetTitle>Edit larval surveillance</SheetTitle>
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
								<strong className="text-[0.92rem] text-foreground">Density inference ranges</strong>
								<p className="m-0 text-[0.8rem] leading-snug text-muted-foreground">
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
						<p className="m-0 text-[0.84rem] leading-snug text-destructive">{error}</p>
					)}
					<SheetFooter className="px-0">
						<Button type="submit" disabled={!canManage || organization === null}>
							<SaveIcon aria-hidden="true" />
							Save changes
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

export function DensityRangeEditor({
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
			<strong className="text-[0.86rem] text-foreground">{densityLabel(density)}</strong>
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

export function HabitatTypeLookupList({
	canManage,
	habitatTypes,
	organization,
}: {
	readonly canManage: boolean;
	readonly habitatTypes: readonly HabitatTypeRow[];
	readonly organization: OrganizationRow | null;
}) {
	const activeHabitatTypes = useMemo(
		() => sortAdultLookupRows(habitatTypes.filter((habitatType) => habitatType.isActive)),
		[habitatTypes],
	);
	const inactiveHabitatTypes = useMemo(
		() => sortAdultLookupRows(habitatTypes.filter((habitatType) => !habitatType.isActive)),
		[habitatTypes],
	);

	return (
		<LookupListFrame
			activeCount={activeHabitatTypes.length}
			inactiveCount={inactiveHabitatTypes.length}
			detail="Habitat types define larval habitat labels and optional custom fields."
			title="Habitat types"
			action={
				<HabitatTypeDrawer
					canManage={canManage}
					organization={organization}
					trigger={
						<Button type="button" variant="outline" size="sm" disabled={!canManage}>
							<AddIcon aria-hidden="true" />
							Add habitat type
						</Button>
					}
				/>
			}
		>
			<HabitatTypeTable
				canManage={canManage}
				emptyLabel="No active habitat types."
				habitatTypes={activeHabitatTypes}
				organization={organization}
				title="Active habitat types"
			/>
			<HabitatTypeTable
				canManage={canManage}
				emptyLabel="No inactive habitat types."
				habitatTypes={inactiveHabitatTypes}
				organization={organization}
				title="Inactive habitat types"
			/>
		</LookupListFrame>
	);
}

export function HabitatTypeTable({
	canManage,
	emptyLabel,
	habitatTypes,
	organization,
	title,
}: {
	readonly canManage: boolean;
	readonly emptyLabel: string;
	readonly habitatTypes: readonly HabitatTypeRow[];
	readonly organization: OrganizationRow | null;
	readonly title: string;
}) {
	return (
		<div className="grid gap-2">
			<div className="flex items-center justify-between gap-2 border-t border-border/40 pt-2">
				<span className="text-[0.76rem] font-bold text-muted-foreground">{title}</span>
				<span className="text-[0.76rem] font-bold text-muted-foreground">
					{habitatTypes.length}
				</span>
			</div>
			{habitatTypes.length === 0 ? (
				<p className="m-0 rounded-md bg-background/60 px-2.5 py-2 text-[0.84rem] text-muted-foreground">
					{emptyLabel}
				</p>
			) : (
				<div className="overflow-hidden rounded-md border border-border/30 bg-background/70 [--habitat-actions-column:76px] [--habitat-fields-column:112px] [--habitat-name-column:28%]">
					<Table className="w-full table-fixed">
						<TableHeader>
							<TableRow>
								<TableHead className="w-(--habitat-name-column)">Habitat type</TableHead>
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
									<TableCell className="w-(--habitat-name-column) font-bold">
										<span className="wrap-anywhere">{habitatType.name}</span>
									</TableCell>
									<TableCell className="whitespace-normal text-muted-foreground wrap-anywhere">
										{habitatType.description ?? 'No description'}
									</TableCell>
									<TableCell className="w-(--habitat-fields-column)">
										<Badge
											tone={habitatType.customSchema === null ? 'neutral' : 'info'}
											variant="outline"
										>
											{habitatType.customSchema === null ? 'None' : 'Configured'}
										</Badge>
									</TableCell>
									{canManage ? (
										<TableCell className="w-(--habitat-actions-column) text-right">
											<HabitatTypeDrawer
												canManage={canManage}
												habitatType={habitatType}
												organization={organization}
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

export function HabitatTypeDrawer({
	canManage,
	habitatType,
	organization,
	trigger,
}: {
	readonly canManage: boolean;
	readonly habitatType?: HabitatTypeRow | undefined;
	readonly organization: OrganizationRow | null;
	readonly trigger: React.ReactNode;
}) {
	const [open, setOpen] = useState(false);
	const defaultValues = habitatTypeFormValues(habitatType);
	const form = useAppForm({
		defaultValues,
		validators: {
			onSubmit: () =>
				organization === null ? 'Organization details are still loading.' : undefined,
		},
		onSubmit: ({ value }) => {
			try {
				const transaction =
					habitatType === undefined
						? createHabitatTypeFromValues(organization, value)
						: updateHabitatTypeFromValues(habitatType, value);
				setOpen(false);
				watchPersistence(
					transaction,
					habitatType === undefined
						? 'Unable to create habitat type.'
						: `Unable to save ${habitatType.name}.`,
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
