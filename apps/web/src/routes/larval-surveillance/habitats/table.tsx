import { PageHeader } from '@simmer-mosquito/ui-web/components/page';
import { iconRegistry } from '@simmer-mosquito/ui-web/icons/registry';
import { createFileRoute } from '@tanstack/react-router';
import { OutletSimpleLayout } from '../../../components/app-shell';
import { ExplorerPagination } from '../../../components/explorer-pagination';
import { HabitatFilterFields } from '../../../components/larval-surveillance/habitats/habitat-filters';
import { HabitatSurfaceSwitch } from '../../../components/larval-surveillance/habitats/habitat-surface-switch';
import {
	habitatFilterCodecs,
	habitatListParams,
	habitatTileFilters,
	sharedHabitatSearch,
} from '../../../components/larval-surveillance/habitats/habitats-search';
import {
	HabitatsTable,
	type HabitatTableRow,
} from '../../../components/larval-surveillance/habitats/habitats-table';
import { RecordTableEmpty } from '../../../components/record/record-table-empty';
import { RecordTableUnavailable } from '../../../components/record/record-table-unavailable';
import {
	mapQueryParams,
	usePagedMapResource,
	WHOLE_WORLD_BBOX,
} from '../../../hooks/explorer/use-paged-map-resource';
import { useHabitatFilterState } from '../../../hooks/larval-surveillance/use-habitat-filter-state';
import { recordNoun } from '../../../lib/record-nouns';
import { searchValidator } from '../../../lib/search-filters';

export const Route = createFileRoute('/larval-surveillance/habitats/table')({
	component: HabitatsTableRoute,
	validateSearch: searchValidator(habitatFilterCodecs),
});

const HabitatIcon = iconRegistry.entities.habitat.icon;

/**
 * Every Habitat as a table, in name order, narrowed by the same filters as the
 * Habitats Map.
 *
 * ## Why this reads the Map's endpoint and not the collection
 *
 * The Inspections Table reads the `inspections` collection, which lets
 * Postgres sort by any indexed column, but only lets it filter by a column of
 * the table itself. Three of the Map's seven habitat filters are not columns:
 * Tags are rows in `entity_tags`, Region is ADR 0015's spatial membership, and
 * Untreated is the server's rule over inspections and control actions. The
 * Dashboard links to the Map with Untreated set, so a Table that dropped it
 * would list habitats the link says are gone.
 *
 * So this sends the Map's own `/map/habitats` request with a box around the
 * whole world, which gets every filter, the Map's name order, and a total, at
 * the cost of the column sort. The switch between the two carries every
 * filter for the same reason.
 */
function HabitatsTableRoute() {
	const binding = useHabitatFilterState();
	const { filters, activeCount, clearAll } = binding;
	const carried = sharedHabitatSearch(Route.useSearch());

	const params = mapQueryParams({
		bbox: WHOLE_WORLD_BBOX,
		...habitatListParams(habitatTileFilters(filters)),
	});
	const { rows, total, isLoading, isError, retry, page, pageCount, setPage } =
		usePagedMapResource<HabitatTableRow>({
			path: '/map/habitats',
			rowsKey: 'habitats',
			recordType: 'habitat',
			params,
		});

	return (
		<OutletSimpleLayout className="grid content-start gap-5" measure="record">
			<PageHeader
				actions={<HabitatSurfaceSwitch current="table" search={carried} />}
				description="Every habitat on record, by name."
				icon={HabitatIcon}
				title={recordNoun('habitat').titleMany}
			/>
			<div className="grid gap-4 rounded-md border border-border/50 bg-muted/20 p-4">
				<HabitatFilterFields binding={binding} wide />
			</div>
			{isError ? <RecordTableUnavailable onRetry={retry} recordType="habitat" /> : null}
			{rows.length === 0 ? (
				<RecordTableEmpty
					emptyDescription="Active habitats show here as crews add them."
					filteredDescription="No habitat matches what is set above."
					icon={HabitatIcon}
					isError={isError}
					isFiltered={activeCount > 0}
					isLoading={isLoading}
					onClearFilters={clearAll}
					recordType="habitat"
					scope={{ kind: 'active' }}
				/>
			) : (
				<div className="grid gap-3">
					<HabitatsTable rows={rows} />
					<ExplorerPagination
						noun={recordNoun('habitat')}
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
