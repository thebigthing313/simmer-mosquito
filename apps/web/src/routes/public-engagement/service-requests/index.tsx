import type {
	AddressRow,
	ContactRow,
	ServiceRequestRow,
	TagItemRow,
	TagRow,
} from '@simmer-mosquito/sync';
import { Badge } from '@simmer-mosquito/ui-web/components/ui/badge';
import { Button } from '@simmer-mosquito/ui-web/components/ui/button';
import {
	Command,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
} from '@simmer-mosquito/ui-web/components/ui/command';
import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from '@simmer-mosquito/ui-web/components/ui/empty';
import { Input } from '@simmer-mosquito/ui-web/components/ui/input';
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from '@simmer-mosquito/ui-web/components/ui/popover';
import { ToggleGroup, ToggleGroupItem } from '@simmer-mosquito/ui-web/components/ui/toggle-group';
import {
	CheckIcon,
	ChevronDownIcon,
	ChevronRightIcon,
	ContactIcon,
	iconRegistry,
	MapPinnedIcon,
	PlusIcon,
	SearchIcon,
	TagIcon,
	XIcon,
} from '@simmer-mosquito/ui-web/icons/registry';
import { cn } from '@simmer-mosquito/ui-web/lib/utils';
import { eq, inArray, useLiveQuery } from '@tanstack/react-db';
import { createFileRoute, Link } from '@tanstack/react-router';
import type { Map as MapboxMap } from 'mapbox-gl';
import { useEffect, useMemo, useState } from 'react';
import { MapSplitPage } from '../../../components/app-shell/outlet/map-split-page';
import { ExplorerPagination } from '../../../components/explorer-pagination';
import { MapCanvas } from '../../../components/map';
import { TagBadge } from '../../../components/tag-badge';
import { useOrganizationWorkspace } from '../../../hooks/use-organization-workspace';
import { webCollections } from '../../../sync/webCollections';
import {
	contactDisplayName,
	formatAddressLine,
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
const UNMATCHABLE_ID = '00000000-0000-0000-0000-000000000000';
const EMPTY_TAGS: readonly TagRow[] = [];

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

	// tags is an eager baseline collection, so the whole catalog is already local.
	// It drives both the filter options and the per-card chip labels.
	const tagCatalog = useLiveQuery((query) => query.from({ tag: webCollections.tags }), []);
	const tagById = useMemo(
		() => new Map((tagCatalog.data ?? []).map((tag) => [tag.id, tag as TagRow])),
		[tagCatalog.data],
	);
	const availableTags = useMemo(
		() =>
			[...tagById.values()]
				.filter((tag) => tag.isActive)
				.sort((first, second) => first.tagName.localeCompare(second.tagName)),
		[tagById],
	);

	const [status, setStatus] = useState<StatusFilter>('open');
	const [search, setSearch] = useState('');
	const [selectedTagIds, setSelectedTagIds] = useState<ReadonlySet<string>>(() => new Set());
	const [page, setPage] = useState(0);
	const [focusedId, setFocusedId] = useState<string | null>(null);
	const [map, setMap] = useState<MapboxMap | null>(null);

	// Tag filter is applied through a targeted query keyed on the (few) selected
	// tag ids — it resolves the set of request ids carrying any selected tag,
	// rather than loading tag rows for every request up front.
	const selectedTagKey = [...selectedTagIds].sort().join(',');
	const taggedRequestIds = useRequestIdsForTags(selectedTagIds);

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
			if (selectedTagIds.size > 0 && !taggedRequestIds.has(request.id)) {
				return false;
			}
			if (query.length === 0) {
				return true;
			}
			return (
				serviceRequestTitle(request).toLowerCase().includes(query) ||
				request.details.toLowerCase().includes(query)
			);
		});
	}, [requests, status, search, selectedTagIds, taggedRequestIds]);

	const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
	// biome-ignore lint/correctness/useExhaustiveDependencies: reset paging when the filter set changes.
	useEffect(() => {
		setPage(0);
	}, [search, status, selectedTagKey]);
	useEffect(() => {
		if (page > pageCount - 1) {
			setPage(pageCount - 1);
		}
	}, [page, pageCount]);
	const visible = filtered.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);

	// Resolve the related on-demand rows for the *visible page only* — a ≤25-id
	// subset that loads reliably, instead of one join over the whole request set.
	const visibleRequestIds = useStableIds(visible.map((request) => request.id));
	const visibleContactIds = useStableIds(visible.map((request) => request.contactId));
	const visibleAddressIds = useStableIds(visible.map((request) => request.addressId));
	const contacts = useContactMap(visibleContactIds);
	const addresses = useAddressMap(visibleAddressIds);
	const tagsByRequestId = useTagsByEntityId(visibleRequestIds, tagById);
	const detailsLoading = !contacts.isReady || !addresses.isReady || !tagsByRequestId.isReady;

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

	const hasTagFilter = availableTags.length > 0 || selectedTagIds.size > 0;
	const hasFilter = search.trim().length > 0 || status !== 'all' || selectedTagIds.size > 0;

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
						{hasTagFilter ? (
							<TagFilter
								onChange={setSelectedTagIds}
								options={availableTags}
								selected={selectedTagIds}
							/>
						) : null}
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
					{selectedTagIds.size > 0 ? (
						<div className="flex flex-wrap items-center gap-1.5">
							{availableTags
								.filter((tag) => selectedTagIds.has(tag.id))
								.map((tag) => (
									<RemovableTagChip
										key={tag.id}
										onRemove={() => setSelectedTagIds(toggle(selectedTagIds, tag.id))}
										tag={tag}
									/>
								))}
							<button
								className="rounded-sm px-1.5 py-0.5 text-muted-foreground text-xs hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
								onClick={() => setSelectedTagIds(new Set())}
								type="button"
							>
								Clear
							</button>
						</div>
					) : null}
				</div>

				{!result.isReady ? (
					<RequestsSkeleton />
				) : filtered.length === 0 ? (
					<RequestsEmpty hasFilter={hasFilter} />
				) : (
					<div className="flex min-h-0 flex-1 flex-col">
						<ul className="min-h-0 flex-1 overflow-y-auto p-2">
							{visible.map((request) => (
								<RequestRowItem
									address={addresses.byId.get(request.addressId) ?? null}
									contact={contacts.byId.get(request.contactId) ?? null}
									detailsLoading={detailsLoading}
									isFocused={request.id === focusedId}
									key={request.id}
									onFocus={() => setFocusedId(request.id)}
									request={request}
									tags={tagsByRequestId.byId.get(request.id) ?? EMPTY_TAGS}
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

/** Dedupe + sort an id list into a stable array reference for query deps. */
function useStableIds(ids: readonly string[]): readonly string[] {
	const key = ids.join(',');
	// biome-ignore lint/correctness/useExhaustiveDependencies: `key` captures `ids`.
	return useMemo(() => [...new Set(ids)].sort(), [key]);
}

/**
 * The set of request ids carrying any of the selected tags, resolved from the
 * on-demand `tag_items` collection with a query keyed on the (few) selected tag
 * ids. entityId is a globally-unique UUID, so a request id in this set provably
 * carries the tag regardless of the polymorphic entity_type discriminator.
 */
function useRequestIdsForTags(selectedTagIds: ReadonlySet<string>): ReadonlySet<string> {
	const tagIds = [...selectedTagIds].sort();
	const key = tagIds.join(',');
	const queryIds = tagIds.length > 0 ? tagIds : [UNMATCHABLE_ID];
	const result = useLiveQuery(
		{
			gcTime: requestsGcTimeMs,
			query: (query) =>
				query
					.from({ item: webCollections.tagItems })
					.where(({ item }) => inArray(item.tagId, queryIds)),
		},
		[key],
	);
	return useMemo(() => {
		const ids = new Set<string>();
		for (const item of (result.data ?? []) as readonly TagItemRow[]) {
			ids.add(item.entityId);
		}
		return ids;
	}, [result.data]);
}

/** Load contacts by id off the on-demand `contacts` collection, indexed by id. */
function useContactMap(ids: readonly string[]): {
	readonly byId: ReadonlyMap<string, ContactRow>;
	readonly isReady: boolean;
} {
	const idsKey = ids.join(',');
	const queryIds = ids.length > 0 ? [...ids] : [UNMATCHABLE_ID];
	const result = useLiveQuery(
		{
			gcTime: requestsGcTimeMs,
			query: (query) =>
				query
					.from({ contact: webCollections.contacts })
					.where(({ contact }) => inArray(contact.id, queryIds)),
		},
		[idsKey],
	);
	const byId = useMemo(() => {
		const map = new Map<string, ContactRow>();
		for (const contact of (result.data ?? []) as readonly ContactRow[]) {
			map.set(contact.id, contact);
		}
		return map;
	}, [result.data]);
	return { byId, isReady: result.isReady };
}

/** Load addresses by id off the on-demand `addresses` collection, indexed by id. */
function useAddressMap(ids: readonly string[]): {
	readonly byId: ReadonlyMap<string, AddressRow>;
	readonly isReady: boolean;
} {
	const idsKey = ids.join(',');
	const queryIds = ids.length > 0 ? [...ids] : [UNMATCHABLE_ID];
	const result = useLiveQuery(
		{
			gcTime: requestsGcTimeMs,
			query: (query) =>
				query
					.from({ address: webCollections.addresses })
					.where(({ address }) => inArray(address.id, queryIds)),
		},
		[idsKey],
	);
	const byId = useMemo(() => {
		const map = new Map<string, AddressRow>();
		for (const address of (result.data ?? []) as readonly AddressRow[]) {
			map.set(address.id, address);
		}
		return map;
	}, [result.data]);
	return { byId, isReady: result.isReady };
}

/**
 * Resolve the assigned tags for each entity id off the on-demand `tag_items`
 * collection, joined against the eager `tags` catalog. Filtering by `entityId`
 * alone is safe: ids are globally unique UUIDs, so only service-request tag
 * items match — and it sidesteps the snake_case/camelCase `entity_type` bridge.
 */
function useTagsByEntityId(
	entityIds: readonly string[],
	tagById: ReadonlyMap<string, TagRow>,
): { readonly byId: ReadonlyMap<string, readonly TagRow[]>; readonly isReady: boolean } {
	const idsKey = entityIds.join(',');
	const queryIds = entityIds.length > 0 ? [...entityIds] : [UNMATCHABLE_ID];
	const result = useLiveQuery(
		{
			gcTime: requestsGcTimeMs,
			query: (query) =>
				query
					.from({ item: webCollections.tagItems })
					.where(({ item }) => inArray(item.entityId, queryIds)),
		},
		[idsKey],
	);
	const byId = useMemo(() => {
		const map = new Map<string, TagRow[]>();
		for (const item of (result.data ?? []) as readonly TagItemRow[]) {
			const tag = tagById.get(item.tagId);
			if (tag === undefined) {
				continue;
			}
			const list = map.get(item.entityId) ?? [];
			if (!list.some((existing) => existing.id === tag.id)) {
				list.push(tag);
			}
			map.set(item.entityId, list);
		}
		for (const list of map.values()) {
			list.sort((first, second) => first.tagName.localeCompare(second.tagName));
		}
		return map;
	}, [result.data, tagById]);
	return { byId, isReady: result.isReady };
}

function TagFilter({
	options,
	selected,
	onChange,
}: {
	readonly options: readonly TagRow[];
	readonly selected: ReadonlySet<string>;
	readonly onChange: (next: ReadonlySet<string>) => void;
}) {
	const [open, setOpen] = useState(false);
	const count = selected.size;

	return (
		<Popover onOpenChange={setOpen} open={open}>
			<PopoverTrigger asChild>
				<Button
					aria-label="Filter by tag"
					className="h-8 justify-between font-normal"
					size="sm"
					variant="outline"
				>
					<TagIcon aria-hidden="true" className="size-3.5 text-muted-foreground" />
					<span className="truncate">Tags</span>
					<span className="flex items-center gap-1">
						{count > 0 ? (
							<Badge className="px-1.5" variant="secondary">
								{count}
							</Badge>
						) : null}
						<ChevronDownIcon aria-hidden="true" className="size-4 text-muted-foreground" />
					</span>
				</Button>
			</PopoverTrigger>
			<PopoverContent align="start" className="w-64 p-0">
				<Command>
					<CommandInput placeholder="Search tags…" />
					<CommandList>
						<CommandEmpty>No tags found.</CommandEmpty>
						<CommandGroup>
							{options.map((tag) => {
								const isSelected = selected.has(tag.id);
								return (
									<CommandItem
										key={tag.id}
										onSelect={() => onChange(toggle(selected, tag.id))}
										value={`${tag.tagName} ${tag.id}`}
									>
										<span
											className={cn(
												'flex size-4 items-center justify-center rounded-sm border',
												isSelected
													? 'border-primary bg-primary text-primary-foreground'
													: 'border-input',
											)}
										>
											{isSelected ? <CheckIcon aria-hidden="true" className="size-3" /> : null}
										</span>
										<TagBadge tag={tag} />
									</CommandItem>
								);
							})}
						</CommandGroup>
					</CommandList>
				</Command>
			</PopoverContent>
		</Popover>
	);
}

function RemovableTagChip({
	tag,
	onRemove,
}: {
	readonly tag: TagRow;
	readonly onRemove: () => void;
}) {
	return (
		<span className="inline-flex items-center gap-1">
			<TagBadge tag={tag} />
			<button
				aria-label={`Remove ${tag.tagName} filter`}
				className="rounded-full p-0.5 text-muted-foreground opacity-70 transition-opacity hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
				onClick={onRemove}
				type="button"
			>
				<XIcon aria-hidden="true" className="size-3" />
			</button>
		</span>
	);
}

function RequestRowItem({
	request,
	tags,
	contact,
	address,
	detailsLoading,
	isFocused,
	onFocus,
}: {
	readonly request: ServiceRequestRow;
	readonly tags: readonly TagRow[];
	readonly contact: ContactRow | null;
	readonly address: AddressRow | null;
	readonly detailsLoading: boolean;
	readonly isFocused: boolean;
	readonly onFocus: () => void;
}) {
	const contactLabel = contact === null ? null : contactDisplayName(contact);
	const addressLabel =
		address === null
			? null
			: formatAddressLine(address).trim() || address.displayName?.trim() || null;

	return (
		<li
			className={cn(
				'group flex items-start gap-1.5 rounded-md py-2 pr-1 pl-2',
				isFocused ? 'bg-primary/8' : 'hover:bg-muted/50',
			)}
		>
			<button
				className="min-w-0 flex-1 space-y-1.5 rounded-sm text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
				onClick={onFocus}
				title="Show on the map"
				type="button"
			>
				<span className="flex flex-wrap items-center gap-x-2 gap-y-1">
					<span className="min-w-0 truncate font-medium text-foreground text-sm hover:text-primary">
						{serviceRequestTitle(request)}
					</span>
					<RequestStatusBadge open={isServiceRequestOpen(request)} />
					{tags.map((tag) => (
						<TagBadge key={tag.id} tag={tag} />
					))}
				</span>
				<span className="flex items-start gap-1.5 text-muted-foreground text-xs">
					<ContactIcon aria-hidden="true" className="mt-0.5 size-3 shrink-0" />
					<span className={cn('min-w-0 truncate', contactLabel === null && 'italic')}>
						{contactLabel ?? (detailsLoading ? 'Loading…' : 'No contact')}
					</span>
				</span>
				{addressLabel === null && !detailsLoading ? null : (
					<span className="flex items-start gap-1.5 text-muted-foreground text-xs">
						<MapPinnedIcon aria-hidden="true" className="mt-0.5 size-3 shrink-0" />
						<span className="min-w-0">
							{addressLabel ?? <span className="italic">Loading…</span>}
						</span>
					</span>
				)}
			</button>
			<Link
				aria-label={`View ${serviceRequestTitle(request)}`}
				className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
				<div className="h-16 animate-pulse rounded-md bg-muted/60" key={index} />
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

function toggle(set: ReadonlySet<string>, id: string): ReadonlySet<string> {
	const next = new Set(set);
	if (next.has(id)) {
		next.delete(id);
	} else {
		next.add(id);
	}
	return next;
}
