import type { AdultCollectionTimingMode } from '@simmer-mosquito/domain';
import { Badge } from '@simmer-mosquito/ui-web/components/ui/badge';
import { Button } from '@simmer-mosquito/ui-web/components/ui/button';
import { Card, CardContent } from '@simmer-mosquito/ui-web/components/ui/card';
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
import type React from 'react';
import { useState } from 'react';
import { EditIcon } from '../constants';
import {
	collectionTimingModeFromFields,
	displayFieldValue,
	errorMessageForSave,
	formatMode,
} from '../helpers';
import type { SettingField, SetupCatalog, SimmerRole, SwitchSettingField } from '../types';
import { OrgSection } from './org-section';
import { SectionHeader } from './section-header';

export function DomainSection({
	canManage,
	children,
	editDescription,
	editAction,
	fields,
	id,
	meta,
	onSave,
	setupItems,
	title,
}: {
	readonly canManage: boolean;
	readonly children?: React.ReactNode;
	readonly editDescription: string;
	readonly editAction?: React.ReactNode;
	readonly fields: readonly SettingField[];
	readonly id: string;
	readonly meta: string;
	readonly onSave?: ((formData: FormData) => unknown) | undefined;
	readonly setupItems: readonly SetupCatalog[];
	readonly title: string;
}) {
	const action =
		canManage && editAction !== undefined ? (
			editAction
		) : canManage && fields.length > 0 ? (
			<EditSettingsSheet
				description={editDescription}
				fields={fields}
				onSave={onSave}
				title={`Edit ${title}`}
			/>
		) : null;

	return (
		<OrgSection id={id}>
			<OrgSurface>
				<SectionHeader action={action} meta={meta} title={title} />
				{children ?? (fields.length === 0 ? null : <SettingsDisplayGrid fields={fields} />)}
				<SetupList items={setupItems} />
			</OrgSurface>
		</OrgSection>
	);
}

export function EditSettingsSheet({
	description,
	fields,
	onSave,
	title,
}: {
	readonly description: string;
	readonly fields: readonly SettingField[];
	readonly onSave?: ((formData: FormData) => unknown) | undefined;
	readonly title: string;
}) {
	const [open, setOpen] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const timingMode = collectionTimingModeFromFields(fields);
	const [selectedTimingMode, setSelectedTimingMode] = useState(timingMode);
	const showsCollectionTiming = fields.some((field) => field.label === 'Collection timing');

	async function submit(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault();
		if (onSave === undefined) {
			setOpen(false);
			return;
		}

		setError(null);
		try {
			await onSave(new FormData(event.currentTarget));
			setOpen(false);
		} catch (saveError) {
			setError(errorMessageForSave(saveError));
		}
	}

	return (
		<Sheet
			open={open}
			onOpenChange={(nextOpen) => {
				if (nextOpen) {
					setSelectedTimingMode(timingMode);
				}
				setOpen(nextOpen);
			}}
		>
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
				<form className="grid gap-3.5" onSubmit={submit}>
					<div className="grid gap-2.5 px-4">
						{fields.map((field) => (
							<SettingsEditor
								field={field}
								key={field.label}
								onCollectionTimingChange={setSelectedTimingMode}
							/>
						))}
						{showsCollectionTiming ? <CollectionTimingGuide mode={selectedTimingMode} /> : null}
					</div>
					{error === null ? null : (
						<p className="m-0 px-4 text-sm leading-snug text-destructive">{error}</p>
					)}
					<SheetFooter>
						<Button type="submit" disabled={onSave === undefined}>
							Save Changes
						</Button>
						<SheetClose asChild>
							<Button type="button" variant="outline">
								Cancel
							</Button>
						</SheetClose>
					</SheetFooter>
				</form>
			</SheetContent>
		</Sheet>
	);
}

function SettingsDisplayGrid({ fields }: { readonly fields: readonly SettingField[] }) {
	return (
		<div className="grid gap-2 md:grid-cols-4">
			{fields.map((field) => (
				<div
					className="grid min-h-[68px] min-w-0 content-start gap-1.5 rounded-md border border-border/30 bg-muted/40 px-2.5 py-2"
					key={field.label}
				>
					<span className="text-xs font-medium text-muted-foreground">{field.label}</span>
					<span className="font-medium wrap-anywhere text-sm text-foreground">
						{displayFieldValue(field)}
					</span>
				</div>
			))}
		</div>
	);
}

function SettingsEditor({
	field,
	onCollectionTimingChange,
}: {
	readonly field: SettingField;
	readonly onCollectionTimingChange?: ((mode: AdultCollectionTimingMode) => void) | undefined;
}) {
	if (field.kind === 'switch') {
		return <SwitchEditor field={field} />;
	}

	if (field.kind === 'select') {
		return (
			<Field className="min-w-0 gap-1">
				<FieldLabel>{field.label}</FieldLabel>
				<Select
					defaultValue={field.value}
					disabled={!field.editable}
					name={field.label}
					onValueChange={(value) => {
						if (
							field.label === 'Collection timing' &&
							(value === 'exact_timestamps' || value === 'collection_date_duration')
						) {
							onCollectionTimingChange?.(value);
						}
					}}
				>
					<SelectTrigger size="sm" className="w-full">
						<SelectValue placeholder="Not set" />
					</SelectTrigger>
					<SelectContent>
						<SelectGroup>
							{field.options.map((option) => (
								<SelectItem key={option.value} value={option.value}>
									{option.label}
								</SelectItem>
							))}
						</SelectGroup>
					</SelectContent>
				</Select>
			</Field>
		);
	}

	return (
		<Field className="min-w-0 gap-1">
			<FieldLabel>{field.label}</FieldLabel>
			<Input
				defaultValue={field.value}
				disabled={!field.editable}
				name={field.label}
				type={field.inputType ?? 'text'}
			/>
		</Field>
	);
}

