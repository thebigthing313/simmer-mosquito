import { PageHeader } from '@simmer-mosquito/ui-web/components/page';
import { iconRegistry } from '@simmer-mosquito/ui-web/icons/registry';
import { createFileRoute } from '@tanstack/react-router';
import { OutletSimpleLayout } from '../../../components/app-shell';
import { SourceReductionFilterFields } from '../../../components/control-operations/source-reduction/source-reduction-filters';
import type { SourceReductionListRow } from '../../../components/control-operations/source-reduction/source-reduction-row-parts';
import {
	SOURCE_REDUCTION_WINDOW_DAYS,
	sourceReductionFilterCodecs,
	sourceReductionListParams,
	sourceReductionRecordSet,
	sourceReductionTileFilters,
} from '../../../components/control-operations/source-reduction/source-reductions-search';
import { SourceReductionsTable } from '../../../components/control-operations/source-reduction/source-reductions-table';
import { RecordSetSwitch } from '../../../components/explorer/record-set-switch';
import { ExplorerPagination } from '../../../components/explorer-pagination';
import { RecordTableEmpty } from '../../../components/record/record-table-empty';
import { RecordTableUnavailable } from '../../../components/record/record-table-unavailable';
import {
	mapQueryParams,
	usePagedMapResource,
	WHOLE_WORLD_BBOX,
} from '../../../hooks/explorer/use-paged-map-resource';
import { useRecordSetFilters } from '../../../hooks/explorer/use-record-set-filters';
import { recordNoun } from '../../../lib/record-nouns';
import { searchValidator } from '../../../lib/search-filters';

export const Route = createFileRoute('/control-operations/source-reduction/table')({
	component: SourceReductionsTableRoute,
	validateSearch: searchValidator(sourceReductionFilterCodecs),
});

const SourceReductionIcon = iconRegistry.entities.sourceReduction.icon;

/**
 * The Source Reductions in the date window as a table, newest first, narrowed
 * by the same filters as the Source Reductions Map. It sends the Map's own
 * `/map/source-reduction` request under a box around the whole world, so the
 * two surfaces list one set.
 */
function SourceReductionsTableRoute() {
	const binding = useRecordSetFilters(sourceReductionRecordSet, 'table');
	const { filters, activeCount, reset } = binding;
	const routeSearch = Route.useSearch();

	const params = mapQueryParams({
		bbox: WHOLE_WORLD_BBOX,
		...sourceReductionListParams(sourceReductionTileFilters(filters)),
	});
	const { rows, total, isLoading, isError, retry, page, pageCount, setPage } =
		usePagedMapResource<SourceReductionListRow>({
			path: '/map/source-reduction',
			rowsKey: 'sourceReductions',
			recordType: 'sourceReduction',
			params,
		});

	return (
		<OutletSimpleLayout className="grid content-start gap-5" measure="record">
			<PageHeader
				actions={
					<RecordSetSwitch current="table" search={routeSearch} set={sourceReductionRecordSet} />
				}
				description="Source reductions in the date window, newest first."
				icon={SourceReductionIcon}
				title={recordNoun('sourceReduction').titleMany}
			/>
			<div className="grid gap-4 rounded-md border border-border/50 bg-muted/20 p-4">
				<SourceReductionFilterFields binding={binding} wide />
			</div>
			{isError ? <RecordTableUnavailable onRetry={retry} recordType="sourceReduction" /> : null}
			{rows.length === 0 ? (
				<RecordTableEmpty
					emptyDescription={`Source reductions made in the last ${SOURCE_REDUCTION_WINDOW_DAYS} days show here.`}
					filteredDescription="No source reduction matches what is set above."
					icon={SourceReductionIcon}
					isError={isError}
					isFiltered={activeCount > 0}
					isLoading={isLoading}
					onClearFilters={reset}
					recordType="sourceReduction"
					scope={{ kind: 'lastDays', days: SOURCE_REDUCTION_WINDOW_DAYS }}
				/>
			) : (
				<div className="grid gap-3">
					<SourceReductionsTable rows={rows} />
					<ExplorerPagination
						noun={recordNoun('sourceReduction')}
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
