import { Alert, AlertDescription } from '@simmer-mosquito/ui-web/components/ui/alert';
import { Button } from '@simmer-mosquito/ui-web/components/ui/button';
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from '@simmer-mosquito/ui-web/components/ui/card';
import { Skeleton } from '@simmer-mosquito/ui-web/components/ui/skeleton';
import { Spinner } from '@simmer-mosquito/ui-web/components/ui/spinner';
import { iconRegistry } from '@simmer-mosquito/ui-web/icons/registry';
import { cn } from '@simmer-mosquito/ui-web/lib/utils';
import { createFileRoute, Link } from '@tanstack/react-router';
import { type ReactNode, useCallback, useMemo } from 'react';
import type { AskAcknowledged } from '../../../components/acknowledged-write';
import { useBreadcrumbLabel } from '../../../components/app-shell';
import { CommentsSection } from '../../../components/comments-section';
import { DangerZoneCard } from '../../../components/danger-zone-card';
import { useControlMethodNames } from '../../../components/explorer';
import { LinkedAddressValueById } from '../../../components/linked-address';
import { RecordLocationCard } from '../../../components/map/record-location-card';
import { RecordRegionsBand } from '../../../components/map/record-regions-band';
import {
	RecordDetailColumns,
	RecordDetailHeader,
	type RecordDetailLayout,
	RecordDetailPage,
} from '../../../components/record';
import { RequestStatusBadge } from '../../../components/request-status-badge';
import { WriteOnly } from '../../../components/write-only';
import { useRequestedControlActionMutations } from '../../../hooks/mutations/use-requested-control-action-mutations';
import {
	controlTypeLabel,
	formatScheduledStart,
	missionDisplayName,
	requestDisplayName,
} from '../../../hooks/queries/operations-view';
import { useHabitatNames } from '../../../hooks/queries/use-habitat-names';
import {
	type MissionLink,
	useMissionsForRequest,
} from '../../../hooks/queries/use-missions-for-request';
import { useProfileRoster } from '../../../hooks/queries/use-profile-roster';
import {
	type RequestRecord,
	useRequestedControlAction,
} from '../../../hooks/queries/use-requested-control-action';
import { useHabitatLocationContext } from '../../../hooks/use-habitat-geometry';
import { useOrganizationTimeZone } from '../../../hooks/use-organization-time-zone';
import {
	REQUESTED_CONTROL_ACTION_GEOMETRY_SOURCE,
	useOwnedGeometry,
} from '../../../hooks/use-owned-geometry';
import { CONTROL_REQUEST_DELETE_REFUSALS } from '../../../lib/acknowledgement-copy';
import { useCommandRunner } from '../-command-runner';
import { MissionStatusBadge } from '../-operations-display';

const RequestIcon = iconRegistry.domains.controlOperations.icon;
const MissionIcon = iconRegistry.entities.route.icon;
const EditIcon = iconRegistry.actions.edit.icon;

export const Route = createFileRoute('/operations/requests-for-control/$id')({
	component: RequestDetailRoute,
});

const layout: RecordDetailLayout = {
	aside: 'wide',
	stickyAside: true,
	skeleton: { eyebrow: 'w-32', main: ['h-[360px]', 'h-40'], aside: ['h-72'] },
};

/**
 * One request for control: what was asked for, where, and what came of it.
 *
 * The request itself is a short record — most of this page is the two things
 * that answer "has anything happened about it": whether it has been resolved,
 * and which missions have been sent to it.
 */
function RequestDetailRoute() {
	const { id } = Route.useParams();
	const { request, isError, isReady } = useRequestedControlAction(id);

	const subject = request === undefined ? null : requestDisplayName(request);
	useBreadcrumbLabel(id, subject);

	return (
		<RecordDetailPage
			back={{ label: 'Back to requests for control', to: '/operations/requests-for-control' }}
			deleteRefusals={CONTROL_REQUEST_DELETE_REFUSALS}
			layout={layout}
			noun="request"
			reading={{ isError, isReady, record: request }}
		>
			{(record, askDelete) => (
				<RequestDetailContent askDelete={askDelete} request={record} subject={subject ?? ''} />
			)}
		</RecordDetailPage>
	);
}

