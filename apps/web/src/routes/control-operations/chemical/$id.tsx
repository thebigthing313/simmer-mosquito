import type { InsecticideBatch as InsecticideBatchOption } from '@simmer-mosquito/sync';
import { backLink } from '@simmer-mosquito/ui-web/components/back-link';
import { customSchemaFor } from '@simmer-mosquito/ui-web/components/form';
import { pageContainer } from '@simmer-mosquito/ui-web/components/page-container';
import { Badge } from '@simmer-mosquito/ui-web/components/ui/badge';
import { Button } from '@simmer-mosquito/ui-web/components/ui/button';
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from '@simmer-mosquito/ui-web/components/ui/card';
import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from '@simmer-mosquito/ui-web/components/ui/empty';
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '@simmer-mosquito/ui-web/components/ui/select';
import { Skeleton } from '@simmer-mosquito/ui-web/components/ui/skeleton';
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from '@simmer-mosquito/ui-web/components/ui/table';
import { ArrowLeftIcon, iconRegistry } from '@simmer-mosquito/ui-web/icons/registry';
import { eq, useLiveQuery } from '@tanstack/react-db';
import { createFileRoute, Link } from '@tanstack/react-router';
import { type ReactNode, useCallback, useMemo, useState } from 'react';
import {
	type Acknowledgements,
	useAcknowledgedWrite,
} from '../../../components/acknowledged-write';
import { AdditionalPersonnelList } from '../../../components/additional-personnel-list';
import { useBreadcrumbLabel } from '../../../components/app-shell';
import { CommentsSection } from '../../../components/comments-section';
import { CustomFieldsCard } from '../../../components/custom-fields-card';
import { DangerZoneCard } from '../../../components/danger-zone-card';
import { LinkedAddressValueById } from '../../../components/linked-address';
import { RecordLocationCard } from '../../../components/map/record-location-card';
import { RecordRegionsBand } from '../../../components/map/record-regions-band';
import { RecordUnavailable } from '../../../components/record';
import { WriteOnly } from '../../../components/write-only';
import { useApplicationMutations } from '../../../hooks/mutations/use-application-mutations';
import type { ChemicalApplication } from '../../../hooks/queries/control-action-view';
import { useApplication } from '../../../hooks/queries/use-application';
import { useApplicationBatches } from '../../../hooks/queries/use-application-batches';
import { useApplicationMethodRoster } from '../../../hooks/queries/use-catalog-rosters';
import { useHabitatNames } from '../../../hooks/queries/use-habitat-names';
import { useHabitatLocationContext } from '../../../hooks/use-habitat-geometry';
import { CHEMICAL_GEOMETRY_SOURCE, useOwnedGeometry } from '../../../hooks/use-owned-geometry';
import { APPLICATION_DELETE_REFUSALS } from '../../../lib/acknowledgement-copy';
import { insecticide_batches } from '../../../lib/collections/insecticide_batches';
import { ContextBadge, formatActionDate, formatMeasure, nameById } from '../-control-display';

export const Route = createFileRoute('/control-operations/chemical/$id')({
	component: RouteComponent,
});

const ApplicationIcon = iconRegistry.entities.application.icon;
const InsecticideIcon = iconRegistry.entities.insecticide.icon;
const EditIcon = iconRegistry.actions.edit.icon;
const DeleteIcon = iconRegistry.actions.delete.icon;

const applicationGcTimeMs = 30_000;

// Roles that get a read-only view — no batch add/remove (mirrors the adult
// collection detail's read-only gate).
const READ_ONLY_ROLES = new Set(['viewer']);

function RouteComponent() {
	const { id } = Route.useParams();
	const { auth } = Route.useRouteContext();
	const snapshot = auth.snapshot?.authenticated === true ? auth.snapshot : null;
	const role = snapshot?.localIdentity.role ?? null;
	const canEdit = snapshot !== null && !(role !== null && READ_ONLY_ROLES.has(role));
	return <ApplicationDetail applicationId={id} canEdit={canEdit} />;
}

