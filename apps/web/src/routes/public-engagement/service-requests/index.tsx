import type { ServiceRequestRow } from '@simmer-mosquito/sync';
import { Button } from '@simmer-mosquito/ui-web/components/ui/button';
import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from '@simmer-mosquito/ui-web/components/ui/empty';
import { Input } from '@simmer-mosquito/ui-web/components/ui/input';
import { ToggleGroup, ToggleGroupItem } from '@simmer-mosquito/ui-web/components/ui/toggle-group';
import {
	ChevronRightIcon,
	iconRegistry,
	PlusIcon,
	SearchIcon,
	XIcon,
} from '@simmer-mosquito/ui-web/icons/registry';
import { cn } from '@simmer-mosquito/ui-web/lib/utils';
import { eq, useLiveQuery } from '@tanstack/react-db';
import { createFileRoute, Link } from '@tanstack/react-router';
import type { Map as MapboxMap } from 'mapbox-gl';
import { useEffect, useMemo, useState } from 'react';
import { MapSplitPage } from '../../../components/app-shell/outlet/map-split-page';
import { ExplorerPagination } from '../../../components/explorer-pagination';
import { MapCanvas } from '../../../components/map';
import { useOrganizationWorkspace } from '../../../hooks/use-organization-workspace';
import { webCollections } from '../../../sync/webCollections';
import {
	formatRequestDate,
	intakeTypeLabel,
	isServiceRequestOpen,
	serviceRequestTitle,
} from '../-public-engagement-display';
import { RequestStatusBadge } from '../-public-engagement-ui';

export const Route = createFileRoute('/public-engagement/service-requests/')({
	component: ServiceRequestsExplorerRoute,
});

const RequestIcon = iconRegistry.domains.publicEngagement.icon;
const requestsGcTimeMs = 30_000;
const PAGE_SIZE = 25;

type StatusFilter = 'all' | 'open' | 'closed';

