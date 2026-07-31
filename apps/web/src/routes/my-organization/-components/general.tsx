import type { OrganizationSettings } from '@simmer-mosquito/domain';
import type { OrganizationRow, TagRow, UnitRow } from '@simmer-mosquito/sync';
import { ColorPicker } from '@simmer-mosquito/ui-web/components/color-picker';
import { Badge } from '@simmer-mosquito/ui-web/components/ui/badge';
import { Button } from '@simmer-mosquito/ui-web/components/ui/button';
import { Field, FieldLabel } from '@simmer-mosquito/ui-web/components/ui/field';
import { Input } from '@simmer-mosquito/ui-web/components/ui/input';
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
import { Textarea } from '@simmer-mosquito/ui-web/components/ui/textarea';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { EmptyValue } from '../../../components/empty-value';
import { useAppForm } from '../../../forms';
import {
	AddIcon,
	CloseIcon,
	DeleteIcon,
	EditIcon,
	SaveIcon,
	US_STATE_SELECT_OPTIONS,
	US_TIMEZONE_OPTIONS,
} from './constants';
import {
	AgencyDetailLine,
	agencyDetailsFormValues,
	createOrganizationTagFromValues,
	deleteOrganizationTag,
	errorMessageForSave,
	formatMailingAddress,
	formatMode,
	saveAgencyDetailsFromValues,
	saveUnitDefaultsFromValues,
	unitDefaultsFormValues,
	unitOptionsForDefault,
	updateOrganizationTagFromValues,
	validateEmail,
	watchPersistence,
} from './helpers';
import { DomainSection } from './layout/layout';
import type {
	AgencyDetailsFormValues,
	SettingField,
	TagFormValues,
	UnitDefaultsFormValues,
} from './types';

export function GeneralOrganizationSection({
	agencyFields,
	canManage,
	organization,
	organizationName,
	settings,
	status,
	tags,
	timezone,
	unitFields,
	units,
}: {
	readonly agencyFields: readonly SettingField[];
	readonly canManage: boolean;
	readonly organization: OrganizationRow | null;
	readonly organizationName: string;
	readonly settings: OrganizationSettings;
	readonly status: string;
	readonly tags: readonly TagRow[];
	readonly timezone: string;
	readonly unitFields: readonly SettingField[];
	readonly units: readonly UnitRow[];
}) {
	const organizationTags =
		organization === null ? tags : tags.filter((tag) => tag.organizationId === organization.id);
	const [isCreatingTag, setIsCreatingTag] = useState(false);

	return (
		<>
			<DomainSection
				canManage={canManage}
				editDescription="Update the agency profile details available to organization members."
				editAction={
					<EditAgencyDetailsSheet
						defaultValues={agencyDetailsFormValues(organization, settings)}
						description="Update the agency profile details available to organization members."
						organization={organization}
						settings={settings}
						title={`Edit ${organizationName}`}
					/>
				}
				fields={agencyFields}
				id="agency"
				meta={status === 'ready' ? 'Current agency details' : 'Agency details loading'}
				setupItems={[]}
				title={organizationName}
			>
				<AgencyDetailsSummary organization={organization} timezone={timezone} />
			</DomainSection>

			<DomainSection
				canManage={canManage}
				editDescription="Set default units used across collection forms, summaries, and operational reports."
				editAction={
					<EditUnitDefaultsSheet
						defaultValues={unitDefaultsFormValues(settings.unitDefaults)}
						description="Set default units used across collection forms, summaries, and operational reports."
						organization={organization}
						settings={settings}
						title="Edit Unit Defaults"
						units={units}
					/>
				}
				fields={unitFields}
				id="units"
				meta="Measurement choices used across forms and summaries"
				setupItems={[]}
				title="Unit Defaults"
			/>

			<DomainSection
				canManage={canManage}
				editDescription="Manage shared labels, display colors, and tag lifecycle state."
				editAction={
					<Button
						type="button"
						variant="outline"
						size="sm"
						disabled={organization === null || isCreatingTag}
						onClick={() => setIsCreatingTag(true)}
					>
						<AddIcon aria-hidden="true" />
						Add Tag
					</Button>
				}
				fields={[]}
				id="tags"
				meta="Shared record tagging vocabulary"
				setupItems={[]}
				title="Tags"
			>
				<TagSections
					canManage={canManage}
					isCreating={isCreatingTag}
					onCancelCreate={() => setIsCreatingTag(false)}
					organization={organization}
					tags={organizationTags}
				/>
			</DomainSection>
		</>
	);
}

