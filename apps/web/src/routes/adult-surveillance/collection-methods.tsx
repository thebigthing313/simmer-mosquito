import type { CollectionMethodRow, OrganizationRow, TrapRow } from '@simmer-mosquito/sync';
import { useAppForm, validateJsonSchemaValue } from '@simmer-mosquito/ui-web/components/form';
import { Button } from '@simmer-mosquito/ui-web/components/ui/button';
import { TableCell, TableHead, TableRow } from '@simmer-mosquito/ui-web/components/ui/table';
import { iconRegistry } from '@simmer-mosquito/ui-web/icons/registry';
import { cn } from '@simmer-mosquito/ui-web/lib/utils';
import { createFileRoute } from '@tanstack/react-router';
import { useMemo, useState } from 'react';
import {
	CatalogActionsHead,
	CatalogDialogCancel,
	CatalogFilteredList,
	CatalogNameCell,
	CatalogPage,
	CatalogRecordDialog,
	CatalogRowActions,
	CatalogSection,
	commitCatalogWrite,
	toggleCatalogLifecycle,
	useCatalogDialogOpen,
	useCatalogSearch,
	useResetOnOpen,
} from '../../components/catalog';
import { CustomFieldsCell } from '../../components/custom-fields-cell';
import { EmptyValue } from '../../components/empty-value';
import { useActiveNamedCollectionRows } from '../../hooks/use-active-named-collection-rows';
import { useCollectionRows } from '../../hooks/use-collection-rows';
import { useOrganizationWorkspace } from '../../hooks/use-organization-workspace';
import { webCollections } from '../../sync/webCollections';
import {
	collectionMethodFormValues,
	createAdultCollectionMethodFromValues,
	updateAdultCollectionMethodFromValues,
} from '../my-organization/-components/helpers';

export const Route = createFileRoute('/adult-surveillance/collection-methods')({
	component: CollectionMethodsRoute,
});

const MethodIcon = iconRegistry.generic.component.icon;
const AddIcon = iconRegistry.actions.add.icon;
const TrapIcon = iconRegistry.entities.trap.icon;

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

function matchesMethod(row: CollectionMethodRow, query: string): boolean {
	return (
		row.name.toLowerCase().includes(query) || (row.description ?? '').toLowerCase().includes(query)
	);
}