function ServiceRequestsExplorerRoute() {
	const { auth } = Route.useRouteContext();
	const { organization } = useOrganizationWorkspace(auth.snapshot);
	const organizationId = organization?.id ?? '';

	// service_requests is on-demand; the org-scoped query drives its subset.
	const result = useLiveQuery(
		{
			gcTime: requestsGcTimeMs,
			query: (query) =>
				query
					.from({ request: webCollections.serviceRequests })
					.where(({ request }) => eq(request.organizationId, organizationId))
					.orderBy(({ request }) => request.requestDate, 'desc'),
		},
		[organizationId],
	);
	const requests = (result.data ?? []) as readonly ServiceRequestRow[];

	const [status, setStatus] = useState<StatusFilter>('open');
	const [search, setSearch] = useState('');
	const [page, setPage] = useState(0);
	const [focusedId, setFocusedId] = useState<string | null>(null);
	const [map, setMap] = useState<MapboxMap | null>(null);

	const filtered = useMemo(() => {
		const query = search.trim().toLowerCase();
		return requests.filter((request) => {
			const open = isServiceRequestOpen(request);
			if (status === 'open' && !open) {
				return false;
			}
			if (status === 'closed' && open) {
				return false;
			}
			if (query.length === 0) {
				return true;
			}
			return (
				request.details.toLowerCase().includes(query) ||
				serviceRequestTitle(request).toLowerCase().includes(query)
			);
		});
	}, [requests, status, search]);

	const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
	// biome-ignore lint/correctness/useExhaustiveDependencies: reset paging when the filter set changes.
	useEffect(() => {
		setPage(0);
	}, [search, status]);
	useEffect(() => {
		if (page > pageCount - 1) {
			setPage(pageCount - 1);
		}
	}, [page, pageCount]);
	const visible = filtered.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);

	const geoJson = useMemo<GeoJSON.GeoJSON | null>(() => {
		const features = filtered
			.filter((request) => Number.isFinite(request.lat) && Number.isFinite(request.lng))
			.map(
				(request): GeoJSON.Feature => ({
					type: 'Feature',
					id: request.id,
					properties: { id: request.id },
					geometry: { type: 'Point', coordinates: [request.lng, request.lat] },
				}),
			);
		return features.length === 0 ? null : { type: 'FeatureCollection', features };
	}, [filtered]);

	// Fly to a request when it becomes focused (list click or map click).
	const focused = focusedId === null ? null : (requests.find((r) => r.id === focusedId) ?? null);
	useEffect(() => {
		if (map === null || focused === null) {
			return;
		}
		map.flyTo({
			center: [focused.lng, focused.lat],
			zoom: Math.max(map.getZoom(), 14),
			duration: 600,
		});
	}, [map, focused]);

	return (
		<MapSplitPage
			map={
				<>
					<MapCanvas
						controls={{ layers: false }}
						geoJson={geoJson}
						geoJsonInteraction={{ selectedId: focusedId, onSelectFeature: setFocusedId }}
						onMapReady={setMap}
					/>
					{focused === null ? null : (
						<RequestFocusCard request={focused} onClose={() => setFocusedId(null)} />
					)}
				</>
			}
		>
			<div className="flex h-full min-h-0 flex-col">
				<div className="sticky top-0 z-10 grid gap-3 border-border/50 border-b bg-background/95 p-4 backdrop-blur-sm">
					<div className="flex flex-wrap items-center justify-between gap-2">
						<div className="grid gap-1">
							<h1 className="m-0 font-semibold text-foreground text-lg leading-none">
								Service requests
							</h1>
							<p className="m-0 text-muted-foreground text-sm">
								Requests from the public, mapped to their reported location.
							</p>
						</div>
						<Button asChild size="sm">
							<Link to="/public-engagement/service-requests/create">
								<PlusIcon aria-hidden="true" data-icon="inline-start" />
								New request
							</Link>
						</Button>
					</div>
					<div className="flex flex-wrap items-center gap-2">
						<ToggleGroup
							aria-label="Status filter"
							onValueChange={(next) => {
								if (next === 'all' || next === 'open' || next === 'closed') {
									setStatus(next);
								}
							}}
							size="sm"
							type="single"
							value={status}
							variant="outline"
						>
							<ToggleGroupItem className="px-3 text-xs" value="open">
								Open
							</ToggleGroupItem>
							<ToggleGroupItem className="px-3 text-xs" value="closed">
								Closed
							</ToggleGroupItem>
							<ToggleGroupItem className="px-3 text-xs" value="all">
								All
							</ToggleGroupItem>
						</ToggleGroup>
						<div className="relative min-w-[12rem] flex-1">
							<SearchIcon
								aria-hidden="true"
								className="-translate-y-1/2 pointer-events-none absolute top-1/2 left-3 size-4 text-muted-foreground"
							/>
							<Input
								aria-label="Search service requests"
								className="pl-9"
								onChange={(event) => setSearch(event.target.value)}
								placeholder="Search requests…"
								type="search"
								value={search}
							/>
						</div>
					</div>
				</div>

				{!result.isReady ? (
					<RequestsSkeleton />
				) : filtered.length === 0 ? (
					<RequestsEmpty hasFilter={search.trim().length > 0 || status !== 'all'} />
				) : (
					<div className="flex min-h-0 flex-1 flex-col">
						<ul className="min-h-0 flex-1 overflow-y-auto p-2">
							{visible.map((request) => (
								<RequestRowItem
									isFocused={request.id === focusedId}
									key={request.id}
									onFocus={() => setFocusedId(request.id)}
									request={request}
								/>
							))}
						</ul>
						{pageCount > 1 ? (
							<div className="border-border/50 border-t p-3">
								<ExplorerPagination
									noun="requests"
									onPageChange={setPage}
									page={page}
									pageCount={pageCount}
									total={filtered.length}
								/>
							</div>
						) : null}
					</div>
				)}
			</div>
		</MapSplitPage>
	);
}