function ApplicationDetail({
	applicationId,
	canEdit,
}: {
	readonly applicationId: string;
	readonly canEdit: boolean;
}) {
	// One query for the application, its product, method, unit, applicator, rig and
	// address — the lookups this page used to do for itself. `applications` is
	// on-demand, so this is status-gated rather than suspending; see the hook.
	const { application, isReady, isError } = useApplication(applicationId, {
		gcTime: applicationGcTimeMs,
	});
	// Held here rather than in the danger zone, and rendered here too. The delete
	// is optimistic, so the application leaves the collection the moment the button
	// is pressed and everything below this line unmounts before the registry's
	// refusal comes back. This component survives it: the row going is what makes
	// it render `RecordUnavailable` instead.
	const { run, dialog } = useAcknowledgedWrite({
		askable: APPLICATION_DELETE_REFUSALS,
		ask: true,
	});

	return (
		<div className="h-full min-h-0 overflow-y-auto">
			<div className={pageContainer({ gap: 'detail', padding: 'detail' })}>
				<Link className={backLink()} to="/control-operations/chemical">
					<ArrowLeftIcon aria-hidden="true" />
					Back to applications
				</Link>
				{isError ? (
					<RecordUnavailable noun="application" reason="error" />
				) : !isReady ? (
					<ApplicationDetailSkeleton />
				) : application === undefined ? (
					<RecordUnavailable noun="application" reason="not-found" />
				) : (
					<ApplicationDetailContent application={application} askDelete={run} canEdit={canEdit} />
				)}
				{dialog}
			</div>
		</div>
	);
}

function ApplicationDetailContent({
	application,
	askDelete,
	canEdit,
}: {
	readonly application: ChemicalApplication;
	readonly askDelete: (
		write: (acknowledgements: Acknowledgements) => Promise<void>,
	) => Promise<void>;
	readonly canEdit: boolean;
}) {
	// The roster is still read, but only for the custom-field schema the chosen
	// method declares — the method's *name* arrives joined.
	const methods = useApplicationMethodRoster();
	const { remove } = useApplicationMutations();
	// habitats is on-demand and has no join here; resolve just the linked habitat's
	// name as a subset.
	const habitatIds = useMemo(
		() => (application.habitatId === null ? [] : [application.habitatId]),
		[application.habitatId],
	);
	const habitatNameById = useHabitatNames(habitatIds);

	const productName = application.productName;
	const amount = formatMeasure(application.amountApplied, application.unitAbbreviation);

	useBreadcrumbLabel(application.id, productName);

	const habitatName =
		application.habitatId === null
			? null
			: (habitatNameById.get(application.habitatId) ?? 'Unknown habitat');

	return (
		<>
			<div className="flex flex-wrap items-start justify-between gap-3">
				<div className="grid gap-1.5">
					<span className="inline-flex items-center gap-1.5 font-medium text-muted-foreground text-xs uppercase tracking-wide">
						<ApplicationIcon aria-hidden="true" className="size-3.5" />
						Application
					</span>
					<h1 className="m-0 font-semibold text-[1.5rem] text-foreground leading-tight">
						{productName}
					</h1>
					<p className="m-0 text-[0.95rem] text-muted-foreground">
						{amount} · {formatActionDate(application.actionDate)}
					</p>
				</div>
				<div className="flex flex-wrap items-center gap-2">
					<ContextBadge
						collectionId={application.collectionId}
						habitatId={application.habitatId}
						inspectionId={application.inspectionId}
					/>
					{canEdit ? (
						<WriteOnly>
							<Button asChild size="sm" variant="outline">
								<Link params={{ id: application.id }} to="/control-operations/chemical/$id/edit">
									<EditIcon aria-hidden="true" />
									Edit
								</Link>
							</Button>
						</WriteOnly>
					) : null}
				</div>
			</div>

			<div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_22rem]">
				<div className="grid min-w-0 content-start gap-5">
					<div className="grid content-start gap-3">
						<ApplicationLocationCard application={application} habitatName={habitatName} />
						<RecordRegionsBand
							noun="application"
							recordId={application.id}
							recordType="applications"
						/>
					</div>
					<ApplicationBatchesCard
						application={application}
						canEdit={canEdit}
						productName={productName}
					/>
					<DangerZoneCard
						ask={askDelete}
						name={productName}
						noun="chemical application"
						onDelete={(acknowledgements) => remove(application.id, acknowledgements)}
						recordId={application.id}
						recordType="application"
						returnTo="/control-operations/chemical"
					/>
				</div>
				<div className="grid content-start gap-5 xl:sticky xl:top-0 xl:self-start">
					<ApplicationDetailsCard
						amount={amount}
						application={application}
						habitatName={habitatName}
						productName={productName}
					/>
					<CustomFieldsCard
						metadata={application.metadata}
						schema={customSchemaFor(methods, application.methodId)}
					/>
					<CommentsSection
						description="Field notes, product observations, and follow-up for this application."
						target={{ type: 'application', id: application.id }}
					/>
				</div>
			</div>
		</>
	);
}

