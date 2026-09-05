import { sessionFetch } from '@simmer-mosquito/sync';
import { useAppForm, validateJsonSchemaValue } from '@simmer-mosquito/ui-web/components/form';
import { Button } from '@simmer-mosquito/ui-web/components/ui/button';
import { Skeleton } from '@simmer-mosquito/ui-web/components/ui/skeleton';
import { TableCell, TableHead, TableRow } from '@simmer-mosquito/ui-web/components/ui/table';
import { iconRegistry } from '@simmer-mosquito/ui-web/icons/registry';
import { cn } from '@simmer-mosquito/ui-web/lib/utils';
import { useQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { useState } from 'react';
import { getServerUrl } from '../../../auth';
import { useAcknowledgedWrite } from '../../../components/acknowledged-write';
import {
	CatalogActionsHead,
	CatalogDialogCancel,
	CatalogFilteredList,
	CatalogNameCell,
	CatalogPage,
	CatalogRecordDialog,
	CatalogRowActions,
	CatalogSection,
	catalogFields,
	catalogFormValues,
	commitCatalogSave,
	toggleCatalogActive,
	useCatalogDialogOpen,
	useCatalogSearch,
	useResetOnOpen,
} from '../../../components/catalog';
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
import { useOrganizationWorkspace } from '../../../hooks/use-organization-workspace';

export const Route = createFileRoute('/larval-surveillance/habitats/types')({
	component: HabitatTypesRoute,
});

const TaxonomyIcon = iconRegistry.entities.taxonomy.icon;
const AddIcon = iconRegistry.actions.add.icon;
const HabitatIcon = iconRegistry.domains.larvalSurveillance.icon;

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
	const response = await sessionFetch(new URL('/map/habitats/type-usage', getServerUrl()), {
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

function matchesHabitatType(row: SchemaCatalogRecord, query: string): boolean {
	return (
		row.name.toLowerCase().includes(query) || (row.description ?? '').toLowerCase().includes(query)
	);
}

function HabitatTypesRoute() {
	const { auth } = Route.useRouteContext();
	const { canManage } = useOrganizationWorkspace(auth.snapshot);
	const { activeRecords, inactiveRecords } = useHabitatTypeRecords();
	const mutations = useHabitatTypeMutations();
	const { usageById, isLoading: usageLoading } = useHabitatTypeUsage();
	const search = useCatalogSearch(activeRecords, inactiveRecords, matchesHabitatType);

	// The header and the empty state offer the same way in, so they mount the
	// same dialog rather than each spelling out its own trigger.
	const addHabitatTypeDialog = (
		<HabitatTypeDialog
			mutations={mutations}
			trigger={
				<Button type="button">
					<AddIcon aria-hidden="true" />
					Add Habitat Type
				</Button>
			}
		/>
	);

	return (
		<CatalogPage
			action={canManage ? addHabitatTypeDialog : undefined}
			canEdit={canManage}
			description="Habitat types classify the habitats your crews inspect — catch basins, storm drains, ditches, tire piles, and the rest. Manage the labels and any custom fields you record against them."
			emptyDescription={
				<>
					Habitat types are the classification labels crews pick when recording a larval habitat.
					{canManage
						? ' Add your first type to start classifying inspections.'
						: ' An owner or admin can add habitat types for you.'}
				</>
			}
			emptyTitle="No Habitat Types Yet"
			icon={TaxonomyIcon}
			isEmpty={search.total === 0}
			title="Habitat Types"
		>
			<CatalogFilteredList
				noun="habitat types"
				search={search}
				searchLabel="Search habitat types by name or description"
				searchPlaceholder="Search habitat types…"
			>
				<HabitatTypeSection
					canManage={canManage}
					emptyLabel={
						search.query.length > 0
							? 'No active habitat types match your search.'
							: 'No active habitat types. Add one to start classifying habitats.'
					}
					mutations={mutations}
					rows={search.filteredActive}
					title="Active"
					tone="active"
					usageById={usageById}
					usageLoading={usageLoading}
				/>
				{search.inactiveCount > 0 ? (
					<HabitatTypeSection
						canManage={canManage}
						emptyLabel="No inactive habitat types match your search."
						mutations={mutations}
						rows={search.filteredInactive}
						title="Inactive"
						tone="inactive"
						usageById={usageById}
						usageLoading={usageLoading}
					/>
				) : null}
			</CatalogFilteredList>
		</CatalogPage>
	);
}

function HabitatTypeSection({
	canManage,
	emptyLabel,
	mutations,
	rows,
	title,
	tone,
	usageById,
	usageLoading,
}: {
	readonly canManage: boolean;
	readonly emptyLabel: string;
	readonly mutations: CatalogMutations;
	readonly rows: readonly SchemaCatalogRecord[];
	readonly title: string;
	readonly tone: 'active' | 'inactive';
	readonly usageById: UsageById;
	readonly usageLoading: boolean;
}) {
	return (
		<CatalogSection
			columns={
				<TableRow className="bg-muted/40 hover:bg-muted/40">
					<TableHead className="w-[28%]">Habitat Type</TableHead>
					<TableHead>Description</TableHead>
					<TableHead className="w-[22%]">Custom Fields</TableHead>
					<TableHead className="w-[104px] text-right">Active Habitats</TableHead>
					{canManage ? <CatalogActionsHead /> : null}
				</TableRow>
			}
			count={rows.length}
			emptyLabel={emptyLabel}
			title={title}
		>
			{rows.map((habitatType) => (
				<TableRow key={habitatType.id}>
					<CatalogNameCell isInactive={tone === 'inactive'} name={habitatType.name} />
					<TableCell className="align-top whitespace-normal text-muted-foreground wrap-anywhere">
						{habitatType.description ?? <EmptyValue />}
					</TableCell>
					<TableCell className="align-top">
						<CustomFieldsCell schema={habitatType.customSchema} />
					</TableCell>
					<TableCell className="align-top text-right">
						<SitesCount count={usageById.get(habitatType.id) ?? 0} isLoading={usageLoading} />
					</TableCell>
					{canManage ? (
						<TableCell className="align-top text-right">
							<HabitatTypeRowActions habitatType={habitatType} mutations={mutations} />
						</TableCell>
					) : null}
				</TableRow>
			))}
		</CatalogSection>
	);
}

function SitesCount({ count, isLoading }: { readonly count: number; readonly isLoading: boolean }) {
	if (isLoading) {
		return <Skeleton className="inline-block h-4 w-7 rounded align-middle" />;
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
	mutations,
}: {
	readonly habitatType: SchemaCatalogRecord;
	readonly mutations: CatalogMutations;
}) {
	const [editOpen, setEditOpen] = useState(false);
	// The retire here issues `deactivate` on its own, so it carries the catalog's
	// own questions rather than the dialog's.
	const { run, dialog } = useAcknowledgedWrite({ askable: mutations.refusals, ask: true });

	return (
		<>
			<CatalogRowActions
				isActive={habitatType.isActive}
				name={habitatType.name}
				onEdit={() => setEditOpen(true)}
				onToggle={() =>
					toggleCatalogActive({
						apply: (isActive) =>
							run((acknowledgements) =>
								mutations.setActive(habitatType.id, isActive, acknowledgements),
							),
						isActive: habitatType.isActive,
						name: habitatType.name,
					})
				}
			/>
			<HabitatTypeDialog
				habitatType={habitatType}
				onOpenChange={setEditOpen}
				open={editOpen}
				mutations={mutations}
			/>
			{dialog}
		</>
	);
}

function HabitatTypeDialog({
	habitatType,
	onOpenChange,
	open: controlledOpen,
	mutations,
	trigger,
}: {
	readonly habitatType?: SchemaCatalogRecord | undefined;
	/** Controlled open handler — pair with `open` when there is no `trigger`. */
	readonly onOpenChange?: ((open: boolean) => void) | undefined;
	readonly open?: boolean | undefined;
	readonly mutations: CatalogMutations;
	/** Uncontrolled mode: the element that opens the dialog (Add button, empty-state CTA). */
	readonly trigger?: React.ReactNode;
}) {
	const [open, setOpen] = useCatalogDialogOpen(controlledOpen, onOpenChange);
	const isEditing = habitatType !== undefined;
	const { run, dialog } = useAcknowledgedWrite({ askable: mutations.refusals, ask: true });

	const form = useAppForm({
		defaultValues: catalogFormValues(habitatType),
		validators: {
			onSubmit: () => (mutations.canWrite ? undefined : 'Organization details are still loading.'),
		},
		onSubmit: ({ value }) => {
			commitCatalogSave({
				failureMessage: isEditing
					? `Unable to save ${habitatType.name}.`
					: 'Unable to create habitat type.',
				// Closing is inside `run` rather than `onWritten`: `run` resolves on a
				// refusal too, so dismissing on the way past would take the form away
				// before the question could be asked.
				save: () =>
					run(async (acknowledgements) => {
						if (isEditing) {
							await mutations.save(
								habitatType.id,
								catalogFields(value),
								catalogFields(catalogFormValues(habitatType)),
								acknowledgements,
							);
						} else {
							await mutations.create(catalogFields(value));
						}
						setOpen(false);
					}),
			});
		},
	});

	useResetOnOpen(open, habitatType, () => form.reset(catalogFormValues(habitatType)));

	return (
		<>
			<form.AppForm>
				<CatalogRecordDialog
					actions={
						<form.FormActions>
							<form.SubmitButton disabled={!mutations.canWrite} />
							<CatalogDialogCancel />
						</form.FormActions>
					}
					description="Manage the label, lifecycle state, and optional custom fields."
					onOpenChange={setOpen}
					onSubmit={() => void form.handleSubmit()}
					open={open}
					title={isEditing ? `Edit ${habitatType.name}` : 'Add Habitat Type'}
					trigger={trigger}
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
				</CatalogRecordDialog>
			</form.AppForm>
			{dialog}
		</>
	);
}