function SwitchEditor({ field }: { readonly field: SwitchSettingField }) {
	const [checked, setChecked] = useState(field.checked);

	return (
		<Field className="grid min-h-8 grid-cols-[minmax(0,1fr)_auto] items-center rounded-md border border-border/30 bg-muted/40 px-2.5 py-0">
			<FieldLabel>{field.label}</FieldLabel>
			<Switch checked={checked} disabled={!field.editable} onCheckedChange={setChecked} />
			<input
				type="hidden"
				name={field.label}
				value={checked ? 'true' : 'false'}
				disabled={!field.editable}
			/>
		</Field>
	);
}

function SetupList({ items }: { readonly items: readonly SetupCatalog[] }) {
	if (items.length === 0) {
		return null;
	}

	return (
		<div className="grid gap-1.5">
			<h3 className="eyebrow mt-0.5 mb-0">Setup Lists</h3>
			<div className="grid gap-2">
				{items.map((catalog) => (
					<article
						className="grid min-w-0 items-center gap-3 rounded-md border border-border/30 bg-muted/40 p-2.5 md:grid-cols-[minmax(240px,1fr)_auto]"
						key={catalog.label}
					>
						<div className="min-w-0">
							<span className="font-medium wrap-anywhere text-sm text-foreground">
								{catalog.label}
							</span>
							<p className="m-0 text-sm leading-snug text-muted-foreground">{catalog.detail}</p>
						</div>
						<Badge tone={catalog.editable ? 'success' : 'neutral'} variant="outline">
							{catalog.editable ? 'Editable' : 'Read only'}
						</Badge>
					</article>
				))}
			</div>
		</div>
	);
}

function CollectionTimingGuide({ mode }: { readonly mode: AdultCollectionTimingMode }) {
	return (
		<section className="grid gap-2 rounded-md border border-border/30 bg-muted/30 p-2.5">
			<div className="grid gap-1">
				<span className="font-medium text-sm text-foreground">Collection timing</span>
				<p className="m-0 text-sm leading-snug text-muted-foreground">
					This controls how adult surveillance forms ask crews to record when a trap was collected.
				</p>
			</div>
			<div className="grid gap-2 md:grid-cols-2">
				<div
					className="grid gap-1 rounded-md border border-border/30 bg-background p-2 data-[active=true]:border-primary/35"
					data-active={mode === 'exact_timestamps'}
				>
					<span className="font-medium text-sm text-foreground">Exact timestamps</span>
					<p className="m-0 text-xs text-muted-foreground">Set time and pickup time.</p>
				</div>
				<div
					className="grid gap-1 rounded-md border border-border/30 bg-background p-2 data-[active=true]:border-primary/35"
					data-active={mode === 'collection_date_duration'}
				>
					<span className="font-medium text-sm text-foreground">Collection date and duration</span>
					<p className="m-0 text-xs text-muted-foreground">Collection date plus duration.</p>
				</div>
			</div>
		</section>
	);
}

export function LookupListFrame({
	action,
	activeCount,
	children,
	detail,
	inactiveCount,
	title,
}: {
	readonly action?: React.ReactNode;
	readonly activeCount?: number;
	readonly children: React.ReactNode;
	readonly detail: string;
	readonly inactiveCount?: number;
	readonly title: string;
}) {
	return (
		<section className="grid gap-2 rounded-md border border-border/30 bg-muted/30 p-2.5">
			<div className="flex flex-wrap items-start justify-between gap-2">
				<div className="grid min-w-0 gap-1">
					<span className="font-medium wrap-anywhere text-sm text-foreground">{title}</span>
					<p className="m-0 text-sm leading-snug text-muted-foreground">{detail}</p>
				</div>
				<div className="flex flex-wrap items-center gap-2">
					{activeCount === undefined ? null : (
						<Badge tone="success" variant="outline">
							{activeCount} active
						</Badge>
					)}
					{inactiveCount === undefined ? null : (
						<Badge tone="neutral" variant="outline">
							{inactiveCount} inactive
						</Badge>
					)}
					{action}
				</div>
			</div>
			<div className="grid gap-2">{children}</div>
		</section>
	);
}

/**
 * How a setting's options are shown: one card per option, each a worked example
 * of what that option does, with the selected one tinted. `badge` defaults to
 * the "Current" marker while active; density inference passes its own badge
 * instead, because "configured or not" is a different reading from "current".
 */
export function SettingChoiceCard({
	active = false,
	badge,
	children,
	description,
	title,
}: {
	readonly active?: boolean;
	readonly badge?: React.ReactNode;
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
					<span className="font-medium text-sm text-foreground">{title}</span>
					<p className="m-0 text-xs leading-snug text-muted-foreground">{description}</p>
				</div>
				{badge ??
					(active ? (
						<Badge tone="success" variant="outline">
							Current
						</Badge>
					) : null)}
			</div>
			<div className="grid gap-2">{children}</div>
		</div>
	);
}

export function OrgSurface({
	children,
	className,
}: {
	readonly children: React.ReactNode;
	readonly className?: string | undefined;
}) {
	return (
		<Card variant="surface" className={className}>
			<CardContent padding="compact" className="grid gap-3">
				{children}
			</CardContent>
		</Card>
	);
}

export function PermissionPill({
	canManage,
	role,
}: {
	readonly canManage: boolean;
	readonly role: SimmerRole;
}) {
	return (
		<Badge tone={canManage ? 'success' : 'neutral'} variant="outline">
			{canManage ? `${formatMode(role)} access` : `${formatMode(role)} view`}
		</Badge>
	);
}
