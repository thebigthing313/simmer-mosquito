import type {
	ApplicationBatchRow,
	ApplicationRow,
	ControlMethodRow,
	EquipmentRow,
	InsecticideBatchRow,
	InsecticideRow,
	ProfileRow,
	UnitRow,
	VehicleRow,
} from '@simmer-mosquito/sync';
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
import { AdditionalPersonnelList } from '../../../components/additional-personnel-list';
import { useBreadcrumbLabel } from '../../../components/app-shell';
import { CommentsSection } from '../../../components/comments-section';
import { CustomFieldsCard } from '../../../components/custom-fields-card';
import { RecordLocationCard } from '../../../components/map/record-location-card';
import { customSchemaFor } from '../../../forms/field-components';
import { useCollectionRows } from '../../../hooks/use-collection-rows';
import { useHabitatLocationContext } from '../../../hooks/use-habitat-geometry';
import { CHEMICAL_GEOMETRY_SOURCE, useOwnedGeometry } from '../../../hooks/use-owned-geometry';
import { webCollections } from '../../../sync/webCollections';
import { ContextBadge, formatActionDate, formatAmount, nameById } from '../-control-display';
import { useHabitatNames } from '../-overview-data';
import { useApplicationBatches } from './-application-batches';

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
	const actorProfileId = snapshot?.localIdentity.profileId ?? null;
	const role = snapshot?.localIdentity.role ?? null;
	const canEdit = snapshot !== null && !(role !== null && READ_ONLY_ROLES.has(role));
	return <ApplicationDetail actorProfileId={actorProfileId} applicationId={id} canEdit={canEdit} />;
}

function ApplicationDetail({
	applicationId,
	actorProfileId,
	canEdit,
}: {
	readonly applicationId: string;
	readonly actorProfileId: string | null;
	readonly canEdit: boolean;
}) {
	// applications is on-demand; the id-scoped subset drives the shape. Status-gated
	// useLiveQuery (not the suspense variant) to avoid the post-unmount hang.
	const result = useLiveQuery(
		{
			gcTime: applicationGcTimeMs,
			query: (query) =>
				query
					.from({ application: webCollections.applications })
					.where(({ application }) => eq(application.id, applicationId))
					.findOne(),
		},
		[applicationId],
	);
	const application = result.data as ApplicationRow | undefined;

	return (
		<div className="h-full min-h-0 overflow-y-auto">
			<div className={pageContainer({ gap: 'detail', padding: 'detail' })}>
				<Link
					className="inline-flex w-fit items-center gap-1.5 text-muted-foreground text-sm hover:text-foreground"
					to="/control-operations/chemical"
				>
					<ArrowLeftIcon aria-hidden="true" />
					Back to applications
				</Link>
				{!result.isReady ? (
					<ApplicationDetailSkeleton />
				) : application === undefined ? (
					<ApplicationUnavailable />
				) : (
					<ApplicationDetailContent
						actorProfileId={actorProfileId}
						application={application}
						canEdit={canEdit}
					/>
				)}
			</div>
		</div>
	);
}