function CollectionMethodsRoute() {
	const { auth } = Route.useRouteContext();
	const { canManage, organization } = useOrganizationWorkspace(auth.snapshot);
	const { activeRows, inactiveRows } = useActiveNamedCollectionRows<CollectionMethodRow>(
		webCollections.collectionMethods,
	);
	const usageById = useMethodTrapUsage();
	const search = useCatalogSearch(activeRows, inactiveRows, matchesMethod);

	// The header and the empty state offer the same way in, so they mount the
	// same dialog rather than each spelling out its own trigger.
	const addMethodDialog = (
		<CollectionMethodDialog
			organization={organization}
			trigger={
				<Button type="button">
					<AddIcon aria-hidden="true" />
					Add Method
				</Button>
			}
		/>
	);

	return (
		<CatalogPage
			action={canManage ? addMethodDialog : undefined}
			canEdit={canManage}
			description="Collection methods describe how your crews catch adult mosquitoes — light traps with and without attractant, gravid traps, resting traps, and emergence traps. Manage the labels, action thresholds, and any custom fields recorded against them."
			emptyDescription={
				<>
					Every trap records the method that caught its mosquitoes, so your agency needs at least
					one before crews can add traps.
					{canManage
						? ' Add your first method to get started.'
						: ' An owner or admin can add collection methods for your agency.'}
				</>
			}
			emptyTitle="No Collection Methods Yet"
			icon={MethodIcon}
			isEmpty={search.total === 0}
			title="Collection Methods"
		>
			<CatalogFilteredList
				noun="collection methods"
				search={search}
				searchLabel="Search collection methods by name or description"
				searchPlaceholder="Search methods…"
			>
				<CollectionMethodSection
					canManage={canManage}
					emptyLabel={
						search.query.length > 0
							? 'No active collection methods match your search.'
							: 'No active collection methods. Add one to start recording traps.'
					}
					organization={organization}
					rows={search.filteredActive}
					title="Active"
					tone="active"
					usageById={usageById}
				/>
				{search.inactiveCount > 0 ? (
					<CollectionMethodSection
						canManage={canManage}
						emptyLabel="No inactive collection methods match your search."
						organization={organization}
						rows={search.filteredInactive}
						title="Inactive"
						tone="inactive"
						usageById={usageById}
					/>
				) : null}
			</CatalogFilteredList>
		</CatalogPage>
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
		<CatalogSection
			columns={
				<TableRow className="bg-muted/40 hover:bg-muted/40">
					<TableHead className="w-[26%]">Method</TableHead>
					<TableHead>Description</TableHead>
					<TableHead className="w-[96px] text-right">Threshold</TableHead>
					<TableHead className="w-[22%]">Custom Fields</TableHead>
					<TableHead className="w-[104px] text-right">Active Traps</TableHead>
					{canManage ? <CatalogActionsHead /> : null}
				</TableRow>
			}
			count={rows.length}
			emptyLabel={emptyLabel}
			title={title}
		>
			{rows.map((method) => (
				<TableRow key={method.id}>
					<CatalogNameCell isInactive={tone === 'inactive'} name={method.name} />
					<TableCell className="align-top whitespace-normal text-muted-foreground wrap-anywhere">
						{method.description ?? <EmptyValue />}
					</TableCell>
					<TableCell className="align-top text-right">
						<ThresholdValue threshold={method.actionThreshold} />
					</TableCell>
					<TableCell className="align-top">
						<CustomFieldsCell schema={method.customSchema} />
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
		</CatalogSection>
	);
}

function ThresholdValue({ threshold }: { readonly threshold: number | null }) {
	if (threshold === null) {
		return <span className="text-muted-foreground text-sm">None</span>;
	}
	return <span className="font-medium tabular-nums">{threshold}</span>;
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
			<CatalogRowActions
				isActive={method.isActive}
				name={method.name}
				onEdit={() => setEditOpen(true)}
				onToggle={() => toggleCollectionMethodActive(method)}
				toggleDisabled={deactivateBlocked}
				toggleHint={`In use by ${activeTrapCount} active ${activeTrapCount === 1 ? 'trap' : 'traps'}.`}
			/>
			<CollectionMethodDialog
				method={method}
				onOpenChange={setEditOpen}
				open={editOpen}
				organization={organization}
			/>
		</>
	);
}

function toggleCollectionMethodActive(method: CollectionMethodRow): void {
	toggleCatalogLifecycle({
		apply: (isActive) =>
			updateAdultCollectionMethodFromValues(method, {
				...collectionMethodFormValues(method),
				isActive,
			}),
		isActive: method.isActive,
		name: method.name,
	});
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
	const [open, setOpen] = useCatalogDialogOpen(controlledOpen, onOpenChange);
	const isEditing = method !== undefined;

	const form = useAppForm({
		defaultValues: collectionMethodFormValues(method),
		validators: {
			onSubmit: () =>
				organization === null ? 'Organization details are still loading.' : undefined,
		},
		onSubmit: ({ value }) => {
			commitCatalogWrite({
				failureMessage: isEditing
					? `Unable to save ${method.name}.`
					: 'Unable to create collection method.',
				onWritten: () => setOpen(false),
				write: () =>
					isEditing
						? updateAdultCollectionMethodFromValues(method, value)
						: createAdultCollectionMethodFromValues(organization, value),
			});
		},
	});

	useResetOnOpen(open, method, () => form.reset(collectionMethodFormValues(method)));

	return (
		<form.AppForm>
			<CatalogRecordDialog
				actions={
					<form.FormActions>
						<form.SubmitButton disabled={organization === null} />
						<CatalogDialogCancel />
					</form.FormActions>
				}
				description="Manage the label, action threshold, lifecycle state, and optional custom fields."
				onOpenChange={setOpen}
				onSubmit={() => void form.handleSubmit()}
				open={open}
				title={isEditing ? `Edit ${method.name}` : 'Add collection method'}
				trigger={trigger}
			>
				<form.FormErrorAlert />
				<form.AppField
					name="name"
					validators={{
						onSubmit: ({ value }) =>
							value.trim().length === 0 ? 'Method name is required.' : undefined,
					}}
				>
					{(field) => <field.TextField label="Method name" placeholder="e.g. CDC light trap" />}
				</form.AppField>
				<form.AppField name="description">
					{(field) => <field.TextareaField className="min-h-24" label="Description" />}
				</form.AppField>
				<form.AppField name="actionThreshold">
					{(field) => (
						<field.NumberField
							description="The count at or above which collections made this way warrant a response. Leave blank when the method has no count trigger."
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
			</CatalogRecordDialog>
		</form.AppForm>
	);
}
