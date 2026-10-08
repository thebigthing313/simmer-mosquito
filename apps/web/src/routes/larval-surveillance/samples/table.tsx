import { PageHeader } from '@simmer-mosquito/ui-web/components/page';
import { iconRegistry } from '@simmer-mosquito/ui-web/icons/registry';
import { createFileRoute } from '@tanstack/react-router';
import { OutletSimpleLayout } from '../../../components/app-shell';
import { ExplorerPagination } from '../../../components/explorer-pagination';
import { SampleFilterFields } from '../../../components/larval-surveillance/samples/sample-filters';
import type { SampleListRow } from '../../../components/larval-surveillance/samples/sample-row-parts';
import { SampleSurfaceSwitch } from '../../../components/larval-surveillance/samples/sample-surface-switch';
import { SamplesTable } from '../../../components/larval-surveillance/samples/samples-table';
import {
	sampleFilterCodecs,
	sampleListParams,
	sampleTileFilters,
	sharedSampleSearch,
} from '../../../components/larval-surveillance/samples-search';
import { RecordTableEmpty } from '../../../components/record/record-table-empty';
import { RecordTableUnavailable } from '../../../components/record/record-table-unavailable';
import {
	mapQueryParams,
	usePagedMapResource,
	WHOLE_WORLD_BBOX,
} from '../../../hooks/explorer/use-paged-map-resource';
import { useSampleFilterState } from '../../../hooks/larval-surveillance/use-sample-filter-state';
import { recordNoun } from '../../../lib/record-nouns';
import { searchValidator } from '../../../lib/search-filters';

export const Route = createFileRoute('/larval-surveillance/samples/table')({
	component: SamplesTableRoute,
	validateSearch: searchValidator(sampleFilterCodecs),
});

const SampleIcon = iconRegistry.entities.sample.icon;

/**
 * Every Sample as a table, newest inspection first, narrowed by the same
 * filters as the Samples Map.
 *
 * ## Why this reads the Map's endpoint and not the collection
 *
 * A Sample's own row holds almost nothing a reader filters by. Its date is its
 * inspection's, its status is decided by whether any `sample_species` row
 * exists, and what was identified in it is those rows. The `samples`
 * collection can only push a filter or a sort down to Postgres when it names a
 * column of `samples`, so read that way the table could neither sort nor
 * filter by date. `HabitatsTableRoute` makes the same trade for its own
 * reasons.
 *
 * So this sends the Map's own `/map/samples` request with a box around the
 * whole world. Every inspection carries geometry, so the box leaves nothing
 * out, and every filter the Map has applies here too.
 */
function SamplesTableRoute() {
	const binding = useSampleFilterState();
	const { filters, activeCount, reset } = binding;
	const carried = sharedSampleSearch(Route.useSearch());

	const params = mapQueryParams({
		bbox: WHOLE_WORLD_BBOX,
		...sampleListParams(sampleTileFilters(filters)),
	});
	const { rows, total, isLoading, isError, retry, page, pageCount, setPage } =
		usePagedMapResource<SampleListRow>({
			path: '/map/samples',
			rowsKey: 'samples',
			recordType: 'sample',
			params,
		});

	return (
		<OutletSimpleLayout className="grid content-start gap-5" measure="record">
			<PageHeader
				actions={<SampleSurfaceSwitch current="table" search={carried} />}
				description="Every sample taken, newest inspection first."
				icon={SampleIcon}
				title={recordNoun('sample').titleMany}
			/>
			<div className="grid gap-4 rounded-md border border-border/50 bg-muted/20 p-4">
				<SampleFilterFields binding={binding} wide />
			</div>
			{isError ? <RecordTableUnavailable onRetry={retry} recordType="sample" /> : null}
			{rows.length === 0 ? (
				<RecordTableEmpty
					emptyDescription="Samples taken in the last 30 days show here."
					filteredDescription="No sample matches what is set above."
					icon={SampleIcon}
					isError={isError}
					isFiltered={activeCount > 0}
					isLoading={isLoading}
					onClearFilters={reset}
					recordType="sample"
					scope={{ kind: 'lastDays', days: 30 }}
				/>
			) : (
				<div className="grid gap-3">
					<SamplesTable rows={rows} />
					<ExplorerPagination
						noun={recordNoun('sample')}
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
