import type { OutreachActionRow } from '@simmer-mosquito/sync';
import { backLink } from '@simmer-mosquito/ui-web/components/back-link';
import { customSchemaFor } from '@simmer-mosquito/ui-web/components/form';
import { pageContainer } from '@simmer-mosquito/ui-web/components/page-container';
import { Button } from '@simmer-mosquito/ui-web/components/ui/button';
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from '@simmer-mosquito/ui-web/components/ui/card';
import { Skeleton } from '@simmer-mosquito/ui-web/components/ui/skeleton';
import { ArrowLeftIcon, iconRegistry } from '@simmer-mosquito/ui-web/icons/registry';
import { eq, useLiveQuery } from '@tanstack/react-db';
import { createFileRoute, Link } from '@tanstack/react-router';
import { type ReactNode, useMemo } from 'react';
import { AdditionalPersonnelList } from '../../../components/additional-personnel-list';
import { useBreadcrumbLabel } from '../../../components/app-shell';
import { CommentsSection } from '../../../components/comments-section';
import { CustomFieldsCard } from '../../../components/custom-fields-card';
import { DangerZoneCard } from '../../../components/danger-zone-card';
import { EmptyValue } from '../../../components/empty-value';
import { LinkedAddressValueById } from '../../../components/linked-address';
import { RecordLocationCard } from '../../../components/map/record-location-card';
import { RecordUnavailable } from '../../../components/record';
import { WriteOnly } from '../../../components/write-only';
import { useOutreachMethodRoster } from '../../../hooks/queries/use-catalog-rosters';
import { useProfileRoster } from '../../../hooks/queries/use-profile-roster';
import { OUTREACH_GEOMETRY_SOURCE, useOwnedGeometry } from '../../../hooks/use-owned-geometry';
import { webCollections } from '../../../sync/webCollections';
import { formatActionDate, nameById } from '../../control-operations/-control-display';
import { formatReach } from '../-public-engagement-display';

const OutreachIcon = iconRegistry.entities.outreachAction.icon;
const EditIcon = iconRegistry.actions.edit.icon;

const outreachGcTimeMs = 30_000;

export const Route = createFileRoute('/public-engagement/outreach/$id')({
	component: RouteComponent,
});

function RouteComponent() {
	const { id } = Route.useParams();
	return <OutreachDetail actionId={id} />;
}

function OutreachDetail({ actionId }: { readonly actionId: string }) {
	// outreachActions is on-demand; status-gated useLiveQuery (not the suspense
	// variant) avoids the post-unmount hang.
	const result = useLiveQuery(
		{
			gcTime: outreachGcTimeMs,
			query: (query) =>
				query
					.from({ action: webCollections.outreachActions })
					.where(({ action }) => eq(action.id, actionId))
					.findOne(),
		},
		[actionId],
	);
	const action = result.data as OutreachActionRow | undefined;

	return (
		<div className="h-full min-h-0 overflow-y-auto">
			<div className={pageContainer({ gap: 'detail', padding: 'detail' })}>
				<Link className={backLink()} to="/public-engagement/outreach">
					<ArrowLeftIcon aria-hidden="true" />
					Back to outreach
				</Link>
				{result.isError ? (
					<RecordUnavailable noun="outreach action" reason="error" />
				) : !result.isReady ? (
					<OutreachDetailSkeleton />
				) : action === undefined ? (
					<RecordUnavailable noun="outreach action" reason="not-found" />
				) : (
					<OutreachDetailContent action={action} />
				)}
			</div>
		</div>
	);
}

