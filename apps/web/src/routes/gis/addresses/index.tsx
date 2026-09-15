import { SearchInput } from '@simmer-mosquito/ui-web/components/search-input';
import { iconRegistry } from '@simmer-mosquito/ui-web/icons/registry';
import { createFileRoute } from '@tanstack/react-router';
import type { Map as MapboxMap } from 'mapbox-gl';
import { useState } from 'react';
import { getServerUrl } from '../../../auth';
import { createLabel } from '../../../components/app-shell/navigation';
import {
	ActiveFilterBar,
	ExplorerMapPage,
	ExplorerRow,
	FilterChip,
	MultiSelectFilter,
	toggle,
	useExplorerPanel,
	useExplorerResource,
	useRegionOptions,
	whenAny,
	whenText,
} from '../../../components/explorer';
import { ExplorerPagination } from '../../../components/explorer-pagination';
import {
	type AddressTileFilters,
	MAP_CREATE_TARGETS,
	MapCanvas,
	type MapTileLayer,
} from '../../../components/map';
import { type RecordType, recordNoun } from '../../../lib/record-nouns';
import {
	type FilterCodecs,
	idSetParam,
	searchValidator,
	textParam,
	useDebouncedTextFilter,
	useSearchFilters,
} from '../../../lib/search-filters';
import { AddressMapCard } from './-address-map-card';

/**
 * An address as `/map/addresses` lists it: what the row shows, and where on
 * the map it sits. The whole postal address rides along because the row's
 * subtitle is what the title has not said, and `country` because the rail
 * surfaces it only when it is something other than the US default.
 */
interface AddressListing {
	readonly id: string;
	readonly lat: number;
	readonly lng: number;
	readonly displayName: string;
	readonly country: string;
	readonly addressLine1: string | null;
	readonly addressLine2: string | null;
	readonly locality: string | null;
	readonly region: string | null;
	readonly postalCode: string | null;
}

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
const RECORD_TYPE: RecordType = 'address';
const PATH = '/map/addresses';

function AddressesExplorerRoute() {
	// The search term lives in the URL, so a shared link and Back out of an
	// address both land on the list the operator had narrowed to.
	const {
		filters: query,
		setFilters,
		activeCount: activeFilterCount,
	} = useSearchFilters(ADDRESS_FILTER_DEFAULTS, ADDRESS_FILTER_CODECS);
	const search = query.search;
	const regionIds = query.regions;
	const commitSearch = (next: string) => setFilters({ search: next });
	const { searchInput, setSearch, clearSearch } = useAddressSearch(search, commitSearch);
	const setRegionIds = (next: ReadonlySet<string>) => setFilters({ regions: next });
	const regions = useRegionOptions();
	const [selectedId, setSelectedId] = useState<string | null>(null);
	const [map, setMap] = useState<MapboxMap | null>(null);
	const panel = useExplorerPanel();

	// The tiles and the page read one filter shape off one server predicate, so
	// the map and the rail stay in lockstep. The rail used to filter and page the
	// whole address book out of the sync collection beside a map drawing one
	// viewport, so the two showed different sets (#962).
	const filters: AddressTileFilters = {
		...whenText('search', search.trim()),
		...whenAny('regionIds', regionIds),
	};
	const layer: MapTileLayer = {
		kind: 'addresses',
		serverUrl: getServerUrl(),
		filters,
		selectedId,
		onSelectFeature: setSelectedId,
	};
	const layers: readonly MapTileLayer[] = [layer];
	const { rows, total, isLoading, isError, retry, page, pageCount, setPage, selected, empty } =
		useExplorerResource<AddressListing>({
			path: PATH,
			rowsKey: 'addresses',
			rowKey: 'address',
			recordType: RECORD_TYPE,
			params: { search: filters.search, regionId: filters.regionIds },
			layer,
			map,
			selectedId,
		});

	const clearAll = () => {
		setFilters({ search: '', regions: new Set() });
	};

	return (
		<ExplorerMapPage
			activeFilterCount={activeFilterCount}
			filters={
				<>
					<SearchInput
						label="Search addresses"
						onChange={(event) => setSearch(event.target.value)}
						onClear={clearSearch}
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
				<ExplorerPagination
					noun={recordNoun(RECORD_TYPE)}
					onPageChange={setPage}
					page={page}
					pageCount={pageCount}
					total={total}
				/>
			}
			heading={{
				title: 'Address Book',
				icon: AddressIcon,
				total,
				isLoading,
				create: { to: '/gis/addresses/create', label: createLabel('address') },
			}}
			onResetFilters={clearAll}
			map={
				<>
					<MapCanvas
						contextMenu={{ create: [MAP_CREATE_TARGETS.address] }}
						controls={{ measure: true, readout: true }}
						fitToData
						inset={panel.inset}
						layers={layers}
						onMapReady={setMap}
						searchWidth={panel.width}
					/>
					{selected === null ? null : (
						<AddressMapCard
							id={selected.id}
							inset={panel.inset}
							map={map}
							onClose={() => setSelectedId(null)}
						/>
					)}
				</>
			}
			panel={panel}
			results={{
				rows,
				isError,
				onRetry: retry,
				empty,
				renderRow: (address) => (
					<AddressRowItem
						address={address}
						isFocused={address.id === selectedId}
						key={address.id}
						onFocus={() => setSelectedId(address.id)}
					/>
				),
			}}
		/>
	);
}

/**
 * The search box's two halves: the field the operator is looking at, and the
 * committed term on the URL that is actually cutting the list. Clearing has to
 * reach both, or the box empties and the list stays narrowed.
 */
function useAddressSearch(
	urlSearch: string,
	commitSearch: (next: string) => void,
): {
	readonly searchInput: string;
	readonly setSearch: (next: string) => void;
	readonly clearSearch: () => void;
} {
	const { input, setInput, clear } = useDebouncedTextFilter(urlSearch, commitSearch);
	const clearSearch = () => {
		clear();
		commitSearch('');
	};

	return { searchInput: input, setSearch: setInput, clearSearch };
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
	const name = address.displayName.trim() || line || 'Unnamed address';
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
