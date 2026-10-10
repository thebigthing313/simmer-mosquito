import { iconRegistry } from '@simmer-mosquito/ui-web/icons/registry';
import { createFileRoute } from '@tanstack/react-router';
import { surfaceCodecs } from '../../../components/explorer/record-set';
import { RecordSetTablePage } from '../../../components/explorer/record-set-table-page';
import { HabitatFilterFields } from '../../../components/larval-surveillance/habitats/habitat-filters';
import { habitatRecordSet } from '../../../components/larval-surveillance/habitats/habitats-search';
import {
	HabitatsTable,
	type HabitatTableRow,
} from '../../../components/larval-surveillance/habitats/habitats-table';
import { useRecordSetFilters } from '../../../hooks/explorer/use-record-set-filters';
import { searchValidator } from '../../../lib/search-filters';

export const Route = createFileRoute('/larval-surveillance/habitats/table')({
	component: HabitatsTableRoute,
	validateSearch: searchValidator(surfaceCodecs(habitatRecordSet, 'table')),
});

const HabitatIcon = iconRegistry.entities.habitat.icon;

/**
 * Every Habitat as a table, in name order, narrowed by the same filters as the
 * Habitats Map. `docs/web-components.md`, under "The record tables", says why
 * it reads the Map's endpoint rather than the `habitats` collection.
 */
function HabitatsTableRoute() {
	const binding = useRecordSetFilters(habitatRecordSet, 'table');
	const search = Route.useSearch();
	return (
		<RecordSetTablePage
			binding={binding}
			description="Every habitat on record, by name."
			empty={{
				emptyDescription: 'Active habitats show here as crews add them.',
				filteredDescription: 'No habitat matches what is set above.',
				scope: { kind: 'active' },
			}}
			filters={<HabitatFilterFields binding={binding} wide />}
			icon={HabitatIcon}
			search={search}
			set={habitatRecordSet}
			table={(rows: readonly HabitatTableRow[]) => <HabitatsTable rows={rows} />}
		/>
	);
}
