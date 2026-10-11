import { iconRegistry } from '@simmer-mosquito/ui-web/icons/registry';
import { createFileRoute } from '@tanstack/react-router';
import { TrapFilterFields } from '../../../components/adult-surveillance/traps/trap-filters';
import { trapRecordSet } from '../../../components/adult-surveillance/traps/traps-search';
import {
	TrapsTable,
	type TrapTableRow,
} from '../../../components/adult-surveillance/traps/traps-table';
import { surfaceCodecs } from '../../../components/explorer/record-set';
import { RecordSetTablePage } from '../../../components/explorer/record-set-table-page';
import { useRecordSetFilters } from '../../../hooks/explorer/use-record-set-filters';
import { searchValidator } from '../../../lib/search-filters';

export const Route = createFileRoute('/adult-surveillance/traps/table')({
	component: TrapsTableRoute,
	validateSearch: searchValidator(surfaceCodecs(trapRecordSet, 'table')),
});

const TrapIcon = iconRegistry.entities.trap.icon;

/**
 * Every Trap as a table, by code or by name where there is none, narrowed by
 * the same filters as the Traps Map.
 */
function TrapsTableRoute() {
	const binding = useRecordSetFilters(trapRecordSet, 'table');
	const search = Route.useSearch();
	return (
		<RecordSetTablePage
			binding={binding}
			description="Traps by code, or by name where a trap has none."
			empty={{
				emptyDescription: 'Active traps show here as crews place them.',
				filteredDescription: 'No trap matches what is set above.',
				scope: { kind: 'active' },
			}}
			filters={<TrapFilterFields binding={binding} wide />}
			icon={TrapIcon}
			search={search}
			set={trapRecordSet}
			table={(rows: readonly TrapTableRow[]) => <TrapsTable rows={rows} />}
		/>
	);
}