// --- location ----------------------------------------------------------------

/**
 * An application owns Point/LineString/Polygon geometry, so the detail page renders
 * the treated swath as drawn rather than collapsing it to a centroid. Electric
 * streams only the centroid (ADR 0009), so the full geometry is fetched here.
 *
 * The habitat treated draws underneath it: whether a swath covered the site it
 * was written against is the question a reviewer opens this card to answer.
 */
function ApplicationLocationCard({
	application,
	habitatName,
}: {
	readonly application: ChemicalApplication;
	readonly habitatName: string | null;
}) {
	const geometry = useOwnedGeometry(
		CHEMICAL_GEOMETRY_SOURCE,
		application.id,
		application.updatedAt.toISOString(),
	);
	const habitatContext = useHabitatLocationContext(application.habitatId, habitatName);

	return (
		<RecordLocationCard
			context={habitatContext}
			emptyDescription="This application has no location to display."
			geojson={geometry.geojson}
			geomType={geometry.geomType ?? application.geometryKind}
			isError={geometry.isError}
			isPending={geometry.isPending}
		/>
	);
}

// --- batches (add / remove only) ---------------------------------------------

/**
 * Application batches are add/remove only — there is no update path (see the
 * `noUpdate` application-batch mutation handlers), so the list is an inline
 * add form plus per-row removal.
 */
