import { PageHeader } from '@simmer-mosquito/ui-web/components/page';
import { iconRegistry } from '@simmer-mosquito/ui-web/icons/registry';
import { createFileRoute } from '@tanstack/react-router';
import { OutletSimpleLayout } from '../../../components/app-shell';
import { ApplicationFilterFields } from '../../../components/control-operations/chemical/application-filters';
import {
	type ApplicationListRow,
	normalizeApplication,
} from '../../../components/control-operations/chemical/application-row-parts';
import {
	APPLICATION_WINDOW_DAYS,
	applicationFilterCodecs,
	applicationListParams,
	applicationRecordSet,
	applicationTileFilters,
} from '../../../components/control-operations/chemical/applications-search';
import { ApplicationsTable } from '../../../components/control-operations/chemical/applications-table';
import { RecordSetSwitch } from '../../../components/explorer/record-set-switch';
import { ExplorerPagination } from '../../../components/explorer-pagination';
import { RecordTableEmpty } from '../../../components/record/record-table-empty';
import { RecordTableUnavailable } from '../../../components/record/record-table-unavailable';
import { useApplicationFilterState } from '../../../hooks/control-operations/use-application-filter-state';
import {
	mapQueryParams,
	usePagedMapResource,
	WHOLE_WORLD_BBOX,
} from '../../../hooks/explorer/use-paged-map-resource';
import { recordNoun } from '../../../lib/record-nouns';
import { searchValidator } from '../../../lib/search-filters';

export const Route = createFileRoute('/control-operations/chemical/table')({
	component: ApplicationsTableRoute,
	validateSearch: searchValidator(applicationFilterCodecs),
});

const ApplicationIcon = iconRegistry.entities.application.icon;

/**
 * The Chemical Applications in the date window as a table, newest first,
 * narrowed by the same filters as the Chemical Applications Map. It sends the
 * Map's own `/map/chemical` request under a box around the whole world, so the
 * two surfaces list one set.
 */
function ApplicationsTableRoute() {
	const binding = useApplicationFilterState();
	const { filters, activeCount, reset } = binding;
	const routeSearch = Route.useSearch();

	const params = mapQueryParams({
		bbox: WHOLE_WORLD_BBOX,
		...applicationListParams(applicationTileFilters(filters)),
	});
	const { rows, total, isLoading, isError, retry, page, pageCount, setPage } =
		usePagedMapResource<ApplicationListRow>({
			path: '/map/chemical',
			rowsKey: 'applications',
			recordType: 'application',
			params,
			normalizeRow: normalizeApplication,
		});

	return (
		<OutletSimpleLayout className="grid content-start gap-5" measure="record">
			<PageHeader
				actions={
					<RecordSetSwitch current="table" search={routeSearch} set={applicationRecordSet} />
				}
				description="Chemical applications in the date window, newest first."
				icon={ApplicationIcon}
				title={recordNoun('application').titleMany}
			/>
			<div className="grid gap-4 rounded-md border border-border/50 bg-muted/20 p-4">
				<ApplicationFilterFields binding={binding} wide />
			</div>
			{isError ? <RecordTableUnavailable onRetry={retry} recordType="application" /> : null}
			{rows.length === 0 ? (
				<RecordTableEmpty
					emptyDescription={`Chemical applications made in the last ${APPLICATION_WINDOW_DAYS} days show here.`}
					filteredDescription="No chemical application matches what is set above."
					icon={ApplicationIcon}
					isError={isError}
					isFiltered={activeCount > 0}
					isLoading={isLoading}
					onClearFilters={reset}
					recordType="application"
					scope={{ kind: 'lastDays', days: APPLICATION_WINDOW_DAYS }}
				/>
			) : (
				<div className="grid gap-3">
					<ApplicationsTable rows={rows} />
					<ExplorerPagination
						noun={recordNoun('application')}
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
