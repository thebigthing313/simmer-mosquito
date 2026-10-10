import { PageHeader } from '@simmer-mosquito/ui-web/components/page';
import { iconRegistry } from '@simmer-mosquito/ui-web/icons/registry';
import { createFileRoute } from '@tanstack/react-router';
import { TrapFilterFields } from '../../../components/adult-surveillance/traps/trap-filters';
import {
	trapFilterCodecs,
	trapListParams,
	trapRecordSet,
	trapTileFilters,
} from '../../../components/adult-surveillance/traps/traps-search';
import {
	TrapsTable,
	type TrapTableRow,
} from '../../../components/adult-surveillance/traps/traps-table';
import { OutletSimpleLayout } from '../../../components/app-shell';
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

export const Route = createFileRoute('/adult-surveillance/traps/table')({
	component: TrapsTableRoute,
	validateSearch: searchValidator(trapFilterCodecs),
});

const TrapIcon = iconRegistry.entities.trap.icon;

/**
 * Every Trap as a table, by code or by name where there is none, narrowed by
 * the same filters as the Traps Map. It sends the Map's own `/map/traps`
 * request under a box around the whole world, so the two surfaces list one
 * set.
 */
function TrapsTableRoute() {
	const binding = useRecordSetFilters(trapRecordSet, 'table');
	const { filters, activeCount, clearAll } = binding;
	const routeSearch = Route.useSearch();

	const params = mapQueryParams({
		bbox: WHOLE_WORLD_BBOX,
		...trapListParams(trapTileFilters(filters)),
	});
	const { rows, total, isLoading, isError, retry, page, pageCount, setPage } =
		usePagedMapResource<TrapTableRow>({
			path: '/map/traps',
			rowsKey: 'traps',
			recordType: 'trap',
			params,
		});

	return (
		<OutletSimpleLayout className="grid content-start gap-5" measure="record">
			<PageHeader
				actions={<RecordSetSwitch current="table" search={routeSearch} set={trapRecordSet} />}
				description="Traps by code, or by name where a trap has none."
				icon={TrapIcon}
				title={recordNoun('trap').titleMany}
			/>
			<div className="grid gap-4 rounded-md border border-border/50 bg-muted/20 p-4">
				<TrapFilterFields binding={binding} wide />
			</div>
			{isError ? <RecordTableUnavailable onRetry={retry} recordType="trap" /> : null}
			{rows.length === 0 ? (
				<RecordTableEmpty
					emptyDescription="Active traps show here as crews place them."
					filteredDescription="No trap matches what is set above."
					icon={TrapIcon}
					isError={isError}
					isFiltered={activeCount > 0}
					isLoading={isLoading}
					onClearFilters={clearAll}
					recordType="trap"
					scope={{ kind: 'active' }}
				/>
			) : (
				<div className="grid gap-3">
					<TrapsTable rows={rows} />
					<ExplorerPagination
						noun={recordNoun('trap')}
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