function RequestDetailContent({
	request,
	subject,
	askDelete,
}: {
	readonly request: RequestRecord;
	readonly subject: string;
	readonly askDelete: AskAcknowledged;
}) {
	const habitatName = useLinkedHabitatName(request.habitatId);
	const requestWrites = useRequestedControlActionMutations();
	const { busy, error, run } = useCommandRunner();

	const toggleResolved = useCallback(() => {
		void run(
			() =>
				request.status === 'open'
					? requestWrites.resolve(request.id)
					: requestWrites.reopen(request.id),
			'Unable to update this request.',
		);
	}, [request.status, request.id, requestWrites, run]);

	return (
		<RecordDetailColumns
			aside={
				<>
					<RequestDetailsCard habitatName={habitatName} request={request} />
					<CommentsSection
						description="Why this was raised, what was found, and how it was settled."
						target={{ type: 'requestedControlAction', id: request.id }}
					/>
				</>
			}
			header={
				<>
					<RequestHeader
						busy={busy}
						onToggleResolved={toggleResolved}
						request={request}
						subject={subject}
					/>
					{error === null ? null : (
						<Alert variant="destructive">
							<AlertDescription>{error}</AlertDescription>
						</Alert>
					)}
				</>
			}
			layout={layout}
		>
			<div className="grid content-start gap-3">
				<RequestLocationCard habitatName={habitatName} request={request} />
				<RecordRegionsBand
					noun="request"
					recordId={request.id}
					recordType="requested_control_actions"
				/>
			</div>
			<RequestMissionsCard requestId={request.id} />
			<DangerZoneCard
				ask={askDelete}
				name={subject}
				noun="request for control"
				onDelete={(acknowledgements) => requestWrites.remove(request.id, acknowledgements)}
				recordId={request.id}
				recordType="requestedControlAction"
				returnTo="/operations/requests-for-control"
			/>
		</RecordDetailColumns>
	);
}

/** Habitats are an on-demand collection, so the linked one resolves as a subset. */
function useLinkedHabitatName(habitatId: string | null): string | null {
	const habitatIds = useMemo(() => (habitatId === null ? [] : [habitatId]), [habitatId]);
	const habitatNameById = useHabitatNames(habitatIds);
	return habitatId === null ? null : (habitatNameById.get(habitatId) ?? null);
}

function RequestHeader({
	request,
	subject,
	busy,
	onToggleResolved,
}: {
	readonly request: RequestRecord;
	readonly subject: string;
	readonly busy: boolean;
	readonly onToggleResolved: () => void;
}) {
	const isOpen = request.status === 'open';
	const timeZone = useOrganizationTimeZone();

	return (
		<RecordDetailHeader
			actions={
				<>
					<RequestStatusBadge status={request.status} />
					{/*
					 * Editing is `OWN_REQUESTED_ACTION` — the author or a manager. The
					 * browser cannot tell authorship apart, so the button shows at the
					 * write line and the server settles the rest.
					 */}
					<WriteOnly>
						<Button asChild size="sm" variant="outline">
							<Link params={{ id: request.id }} to="/operations/requests-for-control/$id/edit">
								<EditIcon aria-hidden="true" />
								Edit
							</Link>
						</Button>
					</WriteOnly>
					{/* Resolving is a manager call: it takes work off the queue. */}
					<WriteOnly minimum="manager">
						<Button
							disabled={busy}
							onClick={onToggleResolved}
							size="sm"
							variant={isOpen ? 'default' : 'outline'}
						>
							{busy ? <Spinner /> : null}
							{isOpen ? 'Mark Resolved' : 'Reopen Request'}
						</Button>
					</WriteOnly>
				</>
			}
			eyebrow="Request for Control"
			icon={RequestIcon}
			subtitle={`${controlTypeLabel(request.controlType)} · raised ${formatScheduledStart(request.requestedAt, timeZone)}`}
			title={subject}
		/>
	);
}

/**
 * Where the work was asked for.
 *
 * A request owns Point/LineString/Polygon geometry, so the card draws it as it
 * was placed rather than collapsing it to the centroid the queue map shows. The
 * linked habitat draws beneath it: whether the request covers the site it was
 * raised against is the question a planner opens this card to answer.
 */
function RequestLocationCard({
	request,
	habitatName,
}: {
	readonly request: RequestRecord;
	readonly habitatName: string | null;
}) {
	const geometry = useOwnedGeometry(
		REQUESTED_CONTROL_ACTION_GEOMETRY_SOURCE,
		request.id,
		request.updatedAt.toISOString(),
	);
	const habitatContext = useHabitatLocationContext(request.habitatId, habitatName);

	return (
		<RecordLocationCard
			context={habitatContext}
			emptyDescription="This request has no location to display."
			geojson={geometry.geojson}
			geomType={geometry.geomType ?? request.geometryKind}
			isError={geometry.isError}
			isPending={geometry.isPending}
		/>
	);
}

/**
 * The missions this request has been scheduled onto.
 *
 * A request is put on a mission by becoming one of its stops, so this is the
 * only place either record names the other. Empty is the normal state for a
 * freshly raised request, and says so rather than implying something is missing.
 */
function RequestMissionsCard({ requestId }: { readonly requestId: string }) {
	const { missions, isReady } = useMissionsForRequest(requestId);

	return (
		<Card variant="surface">
			<CardHeader className="px-4 py-4">
				<div className="grid gap-1">
					<CardTitle className="flex items-center gap-2">
						<MissionIcon aria-hidden="true" className="size-4 text-muted-foreground" />
						Missions
					</CardTitle>
					<CardDescription>The missions carrying this request as a stop.</CardDescription>
				</div>
			</CardHeader>
			<CardContent className="grid gap-2" padding="compact">
				{!isReady ? (
					<Skeleton className="h-16 w-full rounded-md" />
				) : missions.length === 0 ? (
					<p className="m-0 rounded-md border border-border/50 border-dashed bg-muted/20 px-3 py-2.5 text-muted-foreground text-sm">
						Not on a mission yet. Add it as a stop from a mission&rsquo;s page.
					</p>
				) : (
					missions.map((mission) => <MissionLinkRow key={mission.id} mission={mission} />)
				)}
			</CardContent>
		</Card>
	);
}

