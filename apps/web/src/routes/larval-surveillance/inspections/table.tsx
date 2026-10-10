import { PageHeader } from '@simmer-mosquito/ui-web/components/page';
import { iconRegistry } from '@simmer-mosquito/ui-web/icons/registry';
import { createFileRoute } from '@tanstack/react-router';
import { OutletSimpleLayout } from '../../../components/app-shell';
import { surfaceCodecs } from '../../../components/explorer/record-set';
import { RecordSetSwitch } from '../../../components/explorer/record-set-switch';
import { ExplorerPagination } from '../../../components/explorer-pagination';
import {
	INSPECTIONS_PATH,
	type InspectionListing,
	inspectionQueryParams,
	inspectionTileFilters,
} from '../../../components/larval-surveillance/inspection-listing';
import { InspectionsFilterBar } from '../../../components/larval-surveillance/inspections-filter-bar';
import { inspectionRecordSet } from '../../../components/larval-surveillance/inspections-search';
import { InspectionsTable } from '../../../components/larval-surveillance/inspections-table';
import { RecordTableEmpty } from '../../../components/record/record-table-empty';
import { RecordTableUnavailable } from '../../../components/record/record-table-unavailable';
import {
	mapQueryParams,
	usePagedMapResource,
	WHOLE_WORLD_BBOX,
} from '../../../hooks/explorer/use-paged-map-resource';
import { useInspectionCatalogs } from '../../../hooks/larval-surveillance/use-inspection-catalogs';
import { useInspectionFilterState } from '../../../hooks/larval-surveillance/use-inspection-filter-state';
import { recordNoun } from '../../../lib/record-nouns';
import { searchValidator } from '../../../lib/search-filters';

/**
 * The filters the Table applies, validated through the record set's codecs as
 * the Table reads them. `searchValidator` keeps what its codecs name and drops
 * the rest, so a Region on a hand-typed address does not survive here.
 */
export const Route = createFileRoute('/larval-surveillance/inspections/table')({
	component: InspectionsTableRoute,
	validateSearch: searchValidator(surfaceCodecs(inspectionRecordSet, 'table')),
});

const InspectionIcon = iconRegistry.entities.inspection.icon;

/**
 * Every inspection as a table, newest first, a hundred to a page.
 *
 * The map explorer beside this answers "where was work done"; this answers
 * "what has been recorded", which is a question about a run of rows rather than
 * about a place, so it spends no room on a map.
 *
 * The rows are a page of `/map/inspections`, the endpoint the Map's rail reads,
 * over the whole world rather than a viewport. Postgres filters, orders and
 * counts, and the order is fixed: newest inspection date first, the newest
 * entry first within a date. `docs/web-components.md` says why there are no
 * column sorts and no Load more.
 *
 * ## The filters are the map explorer's
 *
 * The bar above the rows reads and writes the params the explorer reads and
 * writes, through the same codecs, so a link built on one surface opens the same
 * set on the other. Six of the explorer's seven filters are here. Region is not,
 * and `inspectionRecordSet` leaves it behind on the way here. The Table opens
 * on all time where the Map opens on the last 30 days, which the record set's
 * defaults say.
 */
function InspectionsTableRoute() {
	const binding = useInspectionFilterState('table');
	const catalogs = useInspectionCatalogs();
	const routeSearch = Route.useSearch();

	const params = mapQueryParams({
		bbox: WHOLE_WORLD_BBOX,
		...inspectionQueryParams(inspectionTileFilters(binding.state)),
	});
	const { rows, total, isLoading, isError, retry, page, pageCount, setPage } =
		usePagedMapResource<InspectionListing>({
			path: INSPECTIONS_PATH,
			rowsKey: 'inspections',
			recordType: 'inspection',
			params,
		});

	// `record` is the measure the route-loading skeleton reserves, so the table
	// arrives at the width it stood in for (#1043, #1047).
	return (
		<OutletSimpleLayout className="grid content-start gap-5" measure="record">
			<PageHeader
				actions={<RecordSetSwitch current="table" search={routeSearch} set={inspectionRecordSet} />}
				icon={InspectionIcon}
				title={recordNoun('inspection').titleMany}
			/>
			<InspectionsFilterBar binding={binding} catalogs={catalogs} />
			{isError ? <RecordTableUnavailable onRetry={retry} recordType="inspection" /> : null}
			{rows.length === 0 ? (
				<RecordTableEmpty
					emptyDescription="Inspections show here as crews record them."
					filteredDescription="Nothing recorded matches what is set above."
					icon={InspectionIcon}
					isError={isError}
					isFiltered={binding.activeCount > 0}
					isLoading={isLoading}
					onClearFilters={binding.reset}
					recordType="inspection"
					scope={{ kind: 'yet' }}
				/>
			) : (
				<div className="grid gap-3">
					<InspectionsTable rows={rows} typeNameById={catalogs.typeNameById} />
					<ExplorerPagination
						noun={recordNoun('inspection')}
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
