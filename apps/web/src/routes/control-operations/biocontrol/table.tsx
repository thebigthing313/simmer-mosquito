import { PageHeader } from '@simmer-mosquito/ui-web/components/page';
import { iconRegistry } from '@simmer-mosquito/ui-web/icons/registry';
import { createFileRoute } from '@tanstack/react-router';
import { OutletSimpleLayout } from '../../../components/app-shell';
import {
	BIOCONTROL_WINDOW_DAYS,
	biocontrolFilterCodecs,
	biocontrolListParams,
	biocontrolTileFilters,
	sharedBiocontrolSearch,
} from '../../../components/control-operations/biocontrol/biocontrol-actions-search';
import { BiocontrolActionsTable } from '../../../components/control-operations/biocontrol/biocontrol-actions-table';
import { BiocontrolFilterFields } from '../../../components/control-operations/biocontrol/biocontrol-filters';
import type { BiocontrolListRow } from '../../../components/control-operations/biocontrol/biocontrol-row-parts';
import { BiocontrolSurfaceSwitch } from '../../../components/control-operations/biocontrol/biocontrol-surface-switch';
import { ExplorerPagination } from '../../../components/explorer-pagination';
import { RecordTableEmpty } from '../../../components/record/record-table-empty';
import { RecordTableUnavailable } from '../../../components/record/record-table-unavailable';
import { useBiocontrolFilterState } from '../../../hooks/control-operations/use-biocontrol-filter-state';
import {
	mapQueryParams,
	usePagedMapResource,
	WHOLE_WORLD_BBOX,
} from '../../../hooks/explorer/use-paged-map-resource';
import { recordNoun } from '../../../lib/record-nouns';
import { searchValidator } from '../../../lib/search-filters';

export const Route = createFileRoute('/control-operations/biocontrol/table')({
	component: BiocontrolActionsTableRoute,
	validateSearch: searchValidator(biocontrolFilterCodecs),
});

const BiocontrolIcon = iconRegistry.entities.biocontrolAction.icon;

/**
 * The Biocontrol Actions in the date window as a table, newest first, narrowed
 * by the same filters as the Biocontrol Actions Map. It sends the Map's own
 * `/map/biocontrol` request under a box around the whole world, so the two
 * surfaces list one set.
 */
function BiocontrolActionsTableRoute() {
	const binding = useBiocontrolFilterState();
	const { filters, activeCount, reset } = binding;
	const carried = sharedBiocontrolSearch(Route.useSearch());

	const params = mapQueryParams({
		bbox: WHOLE_WORLD_BBOX,
		...biocontrolListParams(biocontrolTileFilters(filters)),
	});
	const { rows, total, isLoading, isError, retry, page, pageCount, setPage } =
		usePagedMapResource<BiocontrolListRow>({
			path: '/map/biocontrol',
			rowsKey: 'biocontrolActions',
			recordType: 'biocontrolAction',
			params,
		});

	return (
		<OutletSimpleLayout className="grid content-start gap-5" measure="record">
			<PageHeader
				actions={<BiocontrolSurfaceSwitch current="table" search={carried} />}
				description="Biocontrol actions in the date window, newest first."
				icon={BiocontrolIcon}
				title={recordNoun('biocontrolAction').titleMany}
			/>
			<div className="grid gap-4 rounded-md border border-border/50 bg-muted/20 p-4">
				<BiocontrolFilterFields binding={binding} wide />
			</div>
			{isError ? <RecordTableUnavailable onRetry={retry} recordType="biocontrolAction" /> : null}
			{rows.length === 0 ? (
				<RecordTableEmpty
					emptyDescription={`Biocontrol actions made in the last ${BIOCONTROL_WINDOW_DAYS} days show here.`}
					filteredDescription="No biocontrol action matches what is set above."
					icon={BiocontrolIcon}
					isError={isError}
					isFiltered={activeCount > 0}
					isLoading={isLoading}
					onClearFilters={reset}
					recordType="biocontrolAction"
					scope={{ kind: 'lastDays', days: BIOCONTROL_WINDOW_DAYS }}
				/>
			) : (
				<div className="grid gap-3">
					<BiocontrolActionsTable rows={rows} />
					<ExplorerPagination
						noun={recordNoun('biocontrolAction')}
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
