import type { ControlMethodRow, OrganizationRow } from '@simmer-mosquito/sync';
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
import { iconRegistry, type RegistryIcon } from '@simmer-mosquito/ui-web/icons/registry';
import type { Collection } from '@tanstack/react-db';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { OutletSimpleLayout } from '../../components/app-shell/outlet/simple-layout';
import { useAppForm } from '../../forms';
import { validateJsonSchemaValue } from '../../forms/field-components';
import { useActiveNamedCollectionRows } from '../../hooks/use-active-named-collection-rows';
import {
	controlMethodFormValues,
	createControlMethodFromValues,
	errorMessageForSave,
	updateControlMethodFromValues,
	watchPersistence,
} from '../my-organization/-components/helpers';
import type { ControlMethodCollectionKey } from '../my-organization/-components/types';

// Chemical, source reduction, and biocontrol each manage their own method catalog.
// The catalogs are the same shape (name + lifecycle + optional custom fields), so
// the three routes render this page with their own copy and collection key.

const AddIcon = iconRegistry.actions.add.icon;
const EditIcon = iconRegistry.actions.edit.icon;
const CloseIcon = iconRegistry.actions.close.icon;
const CheckIcon = iconRegistry.actions.check.icon;
const SearchIcon = iconRegistry.actions.search.icon;
const MoreIcon = iconRegistry.arrows.moreHorizontal.icon;

/** Show the filter only once the list is large enough to be worth scanning. */
const SEARCH_THRESHOLD = 6;

export interface ControlMethodsPageProps {
	readonly collectionKey: ControlMethodCollectionKey;
	readonly collection: Collection<ControlMethodRow, string | number>;
	readonly canManage: boolean;
	readonly organization: OrganizationRow | null;
	/** e.g. "Application methods" */
	readonly title: string;
	readonly description: string;
	/** e.g. "application method" — used in buttons, dialogs, and empty states. */
	readonly singularLabel: string;
	readonly namePlaceholder: string;
	readonly customFieldsDescription: string;
	readonly emptyDescription: string;
	readonly icon: RegistryIcon;
}

export function ControlMethodsPage({
	collectionKey,
	collection,
	canManage,
	organization,
	title,
	description,
	singularLabel,
	namePlaceholder,
	customFieldsDescription,
	emptyDescription,
	icon: MethodIcon,
}: ControlMethodsPageProps) {
	const { activeRows, inactiveRows } = useActiveNamedCollectionRows<ControlMethodRow>(collection);

	const [search, setSearch] = useState('');
	const query = search.trim().toLowerCase();

	const filteredActive = useMemo(() => filterMethods(activeRows, query), [activeRows, query]);
	const filteredInactive = useMemo(() => filterMethods(inactiveRows, query), [inactiveRows, query]);

	const total = activeRows.length + inactiveRows.length;
	const showSearch = total > SEARCH_THRESHOLD;
	const hasMatches = filteredActive.length + filteredInactive.length > 0;

	const dialogProps = {
		collectionKey,
		organization,
		singularLabel,
		namePlaceholder,
		customFieldsDescription,
	};

	return (
		<OutletSimpleLayout className="grid content-start gap-5">
			<header className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
				<div className="flex min-w-0 items-start gap-3">
					<span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
						<MethodIcon aria-hidden="true" className="size-5" />
					</span>
					<div className="grid min-w-0 gap-1">
						<h1 className="text-pretty font-semibold text-foreground text-xl leading-tight">
							{title}
						</h1>
						<p className="max-w-[60ch] text-pretty text-muted-foreground text-sm leading-snug">
							{description}
						</p>
					</div>
				</div>
				<div className="flex shrink-0 items-center gap-2">
					<Badge tone={canManage ? 'success' : 'neutral'} variant="outline">
						{canManage ? 'Editor access' : 'View only'}
					</Badge>
					{canManage ? (
						<ControlMethodDialog
							{...dialogProps}
							trigger={
								<Button type="button">
									<AddIcon aria-hidden="true" />
									Add Method
								</Button>
							}
						/>
					) : null}
				</div>
			</header>

			{total === 0 ? (
				<Empty className="border-border/60">
					<EmptyHeader>
						<EmptyMedia variant="icon">
							<MethodIcon aria-hidden="true" />
						</EmptyMedia>
						<EmptyTitle>No {singularLabel}s yet</EmptyTitle>
						<EmptyDescription>
							{emptyDescription}
							{canManage
								? ' Add your first method to get started.'
								: ' An owner or admin can add methods for your agency.'}
						</EmptyDescription>
					</EmptyHeader>
					{canManage ? (
						<EmptyContent>
							<ControlMethodDialog
								{...dialogProps}
								trigger={
									<Button type="button">
										<AddIcon aria-hidden="true" />
										Add Method
									</Button>
								}
							/>
						</EmptyContent>
					) : null}
				</Empty>
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
						{showSearch ? (
							<div className="relative w-full max-w-[260px]">
								<SearchIcon
									aria-hidden="true"
									className="-translate-y-1/2 pointer-events-none absolute top-1/2 left-3 size-4 text-muted-foreground"
								/>
								<Input
									aria-label={`Search ${title.toLowerCase()} by name`}
									className="h-9 pl-9"
									onChange={(event) => setSearch(event.target.value)}
									placeholder="Search methods…"
									type="search"
									value={search}
								/>
							</div>
						) : null}
					</div>

					{hasMatches ? (
						<div className="grid gap-6">
							<ControlMethodSection
								{...dialogProps}
								canManage={canManage}
								emptyLabel={
									query.length > 0
										? `No active ${singularLabel}s match your search.`
										: `No active ${singularLabel}s. Add one to start recording work.`
								}
								rows={filteredActive}
								title="Active"
								tone="active"
							/>
							{inactiveRows.length > 0 ? (
								<ControlMethodSection
									{...dialogProps}
									canManage={canManage}
									emptyLabel={`No inactive ${singularLabel}s match your search.`}
									rows={filteredInactive}
									title="Inactive"
									tone="inactive"
								/>
							) : null}
						</div>
					) : (
						<p className="rounded-md border border-border/40 border-dashed bg-muted/30 px-4 py-8 text-center text-muted-foreground text-sm">
							No methods match “{search.trim()}”.
						</p>
					)}
				</div>
			)}
		</OutletSimpleLayout>
	);
}

