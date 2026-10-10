import { iconRegistry } from '@simmer-mosquito/ui-web/icons/registry';
import { createFileRoute } from '@tanstack/react-router';
import { createLabel } from '../../../components/app-shell/navigation';
import {
	biocontrolFilterCodecs,
	biocontrolRecordSet,
} from '../../../components/control-operations/biocontrol/biocontrol-actions-search';
import {
	BiocontrolFilterFields,
	biocontrolFilterDeclarations,
} from '../../../components/control-operations/biocontrol/biocontrol-filters';
import {
	type BiocontrolListRow,
	biocontrolMethodName,
	biocontrolTechnicianName,
	linkedHabitatIds,
} from '../../../components/control-operations/biocontrol/biocontrol-row-parts';
import { biocontrolSummaryGroupings } from '../../../components/control-operations/biocontrol/biocontrol-summary';
import { BiocontrolMapCard } from '../../../components/control-operations/biocontrol-map-card';
import {
	controlContext,
	formatAmount,
} from '../../../components/control-operations/control-display';
import { ExplorerMapPage, ExplorerRow } from '../../../components/explorer';
import { DeclaredFilterChips } from '../../../components/explorer/declared-filters';
import { ExplorerCanvas } from '../../../components/explorer/explorer-canvas';
import { ExplorerSummary } from '../../../components/explorer/explorer-summary';
import { RecordSetSwitch } from '../../../components/explorer/record-set-switch';
import { MAP_CREATE_TARGETS } from '../../../components/map';
import { type RecordBadgeFacts, recordBadges } from '../../../components/record/record-badges';
import { useCatalogOptions } from '../../../hooks/explorer/use-catalog-options';
import { useExplorerPanel } from '../../../hooks/explorer/use-explorer-panel';
import {
	type ExplorerResource,
	useExplorerResource,
} from '../../../hooks/explorer/use-explorer-resource';
import { useRecordSetFilters } from '../../../hooks/explorer/use-record-set-filters';
import { catalogs } from '../../../hooks/queries/catalog-register';
import { useHabitatNames } from '../../../hooks/queries/use-habitat-names';
import { useUnitLabels } from '../../../hooks/queries/use-unit-labels';
import { formatListDate } from '../../../lib/local-date';
import { recordNoun } from '../../../lib/record-nouns';
import { searchValidator } from '../../../lib/search-filters';

const BiocontrolEntityIcon = iconRegistry.entities.biocontrolAction.icon;

export const Route = createFileRoute('/control-operations/biocontrol/')({
	component: BiocontrolExplorerRoute,
	validateSearch: searchValidator(biocontrolFilterCodecs),
});

function BiocontrolExplorerRoute() {
	// The filter state lives in the URL, so a shared link and Back out of a record
	// both land on the list the operator had narrowed to.
	const binding = useRecordSetFilters(biocontrolRecordSet, 'map');
	const { filters: query, setFilters, reset: clearAll, activeCount: activeFilterCount } = binding;
	const panel = useExplorerPanel();

	const { nameById: methodNameById } = useCatalogOptions(catalogs.biocontrolMethods);
	const { nameById: personNameById } = useCatalogOptions(catalogs.profiles);
	const unitById = useUnitLabels().byId;

	const routeSearch = Route.useSearch();
	const {
		rows,
		total,
		isLoading,
		isError,
		retry,
		empty,
		summary,
		canvas,
		selectedId,
		setSelectedId,
	}: ExplorerResource<BiocontrolListRow> = useExplorerResource({
		set: biocontrolRecordSet,
		binding,
		tileset: 'biocontrol',
		rowKey: 'biocontrolAction',
		summarize: true,
	});

	// `habitats` syncs on demand, so resolve only the referenced ids as a bounded
	// live subset rather than reading the whole collection eagerly.
	const habitatNameById = useHabitatNames(linkedHabitatIds(rows));

	return (
		<ExplorerMapPage
			actions={
				<RecordSetSwitch compact current="map" search={routeSearch} set={biocontrolRecordSet} />
			}
			activeFilterCount={activeFilterCount}
			filters={<BiocontrolFilterFields binding={binding} />}
			heading={{
				title: recordNoun('biocontrolAction').titleMany,
				icon: BiocontrolEntityIcon,
				total,
				isLoading,
				create: {
					to: '/control-operations/biocontrol/create',
					label: createLabel('biocontrolAction'),
				},
			}}
			onResetFilters={clearAll}
			map={
				<ExplorerCanvas
					canvas={canvas}
					card={(props) => <BiocontrolMapCard {...props} />}
					contextMenu={{ create: [MAP_CREATE_TARGETS.biocontrol] }}
					panel={panel}
				/>
			}
			panel={panel}
			results={{
				rows,
				isError,
				onRetry: retry,
				empty,
				// Over 100 in view the rows would not fit on one page, so the panel
				// says what is in view instead (#1376).
				summary: summary.isShown ? (
					<ExplorerSummary
						chips={
							<DeclaredFilterChips binding={binding} declarations={biocontrolFilterDeclarations} />
						}
						groupings={
							summary.data === null
								? []
								: biocontrolSummaryGroupings({
										summary: summary.data,
										filters: query,
										setFilters,
										methodNameById,
										personNameById,
										unitById,
									})
						}
						recordType="biocontrolAction"
						state={summary}
					/>
				) : undefined,
				renderRow: (row) => (
					<BiocontrolListItem
						amount={formatAmount(row.amountReleased, unitById.get(row.releaseUnitId))}
						habitatName={
							row.habitatId === null
								? null
								: (habitatNameById.get(row.habitatId) ?? 'Unknown habitat')
						}
						isSelected={row.id === selectedId}
						key={row.id}
						methodName={biocontrolMethodName(row, methodNameById)}
						onSelect={setSelectedId}
						row={row}
						technicianName={biocontrolTechnicianName(row, personNameById)}
					/>
				),
			}}
		/>
	);
}

function BiocontrolListItem({
	row,
	methodName,
	amount,
	habitatName,
	technicianName,
	isSelected,
	onSelect,
}: {
	readonly row: BiocontrolListRow;
	readonly methodName: string;
	readonly amount: string;
	readonly habitatName: string | null;
	readonly technicianName: string | null;
	readonly isSelected: boolean;
	readonly onSelect: (id: string) => void;
}) {
	const facts: RecordBadgeFacts = { category: 'biocontrol', context: controlContext(row) };
	return (
		<ExplorerRow
			badges={recordBadges(facts, 'dot')}
			date={formatListDate(row.biocontrolDate)}
			detailLabel={`View details for ${methodName}`}
			detailLink={{ to: '/control-operations/biocontrol/$id', params: { id: row.id } }}
			isSelected={isSelected}
			onSelect={() => onSelect(row.id)}
			personnel={technicianName}
			selectLabel={`Show ${methodName} on the map`}
			subtitle={`${amount}${habitatName === null ? '' : ` · ${habitatName}`}`}
			title={methodName}
			titleLink={{ to: '/control-operations/biocontrol/$id', params: { id: row.id } }}
		/>
	);
}