export function TagSections({
	canManage,
	isCreating,
	onCancelCreate,
	organization,
	tags,
}: {
	readonly canManage: boolean;
	readonly isCreating: boolean;
	readonly onCancelCreate: () => void;
	readonly organization: OrganizationRow | null;
	readonly tags: readonly TagRow[];
}) {
	const activeTags = sortedTags(tags.filter((tag) => tag.isActive));
	const deactivatedTags = sortedTags(tags.filter((tag) => !tag.isActive));
	const [editingTagId, setEditingTagId] = useState<string | null>(null);

	return (
		<div className="grid gap-3">
			{canManage && isCreating ? (
				<TagCreatePanel organization={organization} onCancel={onCancelCreate} />
			) : null}
			<TagTableSection
				canManage={canManage}
				editingTagId={editingTagId}
				emptyLabel="No active tags"
				onCancelEdit={() => setEditingTagId(null)}
				onEdit={setEditingTagId}
				title="Active"
				tags={activeTags}
			/>
			<TagTableSection
				canManage={canManage}
				editingTagId={editingTagId}
				emptyLabel="No deactivated tags"
				onCancelEdit={() => setEditingTagId(null)}
				onEdit={setEditingTagId}
				title="Deactivated"
				tags={deactivatedTags}
			/>
		</div>
	);
}

export function TagTableSection({
	canManage,
	editingTagId,
	emptyLabel,
	onCancelEdit,
	onEdit,
	tags,
	title,
}: {
	readonly canManage: boolean;
	readonly editingTagId: string | null;
	readonly emptyLabel: string;
	readonly onCancelEdit: () => void;
	readonly onEdit: (tagId: string) => void;
	readonly tags: readonly TagRow[];
	readonly title: string;
}) {
	return (
		<div className="grid gap-2">
			<h3 className="eyebrow mt-0.5 mb-0">{title}</h3>
			{tags.length === 0 ? (
				<p className="m-0 rounded-md border border-border/30 bg-muted/40 px-2.5 py-2 text-sm text-muted-foreground">
					{emptyLabel}
				</p>
			) : (
				<div className="overflow-hidden rounded-md border border-border/30 [--tag-actions-column:156px] [--tag-color-column:150px] [--tag-description-column:clamp(220px,30vw,360px)] [--tag-preview-column:clamp(150px,18vw,220px)]">
					<Table className="min-w-[calc(var(--tag-preview-column)+var(--tag-description-column)+var(--tag-color-column)+var(--tag-actions-column))] table-fixed">
						<TableHeader>
							<TableRow>
								<TableHead className="w-(--tag-preview-column)">Tag Preview</TableHead>
								<TableHead className="w-(--tag-description-column)">Description</TableHead>
								<TableHead className="w-(--tag-color-column)">Color</TableHead>
								{canManage ? (
									<TableHead className="w-(--tag-actions-column) text-right">Actions</TableHead>
								) : null}
							</TableRow>
						</TableHeader>
						<TableBody>
							{tags.map((tag) =>
								editingTagId === tag.id ? (
									<TagEditorTableRow key={tag.id} tag={tag} onCancel={onCancelEdit} />
								) : (
									<TagDisplayTableRow
										canManage={canManage}
										key={tag.id}
										onEdit={() => onEdit(tag.id)}
										tag={tag}
									/>
								),
							)}
						</TableBody>
					</Table>
				</div>
			)}
		</div>
	);
}