function RequestRowItem({
	request,
	isFocused,
	onFocus,
}: {
	readonly request: ServiceRequestRow;
	readonly isFocused: boolean;
	readonly onFocus: () => void;
}) {
	return (
		<li
			className={cn(
				'group flex items-center gap-1.5 rounded-md py-1.5 pr-1 pl-2',
				isFocused ? 'bg-primary/8' : 'hover:bg-muted/50',
			)}
		>
			<button
				className="min-w-0 flex-1 rounded-sm text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
				onClick={onFocus}
				title="Show on the map"
				type="button"
			>
				<span className="flex items-center gap-2">
					<span className="truncate font-medium text-foreground text-sm hover:text-primary">
						{serviceRequestTitle(request)}
					</span>
					<RequestStatusBadge open={isServiceRequestOpen(request)} />
				</span>
				<span className="block truncate text-muted-foreground text-xs leading-snug">
					{intakeTypeLabel(request.intakeType)} · {formatRequestDate(request.requestDate)} ·{' '}
					{request.details}
				</span>
			</button>
			<Link
				aria-label={`View ${serviceRequestTitle(request)}`}
				className="flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
				params={{ id: request.id }}
				title="View request details"
				to="/public-engagement/service-requests/$id"
			>
				<ChevronRightIcon aria-hidden="true" className="size-4" />
			</Link>
		</li>
	);
}

function RequestFocusCard({
	request,
	onClose,
}: {
	readonly request: ServiceRequestRow;
	readonly onClose: () => void;
}) {
	return (
		<div className="pointer-events-none absolute inset-x-4 bottom-4 z-10 flex justify-center motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2">
			<article className="pointer-events-auto w-full max-w-[420px] rounded-lg border border-border/60 bg-card/95 p-4 shadow-lg backdrop-blur-sm">
				<div className="flex items-start justify-between gap-3">
					<div className="grid min-w-0 gap-1">
						<div className="flex items-center gap-2">
							<h2 className="truncate font-semibold text-base text-foreground leading-tight">
								{serviceRequestTitle(request)}
							</h2>
							<RequestStatusBadge open={isServiceRequestOpen(request)} />
						</div>
						<p className="m-0 line-clamp-2 text-muted-foreground text-sm leading-snug">
							{request.details}
						</p>
					</div>
					<Button aria-label="Close" onClick={onClose} size="icon" variant="ghost">
						<XIcon aria-hidden="true" />
					</Button>
				</div>
				<div className="mt-3 flex justify-end">
					<Button asChild size="sm" variant="outline">
						<Link params={{ id: request.id }} to="/public-engagement/service-requests/$id">
							View details
							<ChevronRightIcon aria-hidden="true" />
						</Link>
					</Button>
				</div>
			</article>
		</div>
	);
}

function RequestsSkeleton() {
	return (
		<div className="grid gap-2 p-4">
			{[0, 1, 2, 3, 4].map((index) => (
				<div className="h-12 animate-pulse rounded-md bg-muted/60" key={index} />
			))}
		</div>
	);
}

function RequestsEmpty({ hasFilter }: { readonly hasFilter: boolean }) {
	return (
		<div className="flex flex-1 items-center justify-center p-6">
			<Empty className="min-h-[200px] border border-border/40 bg-muted/30">
				<EmptyHeader>
					<EmptyMedia variant="icon">
						<RequestIcon aria-hidden="true" />
					</EmptyMedia>
					<EmptyTitle>{hasFilter ? 'No requests match' : 'No service requests yet'}</EmptyTitle>
					<EmptyDescription>
						{hasFilter
							? 'Try a different filter or search term.'
							: 'Log a service request to start tracking public reports.'}
					</EmptyDescription>
				</EmptyHeader>
			</Empty>
		</div>
	);
}