function MissionLinkRow({ mission }: { readonly mission: MissionLink }) {
	const timeZone = useOrganizationTimeZone();
	return (
		<Link
			className={cn(
				'grid gap-1 rounded-md border border-border/60 bg-card p-3 transition-colors',
				'hover:border-border hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
			)}
			params={{ id: mission.id }}
			to="/operations/missions/$id"
		>
			<div className="flex flex-wrap items-center gap-2">
				<span className="font-medium text-foreground text-sm">
					{missionDisplayName(mission, timeZone)}
				</span>
				<MissionStatusBadge status={mission.status} />
			</div>
			<span className="text-muted-foreground text-xs">
				{controlTypeLabel(mission.controlType)} ·{' '}
				{formatScheduledStart(mission.scheduledStartAt, timeZone)}
			</span>
		</Link>
	);
}

function RequestDetailsCard({
	request,
	habitatName,
}: {
	readonly request: RequestRecord;
	readonly habitatName: string | null;
}) {
	return (
		<Card variant="surface">
			<CardHeader className="px-4 py-4">
				<CardTitle>Details</CardTitle>
			</CardHeader>
			<CardContent padding="compact">
				<dl className="grid gap-2.5">
					<RequestFactRows request={request} />
					<RequestLinkRows habitatName={habitatName} request={request} />
				</dl>
			</CardContent>
		</Card>
	);
}

/** What was asked for, by whom, and when — the request's own fields. */
function RequestFactRows({ request }: { readonly request: RequestRecord }) {
	const methodName = useRecommendedMethodName(request.recommendedMethodId);
	const raisedBy = useProfileName(request.requestedByProfileId);
	const resolvedBy = useProfileName(request.resolvedByProfileId);
	const timeZone = useOrganizationTimeZone();

	return (
		<>
			<DetailRow label="Control type">{controlTypeLabel(request.controlType)}</DetailRow>
			<DetailRow label="Method">{methodName ?? <NotSet>No method named</NotSet>}</DetailRow>
			<DetailRow label="Summary">
				{request.summary?.trim() ? (
					<span className="whitespace-pre-wrap">{request.summary}</span>
				) : (
					<NotSet>No summary</NotSet>
				)}
			</DetailRow>
			<DetailRow label="Raised by">{raisedBy ?? <NotSet>Not recorded</NotSet>}</DetailRow>
			<DetailRow label="Raised">{formatScheduledStart(request.requestedAt, timeZone)}</DetailRow>
			{request.resolvedAt === null ? null : (
				<DetailRow label="Resolved">
					{formatScheduledStart(request.resolvedAt, timeZone)}
					{resolvedBy === null ? '' : ` · ${resolvedBy}`}
				</DetailRow>
			)}
		</>
	);
}

/** The records the request hangs off: where it is, and what surfaced it. */
function RequestLinkRows({
	request,
	habitatName,
}: {
	readonly request: RequestRecord;
	readonly habitatName: string | null;
}) {
	return (
		<>
			<DetailRow label="Address">
				<LinkedAddressValueById addressId={request.addressId} />
			</DetailRow>
			<DetailRow label="Habitat">
				{request.habitatId === null ? (
					<NotSet>None</NotSet>
				) : (
					<Link
						className={recordLinkClass}
						params={{ id: request.habitatId }}
						to="/larval-surveillance/habitats/$id"
					>
						{habitatName ?? 'Unknown habitat'}
					</Link>
				)}
			</DetailRow>
			<DetailRow label="Inspection">
				{request.inspectionId === null ? (
					<NotSet>None</NotSet>
				) : (
					<Link
						className={recordLinkClass}
						params={{ id: request.inspectionId }}
						to="/larval-surveillance/inspections/$id"
					>
						View inspection
					</Link>
				)}
			</DetailRow>
			<DetailRow label="Collection">
				{request.collectionId === null ? (
					<NotSet>None</NotSet>
				) : (
					<Link
						className={recordLinkClass}
						params={{ id: request.collectionId }}
						to="/adult-surveillance/collections/$id"
					>
						View collection
					</Link>
				)}
			</DetailRow>
		</>
	);
}

const recordLinkClass =
	'rounded-sm font-medium text-foreground hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

/**
 * The recommended method's name.
 *
 * The id is polymorphic by control type — it points at a different catalog for
 * each — so all four are searched rather than the one the type names, which
 * keeps the row honest if the type is edited afterwards.
 */
function useRecommendedMethodName(methodId: string | null): string | null {
	const methodNameById = useControlMethodNames();
	return methodId === null ? null : (methodNameById.get(methodId) ?? 'Unknown method');
}

function useProfileName(profileId: string | null): string | null {
	const profiles = useProfileRoster();
	return profileId === null
		? null
		: (profiles.find((profile) => profile.id === profileId)?.displayName ?? 'Unknown profile');
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
