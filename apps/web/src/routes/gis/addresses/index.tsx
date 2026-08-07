import type { AddressRow } from '@simmer-mosquito/sync';
import { stickyHeader } from '@simmer-mosquito/ui-web/components/sticky-header';
import { Button } from '@simmer-mosquito/ui-web/components/ui/button';
import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from '@simmer-mosquito/ui-web/components/ui/empty';
import { Input } from '@simmer-mosquito/ui-web/components/ui/input';
import { Skeleton } from '@simmer-mosquito/ui-web/components/ui/skeleton';
import {
	ChevronRightIcon,
	iconRegistry,
	PlusIcon,
	SearchIcon,
} from '@simmer-mosquito/ui-web/icons/registry';
import { cn } from '@simmer-mosquito/ui-web/lib/utils';
import { eq, useLiveQuery } from '@tanstack/react-db';
import { createFileRoute, Link } from '@tanstack/react-router';
import type { Map as MapboxMap } from 'mapbox-gl';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { getServerUrl } from '../../../auth';
import { MapSplitPage } from '../../../components/app-shell/outlet/map-split-page';
import {
	FilterChip,
	MultiSelectFilter,
	toggle,
	useRegionMembership,
	useRegionOptions,
} from '../../../components/explorer';
import { ExplorerPagination } from '../../../components/explorer-pagination';
import { MAP_CREATE_TARGETS, MapCanvas } from '../../../components/map';
import { WriteOnly } from '../../../components/write-only';
import { useOrganizationWorkspace } from '../../../hooks/use-organization-workspace';
import {
	type FilterCodecs,
	idSetParam,
	searchValidator,
	textParam,
	useDebouncedTextFilter,
	useSearchFilters,
} from '../../../lib/search-filters';
import { webCollections } from '../../../sync/webCollections';
import { AddressMapCard } from './-address-map-card';

interface AddressFilters {
	readonly search: string;
	readonly regions: ReadonlySet<string>;
}

const ADDRESS_FILTER_DEFAULTS: AddressFilters = { search: '', regions: new Set() };
const ADDRESS_FILTER_CODECS: FilterCodecs<AddressFilters> = {
	search: textParam,
	regions: idSetParam,
};

export const Route = createFileRoute('/gis/addresses/')({
	component: AddressesExplorerRoute,
	validateSearch: searchValidator(ADDRESS_FILTER_CODECS),
});

const AddressIcon = iconRegistry.actions.searchCheck.icon;
const addressesGcTimeMs = 30_000;
const PAGE_SIZE = 25;