function ApplicationBatchesCard({
	application,
	canEdit,
	productName,
}: {
	readonly application: ChemicalApplication;
	readonly canEdit: boolean;
	readonly productName: string;
}) {
	const linkedResult = useApplicationBatches(application.id);
	const entries = linkedResult.rows;
	const { addBatch, removeBatch } = useApplicationMutations();

	// insecticide_batches is on-demand too; only this product's batches can be
	// linked, so scope the subset to the applied insecticide.
	const batchResult = useLiveQuery(
		{
			gcTime: applicationGcTimeMs,
			query: (query) =>
				query
					.from({ batch: insecticide_batches() })
					.where(({ batch }) => eq(batch.insecticide_id, application.insecticideId))
					.orderBy(({ batch }) => batch.batch_name, 'asc'),
		},
		[application.insecticideId],
	);
	const productBatches = batchResult.data;
	const batchNameById = useMemo(
		() => nameById(productBatches, (batch) => batch.batch_name),
		[productBatches],
	);

	const linkedIds = useMemo(
		() => new Set(entries.map((entry) => entry.insecticideBatchId)),
		[entries],
	);
	// Already-linked batches drop out of the picker; inactive ones stay out unless
	// they are already on the record.
	const selectableBatches = useMemo(
		() => productBatches.filter((batch) => batch.is_active && !linkedIds.has(batch.id)),
		[productBatches, linkedIds],
	);

	// Add and remove are their own commands, so each is one write — unlike a create,
	// where the batches ride in the application's own payload.
	const onRemoveBatch = useCallback(
		(applicationBatchId: string) => {
			void removeBatch(applicationBatchId);
		},
		[removeBatch],
	);

	const onAddBatch = useCallback(
		(insecticideBatchId: string) => {
			void addBatch(application.id, insecticideBatchId);
		},
		[addBatch, application.id],
	);

	const isReady = linkedResult.isReady && batchResult.isReady;
	const isError = linkedResult.isError || batchResult.isError;

	return (
		<Card variant="surface">
			<CardHeader className="px-4 py-4">
				<div className="flex items-start justify-between gap-3">
					<div className="grid gap-1">
						<CardTitle className="flex items-center gap-2">
							<InsecticideIcon aria-hidden="true" className="size-4 text-muted-foreground" />
							Batches
						</CardTitle>
						<CardDescription>
							The {productName} lots used on this application, for traceability.
						</CardDescription>
					</div>
					{entries.length > 0 ? (
						<Badge tone="neutral" variant="outline">
							{entries.length} {entries.length === 1 ? 'batch' : 'batches'}
						</Badge>
					) : null}
				</div>
			</CardHeader>
			<CardContent className="grid gap-3" padding="compact">
				{isError ? (
					<BatchesEmpty
						description="Batch records could not be loaded. Try again shortly."
						title="Batches Unavailable"
					/>
				) : !isReady ? (
					<div className="grid gap-2">
						{[0, 1].map((index) => (
							<Skeleton className="h-11 w-full" key={index} />
						))}
					</div>
				) : entries.length === 0 ? (
					<BatchesEmpty
						description={
							canEdit
								? 'No batches linked yet. Add the lot this treatment came from below.'
								: 'No batches have been linked to this application.'
						}
						title="No Batches Linked"
					/>
				) : (
					<div className="overflow-hidden rounded-md border border-border/40">
						<Table>
							<TableHeader>
								<TableRow className="hover:bg-transparent">
									<TableHead>Batch</TableHead>
									{canEdit ? <TableHead className="w-10" /> : null}
								</TableRow>
							</TableHeader>
							<TableBody>
								{entries.map((entry) => (
									<TableRow key={entry.id}>
										<TableCell className="font-medium">
											{batchNameById.get(entry.insecticideBatchId) ?? 'Unknown batch'}
										</TableCell>
										{canEdit ? (
											<TableCell className="text-right">
												<Button
													aria-label="Remove batch"
													onClick={() => onRemoveBatch(entry.id)}
													size="icon"
													type="button"
													variant="ghost"
												>
													<DeleteIcon aria-hidden="true" className="size-4" />
												</Button>
											</TableCell>
										) : null}
									</TableRow>
								))}
							</TableBody>
						</Table>
					</div>
				)}

				{canEdit && isReady && !isError ? (
					<AddBatchControl batches={selectableBatches} onAdd={onAddBatch} />
				) : null}
			</CardContent>
		</Card>
	);
}