function ApplicationDetailContent({
	application,
	actorProfileId,
	canEdit,
}: {
	readonly application: ApplicationRow;
	readonly actorProfileId: string | null;
	readonly canEdit: boolean;
}) {
	const { rows: insecticides } = useCollectionRows<InsecticideRow>(webCollections.insecticides);
	const { rows: methods } = useCollectionRows<ControlMethodRow>(webCollections.applicationMethods);
	const { rows: units } = useCollectionRows<UnitRow>(webCollections.units);
	const { rows: profiles } = useCollectionRows<ProfileRow>(webCollections.profiles);
	const { rows: vehicles } = useCollectionRows<VehicleRow>(webCollections.vehicles);
	const { rows: equipment } = useCollectionRows<EquipmentRow>(webCollections.equipment);
	// habitats is on-demand; resolve just the linked habitat's name as a subset.
	const habitatIds = useMemo(
		() => (application.habitatId === null ? [] : [application.habitatId]),
		[application.habitatId],
	);
	const habitatNameById = useHabitatNames(habitatIds);

	const insecticide = insecticides.find((row) => row.id === application.insecticideId);
	const productName = insecticide === undefined ? 'Unknown product' : insecticide.tradeName;
	const unit = units.find((row) => row.id === application.applicationUnitId);
	const amount = formatAmount(application.amountApplied, unit);

	useBreadcrumbLabel(application.id, productName);

	const methodName =
		application.applicationMethodId === null
			? null
			: (methods.find((row) => row.id === application.applicationMethodId)?.name ??
				'Unknown method');
	const applicatorName =
		application.applicatorProfileId === null
			? null
			: (profiles.find((row) => row.id === application.applicatorProfileId)?.displayName ??
				'Unknown profile');
	const vehicleName =
		application.vehicleId === null
			? null
			: (vehicles.find((row) => row.id === application.vehicleId)?.vehicleName ??
				'Unknown vehicle');
	const equipmentName =
		application.equipmentId === null
			? null
			: (equipment.find((row) => row.id === application.equipmentId)?.equipmentName ??
				'Unknown equipment');
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
						{amount} · {formatActionDate(application.applicationDate)}
					</p>
				</div>
				<div className="flex flex-wrap items-center gap-2">
					<ContextBadge
						collectionId={application.collectionId}
						habitatId={application.habitatId}
						inspectionId={application.inspectionId}
					/>
					{canEdit ? (
						<Button asChild size="sm" variant="outline">
							<Link params={{ id: application.id }} to="/control-operations/chemical/$id/edit">
								<EditIcon aria-hidden="true" />
								Edit
							</Link>
						</Button>
					) : null}
				</div>
			</div>

			<div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_22rem]">
				<div className="grid min-w-0 content-start gap-5">
					<ApplicationLocationCard application={application} habitatName={habitatName} />
					<ApplicationBatchesCard
						actorProfileId={actorProfileId}
						application={application}
						canEdit={canEdit}
						productName={productName}
					/>
				</div>
				<div className="grid content-start gap-5 xl:sticky xl:top-0 xl:self-start">
					<ApplicationDetailsCard
						amount={amount}
						application={application}
						applicatorName={applicatorName}
						equipmentName={equipmentName}
						habitatName={habitatName}
						methodName={methodName}
						productName={productName}
						vehicleName={vehicleName}
					/>
					<CustomFieldsCard
						metadata={application.metadata}
						schema={customSchemaFor(methods, application.applicationMethodId)}
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
	readonly application: ApplicationRow;
	readonly habitatName: string | null;
}) {
	const geometry = useOwnedGeometry(
		CHEMICAL_GEOMETRY_SOURCE,
		application.id,
		application.updatedAt,
	);
	const habitatContext = useHabitatLocationContext(application.habitatId, habitatName);

	return (
		<RecordLocationCard
			context={habitatContext}
			emptyDescription="This application has no location to display."
			geojson={geometry.geojson}
			geomType={geometry.geomType ?? application.geomType}
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
	actorProfileId,
	canEdit,
	productName,
}: {
	readonly application: ApplicationRow;
	readonly actorProfileId: string | null;
	readonly canEdit: boolean;
	readonly productName: string;
}) {
	const linkedResult = useApplicationBatches(application.id);
	const entries = linkedResult.rows;

	// insecticide_batches is on-demand too; only this product's batches can be
	// linked, so scope the subset to the applied insecticide.
	const batchResult = useLiveQuery(
		{
			gcTime: applicationGcTimeMs,
			query: (query) =>
				query
					.from({ batch: webCollections.insecticideBatches })
					.where(({ batch }) => eq(batch.insecticideId, application.insecticideId))
					.orderBy(({ batch }) => batch.batchName, 'asc'),
		},
		[application.insecticideId],
	);
	const productBatches = (batchResult.data ?? []) as unknown as readonly InsecticideBatchRow[];
	const batchNameById = useMemo(
		() => nameById(productBatches, (batch) => batch.batchName),
		[productBatches],
	);

	const linkedIds = useMemo(
		() => new Set(entries.map((entry) => entry.insecticideBatchId)),
		[entries],
	);
	// Already-linked batches drop out of the picker; inactive ones stay out unless
	// they are already on the record.
	const selectableBatches = useMemo(
		() => productBatches.filter((batch) => batch.isActive && !linkedIds.has(batch.id)),
		[productBatches, linkedIds],
	);

	const removeBatch = useCallback((entryId: string) => {
		void webCollections.applicationBatches.delete(entryId);
	}, []);

	const addBatch = useCallback(
		(insecticideBatchId: string) => {
			const now = new Date().toISOString();
			const row: ApplicationBatchRow = {
				id: crypto.randomUUID(),
				organizationId: application.organizationId,
				applicationId: application.id,
				insecticideBatchId,
				createdByProfileId: actorProfileId,
				updatedByProfileId: actorProfileId,
				createdAt: now,
				updatedAt: now,
			};
			void webCollections.applicationBatches.insert(row);
		},
		[application.id, application.organizationId, actorProfileId],
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
													onClick={() => removeBatch(entry.id)}
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
					<AddBatchControl batches={selectableBatches} onAdd={addBatch} />
				) : null}
			</CardContent>
		</Card>
	);
}

function AddBatchControl({
	batches,
	onAdd,
}: {
	readonly batches: readonly InsecticideBatchRow[];
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
								{batch.batchName}
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
	methodName,
	applicatorName,
	vehicleName,
	equipmentName,
	habitatName,
}: {
	readonly application: ApplicationRow;
	readonly productName: string;
	readonly amount: string;
	readonly methodName: string | null;
	readonly applicatorName: string | null;
	readonly vehicleName: string | null;
	readonly equipmentName: string | null;
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
					<DetailRow label="Date">{formatActionDate(application.applicationDate)}</DetailRow>
					<DetailRow label="Method">{methodName ?? <NotSet>No method</NotSet>}</DetailRow>
					<DetailRow label="Applicator">{applicatorName ?? <NotSet>Unassigned</NotSet>}</DetailRow>
					<DetailRow label="Vehicle">{vehicleName ?? <NotSet>None</NotSet>}</DetailRow>
					<DetailRow label="Equipment">{equipmentName ?? <NotSet>None</NotSet>}</DetailRow>
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

function ApplicationUnavailable() {
	return (
		<Empty className="min-h-[280px] border border-border/40 bg-muted/30">
			<EmptyHeader>
				<EmptyTitle>Application Unavailable</EmptyTitle>
				<EmptyDescription>
					This application could not be found, or you do not have access to it.
				</EmptyDescription>
			</EmptyHeader>
		</Empty>
	);
}