function AddressesExplorerRoute() {
	const { auth } = Route.useRouteContext();
	const { organization } = useOrganizationWorkspace(auth.snapshot);
	const organizationId = organization?.id ?? '';

	// addresses is on-demand; the org-scoped query drives its subset. Status-gated
	// useLiveQuery (not the suspense variant) to avoid the post-unmount hang.
	const result = useLiveQuery(
		{
			gcTime: addressesGcTimeMs,
			query: (query) =>
				query
					.from({ address: webCollections.addresses })
					.where(({ address }) => eq(address.organizationId, organizationId))
					.orderBy(({ address }) => address.displayName, 'asc'),
		},
		[organizationId],
	);
	const addresses = (result.data ?? []) as readonly AddressRow[];

	// The search term lives in the URL, so a shared link and Back out of an
	// address both land on the list the operator had narrowed to.
	const { filters: query, setFilters } = useSearchFilters(
		ADDRESS_FILTER_DEFAULTS,
		ADDRESS_FILTER_CODECS,
	);
	const search = query.search;
	const regionIds = query.regions;
	const commitSearch = useCallback((next: string) => setFilters({ search: next }), [setFilters]);
	const { input: searchInput, setInput: setSearch } = useDebouncedTextFilter(search, commitSearch);
	const setRegionIds = useCallback(
		(next: ReadonlySet<string>) => setFilters({ regions: next }),
		[setFilters],
	);
	const regions = useRegionOptions();
	// The map narrows by region server-side; the list is built from synced rows, so
	// it asks the same question of the boundaries directly.
	const regionMembership = useRegionMembership(regionIds);
	const [page, setPage] = useState(0);
	const [focusedId, setFocusedId] = useState<string | null>(null);
	const [map, setMap] = useState<MapboxMap | null>(null);

	const filtered = useMemo(() => {
		const query = search.trim().toLowerCase();
		return addresses.filter((address) => {
			const point = { lng: address.lng ?? Number.NaN, lat: address.lat ?? Number.NaN };
			if (!regionMembership.contains(point)) {
				return false;
			}
			if (query.length === 0) {
				return true;
			}
			return [
				address.displayName,
				address.addressLine1,
				address.locality,
				address.region,
				address.postalCode,
			].some((part) => (part ?? '').toLowerCase().includes(query));
		});
	}, [addresses, search, regionMembership]);

	const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
	const regionKey = [...regionIds].sort().join(',');
	// biome-ignore lint/correctness/useExhaustiveDependencies: reset to the first page on a new narrowing.
	useEffect(() => {
		setPage(0);
	}, [search, regionKey]);
	useEffect(() => {
		if (page > pageCount - 1) {
			setPage(pageCount - 1);
		}
	}, [page, pageCount]);
	const visible = filtered.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);

	// The map's point layer narrows server-side by the same search, so the visible
	// points and the list stay in lockstep as the query changes.
	const serverUrl = getServerUrl();
	const trimmedSearch = search.trim();
	const addressLayer = useMemo(
		() => ({
			serverUrl,
			selectedId: focusedId,
			filters: {
				...(trimmedSearch.length > 0 ? { search: trimmedSearch } : {}),
				...(regionKey.length > 0 ? { regionIds: regionKey.split(',') } : {}),
			},
			onSelectFeature: (id: string | null) => setFocusedId(id),
		}),
		[serverUrl, focusedId, trimmedSearch, regionKey],
	);
	return (
		<MapSplitPage
			map={
				<>
					<MapCanvas
						contextMenu={{ create: [MAP_CREATE_TARGETS.address] }}
						addressLayer={addressLayer}
						controls={{ layers: false, measure: true }}
						fitToData
						onMapReady={setMap}
					/>
					{focusedId === null ? null : (
						<AddressMapCard id={focusedId} map={map} onClose={() => setFocusedId(null)} />
					)}
				</>
			}
		>
			<div className="flex h-full min-h-0 flex-col">
				<div className={stickyHeader({ gap: 'default', padding: 'default' })}>
					<div className="flex flex-wrap items-center justify-between gap-2">
						<div className="grid gap-1">
							<h1 className="m-0 font-semibold text-foreground text-lg leading-none">
								Address Book
							</h1>
							<p className="m-0 text-muted-foreground text-sm">
								Geocoded addresses shared across surveillance and control work.
							</p>
						</div>
						<WriteOnly>
							<Button asChild size="sm">
								<Link to="/gis/addresses/create">
									<PlusIcon aria-hidden="true" data-icon="inline-start" />
									Create
								</Link>
							</Button>
						</WriteOnly>
					</div>
					<div className="relative">
						<SearchIcon
							aria-hidden="true"
							className="-translate-y-1/2 pointer-events-none absolute top-1/2 left-3 size-4 text-muted-foreground"
						/>
						<Input
							aria-label="Search addresses"
							className="pl-9"
							onChange={(event) => setSearch(event.target.value)}
							placeholder="Search addresses…"
							type="search"
							value={searchInput}
						/>
					</div>
					<div className="flex flex-wrap items-center gap-2">
						<MultiSelectFilter
							empty="No regions"
							label="Region"
							onChange={setRegionIds}
							options={regions.options}
							selected={regionIds}
						/>
						{[...regionIds].map((id) => (
							<FilterChip
								key={`region-${id}`}
								label={regions.nameById.get(id) ?? 'Unknown region'}
								onRemove={() => setRegionIds(toggle(regionIds, id))}
							/>
						))}
					</div>
				</div>

				{!result.isReady || !regionMembership.isReady ? (
					<AddressesSkeleton />
				) : filtered.length === 0 ? (
					<AddressesEmpty hasFilter={search.trim().length > 0 || regionIds.size > 0} />
				) : (
					<div className="flex min-h-0 flex-1 flex-col">
						<ul className="min-h-0 flex-1 overflow-y-auto p-2">
							{visible.map((address) => (
								<AddressRowItem
									address={address}
									isFocused={address.id === focusedId}
									key={address.id}
									onFocus={() => setFocusedId(address.id)}
								/>
							))}
						</ul>
						{pageCount > 1 ? (
							<div className="border-border/50 border-t p-3">
								<ExplorerPagination
									noun="addresses"
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

function AddressRowItem({
	address,
	isFocused,
	onFocus,
}: {
	readonly address: AddressRow;
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
				title="Show on the Map"
				type="button"
			>
				<span className="block truncate font-medium text-foreground text-sm hover:text-primary">
					{address.displayName}
				</span>
				<span className="block text-muted-foreground text-xs leading-snug">
					{fullAddress(address) || '—'}
				</span>
			</button>
			<Link
				aria-label={`View details for ${address.displayName}`}
				className="flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
				params={{ id: address.id }}
				title="View Address Details"
				to="/gis/addresses/$id"
			>
				<ChevronRightIcon aria-hidden="true" className="size-4" />
			</Link>
		</li>
	);
}

/** The complete postal address as a readable line: street, unit · city, state postal · country. */
function fullAddress(address: AddressRow): string {
	const street = joinParts([address.addressLine1, address.addressLine2], ', ');
	const cityStateZip = joinParts(
		[joinParts([address.locality, address.region], ', '), address.postalCode],
		' ',
	);
	// US is the default and appears on nearly every row, so only surface a country
	// when it adds information.
	const country = address.country.trim() === 'US' ? null : address.country;
	return joinParts([street, cityStateZip, country], ' · ');
}

function joinParts(parts: readonly (string | null | undefined)[], separator: string): string {
	return parts
		.map((part) => part?.trim() ?? '')
		.filter((part) => part.length > 0)
		.join(separator);
}

function AddressesSkeleton() {
	return (
		<div className="grid gap-2 p-4">
			{[0, 1, 2, 3, 4].map((index) => (
				<Skeleton className="h-12" key={index} />
			))}
		</div>
	);
}

function AddressesEmpty({ hasFilter }: { readonly hasFilter: boolean }) {
	return (
		<div className="flex flex-1 items-center justify-center p-6">
			<Empty className="min-h-[200px] border border-border/40 bg-muted/30">
				<EmptyHeader>
					<EmptyMedia variant="icon">
						<AddressIcon aria-hidden="true" />
					</EmptyMedia>
					<EmptyTitle>{hasFilter ? 'No Addresses Match' : 'No Addresses Yet'}</EmptyTitle>
					<EmptyDescription>
						{hasFilter
							? 'Try a different search term or region.'
							: 'Create an address to build the shared address book.'}
					</EmptyDescription>
				</EmptyHeader>
			</Empty>
		</div>
	);
}