export function TagBadge({ tag }: { readonly tag: TagRow }) {
	const color = validHexColor(tag.color);
	const style =
		color === null
			? undefined
			: ({
					'--tag-color': color,
					'--tag-bg': hexWithAlpha(color, 0.14),
					'--tag-border': hexWithAlpha(color, 0.36),
				} as React.CSSProperties);

	return (
		<Badge
			variant={color === null ? 'secondary' : 'outline'}
			className={
				color === null ? undefined : 'border-(--tag-border) bg-(--tag-bg) text-(--tag-color)'
			}
			style={style}
			title={tag.description ?? undefined}
		>
			{tag.tagName}
		</Badge>
	);
}

export function TagColorSwatch({ color }: { readonly color: string | null }) {
	const normalized = validHexColor(color);
	const style =
		normalized === null ? undefined : ({ '--tag-color': normalized } as React.CSSProperties);

	return (
		<span className="inline-flex items-center gap-2">
			<span
				aria-hidden="true"
				className={
					normalized === null
						? 'size-3 rounded-sm border border-border bg-muted'
						: 'size-3 rounded-sm border border-border bg-(--tag-color)'
				}
				style={style}
			/>
			<span className="font-mono text-xs text-muted-foreground">{normalized ?? 'Default'}</span>
		</span>
	);
}

export function TagDisplayTableRow({
	canManage,
	onEdit,
	tag,
}: {
	readonly canManage: boolean;
	readonly onEdit: () => void;
	readonly tag: TagRow;
}) {
	return (
		<TableRow>
			<TableCell className="w-(--tag-preview-column)">
				<TagBadge tag={tag} />
			</TableCell>
			<TableCell className="w-(--tag-description-column) whitespace-normal text-muted-foreground wrap-anywhere">
				{tag.description ?? <EmptyValue />}
			</TableCell>
			<TableCell className="w-(--tag-color-column)">
				<TagColorSwatch color={tag.color} />
			</TableCell>
			{canManage ? (
				<TableCell className="w-(--tag-actions-column) text-right">
					<Button type="button" variant="outline" size="sm" onClick={onEdit}>
						<EditIcon aria-hidden="true" />
						Edit
					</Button>
				</TableCell>
			) : null}
		</TableRow>
	);
}

export function TagCreatePanel({
	onCancel,
	organization,
}: {
	readonly organization: OrganizationRow | null;
	readonly onCancel: () => void;
}) {
	const [values, setValues] = useState<TagFormValues>({
		tagName: '',
		description: '',
		color: '',
		isActive: true,
	});

	function createTag() {
		try {
			const transaction = createOrganizationTagFromValues(organization, values);
			setValues({ tagName: '', description: '', color: '', isActive: true });
			watchPersistence(transaction, 'Unable to create tag.');
		} catch (error) {
			toast.error(errorMessageForSave(error));
		}
	}

	return (
		<div className="grid gap-2 rounded-md border border-dashed border-border/50 bg-background/50 p-2.5">
			<div className="grid gap-2 md:grid-cols-[minmax(180px,1fr)_132px_auto]">
				<Field className="gap-1">
					<FieldLabel>Name</FieldLabel>
					<Input
						value={values.tagName}
						placeholder="e.g. New tag"
						onChange={(event) => setValues({ ...values, tagName: event.target.value })}
					/>
				</Field>
				<Field className="gap-1">
					<FieldLabel>Color</FieldLabel>
					<ColorPicker
						value={values.color}
						onChange={(color) => setValues({ ...values, color: color ?? '' })}
					/>
				</Field>
				<div className="flex items-end gap-2">
					<Button type="button" disabled={organization === null} onClick={createTag}>
						<AddIcon aria-hidden="true" />
						Add
					</Button>
					<Button type="button" variant="outline" onClick={onCancel}>
						<CloseIcon aria-hidden="true" />
						Cancel
					</Button>
				</div>
			</div>
			<Field className="gap-1">
				<FieldLabel>Description</FieldLabel>
				<Textarea
					value={values.description}
					className="min-h-14"
					onChange={(event) => setValues({ ...values, description: event.target.value })}
				/>
			</Field>
		</div>
	);
}

