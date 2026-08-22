import { SearchField } from '@simmer-mosquito/ui-web/components/search-field';
import { iconRegistry } from '@simmer-mosquito/ui-web/icons/registry';
import { createFileRoute } from '@tanstack/react-router';
import type { Map as MapboxMap } from 'mapbox-gl';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { getServerUrl } from '../../../auth';
import {
	ActiveFilterBar,
	ExplorerMapPage,
	ExplorerRow,
	FilterChip,
	MultiSelectFilter,
	toggle,
	useExplorerPanel,
	useRegionMembership,
	useRegionOptions,
} from '../../../components/explorer';
import { ExplorerPagination } from '../../../components/explorer-pagination';
import { MAP_CREATE_TARGETS, MapCanvas } from '../../../components/map';
import {
	type AddressListing,
	useOrganizationAddresses,
} from '../../../hooks/queries/use-organization-addresses';
import {
	type FilterCodecs,
	idSetParam,
	searchValidator,
	textParam,
	useDebouncedTextFilter,
	useSearchFilters,
} from '../../../lib/search-filters';
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
const RESULT_NOUN = { one: 'address', many: 'addresses' };
const _addressesGcTimeMs = 30_000;
const PAGE_SIZE = 25;

function AddressesExplorerRoute() {
	const { addresses, isReady } = useOrganizationAddresses();

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
	const panel = useExplorerPanel();

	const filtered = useMemo(() => {
		const query = search.trim().toLowerCase();
		return addresses.filter((address) => {
			const point = { lng: address.longitude ?? Number.NaN, lat: address.latitude ?? Number.NaN };
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
	const activeFilterCount = (search.trim().length > 0 ? 1 : 0) + regionIds.size;
	const clearAll = useCallback(() => {
		setFilters({ search: '', regions: new Set() });
	}, [setFilters]);

	// The rows come from synced records rather than a paged request, so the frame
	// is told "loading" only until the collection and the boundaries are both in.
	const isLoading = !isReady || !regionMembership.isReady;

	return (
		<ExplorerMapPage
			activeFilterCount={activeFilterCount}
			filters={
				<>
					<SearchField
						label="Search addresses"
						onChange={setSearch}
						placeholder="Search addresses…"
						value={searchInput}
					/>

					<MultiSelectFilter
						empty="No regions"
						label="Region"
						onChange={setRegionIds}
						options={regions.options}
						selected={regionIds}
					/>

					{activeFilterCount > 0 ? (
						<ActiveFilterBar onClearAll={clearAll}>
							{search.trim().length > 0 ? (
								<FilterChip label={`Search: ${search}`} onRemove={() => commitSearch('')} />
							) : null}
							{[...regionIds].map((id) => (
								<FilterChip
									key={`region-${id}`}
									label={regions.nameById.get(id) ?? 'Unknown region'}
									onRemove={() => setRegionIds(toggle(regionIds, id))}
								/>
							))}
						</ActiveFilterBar>
					) : null}
				</>
			}
			footer={
				pageCount > 1 ? (
					<ExplorerPagination
						noun={{ one: 'address', many: 'addresses' }}
						onPageChange={setPage}
						page={page}
						pageCount={pageCount}
						total={filtered.length}
					/>
				) : undefined
			}
			heading={{
				title: 'Address Book',
				icon: AddressIcon,
				total: filtered.length,
				isLoading,
				noun: RESULT_NOUN,
				create: { to: '/gis/addresses/create', label: 'Create Address' },
			}}
			onResetFilters={clearAll}
			map={
				<>
					<MapCanvas
						addressLayer={addressLayer}
						contextMenu={{ create: [MAP_CREATE_TARGETS.address] }}
						controls={{ layers: false, measure: true, readout: true }}
						fitToData
						inset={panel.inset}
						onMapReady={setMap}
						searchWidth={panel.width}
					/>
					{focusedId === null ? null : (
						<AddressMapCard
							id={focusedId}
							inset={panel.inset}
							map={map}
							onClose={() => setFocusedId(null)}
						/>
					)}
				</>
			}
			panel={panel}
			results={{
				rows: visible,
				emptyTitle: activeFilterCount > 0 ? 'No addresses match' : 'No addresses yet',
				emptyDescription:
					activeFilterCount > 0
						? 'Try a different search term or region.'
						: 'Create an address to build the shared address book.',
				renderRow: (address) => (
					<AddressRowItem
						address={address}
						isFocused={address.id === focusedId}
						key={address.id}
						onFocus={() => setFocusedId(address.id)}
					/>
				),
			}}
		/>
	);
}

function AddressRowItem({
	address,
	isFocused,
	onFocus,
}: {
	readonly address: AddressListing;
	readonly isFocused: boolean;
	readonly onFocus: () => void;
}) {
	// An Address's display name is usually its street line, and the postal line
	// starts with that same street. Printed whole, every row read "1 11th Street"
	// over "1 11th Street · Monroe Township, NJ 08831" and spent its second line
	// repeating its first. The subtitle carries what the title has not said.
	const line = fullAddress(address);
	const name = address.displayName?.trim() || line || 'Unnamed address';
	const rest = line.startsWith(name) ? line.slice(name.length).replace(/^\s*·\s*/, '') : line;
	return (
		<ExplorerRow
			detailLabel={`View details for ${name}`}
			detailLink={{ to: '/gis/addresses/$id', params: { id: address.id } }}
			isSelected={isFocused}
			onSelect={onFocus}
			selectLabel={`Show ${name} on the map`}
			subtitle={rest}
			title={name}
			titleLink={{ to: '/gis/addresses/$id', params: { id: address.id } }}
		/>
	);
}

/** The complete postal address as a readable line: street, unit · city, state postal · country. */
function fullAddress(address: AddressListing): string {
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
