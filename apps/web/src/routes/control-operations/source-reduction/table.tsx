import { iconRegistry } from '@simmer-mosquito/ui-web/icons/registry';
import { createFileRoute } from '@tanstack/react-router';
import { SourceReductionFilterFields } from '../../../components/control-operations/source-reduction/source-reduction-filters';
import type { SourceReductionListRow } from '../../../components/control-operations/source-reduction/source-reduction-row-parts';
import { sourceReductionRecordSet } from '../../../components/control-operations/source-reduction/source-reductions-search';
import { SourceReductionsTable } from '../../../components/control-operations/source-reduction/source-reductions-table';
import { surfaceCodecs } from '../../../components/explorer/record-set';
import { RecordSetTablePage } from '../../../components/explorer/record-set-table-page';
import { useRecordSetFilters } from '../../../hooks/explorer/use-record-set-filters';
import { searchValidator } from '../../../lib/search-filters';

export const Route = createFileRoute('/control-operations/source-reduction/table')({
	component: SourceReductionsTableRoute,
	validateSearch: searchValidator(surfaceCodecs(sourceReductionRecordSet, 'table')),
});

const SourceReductionIcon = iconRegistry.entities.sourceReduction.icon;

/**
 * Every Source Reduction as a table, newest first, narrowed by the same filters
 * as the Source Reductions Map. It opens on all time where the Map opens on a
 * window, which the set's `windows` state.
 */
function SourceReductionsTableRoute() {
	const binding = useRecordSetFilters(sourceReductionRecordSet, 'table');
	const search = Route.useSearch();
	return (
		<RecordSetTablePage
			binding={binding}
			description="Every source reduction, newest first."
			empty={{
				emptyDescription: 'Source reductions show here as crews record them.',
				filteredDescription: 'No source reduction matches what is set above.',
			}}
			filters={<SourceReductionFilterFields binding={binding} wide />}
			icon={SourceReductionIcon}
			search={search}
			set={sourceReductionRecordSet}
			table={(rows: readonly SourceReductionListRow[]) => <SourceReductionsTable rows={rows} />}
		/>
	);
}