export function TagEditorTableRow({
	onCancel,
	tag,
}: {
	readonly onCancel: () => void;
	readonly tag: TagRow;
}) {
	const [values, setValues] = useState<TagFormValues>({
		tagName: tag.tagName,
		description: tag.description ?? '',
		color: tag.color ?? '',
		isActive: tag.isActive,
	});

	useEffect(() => {
		setValues({
			tagName: tag.tagName,
			description: tag.description ?? '',
			color: tag.color ?? '',
			isActive: tag.isActive,
		});
	}, [tag]);

	function saveTag() {
		try {
			const transaction = updateOrganizationTagFromValues(tag, values);
			watchPersistence(transaction, `Unable to save ${tag.tagName}.`);
			onCancel();
		} catch (error) {
			toast.error(errorMessageForSave(error));
		}
	}

	function deleteTag() {
		const transaction = deleteOrganizationTag(tag);
		watchPersistence(transaction, `Unable to delete ${tag.tagName}.`);
		onCancel();
	}

	return (
		<TableRow>
			<TableCell className="w-(--tag-preview-column) align-top">
				<Field className="gap-1">
					<FieldLabel>Name</FieldLabel>
					<Input
						value={values.tagName}
						className="min-w-0"
						onChange={(event) => setValues({ ...values, tagName: event.target.value })}
					/>
				</Field>
			</TableCell>
			<TableCell className="w-(--tag-description-column) align-top whitespace-normal">
				<Field className="gap-1">
					<FieldLabel>Description</FieldLabel>
					<Textarea
						value={values.description}
						className="min-h-14 min-w-0 max-w-full resize-y wrap-anywhere whitespace-pre-wrap"
						onChange={(event) => setValues({ ...values, description: event.target.value })}
					/>
				</Field>
			</TableCell>
			<TableCell className="w-(--tag-color-column) align-top">
				<Field className="gap-1">
					<FieldLabel>Color</FieldLabel>
					<ColorPicker
						value={values.color}
						onChange={(color) => setValues({ ...values, color: color ?? '' })}
					/>
				</Field>
				<Field className="mt-2 grid min-h-9 grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded-md border border-border/30 bg-muted/30 px-2.5 py-1">
					<FieldLabel>{values.isActive ? 'Active' : 'Deactivated'}</FieldLabel>
					<Switch
						checked={values.isActive}
						onCheckedChange={(isActive) => setValues({ ...values, isActive })}
					/>
				</Field>
			</TableCell>
			<TableCell className="w-(--tag-actions-column) align-top">
				<div className="flex justify-end gap-2">
					<Button type="button" variant="destructive" size="icon" onClick={deleteTag}>
						<DeleteIcon aria-hidden="true" />
						<span className="sr-only">Delete {tag.tagName}</span>
					</Button>
					<Button type="button" variant="outline" size="icon" onClick={saveTag}>
						<SaveIcon aria-hidden="true" />
						<span className="sr-only">Save {tag.tagName}</span>
					</Button>
					<Button type="button" variant="outline" size="icon" onClick={onCancel}>
						<CloseIcon aria-hidden="true" />
						<span className="sr-only">Cancel editing {tag.tagName}</span>
					</Button>
				</div>
			</TableCell>
		</TableRow>
	);
}

export function sortedTags(tags: readonly TagRow[]): TagRow[] {
	return [...tags].sort((first, second) => first.tagName.localeCompare(second.tagName));
}

export function validHexColor(value: string | null): string | null {
	if (value === null) {
		return null;
	}

	const normalized = value.trim();
	return /^#[0-9a-fA-F]{6}$/.test(normalized) ? normalized : null;
}

export function hexWithAlpha(hex: string, alpha: number): string {
	const alphaHex = Math.round(Math.min(1, Math.max(0, alpha)) * 255)
		.toString(16)
		.padStart(2, '0');
	return `${hex}${alphaHex}`;
}

