import type { AddressRow } from '@simmer-mosquito/sync';
import { Button } from '@simmer-mosquito/ui-web/components/ui/button';
import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from '@simmer-mosquito/ui-web/components/ui/empty';
import { Input } from '@simmer-mosquito/ui-web/components/ui/input';
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
import { useEffect, useMemo, useState } from 'react';
import { getServerUrl } from '../../../auth';
import { MapSplitPage } from '../../../components/app-shell/outlet/map-split-page';
import { ExplorerPagination } from '../../../components/explorer-pagination';
import { MapCanvas } from '../../../components/map';
import { useOrganizationWorkspace } from '../../../hooks/use-organization-workspace';
import { webCollections } from '../../../sync/webCollections';
import { AddressMapCard } from './-address-map-card';

export const Route = createFileRoute('/gis/addresses/')({
	component: AddressesExplorerRoute,
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

	const [search, setSearch] = useState('');
	const [page, setPage] = useState(0);
	const [focusedId, setFocusedId] = useState<string | null>(null);
	const [map, setMap] = useState<MapboxMap | null>(null);

	const filtered = useMemo(() => {
		const query = search.trim().toLowerCase();
		if (query.length === 0) {
			return addresses;
		}
		return addresses.filter((address) =>
			[
				address.displayName,
				address.addressLine1,
				address.locality,
				address.region,
				address.postalCode,
			].some((part) => (part ?? '').toLowerCase().includes(query)),
		);
	}, [addresses, search]);

	const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
	// biome-ignore lint/correctness/useExhaustiveDependencies: reset to the first page on a new search.
	useEffect(() => {
		setPage(0);
	}, [search]);
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
			...(trimmedSearch.length > 0 ? { filters: { search: trimmedSearch } } : {}),
			onSelectFeature: (id: string | null) => setFocusedId(id),
		}),
		[serverUrl, focusedId, trimmedSearch],
	);
	return (
		<MapSplitPage
			map={
				<>
					<MapCanvas addressLayer={addressLayer} controls={{ layers: false }} onMapReady={setMap} />
					{focusedId === null ? null : (
						<AddressMapCard id={focusedId} map={map} onClose={() => setFocusedId(null)} />
					)}
				</>
			}
		>
			<div className="flex h-full min-h-0 flex-col">
				<div className="sticky top-0 z-10 grid gap-3 border-border/50 border-b bg-background/95 p-4 backdrop-blur-sm">
					<div className="flex flex-wrap items-center justify-between gap-2">
						<div className="grid gap-1">
							<h1 className="m-0 font-semibold text-foreground text-lg leading-none">
								Address book
							</h1>
							<p className="m-0 text-muted-foreground text-sm">
								Geocoded addresses shared across surveillance and control work.
							</p>
						</div>
						<Button asChild size="sm">
							<Link to="/gis/addresses/create">
								<PlusIcon aria-hidden="true" data-icon="inline-start" />
								Create
							</Link>
						</Button>
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
							value={search}
						/>
					</div>
				</div>

				{!result.isReady ? (
					<AddressesSkeleton />
				) : filtered.length === 0 ? (
					<AddressesEmpty hasSearch={search.trim().length > 0} />
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
				title="Show on the map"
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
				title="View address details"
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
				<div className="h-12 animate-pulse rounded-md bg-muted/60" key={index} />
			))}
		</div>
	);
}

function AddressesEmpty({ hasSearch }: { readonly hasSearch: boolean }) {
	return (
		<div className="flex flex-1 items-center justify-center p-6">
			<Empty className="min-h-[200px] border border-border/40 bg-muted/30">
				<EmptyHeader>
					<EmptyMedia variant="icon">
						<AddressIcon aria-hidden="true" />
					</EmptyMedia>
					<EmptyTitle>{hasSearch ? 'No addresses match' : 'No addresses yet'}</EmptyTitle>
					<EmptyDescription>
						{hasSearch
							? 'Try a different search term.'
							: 'Create an address to build the shared address book.'}
					</EmptyDescription>
				</EmptyHeader>
			</Empty>
		</div>
	);
}
