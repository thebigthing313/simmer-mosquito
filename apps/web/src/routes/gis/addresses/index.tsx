import { iconRegistry } from '@simmer-mosquito/ui-web/icons/registry';
import { createFileRoute } from '@tanstack/react-router';
import { createLabel } from '../../../components/app-shell/navigation';
import { ExplorerMapPage, ExplorerRow } from '../../../components/explorer';
import { ExplorerCanvas } from '../../../components/explorer/explorer-canvas';
import { ExplorerSummary } from '../../../components/explorer/explorer-summary';
import { RecordSetSwitch } from '../../../components/explorer/record-set-switch';
import {
	AddressFilterChips,
	AddressFilterFields,
} from '../../../components/gis/addresses/address-filters';
import { AddressMapCard } from '../../../components/gis/addresses/address-map-card';
import {
	type AddressListing,
	addressName,
	fullAddress,
} from '../../../components/gis/addresses/address-row-parts';
import { addressSummaryGroupings } from '../../../components/gis/addresses/address-summary';
import {
	addressFilterCodecs,
	addressListParams,
	addressRecordSet,
	addressTileFilters,
} from '../../../components/gis/addresses/addresses-search';
import { MAP_CREATE_TARGETS } from '../../../components/map';
import { useExplorerPanel } from '../../../hooks/explorer/use-explorer-panel';
import { useExplorerResource } from '../../../hooks/explorer/use-explorer-resource';
import { useAddressFilterState } from '../../../hooks/gis/use-address-filter-state';
import { searchValidator } from '../../../lib/search-filters';

export const Route = createFileRoute('/gis/addresses/')({
	component: AddressesExplorerRoute,
	validateSearch: searchValidator(addressFilterCodecs),
});

const AddressIcon = iconRegistry.actions.searchCheck.icon;
const PATH = '/map/addresses';

function AddressesExplorerRoute() {
	// The filters live in the URL, so a shared link and Back out of an address
	// both land on the list the operator had narrowed to.
	const binding = useAddressFilterState();
	const { activeCount: activeFilterCount, clearAll } = binding;
	const panel = useExplorerPanel();

	// The tiles and the page read one filter shape off one server predicate, so
	// the map and the rail stay in lockstep. The rail used to filter and page the
	// whole address book out of the sync collection beside a map drawing one
	// viewport, so the two showed different sets (#962).
	const filters = addressTileFilters(binding.filters);
	const routeSearch = Route.useSearch();
	const {
		rows,
		total,
		isLoading,
		isError,
		retry,
		empty,
		summary,
		canvas,
		selectedId,
		setSelectedId,
	} = useExplorerResource<AddressListing>({
		path: PATH,
		rowsKey: 'addresses',
		rowKey: 'address',
		recordType: 'address',
		params: addressListParams(filters),
		tiles: { kind: 'addresses', filters },
		summarize: true,
	});

	return (
		<ExplorerMapPage
			actions={
				<RecordSetSwitch compact current="map" search={routeSearch} set={addressRecordSet} />
			}
			activeFilterCount={activeFilterCount}
			filters={<AddressFilterFields binding={binding} />}
			heading={{
				// Not the register's `Addresses`, and deliberately. CONTEXT.md glosses an
				// Address as an "Organization-owned address book entry", so this surface
				// is the book those entries are in, which is a place rather than a second
				// spelling of the record. The sidebar entry that opens it says the same
				// words; the group heading above that entry names the records (#985).
				title: 'Address Book',
				icon: AddressIcon,
				total,
				isLoading,
				create: { to: '/gis/addresses/create', label: createLabel('address') },
			}}
			onResetFilters={clearAll}
			map={
				<ExplorerCanvas
					canvas={canvas}
					card={(props) => <AddressMapCard {...props} />}
					contextMenu={{ create: [MAP_CREATE_TARGETS.address] }}
					panel={panel}
				/>
			}
			panel={panel}
			results={{
				rows,
				isError,
				onRetry: retry,
				empty,
				// Over 100 in view the rows would not fit on one page, so the panel
				// says what is in view instead (#1244, #1378).
				summary: summary.isShown ? (
					<ExplorerSummary
						chips={activeFilterCount === 0 ? null : <AddressFilterChips binding={binding} />}
						groupings={summary.data === null ? [] : addressSummaryGroupings(summary.data)}
						recordType="address"
						state={summary}
					/>
				) : undefined,
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
	const name = addressName(address);
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
