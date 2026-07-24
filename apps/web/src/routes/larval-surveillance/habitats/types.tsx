import type { HabitatTypeRow, OrganizationRow } from '@simmer-mosquito/sync';
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
import { useQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { getServerUrl } from '../../../auth';
import { OutletSimpleLayout } from '../../../components/app-shell/outlet/simple-layout';
import { useAppForm } from '../../../forms';
import { validateJsonSchemaValue } from '../../../forms/field-components';
import { useActiveNamedCollectionRows } from '../../../hooks/use-active-named-collection-rows';
import { useOrganizationWorkspace } from '../../../hooks/use-organization-workspace';
import { webCollections } from '../../../sync/webCollections';
import {
	createHabitatTypeFromValues,
	errorMessageForSave,
	habitatTypeFormValues,
	updateHabitatTypeFromValues,
	watchPersistence,
} from '../../my-organization/-components/helpers';

export const Route = createFileRoute('/larval-surveillance/habitats/types')({
	component: HabitatTypesRoute,
});

const TaxonomyIcon = iconRegistry.entities.taxonomy.icon;
const AddIcon = iconRegistry.actions.add.icon;
const EditIcon = iconRegistry.actions.edit.icon;
const CloseIcon = iconRegistry.actions.close.icon;
const CheckIcon = iconRegistry.actions.check.icon;
const SearchIcon = iconRegistry.actions.search.icon;
const MoreIcon = iconRegistry.arrows.moreHorizontal.icon;
const HabitatIcon = iconRegistry.domains.larvalSurveillance.icon;

/** Show the filter only once the list is large enough to be worth scanning. */
const SEARCH_THRESHOLD = 6;

type UsageById = ReadonlyMap<string, number>;
const EMPTY_USAGE: UsageById = new Map();

/** Active-habitat counts per habitat type — habitats sync on-demand, so this is a server aggregate. */
function useHabitatTypeUsage(): { readonly usageById: UsageById; readonly isLoading: boolean } {
	const query = useQuery({
		queryKey: ['habitat-type-usage'],
		queryFn: ({ signal }) => fetchHabitatTypeUsage(signal),
		staleTime: 30_000,
	});
	return { usageById: query.data ?? EMPTY_USAGE, isLoading: query.isLoading };
}

async function fetchHabitatTypeUsage(signal: AbortSignal): Promise<UsageById> {
	const response = await fetch(new URL('/map/habitats/type-usage', getServerUrl()), {
		credentials: 'include',
		signal,
	});
	if (!response.ok) {
		throw new Error(`Habitat type usage request failed (${response.status}).`);
	}
	const body = (await response.json()) as {
		readonly usage?: readonly { readonly habitatTypeId: string; readonly activeCount: number }[];
	};
	return new Map((body.usage ?? []).map((row) => [row.habitatTypeId, row.activeCount]));
}

function HabitatTypesRoute() {
	const { auth } = Route.useRouteContext();
	const { canManage, organization } = useOrganizationWorkspace(auth.snapshot);
	const { activeRows, inactiveRows } = useActiveNamedCollectionRows<HabitatTypeRow>(
		webCollections.habitatTypes,
	);
	const { usageById, isLoading: usageLoading } = useHabitatTypeUsage();

	const [search, setSearch] = useState('');
	const query = search.trim().toLowerCase();

	const filteredActive = useMemo(() => filterTypes(activeRows, query), [activeRows, query]);
	const filteredInactive = useMemo(() => filterTypes(inactiveRows, query), [inactiveRows, query]);

	const total = activeRows.length + inactiveRows.length;
	const showSearch = total > SEARCH_THRESHOLD;
	const hasMatches = filteredActive.length + filteredInactive.length > 0;

	return (
		<OutletSimpleLayout className="grid content-start gap-5">
			<header className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
				<div className="flex min-w-0 items-start gap-3">
					<span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
						<TaxonomyIcon aria-hidden="true" className="size-5" />
					</span>
					<div className="min-w-0 grid gap-1">
						<h1 className="text-pretty font-semibold text-foreground text-xl leading-tight">
							Habitat Types
						</h1>
						<p className="max-w-[60ch] text-pretty text-muted-foreground text-sm leading-snug">
							Habitat types classify the larval sites your crews inspect — catch basins, ponds,
							ditches, and more. Manage the labels and any custom fields your agency records against
							them.
						</p>
					</div>
				</div>
				<div className="flex shrink-0 items-center gap-2">
					<AccessBadge canManage={canManage} />
					{canManage ? (
						<HabitatTypeDialog
							organization={organization}
							trigger={
								<Button type="button">
									<AddIcon aria-hidden="true" />
									Add Habitat Type
								</Button>
							}
						/>
					) : null}
				</div>
			</header>

			{total === 0 ? (
				<HabitatTypesEmpty canManage={canManage} organization={organization} />
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
							<HabitatTypeSection
								canManage={canManage}
								emptyLabel={
									query.length > 0
										? 'No active habitat types match your search.'
										: 'No active habitat types. Add one to start classifying larval sites.'
								}
								organization={organization}
								rows={filteredActive}
								title="Active"
								tone="active"
								usageById={usageById}
								usageLoading={usageLoading}
							/>
							{inactiveRows.length > 0 ? (
								<HabitatTypeSection
									canManage={canManage}
									emptyLabel="No inactive habitat types match your search."
									organization={organization}
									rows={filteredInactive}
									title="Inactive"
									tone="inactive"
									usageById={usageById}
									usageLoading={usageLoading}
								/>
							) : null}
						</div>
					) : (
						<p className="rounded-md border border-border/40 border-dashed bg-muted/30 px-4 py-8 text-center text-muted-foreground text-sm">
							No habitat types match “{search.trim()}”.
						</p>
					)}
				</div>
			)}
		</OutletSimpleLayout>
	);
}