export function EditAgencyDetailsSheet({
	defaultValues,
	description,
	organization,
	settings,
	title,
}: {
	readonly defaultValues: AgencyDetailsFormValues;
	readonly description: string;
	readonly organization: OrganizationRow | null;
	readonly settings: OrganizationSettings;
	readonly title: string;
}) {
	const [open, setOpen] = useState(false);
	const form = useAppForm({
		defaultValues,
		validators: {
			onSubmit: () =>
				organization === null ? 'Organization details are still loading.' : undefined,
		},
		onSubmit: ({ value }) => {
			try {
				const transaction = saveAgencyDetailsFromValues(organization, settings, value);
				setOpen(false);
				watchPersistence(transaction, 'Unable to save agency details.');
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
		<Sheet open={open} onOpenChange={updateOpen}>
			<SheetTrigger asChild>
				<Button type="button" variant="outline" size="sm">
					<EditIcon aria-hidden="true" />
					Edit
				</Button>
			</SheetTrigger>
			<SheetContent className="w-[min(440px,100%)]">
				<SheetHeader>
					<SheetTitle>{title}</SheetTitle>
					<SheetDescription>{description}</SheetDescription>
				</SheetHeader>
				<form.AppForm>
					<form
						className="grid gap-3.5"
						onSubmit={(event) => {
							event.preventDefault();
							void form.handleSubmit();
						}}
					>
						<div className="grid gap-2.5 px-4">
							<form.FormErrorAlert />
							<form.AppField
								name="name"
								validators={{
									onSubmit: ({ value }) =>
										value.trim().length === 0 ? 'Organization name is required.' : undefined,
								}}
							>
								{(field) => <field.TextField label="Organization name" />}
							</form.AppField>
							<form.AppField name="mainContactEmail" validators={{ onSubmit: validateEmail }}>
								{(field) => <field.TextField label="Main contact" type="email" />}
							</form.AppField>
							<form.AppField name="phoneNumber">
								{(field) => <field.TextField label="Phone" type="tel" />}
							</form.AppField>
							<form.AppField name="mailingAddressLine1">
								{(field) => <field.TextField label="Street address" />}
							</form.AppField>
							<form.AppField name="mailingAddressLine2">
								{(field) => <field.TextField label="Apt, suite, etc." />}
							</form.AppField>
							<form.AppField name="mailingLocality">
								{(field) => <field.TextField label="City" />}
							</form.AppField>
							<form.AppField name="mailingRegion">
								{(field) => (
									<field.SelectField
										label="State"
										options={US_STATE_SELECT_OPTIONS}
										placeholder="Not set"
									/>
								)}
							</form.AppField>
							<form.AppField name="mailingPostalCode">
								{(field) => <field.TextField label="ZIP code" />}
							</form.AppField>
							<form.AppField
								name="timezone"
								validators={{
									onSubmit: ({ value }) =>
										value.trim().length === 0 ? 'Timezone is required.' : undefined,
								}}
							>
								{(field) => <field.SelectField label="Timezone" options={US_TIMEZONE_OPTIONS} />}
							</form.AppField>
						</div>
						<SheetFooter>
							<form.FormActions>
								<form.SubmitButton disabled={organization === null} />
								<SheetClose asChild>
									<Button type="button" variant="outline">
										<CloseIcon data-icon="inline-start" aria-hidden="true" />
										Cancel
									</Button>
								</SheetClose>
							</form.FormActions>
						</SheetFooter>
					</form>
				</form.AppForm>
			</SheetContent>
		</Sheet>
	);
}

export function EditUnitDefaultsSheet({
	defaultValues,
	description,
	organization,
	settings,
	title,
	units,
}: {
	readonly defaultValues: UnitDefaultsFormValues;
	readonly description: string;
	readonly organization: OrganizationRow | null;
	readonly settings: OrganizationSettings;
	readonly title: string;
	readonly units: readonly UnitRow[];
}) {
	const [open, setOpen] = useState(false);
	const form = useAppForm({
		defaultValues,
		validators: {
			onSubmit: () =>
				organization === null ? 'Organization details are still loading.' : undefined,
		},
		onSubmit: ({ value }) => {
			try {
				const transaction = saveUnitDefaultsFromValues(organization, settings, value);
				setOpen(false);
				watchPersistence(transaction, 'Unable to save unit defaults.');
			} catch (saveError) {
				toast.error(errorMessageForSave(saveError));
			}
		},
	});
	const unitTypes = Object.keys(defaultValues) as Array<keyof UnitDefaultsFormValues>;

	function updateOpen(nextOpen: boolean) {
		if (nextOpen) {
			form.reset(defaultValues);
		}
		setOpen(nextOpen);
	}

	return (
		<Sheet open={open} onOpenChange={updateOpen}>
			<SheetTrigger asChild>
				<Button type="button" variant="outline" size="sm">
					<EditIcon aria-hidden="true" />
					Edit
				</Button>
			</SheetTrigger>
			<SheetContent className="w-[min(440px,100%)]">
				<SheetHeader>
					<SheetTitle>{title}</SheetTitle>
					<SheetDescription>{description}</SheetDescription>
				</SheetHeader>
				<form.AppForm>
					<form
						className="grid gap-3.5"
						onSubmit={(event) => {
							event.preventDefault();
							void form.handleSubmit();
						}}
					>
						<div className="grid gap-2.5 px-4">
							<form.FormErrorAlert />
							{unitTypes.map((unitType) => (
								<form.AppField
									key={unitType}
									name={unitType}
									validators={{
										onSubmit: ({ value }) =>
											value.trim().length === 0
												? `${formatMode(unitType)} is required.`
												: undefined,
									}}
								>
									{(field) => (
										<field.SelectField
											label={formatMode(unitType)}
											options={unitOptionsForDefault(
												defaultValues[unitType],
												units.filter((unit) => unit.unitType === unitType),
											)}
										/>
									)}
								</form.AppField>
							))}
						</div>
						<SheetFooter>
							<form.FormActions>
								<form.SubmitButton disabled={organization === null} />
								<SheetClose asChild>
									<Button type="button" variant="outline">
										<CloseIcon data-icon="inline-start" aria-hidden="true" />
										Cancel
									</Button>
								</SheetClose>
							</form.FormActions>
						</SheetFooter>
					</form>
				</form.AppForm>
			</SheetContent>
		</Sheet>
	);
}

export function AgencyDetailsSummary({
	organization,
	timezone,
}: {
	readonly organization: OrganizationRow | null;
	readonly timezone: string;
}) {
	const slug = organization?.slug ?? null;
	const address = formatMailingAddress(organization);

	return (
		<div className="grid gap-3 border-t border-border/50 pt-3 md:grid-cols-[minmax(140px,0.5fr)_minmax(220px,0.9fr)_minmax(260px,1.2fr)]">
			<div className="grid min-w-0 content-start gap-1.5">
				<span className="text-xs leading-tight font-semibold text-muted-foreground">Slug</span>
				{slug === null || slug.length === 0 ? (
					<span className="font-medium text-sm leading-normal text-foreground">Not set</span>
				) : (
					<Badge tone="neutral" variant="outline" className="w-fit max-w-full">
						<span className="truncate">{slug}</span>
					</Badge>
				)}
			</div>
			<div className="grid min-w-0 content-start gap-2">
				<span className="text-xs leading-tight font-semibold text-muted-foreground">Contact</span>
				<AgencyDetailLine label="Email" value={organization?.mainContactEmail} />
				<AgencyDetailLine label="Phone" value={organization?.phoneNumber} />
				<AgencyDetailLine label="Timezone" value={timezone} />
			</div>
			<div className="grid min-w-0 content-start gap-2">
				<span className="text-xs leading-tight font-semibold text-muted-foreground">
					Mailing address
				</span>
				<p className="m-0 max-w-[56ch] wrap-anywhere text-sm leading-normal text-foreground">
					{address}
				</p>
			</div>
		</div>
	);
}
