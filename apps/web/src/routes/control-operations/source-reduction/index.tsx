import { iconRegistry } from '@simmer-mosquito/ui-web/icons/registry';
import { createFileRoute } from '@tanstack/react-router';
import { createLabel } from '../../../components/app-shell/navigation';
import { formatAmount } from '../../../components/control-operations/control-display';
import {
	SourceReductionFilterFields,
	sourceReductionFilterDeclarations,
} from '../../../components/control-operations/source-reduction/source-reduction-filters';
import {
	linkedHabitatIds,
	type SourceReductionListRow,
	sourceReductionMethodName,
	sourceReductionTechnicianName,
} from '../../../components/control-operations/source-reduction/source-reduction-row-parts';
import { sourceReductionSummaryFigures } from '../../../components/control-operations/source-reduction/source-reduction-summary';
import {
	sourceReductionFilterCodecs,
	sourceReductionRecordSet,
} from '../../../components/control-operations/source-reduction/source-reductions-search';
import { SourceReductionMapCard } from '../../../components/control-operations/source-reduction-map-card';
import { ExplorerMapPage, ExplorerRow } from '../../../components/explorer';
import { DeclaredFilterChips } from '../../../components/explorer/declared-filters';
import { DeclaredSummary } from '../../../components/explorer/declared-summary';
import { ExplorerCanvas } from '../../../components/explorer/explorer-canvas';
import { RecordSetSwitch } from '../../../components/explorer/record-set-switch';
import { MAP_CREATE_TARGETS } from '../../../components/map';
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

const SourceReductionEntityIcon = iconRegistry.entities.sourceReduction.icon;

export const Route = createFileRoute('/control-operations/source-reduction/')({
	component: SourceReductionExplorerRoute,
	validateSearch: searchValidator(sourceReductionFilterCodecs),
});

function SourceReductionExplorerRoute() {
	// The filter state lives in the URL, so a shared link and Back out of a record
	// both land on the list the operator had narrowed to.
	const binding = useRecordSetFilters(sourceReductionRecordSet, 'map');
	const { reset: clearAll, activeCount: activeFilterCount } = binding;
	const panel = useExplorerPanel();

	const { nameById: methodNameById } = useCatalogOptions(catalogs.sourceReductionMethods);
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
	}: ExplorerResource<SourceReductionListRow> = useExplorerResource({
		set: sourceReductionRecordSet,
		binding,
		summarize: true,
	});

	// `habitats` syncs on demand, so resolve only the referenced ids as a bounded
	// live subset rather than reading the whole collection eagerly.
	const habitatNameById = useHabitatNames(linkedHabitatIds(rows));

	return (
		<ExplorerMapPage
			actions={
				<RecordSetSwitch
					compact
					current="map"
					search={routeSearch}
					set={sourceReductionRecordSet}
				/>
			}
			activeFilterCount={activeFilterCount}
			filters={<SourceReductionFilterFields binding={binding} />}
			heading={{
				title: recordNoun('sourceReduction').titleMany,
				icon: SourceReductionEntityIcon,
				total,
				isLoading,
				create: {
					to: '/control-operations/source-reduction/create',
					label: createLabel('sourceReduction'),
				},
			}}
			onResetFilters={clearAll}
			map={
				<ExplorerCanvas
					canvas={canvas}
					card={(props) => <SourceReductionMapCard {...props} />}
					contextMenu={{ create: [MAP_CREATE_TARGETS.sourceReduction] }}
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
				// says what is in view instead (#1375).
				summary: summary.isShown ? (
					<DeclaredSummary
						binding={binding}
						chips={
							<DeclaredFilterChips
								binding={binding}
								declarations={sourceReductionFilterDeclarations}
							/>
						}
						declarations={sourceReductionFilterDeclarations}
						figures={(data) => sourceReductionSummaryFigures(data, unitById)}
						order={['methods', 'people']}
						recordType="sourceReduction"
						state={summary}
					/>
				) : undefined,
				renderRow: (row) => (
					<SourceReductionListItem
						amountLabel={formatAmount(
							row.sourcesEliminatedAmount,
							unitById.get(row.sourcesEliminatedUnitId),
						)}
						habitatName={
							row.habitatId === null ? null : (habitatNameById.get(row.habitatId) ?? null)
						}
						isSelected={row.id === selectedId}
						key={row.id}
						methodName={sourceReductionMethodName(row, methodNameById)}
						onSelect={setSelectedId}
						row={row}
						technicianName={sourceReductionTechnicianName(row, personNameById)}
					/>
				),
			}}
		/>
	);
}

function SourceReductionListItem({
	row,
	methodName,
	amountLabel,
	habitatName,
	technicianName,
	isSelected,
	onSelect,
}: {
	readonly row: SourceReductionListRow;
	readonly methodName: string;
	readonly amountLabel: string;
	readonly habitatName: string | null;
	readonly technicianName: string | null;
	readonly isSelected: boolean;
	readonly onSelect: (id: string) => void;
}) {
	return (
		<ExplorerRow
			date={formatListDate(row.sourceReductionDate)}
			detailLabel={`View details for ${methodName}`}
			detailLink={{ to: '/control-operations/source-reduction/$id', params: { id: row.id } }}
			isSelected={isSelected}
			onSelect={() => onSelect(row.id)}
			personnel={technicianName}
			selectLabel={`Show ${methodName} on the map`}
			subtitle={`${amountLabel}${habitatName === null ? '' : ` · ${habitatName}`}`}
			title={methodName}
			titleLink={{ to: '/control-operations/source-reduction/$id', params: { id: row.id } }}
		/>
	);
}