function AddBatchControl({
	batches,
	onAdd,
}: {
	readonly batches: readonly InsecticideBatchOption[];
	readonly onAdd: (insecticideBatchId: string) => void;
}) {
	const [selected, setSelected] = useState('');

	if (batches.length === 0) {
		return (
			<p className="m-0 rounded-md border border-border/50 border-dashed bg-muted/20 px-3 py-2.5 text-muted-foreground text-xs">
				No further batches are available for this product. Add batches under Chemical →
				Insecticides.
			</p>
		);
	}

	return (
		<div className="grid gap-3 rounded-md border border-border/50 border-dashed bg-muted/20 p-3">
			<span className="font-medium text-foreground text-sm">Add batch</span>
			<div className="flex flex-wrap items-center gap-2">
				<Select onValueChange={setSelected} value={selected}>
					<SelectTrigger aria-label="Batch" className="min-w-[12rem] flex-1">
						<SelectValue placeholder="Select batch" />
					</SelectTrigger>
					<SelectContent>
						{batches.map((batch) => (
							<SelectItem key={batch.id} value={batch.id}>
								{batch.batch_name}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
				<Button
					disabled={selected === ''}
					onClick={() => {
						if (selected === '') {
							return;
						}
						onAdd(selected);
						setSelected('');
					}}
					size="sm"
					type="button"
				>
					Add Batch
				</Button>
			</div>
		</div>
	);
}

function BatchesEmpty({
	title,
	description,
}: {
	readonly title: string;
	readonly description: string;
}) {
	return (
		<Empty className="min-h-[120px] border border-border/40 bg-muted/30">
			<EmptyHeader>
				<EmptyMedia variant="icon">
					<InsecticideIcon aria-hidden="true" />
				</EmptyMedia>
				<EmptyTitle>{title}</EmptyTitle>
				<EmptyDescription>{description}</EmptyDescription>
			</EmptyHeader>
		</Empty>
	);
}

// --- details -----------------------------------------------------------------

function ApplicationDetailsCard({
	application,
	productName,
	amount,
	habitatName,
}: {
	readonly application: ChemicalApplication;
	readonly productName: string;
	readonly amount: string;
	readonly habitatName: string | null;
}) {
	return (
		<Card variant="surface">
			<CardHeader className="px-4 py-4">
				<CardTitle>Details</CardTitle>
			</CardHeader>
			<CardContent className="grid gap-4" padding="compact">
				<dl className="grid gap-2.5">
					<DetailRow label="Product">{productName}</DetailRow>
					<DetailRow label="Amount">{amount}</DetailRow>
					<DetailRow label="Date">{formatActionDate(application.actionDate)}</DetailRow>
					<DetailRow label="Method">
						{application.methodName ?? <NotSet>No method</NotSet>}
					</DetailRow>
					<DetailRow label="Applicator">
						{application.applicatorName ?? <NotSet>Unassigned</NotSet>}
					</DetailRow>
					<DetailRow label="Vehicle">{application.vehicleName ?? <NotSet>None</NotSet>}</DetailRow>
					<DetailRow label="Equipment">
						{application.equipmentName ?? <NotSet>None</NotSet>}
					</DetailRow>
					<DetailRow label="Habitat">
						{application.habitatId === null ? (
							<NotSet>Standalone — no habitat</NotSet>
						) : (
							<Link
								className="rounded-sm font-medium text-foreground hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
								params={{ id: application.habitatId }}
								to="/larval-surveillance/habitats/$id"
							>
								{habitatName ?? 'Unknown habitat'}
							</Link>
						)}
					</DetailRow>
					<DetailRow label="Address">
						<LinkedAddressValueById addressId={application.addressId} />
					</DetailRow>
				</dl>
				<AdditionalPersonnelList target={{ type: 'application', id: application.id }} />
			</CardContent>
		</Card>
	);
}

function DetailRow({ label, children }: { readonly label: string; readonly children: ReactNode }) {
	return (
		<div className="grid grid-cols-[92px_1fr] items-baseline gap-3 text-sm">
			<dt className="truncate text-muted-foreground">{label}</dt>
			<dd className="m-0 min-w-0 text-foreground">{children}</dd>
		</div>
	);
}

function NotSet({ children }: { readonly children: ReactNode }) {
	return <span className="text-muted-foreground">{children}</span>;
}

// --- states ------------------------------------------------------------------

function ApplicationDetailSkeleton() {
	return (
		<>
			<div className="grid gap-2">
				<Skeleton className="h-4 w-24" />
				<Skeleton className="h-8 w-64" />
			</div>
			<div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_22rem]">
				<div className="grid content-start gap-5">
					<Skeleton className="h-[360px]" />
					<Skeleton className="h-48" />
				</div>
				<Skeleton className="h-72" />
			</div>
		</>
	);
}