function filterMethods(
	rows: readonly ControlMethodRow[],
	query: string,
): readonly ControlMethodRow[] {
	if (query.length === 0) {
		return rows;
	}
	return rows.filter((row) => row.name.toLowerCase().includes(query));
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

interface MethodDialogContext {
	readonly collectionKey: ControlMethodCollectionKey;
	readonly organization: OrganizationRow | null;
	readonly singularLabel: string;
	readonly namePlaceholder: string;
	readonly customFieldsDescription: string;
}

function ControlMethodSection({
	canManage,
	emptyLabel,
	rows,
	title,
	tone,
	...dialogContext
}: MethodDialogContext & {
	readonly canManage: boolean;
	readonly emptyLabel: string;
	readonly rows: readonly ControlMethodRow[];
	readonly title: string;
	readonly tone: 'active' | 'inactive';
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
								<TableHead>Method</TableHead>
								<TableHead className="w-[140px]">Custom Fields</TableHead>
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
									<TableCell className="align-top">
										<CustomFieldsValue count={customFieldCount(method.customSchema)} />
									</TableCell>
									{canManage ? (
										<TableCell className="align-top text-right">
											<ControlMethodRowActions {...dialogContext} method={method} />
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

function ControlMethodRowActions({
	method,
	...dialogContext
}: MethodDialogContext & { readonly method: ControlMethodRow }) {
	const [editOpen, setEditOpen] = useState(false);

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
						onSelect={() => toggleMethodActive(dialogContext.collectionKey, method)}
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
				</DropdownMenuContent>
			</DropdownMenu>
			<ControlMethodDialog
				{...dialogContext}
				method={method}
				onOpenChange={setEditOpen}
				open={editOpen}
			/>
		</>
	);
}

/**
 * Flip a method's lifecycle in place — reversible, so no confirm step. Control
 * actions sync on demand, so a local "still in use" count would undercount; let the
 * server reject a deactivation it disallows and surface that error.
 */
function toggleMethodActive(
	collectionKey: ControlMethodCollectionKey,
	method: ControlMethodRow,
): void {
	const nextActive = !method.isActive;
	try {
		const transaction = updateControlMethodFromValues(collectionKey, method, {
			...controlMethodFormValues(method),
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

function ControlMethodDialog({
	collectionKey,
	customFieldsDescription,
	method,
	namePlaceholder,
	onOpenChange,
	open: controlledOpen,
	organization,
	singularLabel,
	trigger,
}: MethodDialogContext & {
	readonly method?: ControlMethodRow | undefined;
	/** Controlled open handler — pair with `open` when there is no `trigger`. */
	readonly onOpenChange?: ((open: boolean) => void) | undefined;
	readonly open?: boolean | undefined;
	/** Uncontrolled mode: the element that opens the dialog (Add button, empty-state CTA). */
	readonly trigger?: React.ReactNode;
}) {
	const [internalOpen, setInternalOpen] = useState(false);
	const isControlled = controlledOpen !== undefined;
	const open = isControlled ? controlledOpen : internalOpen;
	const isEditing = method !== undefined;

	const form = useAppForm({
		defaultValues: controlMethodFormValues(method),
		validators: {
			onSubmit: () =>
				organization === null ? 'Organization details are still loading.' : undefined,
		},
		onSubmit: ({ value }) => {
			try {
				const transaction = isEditing
					? updateControlMethodFromValues(collectionKey, method, value)
					: createControlMethodFromValues(collectionKey, organization, value);
				setOpen(false);
				watchPersistence(
					transaction,
					isEditing ? `Unable to save ${method.name}.` : `Unable to create ${singularLabel}.`,
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
			form.reset(controlMethodFormValues(method));
		}
	}, [open, method]);

	return (
		<Dialog onOpenChange={setOpen} open={open}>
			{trigger ? <DialogTrigger asChild>{trigger}</DialogTrigger> : null}
			<DialogContent className="flex max-h-[85vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-xl">
				<DialogHeader className="border-border/60 border-b px-6 py-4 pr-10 text-left">
					<DialogTitle>{isEditing ? `Edit ${method.name}` : `Add ${singularLabel}`}</DialogTitle>
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
										value.trim().length === 0 ? 'Method name is required.' : undefined,
								}}
							>
								{(field) => <field.TextField label="Method name" placeholder={namePlaceholder} />}
							</form.AppField>
							<form.AppField name="isActive">
								{(field) => <field.SwitchField label="Active" />}
							</form.AppField>
							<form.AppField name="customSchema" validators={{ onSubmit: validateJsonSchemaValue }}>
								{(field) => (
									<field.JsonSchemaField
										description={customFieldsDescription}
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
