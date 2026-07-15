import type { CollectionMethodRow, OrganizationRow, TrapRow } from '@simmer-mosquito/sync';
import { Badge } from '@simmer-mosquito/ui-web/components/ui/badge';
import { Button } from '@simmer-mosquito/ui-web/components/ui/button';
import {
	Dialog,
	DialogClose,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from '@simmer-mosquito/ui-web/components/ui/dialog';
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from '@simmer-mosquito/ui-web/components/ui/dropdown-menu';
import {
	Empty,
	EmptyContent,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from '@simmer-mosquito/ui-web/components/ui/empty';
import { Input } from '@simmer-mosquito/ui-web/components/ui/input';
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from '@simmer-mosquito/ui-web/components/ui/table';
import { iconRegistry } from '@simmer-mosquito/ui-web/icons/registry';
import { cn } from '@simmer-mosquito/ui-web/lib/utils';
import { createFileRoute } from '@tanstack/react-router';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { OutletSimpleLayout } from '../../components/app-shell/outlet/simple-layout';
import { useAppForm } from '../../forms';
import { validateJsonSchemaValue } from '../../forms/field-components';
import { useActiveNamedCollectionRows } from '../../hooks/use-active-named-collection-rows';
import { useCollectionRows } from '../../hooks/use-collection-rows';
import { useOrganizationWorkspace } from '../../hooks/use-organization-workspace';
import { webCollections } from '../../sync/webCollections';
import {
	collectionMethodFormValues,
	createAdultCollectionMethodFromValues,
	errorMessageForSave,
	updateAdultCollectionMethodFromValues,
	watchPersistence,
} from '../my-organization/-components/helpers';

export const Route = createFileRoute('/adult-surveillance/collection-methods')({
	component: CollectionMethodsRoute,
});

const MethodIcon = iconRegistry.generic.component.icon;
const AddIcon = iconRegistry.actions.add.icon;
const EditIcon = iconRegistry.actions.edit.icon;
const CloseIcon = iconRegistry.actions.close.icon;
const CheckIcon = iconRegistry.actions.check.icon;
const SearchIcon = iconRegistry.actions.search.icon;
const MoreIcon = iconRegistry.arrows.moreHorizontal.icon;
const TrapIcon = iconRegistry.entities.trap.icon;

/** Show the filter only once the list is large enough to be worth scanning. */
const SEARCH_THRESHOLD = 6;

type UsageById = ReadonlyMap<string, number>;

/**
 * Active-trap counts per collection method. Traps sync eagerly, so this is a local
 * aggregate rather than a server round-trip.
 */
function useMethodTrapUsage(): UsageById {
	const { rows: traps } = useCollectionRows<TrapRow>(webCollections.traps);

	return useMemo(() => {
		const usage = new Map<string, number>();
		for (const trap of traps) {
			if (trap.isActive) {
				usage.set(trap.collectionMethodId, (usage.get(trap.collectionMethodId) ?? 0) + 1);
			}
		}
		return usage;
	}, [traps]);
}

function CollectionMethodsRoute() {
	const { auth } = Route.useRouteContext();
	const { canManage, organization } = useOrganizationWorkspace(auth.snapshot);
	const { activeRows, inactiveRows } = useActiveNamedCollectionRows<CollectionMethodRow>(
		webCollections.collectionMethods,
	);
	const usageById = useMethodTrapUsage();

	const [search, setSearch] = useState('');
	const query = search.trim().toLowerCase();

	const filteredActive = useMemo(() => filterMethods(activeRows, query), [activeRows, query]);
	const filteredInactive = useMemo(() => filterMethods(inactiveRows, query), [inactiveRows, query]);

	const total = activeRows.length + inactiveRows.length;
	const showSearch = total > SEARCH_THRESHOLD;
	const hasMatches = filteredActive.length + filteredInactive.length > 0;

	return (
		<OutletSimpleLayout className="grid content-start gap-5">
			<header className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
				<div className="flex min-w-0 items-start gap-3">
					<span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
						<MethodIcon aria-hidden="true" className="size-5" />
					</span>
					<div className="grid min-w-0 gap-1">
						<h1 className="text-pretty font-semibold text-foreground text-xl leading-tight">
							Collection methods
						</h1>
						<p className="max-w-[60ch] text-pretty text-muted-foreground text-sm leading-snug">
							Collection methods describe how your crews catch adult mosquitoes — light traps,
							gravid traps, resting boxes, and more. Manage the labels, action thresholds, and any
							custom fields recorded against them.
						</p>
					</div>
				</div>
				<div className="flex shrink-0 items-center gap-2">
					<AccessBadge canManage={canManage} />
					{canManage ? (
						<CollectionMethodDialog
							organization={organization}
							trigger={
								<Button type="button">
									<AddIcon aria-hidden="true" />
									Add method
								</Button>
							}
						/>
					) : null}
				</div>
			</header>

			{total === 0 ? (
				<CollectionMethodsEmpty canManage={canManage} organization={organization} />
			) : (
				<div className="grid gap-4">
					<div className="flex flex-wrap items-center justify-between gap-3">
						<div className="flex items-center gap-2">
							<Badge tone="success" variant="outline">
								{activeRows.length} active
							</Badge>
							<Badge tone="neutral" variant="outline">
								{inactiveRows.length} inactive
							</Badge>
						</div>
						{showSearch ? <SearchField value={search} onChange={setSearch} /> : null}
					</div>

					{hasMatches ? (
						<div className="grid gap-6">
							<CollectionMethodSection
								canManage={canManage}
								emptyLabel={
									query.length > 0
										? 'No active collection methods match your search.'
										: 'No active collection methods. Add one to start recording traps.'
								}
								organization={organization}
								rows={filteredActive}
								title="Active"
								tone="active"
								usageById={usageById}
							/>
							{inactiveRows.length > 0 ? (
								<CollectionMethodSection
									canManage={canManage}
									emptyLabel="No inactive collection methods match your search."
									organization={organization}
									rows={filteredInactive}
									title="Inactive"
									tone="inactive"
									usageById={usageById}
								/>
							) : null}
						</div>
					) : (
						<p className="rounded-md border border-border/40 border-dashed bg-muted/30 px-4 py-8 text-center text-muted-foreground text-sm">
							No collection methods match “{search.trim()}”.
						</p>
					)}
				</div>
			)}
		</OutletSimpleLayout>
	);
}

function filterMethods(
	rows: readonly CollectionMethodRow[],
	query: string,
): readonly CollectionMethodRow[] {
	if (query.length === 0) {
		return rows;
	}
	return rows.filter(
		(row) =>
			row.name.toLowerCase().includes(query) ||
			(row.description ?? '').toLowerCase().includes(query),
	);
}

/**
 * Count the fields a method's custom schema declares. Handles both the current
 * `{ key: { label, type, … } }` shape and legacy JSON-Schema `{ properties }` blobs.
 */
function customFieldCount(customSchema: unknown): number {
	if (typeof customSchema !== 'object' || customSchema === null || Array.isArray(customSchema)) {
		return 0;
	}
	const schema = customSchema as Record<string, unknown>;
	const properties = schema.properties;
	if (typeof properties === 'object' && properties !== null && !Array.isArray(properties)) {
		return Object.keys(properties).length;
	}
	return Object.keys(schema).length;
}

function AccessBadge({ canManage }: { readonly canManage: boolean }) {
	return (
		<Badge tone={canManage ? 'success' : 'neutral'} variant="outline">
			{canManage ? 'Editor access' : 'View only'}
		</Badge>
	);
}

function SearchField({
	value,
	onChange,
}: {
	readonly value: string;
	readonly onChange: (value: string) => void;
}) {
	return (
		<div className="relative w-full max-w-[260px]">
			<SearchIcon
				aria-hidden="true"
				className="-translate-y-1/2 pointer-events-none absolute top-1/2 left-3 size-4 text-muted-foreground"
			/>
			<Input
				aria-label="Search collection methods by name or description"
				className="h-9 pl-9"
				onChange={(event) => onChange(event.target.value)}
				placeholder="Search methods…"
				type="search"
				value={value}
			/>
		</div>
	);
}

function CollectionMethodSection({
	canManage,
	emptyLabel,
	organization,
	rows,
	title,
	tone,
	usageById,
}: {
	readonly canManage: boolean;
	readonly emptyLabel: string;
	readonly organization: OrganizationRow | null;
	readonly rows: readonly CollectionMethodRow[];
	readonly title: string;
	readonly tone: 'active' | 'inactive';
	readonly usageById: UsageById;
}) {
	return (
		<section className="grid gap-2">
			<div className="flex items-baseline justify-between gap-2">
				<h2 className="font-bold text-[0.78rem] text-muted-foreground uppercase tracking-wide">
					{title}
				</h2>
				<span className="text-muted-foreground text-xs tabular-nums">{rows.length}</span>
			</div>
			{rows.length === 0 ? (
				<p className="rounded-md bg-muted/40 px-3 py-2.5 text-muted-foreground text-sm">
					{emptyLabel}
				</p>
			) : (
				<div className="overflow-x-auto rounded-md border border-border/50">
					<Table className="table-fixed">
						<TableHeader>
							<TableRow className="bg-muted/40 hover:bg-muted/40">
								<TableHead className="w-[26%]">Method</TableHead>
								<TableHead>Description</TableHead>
								<TableHead className="w-[96px] text-right">Threshold</TableHead>
								<TableHead className="w-[116px]">Custom fields</TableHead>
								<TableHead className="w-[104px] text-right">Active traps</TableHead>
								{canManage ? (
									<TableHead className="w-[60px] text-right">
										<span className="sr-only">Actions</span>
									</TableHead>
								) : null}
							</TableRow>
						</TableHeader>
						<TableBody>
							{rows.map((method) => (
								<TableRow key={method.id}>
									<TableCell className="align-top font-medium">
										<div className="flex items-start gap-2">
											<span className="wrap-anywhere">{method.name}</span>
											{tone === 'inactive' ? (
												<Badge className="mt-0.5 shrink-0" tone="neutral" variant="outline">
													Inactive
												</Badge>
											) : null}
										</div>
									</TableCell>
									<TableCell className="align-top whitespace-normal text-muted-foreground wrap-anywhere">
										{method.description ?? 'No description'}
									</TableCell>
									<TableCell className="align-top text-right">
										<ThresholdValue threshold={method.actionThreshold} />
									</TableCell>
									<TableCell className="align-top">
										<CustomFieldsValue count={customFieldCount(method.customSchema)} />
									</TableCell>
									<TableCell className="align-top text-right">
										<TrapsCount count={usageById.get(method.id) ?? 0} />
									</TableCell>
									{canManage ? (
										<TableCell className="align-top text-right">
											<CollectionMethodRowActions
												activeTrapCount={usageById.get(method.id) ?? 0}
												method={method}
												organization={organization}
											/>
										</TableCell>
									) : null}
								</TableRow>
							))}
						</TableBody>
					</Table>
				</div>
			)}
		</section>
	);
}

function ThresholdValue({ threshold }: { readonly threshold: number | null }) {
	if (threshold === null) {
		return <span className="text-muted-foreground text-sm">None</span>;
	}
	return <span className="font-medium tabular-nums">{threshold}</span>;
}

function CustomFieldsValue({ count }: { readonly count: number }) {
	if (count === 0) {
		return (
			<Badge tone="neutral" variant="outline">
				None
			</Badge>
		);
	}
	return (
		<Badge tone="info" variant="outline">
			{count} {count === 1 ? 'field' : 'fields'}
		</Badge>
	);
}

function TrapsCount({ count }: { readonly count: number }) {
	return (
		<span
			className={cn(
				'inline-flex items-center gap-1 tabular-nums',
				count === 0 ? 'text-muted-foreground' : 'font-medium text-foreground',
			)}
		>
			<TrapIcon aria-hidden="true" className="size-3.5 text-muted-foreground" />
			{count}
		</span>
	);
}

function CollectionMethodRowActions({
	activeTrapCount,
	method,
	organization,
}: {
	readonly activeTrapCount: number;
	readonly method: CollectionMethodRow;
	readonly organization: OrganizationRow | null;
}) {
	const [editOpen, setEditOpen] = useState(false);
	// The server blocks deactivation while active traps still reference the method.
	// Traps sync locally, so disable the doomed action rather than surface its error.
	const deactivateBlocked = method.isActive && activeTrapCount > 0;

	return (
		<>
			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<Button size="icon" type="button" variant="ghost">
						<MoreIcon aria-hidden="true" />
						<span className="sr-only">Actions for {method.name}</span>
					</Button>
				</DropdownMenuTrigger>
				<DropdownMenuContent align="end" className="w-52">
					<DropdownMenuItem onSelect={() => setEditOpen(true)}>
						<EditIcon aria-hidden="true" />
						Edit
					</DropdownMenuItem>
					<DropdownMenuSeparator />
					<DropdownMenuItem
						disabled={deactivateBlocked}
						onSelect={() => toggleCollectionMethodActive(method)}
					>
						{method.isActive ? (
							<>
								<CloseIcon aria-hidden="true" />
								Deactivate
							</>
						) : (
							<>
								<CheckIcon aria-hidden="true" />
								Reactivate
							</>
						)}
					</DropdownMenuItem>
					{deactivateBlocked ? (
						<p className="px-2 pt-0.5 pb-1.5 text-muted-foreground text-xs leading-snug">
							In use by {activeTrapCount} active {activeTrapCount === 1 ? 'trap' : 'traps'}.
						</p>
					) : null}
				</DropdownMenuContent>
			</DropdownMenu>
			<CollectionMethodDialog
				method={method}
				onOpenChange={setEditOpen}
				open={editOpen}
				organization={organization}
			/>
		</>
	);
}

/** Flip a method's lifecycle in place — reversible, so no confirm step. */
function toggleCollectionMethodActive(method: CollectionMethodRow): void {
	const nextActive = !method.isActive;
	try {
		const transaction = updateAdultCollectionMethodFromValues(method, {
			...collectionMethodFormValues(method),
			isActive: nextActive,
		});
		watchPersistence(
			transaction,
			nextActive ? `Unable to reactivate ${method.name}.` : `Unable to deactivate ${method.name}.`,
		);
	} catch (saveError) {
		toast.error(errorMessageForSave(saveError));
	}
}

function CollectionMethodsEmpty({
	canManage,
	organization,
}: {
	readonly canManage: boolean;
	readonly organization: OrganizationRow | null;
}) {
	return (
		<Empty className="border-border/60">
			<EmptyHeader>
				<EmptyMedia variant="icon">
					<MethodIcon aria-hidden="true" />
				</EmptyMedia>
				<EmptyTitle>No collection methods yet</EmptyTitle>
				<EmptyDescription>
					Every trap records the method that caught its mosquitoes, so your agency needs at least
					one before crews can add traps.
					{canManage
						? ' Add your first method to get started.'
						: ' An owner or admin can add collection methods for your agency.'}
				</EmptyDescription>
			</EmptyHeader>
			{canManage ? (
				<EmptyContent>
					<CollectionMethodDialog
						organization={organization}
						trigger={
							<Button type="button">
								<AddIcon aria-hidden="true" />
								Add method
							</Button>
						}
					/>
				</EmptyContent>
			) : null}
		</Empty>
	);
}

function CollectionMethodDialog({
	method,
	onOpenChange,
	open: controlledOpen,
	organization,
	trigger,
}: {
	readonly method?: CollectionMethodRow | undefined;
	/** Controlled open handler — pair with `open` when there is no `trigger`. */
	readonly onOpenChange?: ((open: boolean) => void) | undefined;
	readonly open?: boolean | undefined;
	readonly organization: OrganizationRow | null;
	/** Uncontrolled mode: the element that opens the dialog (Add button, empty-state CTA). */
	readonly trigger?: React.ReactNode;
}) {
	const [internalOpen, setInternalOpen] = useState(false);
	const isControlled = controlledOpen !== undefined;
	const open = isControlled ? controlledOpen : internalOpen;
	const isEditing = method !== undefined;

	const form = useAppForm({
		defaultValues: collectionMethodFormValues(method),
		validators: {
			onSubmit: () =>
				organization === null ? 'Organization details are still loading.' : undefined,
		},
		onSubmit: ({ value }) => {
			try {
				const transaction = isEditing
					? updateAdultCollectionMethodFromValues(method, value)
					: createAdultCollectionMethodFromValues(organization, value);
				setOpen(false);
				watchPersistence(
					transaction,
					isEditing ? `Unable to save ${method.name}.` : 'Unable to create collection method.',
				);
			} catch (saveError) {
				toast.error(errorMessageForSave(saveError));
			}
		},
	});

	function setOpen(nextOpen: boolean) {
		if (isControlled) {
			onOpenChange?.(nextOpen);
		} else {
			setInternalOpen(nextOpen);
		}
	}

	// Reset to the current row's values whenever the dialog opens, whether opened by
	// its own trigger or programmatically from the row actions menu.
	// biome-ignore lint/correctness/useExhaustiveDependencies: form is stable; reset keyed on open.
	useEffect(() => {
		if (open) {
			form.reset(collectionMethodFormValues(method));
		}
	}, [open, method]);

	return (
		<Dialog onOpenChange={setOpen} open={open}>
			{trigger ? <DialogTrigger asChild>{trigger}</DialogTrigger> : null}
			<DialogContent className="flex max-h-[85vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-xl">
				<DialogHeader className="border-border/60 border-b px-6 py-4 pr-10 text-left">
					<DialogTitle>{isEditing ? `Edit ${method.name}` : 'Add collection method'}</DialogTitle>
					<DialogDescription>
						Manage the label, action threshold, lifecycle state, and optional custom fields.
					</DialogDescription>
				</DialogHeader>
				<form.AppForm>
					<form
						className="flex min-h-0 flex-1 flex-col"
						onSubmit={(event) => {
							event.preventDefault();
							void form.handleSubmit();
						}}
					>
						<div className="grid min-h-0 flex-1 gap-3.5 overflow-y-auto px-6 py-4">
							<form.FormErrorAlert />
							<form.AppField
								name="name"
								validators={{
									onSubmit: ({ value }) =>
										value.trim().length === 0 ? 'Method name is required.' : undefined,
								}}
							>
								{(field) => (
									<field.TextField label="Method name" placeholder="e.g. CDC light trap" />
								)}
							</form.AppField>
							<form.AppField name="description">
								{(field) => <field.TextareaField className="min-h-24" label="Description" />}
							</form.AppField>
							<form.AppField name="actionThreshold">
								{(field) => (
									<field.NumberField
										description="Mosquito count at or above this number should be treated as needing follow-up. Leave blank when the method has no count trigger."
										emptyValue={null}
										label="Action threshold"
										min={0}
										step={1}
									/>
								)}
							</form.AppField>
							<form.AppField name="isActive">
								{(field) => <field.SwitchField label="Active" />}
							</form.AppField>
							<form.AppField name="customSchema" validators={{ onSubmit: validateJsonSchemaValue }}>
								{(field) => (
									<field.JsonSchemaField
										description="Optional fields crews fill in when recording a collection with this method."
										label="Custom fields"
									/>
								)}
							</form.AppField>
						</div>
						<DialogFooter className="border-border/60 border-t px-6 py-4">
							<form.FormActions>
								<form.SubmitButton disabled={organization === null} />
								<DialogClose asChild>
									<Button type="button" variant="outline">
										<CloseIcon data-icon="inline-start" aria-hidden="true" />
										Cancel
									</Button>
								</DialogClose>
							</form.FormActions>
						</DialogFooter>
					</form>
				</form.AppForm>
			</DialogContent>
		</Dialog>
	);
}
