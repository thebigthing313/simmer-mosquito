import { PageHeader } from '@simmer-mosquito/ui-web/components/page';
import { iconRegistry } from '@simmer-mosquito/ui-web/icons/registry';
import { createFileRoute } from '@tanstack/react-router';
import { OutletSimpleLayout } from '../../../components/app-shell';
import { RecordSetSwitch } from '../../../components/explorer/record-set-switch';
import { ExplorerPagination } from '../../../components/explorer-pagination';
import { AddressFilterFields } from '../../../components/gis/addresses/address-filters';
import type { AddressListing } from '../../../components/gis/addresses/address-row-parts';
import {
	addressFilterCodecs,
	addressListParams,
	addressRecordSet,
	addressTileFilters,
} from '../../../components/gis/addresses/addresses-search';
import { AddressesTable } from '../../../components/gis/addresses/addresses-table';
import { RecordTableEmpty } from '../../../components/record/record-table-empty';
import { RecordTableUnavailable } from '../../../components/record/record-table-unavailable';
import {
	mapQueryParams,
	usePagedMapResource,
	WHOLE_WORLD_BBOX,
} from '../../../hooks/explorer/use-paged-map-resource';
import { useAddressFilterState } from '../../../hooks/gis/use-address-filter-state';
import { recordNoun } from '../../../lib/record-nouns';
import { searchValidator } from '../../../lib/search-filters';

export const Route = createFileRoute('/gis/addresses/table')({
	component: AddressesTableRoute,
	validateSearch: searchValidator(addressFilterCodecs),
});

const AddressIcon = iconRegistry.actions.searchCheck.icon;

/**
 * Every Address as a table, by name, narrowed by the same filters as the
 * Address Book Map. It sends the Map's own `/map/addresses` request under a
 * box around the whole world, so the two surfaces list one set.
 */
function AddressesTableRoute() {
	const binding = useAddressFilterState();
	const { filters, activeCount, clearAll } = binding;
	const routeSearch = Route.useSearch();

	const params = mapQueryParams({
		bbox: WHOLE_WORLD_BBOX,
		...addressListParams(addressTileFilters(filters)),
	});
	const { rows, total, isLoading, isError, retry, page, pageCount, setPage } =
		usePagedMapResource<AddressListing>({
			path: '/map/addresses',
			rowsKey: 'addresses',
			recordType: 'address',
			params,
		});

	return (
		<OutletSimpleLayout className="grid content-start gap-5" measure="record">
			<PageHeader
				actions={<RecordSetSwitch current="table" search={routeSearch} set={addressRecordSet} />}
				description="Every address in the book, by name."
				icon={AddressIcon}
				// The Map's title, for the reason its heading gives.
				title="Address Book"
			/>
			<div className="grid gap-4 rounded-md border border-border/50 bg-muted/20 p-4">
				<AddressFilterFields binding={binding} wide />
			</div>
			{isError ? <RecordTableUnavailable onRetry={retry} recordType="address" /> : null}
			{rows.length === 0 ? (
				<RecordTableEmpty
					emptyDescription="Addresses show here as they are added to the book."
					filteredDescription="No address matches what is set above."
					icon={AddressIcon}
					isError={isError}
					isFiltered={activeCount > 0}
					isLoading={isLoading}
					onClearFilters={clearAll}
					recordType="address"
					scope={{ kind: 'yet' }}
				/>
			) : (
				<div className="grid gap-3">
					<AddressesTable rows={rows} />
					<ExplorerPagination
						noun={recordNoun('address')}
						onPageChange={setPage}
						page={page}
						pageCount={pageCount}
						total={total}
					/>
				</div>
			)}
		</OutletSimpleLayout>
	);
}
