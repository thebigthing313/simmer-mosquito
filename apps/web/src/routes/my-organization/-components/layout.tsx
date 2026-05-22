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
import { Tabs, TabsList, TabsTrigger } from '@simmer-mosquito/ui-web/components/ui/tabs';
import { Link, useLocation } from '@tanstack/react-router';
import type React from 'react';
import { useState } from 'react';
import { EditIcon, sections } from './constants';
import {
	collectionTimingModeFromFields,
	displayFieldValue,
	errorMessageForSave,
	formatMode,
} from './helpers';
import type {
	OrganizationSectionId,
	OrgRole,
	SettingField,
	SetupCatalog,
	SwitchSettingField,
} from './types';

export function OrganizationRouteTabs({ section }: { readonly section: OrganizationSectionId }) {
	const { pathname } = useLocation();
	const value = activeOrganizationSectionForPath(pathname, section);

	return (
		<Tabs value={value} className="pt-1.5">
			<TabsList
				variant="line"
				className="w-full justify-start overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
				aria-label="Organization sections"
			>
				{sections.map((section) => (
					<TabsTrigger
						className="min-w-max flex-none px-1.5 text-[0.82rem] font-bold"
						key={section.id}
						value={section.id}
						asChild
					>
						<Link to={section.to}>{section.label}</Link>
					</TabsTrigger>
				))}
			</TabsList>
		</Tabs>
	);
}

export function OrganizationWorkspaceShell({
	canManage,
	children,
	role,
	section,
}: {
	readonly canManage: boolean;
	readonly children: React.ReactNode;
	readonly role: OrgRole;
	readonly section: OrganizationSectionId;
}) {
	return (
		<div className="mx-auto grid w-full max-w-[1120px] gap-2.5">
			<div className="-mx-1 sticky top-0 z-8 grid gap-2 bg-[color-mix(in_oklch,var(--app-stage)_94%,transparent)] px-1 pt-0 pb-2 backdrop-blur-sm">
				<header className="flex items-center justify-between gap-4">
					<div className="grid max-w-[68ch] gap-1">
						<p className="eyebrow">Organization workspace</p>
						<h1 className="m-0 text-[1.38rem] leading-tight font-extrabold text-foreground">
							My Organization
						</h1>
						<p className="m-0 text-[0.92rem] leading-snug text-muted-foreground">
							Agency setup is split by workflow so each domain has room for its own decisions.
						</p>
					</div>
					<PermissionPill role={role} canManage={canManage} />
				</header>

				<OrganizationRouteTabs section={section} />
			</div>

			<div className="grid gap-2">{children}</div>
		</div>
	);
}

export function activeOrganizationSectionForPath(
	pathname: string,
	fallback: OrganizationSectionId,
): OrganizationSectionId {
	const normalizedPath = pathname === '/my-organization/' ? '/my-organization' : pathname;
	const exactMatch = sections.find((item) => normalizedPath === item.to);
	if (exactMatch !== undefined) {
		return exactMatch.id;
	}

	return (
		sections
			.filter((item) => item.id !== 'general')
			.find((item) => normalizedPath.startsWith(`${item.to}/`))?.id ?? fallback
	);
}

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
						<p className="m-0 px-4 text-[0.84rem] leading-snug text-destructive">{error}</p>
					)}
					<SheetFooter>
						<Button type="submit" disabled={onSave === undefined}>
							Save changes
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

export function SettingsDisplayGrid({ fields }: { readonly fields: readonly SettingField[] }) {
	return (
		<div className="grid gap-2 md:grid-cols-4">
			{fields.map((field) => (
				<div
					className="grid min-h-[68px] min-w-0 content-start gap-1.5 rounded-md border border-border/30 bg-muted/40 px-2.5 py-2"
					key={field.label}
				>
					<span className="text-[0.78rem] font-bold text-muted-foreground">{field.label}</span>
					<strong className="wrap-anywhere text-[0.92rem] text-foreground">
						{displayFieldValue(field)}
					</strong>
				</div>
			))}
		</div>
	);
}

