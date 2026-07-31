import type { AdultCollectionTimingMode } from '@simmer-mosquito/domain';
import type {
	CollectionLureRow,
	CollectionMethodRow,
	OrganizationRow,
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
import { Field, FieldLabel } from '@simmer-mosquito/ui-web/components/ui/field';
import { Input } from '@simmer-mosquito/ui-web/components/ui/input';
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from '@simmer-mosquito/ui-web/components/ui/table';
import type { Collection } from '@tanstack/react-db';
import { Link } from '@tanstack/react-router';
import { useState } from 'react';
import { toast } from 'sonner';
import { EmptyValue } from '../../../components/empty-value';
import { useAppForm } from '../../../forms';
import { useActiveNamedCollectionRows } from '../../../hooks/use-active-named-collection-rows';
import { AddIcon, ArrowRightIcon, CloseIcon, EditIcon } from './constants';
import {
	collectionLureFormValues,
	collectionTimingModeFromFields,
	createAdultCollectionLureFromValues,
	errorMessageForSave,
	updateAdultCollectionLureFromValues,
	watchPersistence,
} from './helpers';
import { LookupListFrame } from './layout/layout';
import type { SettingField } from './types';

export function AdultSurveillanceSettings({
	canManage,
	collectionLures,
	collectionMethods,
	fields,
	organization,
}: {
	readonly canManage: boolean;
	readonly collectionLures: Collection<CollectionLureRow, string | number>;
	readonly collectionMethods: Collection<CollectionMethodRow, string | number>;
	readonly fields: readonly SettingField[];
	readonly organization: OrganizationRow | null;
}) {
	const timingMode = collectionTimingModeFromFields(fields);

	return (
		<div className="grid gap-3">
			<CollectionTimingGuide mode={timingMode} />
			<div className="grid gap-2">
				<h3 className="eyebrow mt-0.5 mb-0">Setup Lists</h3>
				<div className="grid gap-3">
					<CollectionMethodLookupPointer methods={collectionMethods} />
					<CollectionLureLookupList
						canManage={canManage}
						organization={organization}
						lures={collectionLures}
					/>
				</div>
			</div>
		</div>
	);
}

export function CollectionTimingGuide({ mode }: { readonly mode: AdultCollectionTimingMode }) {
	return (
		<section className="grid gap-2 rounded-md border border-border/30 bg-muted/30 p-2.5">
			<div className="grid gap-1">
				<span className="font-medium text-sm text-foreground">Collection timing</span>
				<p className="m-0 text-sm leading-snug text-muted-foreground">
					This controls how adult surveillance forms ask crews to record when a trap was collected.
				</p>
			</div>
			<div className="grid gap-2 md:grid-cols-2">
				<CollectionTimingExample
					active={mode === 'exact_timestamps'}
					description="Use when crews record the exact set and pickup times."
					title="Exact Timestamps"
				>
					<Field className="gap-1">
						<FieldLabel>Set time</FieldLabel>
						<Input disabled value="May 21, 2026 6:00 PM" readOnly />
					</Field>
					<Field className="gap-1">
						<FieldLabel>Pickup time</FieldLabel>
						<Input disabled value="May 22, 2026 7:30 AM" readOnly />
					</Field>
				</CollectionTimingExample>
				<CollectionTimingExample
					active={mode === 'collection_date_duration'}
					description="Use when crews record the collection date and duration."
					title="Collection Date and Duration"
				>
					<Field className="gap-1">
						<FieldLabel>Collection date</FieldLabel>
						<Input disabled value="May 22, 2026" readOnly />
					</Field>
					<Field className="gap-1">
						<FieldLabel>Duration</FieldLabel>
						<Input disabled value="13.5 hours" readOnly />
					</Field>
				</CollectionTimingExample>
			</div>
		</section>
	);
}

export function CollectionTimingExample({
	active,
	children,
	description,
	title,
}: {
	readonly active: boolean;
	readonly children: React.ReactNode;
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

/**
 * Methods are managed on the adult surveillance route, next to the traps that use them.
 * This keeps their counts visible in settings and points at the one place that edits them.
 */
export function CollectionMethodLookupPointer({
	methods,
}: {
	readonly methods: Collection<CollectionMethodRow, string | number>;
}) {
	const { activeRows: activeMethods, inactiveRows: inactiveMethods } =
		useActiveNamedCollectionRows(methods);

	return (
		<LookupListFrame
			activeCount={activeMethods.length}
			inactiveCount={inactiveMethods.length}
			detail="Methods can define optional custom fields and action thresholds."
			title="Collection Methods"
			action={
				<Button asChild size="sm" variant="outline">
					<Link to="/adult-surveillance/collection-methods">
						Manage Methods
						<ArrowRightIcon aria-hidden="true" />
					</Link>
				</Button>
			}
		>
			<p className="m-0 rounded-md bg-background/60 px-2.5 py-2 text-sm text-muted-foreground">
				Collection methods are managed in Adult Surveillance, alongside the traps that use them.
			</p>
		</LookupListFrame>
	);
}

export function CollectionLureLookupList({
	canManage,
	organization,
	lures,
}: {
	readonly canManage: boolean;
	readonly organization: OrganizationRow | null;
	readonly lures: Collection<CollectionLureRow, string | number>;
}) {
	const { activeRows: activeLures, inactiveRows: inactiveLures } =
		useActiveNamedCollectionRows(lures);

	return (
		<LookupListFrame
			activeCount={activeLures.length}
			inactiveCount={inactiveLures.length}
			detail="Lures stay as lightweight labels with lifecycle state."
			title="Collection Lures"
			action={
				<CollectionLureDrawer
					canManage={canManage}
					organization={organization}
					trigger={
						<Button type="button" variant="outline" size="sm" disabled={!canManage}>
							<AddIcon aria-hidden="true" />
							Add Lure
						</Button>
					}
				/>
			}
		>
			<CollectionLureTable
				canManage={canManage}
				emptyLabel="No active collection lures."
				lures={activeLures}
				organization={organization}
				title="Active Lures"
			/>
			<CollectionLureTable
				canManage={canManage}
				emptyLabel="No inactive collection lures."
				lures={inactiveLures}
				organization={organization}
				title="Inactive Lures"
			/>
		</LookupListFrame>
	);
}

export function CollectionLureTable({
	canManage,
	emptyLabel,
	lures,
	organization,
	title,
}: {
	readonly canManage: boolean;
	readonly emptyLabel: string;
	readonly lures: readonly CollectionLureRow[];
	readonly organization: OrganizationRow | null;
	readonly title: string;
}) {
	return (
		<div className="grid gap-2">
			<div className="flex items-center justify-between gap-2 border-t border-border/40 pt-2">
				<span className="text-xs font-medium text-muted-foreground">{title}</span>
				<span className="text-xs font-medium text-muted-foreground">{lures.length}</span>
			</div>
			{lures.length === 0 ? (
				<p className="m-0 rounded-md bg-background/60 px-2.5 py-2 text-sm text-muted-foreground">
					{emptyLabel}
				</p>
			) : (
				<div className="overflow-hidden rounded-md border border-border/30 bg-background/70 [--lure-actions-column:76px] [--lure-name-column:32%]">
					<Table className="w-full table-fixed">
						<TableHeader>
							<TableRow>
								<TableHead className="w-(--lure-name-column)">Lure</TableHead>
								<TableHead>Description</TableHead>
								{canManage ? (
									<TableHead className="w-(--lure-actions-column) text-right">Actions</TableHead>
								) : null}
							</TableRow>
						</TableHeader>
						<TableBody>
							{lures.map((lure) => (
								<TableRow key={lure.id}>
									<TableCell className="w-(--lure-name-column) font-medium">
										<span className="wrap-anywhere">{lure.name}</span>
									</TableCell>
									<TableCell className="whitespace-normal text-muted-foreground wrap-anywhere">
										{lure.description ?? <EmptyValue />}
									</TableCell>
									{canManage ? (
										<TableCell className="w-(--lure-actions-column) text-right">
											<CollectionLureDrawer
												canManage={canManage}
												lure={lure}
												organization={organization}
												trigger={
													<Button type="button" variant="outline" size="icon">
														<EditIcon aria-hidden="true" />
														<span className="sr-only">Edit {lure.name}</span>
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

export function CollectionLureDrawer({
	canManage,
	lure,
	organization,
	trigger,
}: {
	readonly canManage: boolean;
	readonly lure?: CollectionLureRow | undefined;
	readonly organization: OrganizationRow | null;
	readonly trigger: React.ReactNode;
}) {
	const [open, setOpen] = useState(false);
	const defaultValues = collectionLureFormValues(lure);
	const form = useAppForm({
		defaultValues,
		validators: {
			onSubmit: () =>
				organization === null ? 'Organization details are still loading.' : undefined,
		},
		onSubmit: ({ value }) => {
			try {
				const transaction =
					lure === undefined
						? createAdultCollectionLureFromValues(organization, value)
						: updateAdultCollectionLureFromValues(lure, value);
				setOpen(false);
				watchPersistence(
					transaction,
					lure === undefined ? 'Unable to create collection lure.' : `Unable to save ${lure.name}.`,
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
			<DrawerContent className="w-[min(520px,100%)] sm:max-w-[520px]">
				<DrawerHeader>
					<DrawerTitle>
						{lure === undefined ? 'Add Collection Lure' : `Edit ${lure.name}`}
					</DrawerTitle>
					<DrawerDescription>Manage the label, description, and lifecycle state.</DrawerDescription>
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
									value.trim().length === 0 ? 'Lure name is required.' : undefined,
							}}
						>
							{(field) => (
								<field.TextField label="Lure name" disabled={!canManage} placeholder="e.g. CO2" />
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
