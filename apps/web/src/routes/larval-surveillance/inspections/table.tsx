import { PageHeader } from '@simmer-mosquito/ui-web/components/page';
import { iconRegistry } from '@simmer-mosquito/ui-web/icons/registry';
import { createFileRoute } from '@tanstack/react-router';
import { OutletSimpleLayout } from '../../../components/app-shell';
import { ExplorerPagination } from '../../../components/explorer-pagination';
import { INSPECTION_TABLE_COUNTING } from '../../../components/larval-surveillance/inspection-filters';
import {
	INSPECTIONS_PATH,
	type InspectionListing,
	inspectionQueryParams,
	inspectionTileFilters,
} from '../../../components/larval-surveillance/inspection-listing';
import { InspectionSurfaceSwitch } from '../../../components/larval-surveillance/inspection-surface-switch';
import { InspectionsFilterBar } from '../../../components/larval-surveillance/inspections-filter-bar';
import {
	inspectionFilterCodecs,
	sharedInspectionSearch,
} from '../../../components/larval-surveillance/inspections-search';
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
 * The explorer's filter set, validated through the explorer's codecs.
 *
 * `searchValidator` keeps what its codecs name and drops the rest, so the
 * filters have to be here or a link from the map would arrive with them stripped
 * before the page read them. `regions` is among them and no control here writes
 * it: carrying the param is what lets a reader go Map to Table and back without
 * losing their region selection.
 */
export const Route = createFileRoute('/larval-surveillance/inspections/table')({
	component: InspectionsTableRoute,
	validateSearch: searchValidator(inspectionFilterCodecs),
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
 * set on the other. Six of the explorer's seven filters are here. Region is
 * carried and not applied, because no control here shows or clears it.
 */
function InspectionsTableRoute() {
	// `all-time` is where the two surfaces part: this page says it holds every
	// inspection, so an address with no dates on it opens on every inspection.
	const binding = useInspectionFilterState(INSPECTION_TABLE_COUNTING, 'all-time');
	const catalogs = useInspectionCatalogs();
	const carried = sharedInspectionSearch(Route.useSearch());

	const params = mapQueryParams({
		bbox: WHOLE_WORLD_BBOX,
		...inspectionQueryParams(inspectionTileFilters({ ...binding.state, regionIds: new Set() })),
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
				actions={<InspectionSurfaceSwitch current="table" search={carried} />}
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