export function SettingsEditor({
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

export function SwitchEditor({ field }: { readonly field: SwitchSettingField }) {
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

export function SetupList({ items }: { readonly items: readonly SetupCatalog[] }) {
	if (items.length === 0) {
		return null;
	}

	return (
		<div className="grid gap-1.5">
			<h3 className="eyebrow mt-0.5 mb-0">Setup lists</h3>
			<div className="grid gap-2">
				{items.map((catalog) => (
					<article
						className="grid min-w-0 items-center gap-3 rounded-md border border-border/30 bg-muted/40 p-2.5 md:grid-cols-[minmax(240px,1fr)_auto]"
						key={catalog.label}
					>
						<div className="min-w-0">
							<strong className="wrap-anywhere text-[0.92rem] text-foreground">
								{catalog.label}
							</strong>
							<p className="m-0 text-[0.86rem] leading-snug text-muted-foreground">
								{catalog.detail}
							</p>
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
				<strong className="text-[0.92rem] text-foreground">Collection timing</strong>
				<p className="m-0 text-[0.84rem] leading-snug text-muted-foreground">
					This controls how adult surveillance forms ask crews to record when a trap was collected.
				</p>
			</div>
			<div className="grid gap-2 md:grid-cols-2">
				<div
					className="grid gap-1 rounded-md border border-border/30 bg-background p-2 data-[active=true]:border-primary/35"
					data-active={mode === 'exact_timestamps'}
				>
					<strong className="text-[0.84rem] text-foreground">Exact timestamps</strong>
					<p className="m-0 text-[0.78rem] text-muted-foreground">Set time and pickup time.</p>
				</div>
				<div
					className="grid gap-1 rounded-md border border-border/30 bg-background p-2 data-[active=true]:border-primary/35"
					data-active={mode === 'collection_date_duration'}
				>
					<strong className="text-[0.84rem] text-foreground">Collection date and duration</strong>
					<p className="m-0 text-[0.78rem] text-muted-foreground">Collection date plus duration.</p>
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
	readonly activeCount: number;
	readonly children: React.ReactNode;
	readonly detail: string;
	readonly inactiveCount: number;
	readonly title: string;
}) {
	return (
		<section className="grid gap-2 rounded-md border border-border/30 bg-muted/30 p-2.5">
			<div className="flex flex-wrap items-start justify-between gap-2">
				<div className="grid min-w-0 gap-1">
					<strong className="wrap-anywhere text-[0.92rem] text-foreground">{title}</strong>
					<p className="m-0 text-[0.84rem] leading-snug text-muted-foreground">{detail}</p>
				</div>
				<div className="flex flex-wrap items-center gap-2">
					<Badge tone="success" variant="outline">
						{activeCount} active
					</Badge>
					<Badge tone="neutral" variant="outline">
						{inactiveCount} inactive
					</Badge>
					{action}
				</div>
			</div>
			<div className="grid gap-2">{children}</div>
		</section>
	);
}

export function OrgSection({
	children,
	id,
}: {
	readonly children: React.ReactNode;
	readonly id: string;
}) {
	return (
		<section className="scroll-mt-[132px]" id={id}>
			{children}
		</section>
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

export function SectionHeader({
	action,
	meta,
	title,
}: {
	readonly action?: React.ReactNode;
	readonly meta: string;
	readonly title: string;
}) {
	return (
		<div className="flex items-center justify-between gap-2.5">
			<div>
				<h2 className="m-0 text-[0.98rem] font-extrabold">{title}</h2>
				<p className="mt-0.5 mb-0 text-[0.78rem] leading-snug text-muted-foreground">{meta}</p>
			</div>
			{action === undefined ? null : (
				<div className="[&_a]:text-[0.86rem] [&_a]:font-bold [&_a]:text-primary [&_a]:no-underline">
					{action}
				</div>
			)}
		</div>
	);
}

export function PermissionPill({
	canManage,
	role,
}: {
	readonly canManage: boolean;
	readonly role: OrgRole;
}) {
	return (
		<Badge tone={canManage ? 'success' : 'neutral'} variant="outline">
			{canManage ? `${formatMode(role)} access` : `${formatMode(role)} view`}
		</Badge>
	);
}
