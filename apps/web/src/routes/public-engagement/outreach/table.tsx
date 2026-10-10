import { PageHeader } from '@simmer-mosquito/ui-web/components/page';
import { iconRegistry } from '@simmer-mosquito/ui-web/icons/registry';
import { createFileRoute } from '@tanstack/react-router';
import { OutletSimpleLayout } from '../../../components/app-shell';
import { RecordSetSwitch } from '../../../components/explorer/record-set-switch';
import { ExplorerPagination } from '../../../components/explorer-pagination';
import {
	OUTREACH_WINDOW_DAYS,
	outreachFilterCodecs,
	outreachListParams,
	outreachRecordSet,
	outreachTileFilters,
} from '../../../components/public-engagement/outreach/outreach-actions-search';
import { OutreachActionsTable } from '../../../components/public-engagement/outreach/outreach-actions-table';
import { OutreachFilterFields } from '../../../components/public-engagement/outreach/outreach-filters';
import type { OutreachListRow } from '../../../components/public-engagement/outreach/outreach-row-parts';
import { RecordTableEmpty } from '../../../components/record/record-table-empty';
import { RecordTableUnavailable } from '../../../components/record/record-table-unavailable';
import {
	mapQueryParams,
	usePagedMapResource,
	WHOLE_WORLD_BBOX,
} from '../../../hooks/explorer/use-paged-map-resource';
import { useOutreachFilterState } from '../../../hooks/public-engagement/use-outreach-filter-state';
import { recordNoun } from '../../../lib/record-nouns';
import { searchValidator } from '../../../lib/search-filters';

export const Route = createFileRoute('/public-engagement/outreach/table')({
	component: OutreachActionsTableRoute,
	validateSearch: searchValidator(outreachFilterCodecs),
});

const OutreachIcon = iconRegistry.entities.outreachAction.icon;

/**
 * The Outreach Actions in the date window as a table, newest first, narrowed
 * by the same filters as the Outreach Actions Map. It sends the Map's own
 * `/map/outreach` request under a box around the whole world, so the two
 * surfaces list one set.
 */
function OutreachActionsTableRoute() {
	const binding = useOutreachFilterState();
	const { filters, activeCount, reset } = binding;
	const routeSearch = Route.useSearch();

	const params = mapQueryParams({
		bbox: WHOLE_WORLD_BBOX,
		...outreachListParams(outreachTileFilters(filters)),
	});
	const { rows, total, isLoading, isError, retry, page, pageCount, setPage } =
		usePagedMapResource<OutreachListRow>({
			path: '/map/outreach',
			rowsKey: 'outreachActions',
			recordType: 'outreachAction',
			params,
		});

	return (
		<OutletSimpleLayout className="grid content-start gap-5" measure="record">
			<PageHeader
				actions={<RecordSetSwitch current="table" search={routeSearch} set={outreachRecordSet} />}
				description="Outreach actions in the date window, newest first."
				icon={OutreachIcon}
				title={recordNoun('outreachAction').titleMany}
			/>
			<div className="grid gap-4 rounded-md border border-border/50 bg-muted/20 p-4">
				<OutreachFilterFields binding={binding} wide />
			</div>
			{isError ? <RecordTableUnavailable onRetry={retry} recordType="outreachAction" /> : null}
			{rows.length === 0 ? (
				<RecordTableEmpty
					emptyDescription={`Outreach actions made in the last ${OUTREACH_WINDOW_DAYS} days show here.`}
					filteredDescription="No outreach action matches what is set above."
					icon={OutreachIcon}
					isError={isError}
					isFiltered={activeCount > 0}
					isLoading={isLoading}
					onClearFilters={reset}
					recordType="outreachAction"
					scope={{ kind: 'lastDays', days: OUTREACH_WINDOW_DAYS }}
				/>
			) : (
				<div className="grid gap-3">
					<OutreachActionsTable rows={rows} />
					<ExplorerPagination
						noun={recordNoun('outreachAction')}
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