function filterTypes(rows: readonly HabitatTypeRow[], query: string): readonly HabitatTypeRow[] {
	if (query.length === 0) {
		return rows;
	}
	return rows.filter(
		(row) =>
			row.name.toLowerCase().includes(query) ||
			(row.description ?? '').toLowerCase().includes(query),
	);
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
				aria-label="Search habitat types by name or description"
				className="h-9 pl-9"
				onChange={(event) => onChange(event.target.value)}
				placeholder="Search habitat types…"
				type="search"
				value={value}
			/>
		</div>
	);
}

function HabitatTypeSection({
	canManage,
	emptyLabel,
	organization,
	rows,
	title,
	tone,
	usageById,
	usageLoading,
}: {
	readonly canManage: boolean;
	readonly emptyLabel: string;
	readonly organization: OrganizationRow | null;
	readonly rows: readonly HabitatTypeRow[];
	readonly title: string;
	readonly tone: 'active' | 'inactive';
	readonly usageById: UsageById;
	readonly usageLoading: boolean;
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
				<div className="overflow-hidden rounded-md border border-border/50">
					<Table className="table-fixed">
						<TableHeader>
							<TableRow className="bg-muted/40 hover:bg-muted/40">
								<TableHead className="w-[28%]">Habitat Type</TableHead>
								<TableHead>Description</TableHead>
								<TableHead className="w-[112px]">Custom Fields</TableHead>
								<TableHead className="w-[104px] text-right">Active Sites</TableHead>
								{canManage ? (
									<TableHead className="w-[60px] text-right">
										<span className="sr-only">Actions</span>
									</TableHead>
								) : null}
							</TableRow>
						</TableHeader>
						<TableBody>
							{rows.map((habitatType) => (
								<TableRow key={habitatType.id}>
									<TableCell className="align-top font-medium">
										<div className="flex items-start gap-2">
											<span className="wrap-anywhere">{habitatType.name}</span>
											{tone === 'inactive' ? (
												<Badge className="mt-0.5 shrink-0" tone="neutral" variant="outline">
													Inactive
												</Badge>
											) : null}
										</div>
									</TableCell>
									<TableCell className="align-top whitespace-normal text-muted-foreground wrap-anywhere">
										{habitatType.description ?? 'No description'}
									</TableCell>
									<TableCell className="align-top">
										<Badge
											tone={habitatType.customSchema === null ? 'neutral' : 'info'}
											variant="outline"
										>
											{habitatType.customSchema === null ? 'None' : 'Configured'}
										</Badge>
									</TableCell>
									<TableCell className="align-top text-right">
										<SitesCount
											count={usageById.get(habitatType.id) ?? 0}
											isLoading={usageLoading}
										/>
									</TableCell>
									{canManage ? (
										<TableCell className="align-top text-right">
											<HabitatTypeRowActions
												habitatType={habitatType}
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

function SitesCount({ count, isLoading }: { readonly count: number; readonly isLoading: boolean }) {
	if (isLoading) {
		return <span className="inline-block h-4 w-7 animate-pulse rounded bg-muted align-middle" />;
	}
	return (
		<span
			className={cn(
				'inline-flex items-center gap-1 tabular-nums',
				count === 0 ? 'text-muted-foreground' : 'font-medium text-foreground',
			)}
		>
			<HabitatIcon aria-hidden="true" className="size-3.5 text-muted-foreground" />
			{count}
		</span>
	);
}

function HabitatTypeRowActions({
	habitatType,
	organization,
}: {
	readonly habitatType: HabitatTypeRow;
	readonly organization: OrganizationRow | null;
}) {
	const [editOpen, setEditOpen] = useState(false);

	return (
		<>
			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<Button size="icon" type="button" variant="ghost">
						<MoreIcon aria-hidden="true" />
						<span className="sr-only">Actions for {habitatType.name}</span>
					</Button>
				</DropdownMenuTrigger>
				<DropdownMenuContent align="end" className="w-44">
					<DropdownMenuItem onSelect={() => setEditOpen(true)}>
						<EditIcon aria-hidden="true" />
						Edit
					</DropdownMenuItem>
					<DropdownMenuSeparator />
					<DropdownMenuItem onSelect={() => toggleHabitatTypeActive(habitatType)}>
						{habitatType.isActive ? (
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
				</DropdownMenuContent>
			</DropdownMenu>
			<HabitatTypeDialog
				habitatType={habitatType}
				onOpenChange={setEditOpen}
				open={editOpen}
				organization={organization}
			/>
		</>
	);
}

/** Flip a habitat type's lifecycle in place — reversible, so no confirm step. */
function toggleHabitatTypeActive(habitatType: HabitatTypeRow): void {
	const nextActive = !habitatType.isActive;
	try {
		const transaction = updateHabitatTypeFromValues(habitatType, {
			...habitatTypeFormValues(habitatType),
			isActive: nextActive,
		});
		watchPersistence(
			transaction,
			nextActive
				? `Unable to reactivate ${habitatType.name}.`
				: `Unable to deactivate ${habitatType.name}.`,
		);
	} catch (saveError) {
		toast.error(errorMessageForSave(saveError));
	}
}

function HabitatTypesEmpty({
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
					<TaxonomyIcon aria-hidden="true" />
				</EmptyMedia>
				<EmptyTitle>No Habitat Types Yet</EmptyTitle>
				<EmptyDescription>
					Habitat types are the classification labels crews pick when recording a larval habitat.
					{canManage
						? ' Add your first type to start classifying inspections.'
						: ' An owner or admin can add habitat types for your agency.'}
				</EmptyDescription>
			</EmptyHeader>
			{canManage ? (
				<EmptyContent>
					<HabitatTypeDialog
						organization={organization}
						trigger={
							<Button type="button">
								<AddIcon aria-hidden="true" />
								Add Habitat Type
							</Button>
						}
					/>
				</EmptyContent>
			) : null}
		</Empty>
	);
}

function HabitatTypeDialog({
	habitatType,
	onOpenChange,
	open: controlledOpen,
	organization,
	trigger,
}: {
	readonly habitatType?: HabitatTypeRow | undefined;
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
	const isEditing = habitatType !== undefined;

	const form = useAppForm({
		defaultValues: habitatTypeFormValues(habitatType),
		validators: {
			onSubmit: () =>
				organization === null ? 'Organization details are still loading.' : undefined,
		},
		onSubmit: ({ value }) => {
			try {
				const transaction = isEditing
					? updateHabitatTypeFromValues(habitatType, value)
					: createHabitatTypeFromValues(organization, value);
				setOpen(false);
				watchPersistence(
					transaction,
					isEditing ? `Unable to save ${habitatType.name}.` : 'Unable to create habitat type.',
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
			form.reset(habitatTypeFormValues(habitatType));
		}
	}, [open, habitatType]);

	return (
		<Dialog onOpenChange={setOpen} open={open}>
			{trigger ? <DialogTrigger asChild>{trigger}</DialogTrigger> : null}
			<DialogContent className="flex max-h-[85vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-xl">
				<DialogHeader className="border-border/60 border-b px-6 py-4 pr-10 text-left">
					<DialogTitle>{isEditing ? `Edit ${habitatType.name}` : 'Add Habitat Type'}</DialogTitle>
					<DialogDescription>
						Manage the label, lifecycle state, and optional custom fields.
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
										value.trim().length === 0 ? 'Habitat type name is required.' : undefined,
								}}
							>
								{(field) => (
									<field.TextField label="Habitat type name" placeholder="e.g. Catch basin" />
								)}
							</form.AppField>
							<form.AppField name="description">
								{(field) => <field.TextareaField className="min-h-24" label="Description" />}
							</form.AppField>
							<form.AppField name="isActive">
								{(field) => <field.SwitchField label="Active" />}
							</form.AppField>
							<form.AppField name="customSchema" validators={{ onSubmit: validateJsonSchemaValue }}>
								{(field) => (
									<field.JsonSchemaField
										description="Optional fields crews fill in when recording this habitat type."
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
