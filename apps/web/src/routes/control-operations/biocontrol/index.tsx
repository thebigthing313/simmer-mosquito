import { iconRegistry } from '@simmer-mosquito/ui-web/icons/registry';
import { createFileRoute } from '@tanstack/react-router';
import type { Map as MapboxMap } from 'mapbox-gl';
import { useState } from 'react';
import { getServerUrl } from '../../../auth';
import { createLabel } from '../../../components/app-shell/navigation';
import {
	biocontrolFilterCodecs,
	biocontrolListParams,
	biocontrolTileFilters,
	sharedBiocontrolSearch,
} from '../../../components/control-operations/biocontrol/biocontrol-actions-search';
import {
	BiocontrolFilterChips,
	BiocontrolFilterFields,
} from '../../../components/control-operations/biocontrol/biocontrol-filters';
import {
	type BiocontrolListRow,
	biocontrolMethodName,
	biocontrolTechnicianName,
	linkedHabitatIds,
} from '../../../components/control-operations/biocontrol/biocontrol-row-parts';
import { biocontrolSummaryGroupings } from '../../../components/control-operations/biocontrol/biocontrol-summary';
import { BiocontrolSurfaceSwitch } from '../../../components/control-operations/biocontrol/biocontrol-surface-switch';
import { BiocontrolMapCard } from '../../../components/control-operations/biocontrol-map-card';
import {
	controlContext,
	formatAmount,
} from '../../../components/control-operations/control-display';
import { ExplorerMapPage, ExplorerRow } from '../../../components/explorer';
import { ExplorerSummary } from '../../../components/explorer/explorer-summary';
import { MAP_CREATE_TARGETS, MapCanvas, type MapTileLayer } from '../../../components/map';
import { type RecordBadgeFacts, recordBadges } from '../../../components/record/record-badges';
import { useBiocontrolFilterState } from '../../../hooks/control-operations/use-biocontrol-filter-state';
import { useBiocontrolMethodOptions } from '../../../hooks/explorer/use-biocontrol-method-options';
import { useExplorerPanel } from '../../../hooks/explorer/use-explorer-panel';
import { useExplorerResource } from '../../../hooks/explorer/use-explorer-resource';
import { usePersonnelOptions } from '../../../hooks/explorer/use-personnel-options';
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

const PATH = '/map/biocontrol';

function BiocontrolExplorerRoute() {
	// The filter state lives in the URL, so a shared link and Back out of a record
	// both land on the list the operator had narrowed to.
	const binding = useBiocontrolFilterState();
	const { filters: query, setFilters, reset: clearAll, activeCount: activeFilterCount } = binding;
	const [map, setMap] = useState<MapboxMap | null>(null);
	const [selectedId, setSelectedId] = useState<string | null>(null);
	const panel = useExplorerPanel();

	const { nameById: methodNameById } = useBiocontrolMethodOptions();
	const { nameById: personNameById } = usePersonnelOptions();
	const unitById = useUnitLabels().byId;

	// The server tiles + list read the same filter shape, so the map and the paged
	// rail stay in lockstep. Omitted keys (empty range / no toggle) drop out.
	const filters = biocontrolTileFilters(query);
	// What a move to the Table takes with it: every filter, since the Table
	// applies each one.
	const carried = sharedBiocontrolSearch(Route.useSearch());
	const layer: MapTileLayer = {
		kind: 'biocontrol',
		serverUrl: getServerUrl(),
		filters,
		selectedId,
		onSelectFeature: setSelectedId,
	};
	const { rows, total, isLoading, isError, retry, selected, empty, summary, layers } =
		useExplorerResource<BiocontrolListRow>({
			path: PATH,
			rowsKey: 'biocontrolActions',
			rowKey: 'biocontrolAction',
			recordType: 'biocontrolAction',
			params: biocontrolListParams(filters),
			layer,
			map,
			selectedId,
			summarize: true,
		});

	// `habitats` syncs on demand, so resolve only the referenced ids as a bounded
	// live subset rather than reading the whole collection eagerly.
	const habitatNameById = useHabitatNames(linkedHabitatIds(rows));

	const handleMapReady = (instance: MapboxMap) => setMap(instance);

	return (
		<ExplorerMapPage
			actions={<BiocontrolSurfaceSwitch compact current="map" search={carried} />}
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
				<>
					<MapCanvas
						inset={panel.inset}
						searchWidth={panel.width}
						contextMenu={{ create: [MAP_CREATE_TARGETS.biocontrol] }}
						layers={layers}
						controls={{ measure: true, readout: true }}
						fitToData
						rememberCamera
						onMapReady={handleMapReady}
					/>
					{selected === null ? null : (
						<BiocontrolMapCard
							id={selected.id}
							inset={panel.inset}
							onClose={() => setSelectedId(null)}
						/>
					)}
				</>
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
						chips={activeFilterCount === 0 ? null : <BiocontrolFilterChips binding={binding} />}
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
