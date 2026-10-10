import { iconRegistry } from '@simmer-mosquito/ui-web/icons/registry';
import { createFileRoute } from '@tanstack/react-router';
import { createLabel } from '../../../components/app-shell/navigation';
import { formatAmount } from '../../../components/control-operations/control-display';
import {
	SourceReductionFilterChips,
	SourceReductionFilterFields,
} from '../../../components/control-operations/source-reduction/source-reduction-filters';
import {
	linkedHabitatIds,
	type SourceReductionListRow,
	sourceReductionMethodName,
	sourceReductionTechnicianName,
} from '../../../components/control-operations/source-reduction/source-reduction-row-parts';
import { sourceReductionSummaryGroupings } from '../../../components/control-operations/source-reduction/source-reduction-summary';
import { SourceReductionSurfaceSwitch } from '../../../components/control-operations/source-reduction/source-reduction-surface-switch';
import {
	sharedSourceReductionSearch,
	sourceReductionFilterCodecs,
	sourceReductionListParams,
	sourceReductionTileFilters,
} from '../../../components/control-operations/source-reduction/source-reductions-search';
import { SourceReductionMapCard } from '../../../components/control-operations/source-reduction-map-card';
import { ExplorerMapPage, ExplorerRow } from '../../../components/explorer';
import { ExplorerCanvas } from '../../../components/explorer/explorer-canvas';
import { ExplorerSummary } from '../../../components/explorer/explorer-summary';
import { MAP_CREATE_TARGETS } from '../../../components/map';
import { useSourceReductionFilterState } from '../../../hooks/control-operations/use-source-reduction-filter-state';
import { useCatalogOptions } from '../../../hooks/explorer/use-catalog-options';
import { useExplorerPanel } from '../../../hooks/explorer/use-explorer-panel';
import { useExplorerResource } from '../../../hooks/explorer/use-explorer-resource';
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

const PATH = '/map/source-reduction';

function SourceReductionExplorerRoute() {
	// The filter state lives in the URL, so a shared link and Back out of a record
	// both land on the list the operator had narrowed to.
	const binding = useSourceReductionFilterState();
	const { filters: query, setFilters, reset: clearAll, activeCount: activeFilterCount } = binding;
	const panel = useExplorerPanel();

	const { nameById: methodNameById } = useCatalogOptions(catalogs.sourceReductionMethods);
	const { nameById: personNameById } = useCatalogOptions(catalogs.profiles);
	const unitById = useUnitLabels().byId;

	// The server tiles + list read the same filter shape, so the map and the paged
	// rail stay in lockstep. Omitted keys (empty range / no selection) drop out.
	const filters = sourceReductionTileFilters(query);
	// What a move to the Table takes with it: every filter, since the Table
	// applies each one.
	const carried = sharedSourceReductionSearch(Route.useSearch());
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
	} = useExplorerResource<SourceReductionListRow>({
		path: PATH,
		rowsKey: 'sourceReductions',
		rowKey: 'sourceReduction',
		recordType: 'sourceReduction',
		params: sourceReductionListParams(filters),
		tiles: { kind: 'source-reduction', filters },
		summarize: true,
	});

	// `habitats` syncs on demand, so resolve only the referenced ids as a bounded
	// live subset rather than reading the whole collection eagerly.
	const habitatNameById = useHabitatNames(linkedHabitatIds(rows));

	return (
		<ExplorerMapPage
			actions={<SourceReductionSurfaceSwitch compact current="map" search={carried} />}
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
					<ExplorerSummary
						chips={
							activeFilterCount === 0 ? null : <SourceReductionFilterChips binding={binding} />
						}
						groupings={
							summary.data === null
								? []
								: sourceReductionSummaryGroupings({
										summary: summary.data,
										filters: query,
										setFilters,
										methodNameById,
										personNameById,
										unitById,
									})
						}
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