function OutreachDetailContent({ action }: { readonly action: OutreachActionRow }) {
	const methods = useOutreachMethodRoster();
	const profiles = useProfileRoster();

	const methodName =
		methods.find((method) => method.id === action.outreachMethodId)?.name ?? 'Unknown method';
	const technicianNameById = useMemo(
		() => nameById(profiles, (profile) => profile.displayName),
		[profiles],
	);
	const technicianName =
		action.technicianProfileId === null
			? null
			: (technicianNameById.get(action.technicianProfileId) ?? 'Unknown technician');

	useBreadcrumbLabel(action.id, `${methodName} · ${formatActionDate(action.outreachDate)}`);

	return (
		<>
			<div className="flex flex-wrap items-start justify-between gap-3">
				<div className="grid gap-1.5">
					<span className="inline-flex items-center gap-1.5 font-medium text-muted-foreground text-xs uppercase tracking-wide">
						<OutreachIcon aria-hidden="true" className="size-3.5" />
						Outreach
					</span>
					<h1 className="m-0 font-semibold text-[1.5rem] text-foreground leading-tight">
						{methodName}
					</h1>
					<p className="m-0 text-[0.95rem] text-muted-foreground">
						{formatReach(action.reach)} reached on {formatActionDate(action.outreachDate)}
					</p>
				</div>
				<WriteOnly>
					<Button asChild size="sm" variant="outline">
						<Link params={{ id: action.id }} to="/public-engagement/outreach/$id/edit">
							<EditIcon aria-hidden="true" />
							Edit
						</Link>
					</Button>
				</WriteOnly>
			</div>

			<div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_22rem]">
				<div className="grid min-w-0 content-start gap-5">
					<OutreachLocationCard action={action} />
					<DangerZoneCard
						name={methodName}
						noun="outreach action"
						onDelete={() => webCollections.outreachActions.delete(action.id)}
						recordId={action.id}
						recordType="outreachAction"
						returnTo="/public-engagement/outreach"
					/>
				</div>
				<div className="grid content-start gap-5 xl:sticky xl:top-0 xl:self-start">
					<OutreachDetailsCard
						action={action}
						methodName={methodName}
						technicianName={technicianName}
					/>
					<CustomFieldsCard
						metadata={action.metadata}
						schema={customSchemaFor(methods, action.outreachMethodId)}
					/>
					<CommentsSection
						description="Follow-up, materials, and response notes for this outreach."
						target={{ type: 'outreachAction', id: action.id }}
					/>
				</div>
			</div>
		</>
	);
}

/**
 * An outreach action owns Point/LineString/Polygon geometry, so the detail page
 * renders the area as drawn rather than collapsing it to a centroid. Electric
 * streams only the centroid (ADR 0009), so the full shape is fetched here.
 */
function OutreachLocationCard({ action }: { readonly action: OutreachActionRow }) {
	const geometry = useOwnedGeometry(OUTREACH_GEOMETRY_SOURCE, action.id, action.updatedAt);

	return (
		<RecordLocationCard
			emptyDescription="This outreach action has no location to display."
			geojson={geometry.geojson}
			geomType={geometry.geomType ?? action.geomType}
			isError={geometry.isError}
			isPending={geometry.isPending}
		/>
	);
}

function OutreachDetailsCard({
	action,
	methodName,
	technicianName,
}: {
	readonly action: OutreachActionRow;
	readonly methodName: string;
	readonly technicianName: string | null;
}) {
	// addresses sync on demand, so resolve just the linked one as a bounded subset.
	return (
		<Card variant="surface">
			<CardHeader className="px-4 py-4">
				<CardTitle>Details</CardTitle>
			</CardHeader>
			<CardContent className="grid gap-4" padding="compact">
				<dl className="grid gap-2.5">
					<DetailRow label="Method">{methodName}</DetailRow>
					<DetailRow label="Reached">{formatReach(action.reach)}</DetailRow>
					<DetailRow label="Who">
						{action.reachDescription === null ? (
							<EmptyValue />
						) : (
							// Written in a textarea, so it can carry the crew's own line breaks.
							<span className="whitespace-pre-line">{action.reachDescription}</span>
						)}
					</DetailRow>
					<DetailRow label="Date">{formatActionDate(action.outreachDate)}</DetailRow>
					<DetailRow label="Technician">
						{technicianName ?? <span className="text-muted-foreground">Unassigned</span>}
					</DetailRow>
					<DetailRow label="Address">
						<LinkedAddressValueById addressId={action.addressId} />
					</DetailRow>
				</dl>
				<AdditionalPersonnelList target={{ type: 'outreachAction', id: action.id }} />
			</CardContent>
		</Card>
	);
}

function DetailRow({ label, children }: { readonly label: string; readonly children: ReactNode }) {
	return (
		<div className="grid grid-cols-[90px_1fr] items-baseline gap-3 text-sm">
			<dt className="truncate text-muted-foreground">{label}</dt>
			<dd className="m-0 min-w-0 text-foreground">{children}</dd>
		</div>
	);
}

function OutreachDetailSkeleton() {
	return (
		<>
			<div className="grid gap-2">
				<Skeleton className="h-4 w-20" />
				<Skeleton className="h-8 w-64" />
			</div>
			<div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_22rem]">
				<div className="grid content-start gap-5">
					<Skeleton className="h-[360px]" />
				</div>
				<Skeleton className="h-72" />
			</div>
		</>
	);
}
