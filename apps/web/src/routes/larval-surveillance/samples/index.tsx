import { iconRegistry } from '@simmer-mosquito/ui-web/icons/registry';
import { createFileRoute } from '@tanstack/react-router';
import type { Map as MapboxMap } from 'mapbox-gl';
import { useState } from 'react';
import { getServerUrl } from '../../../auth';
import { ExplorerMapPage, ExplorerRow } from '../../../components/explorer';
import { ExplorerPagination } from '../../../components/explorer-pagination';
import { SampleMapCard } from '../../../components/larval-surveillance/sample-map-card';
import { sampleLegend } from '../../../components/larval-surveillance/samples/legend';
import { SampleFilterFields } from '../../../components/larval-surveillance/samples/sample-filters';
import {
	SampleContext,
	type SampleListRow,
	SpeciesResults,
	sampleSwatch,
} from '../../../components/larval-surveillance/samples/sample-row-parts';
import { SampleSurfaceSwitch } from '../../../components/larval-surveillance/samples/sample-surface-switch';
import {
	sampleFilterCodecs,
	sampleListParams,
	sampleTileFilters,
	sharedSampleSearch,
} from '../../../components/larval-surveillance/samples-search';
import { MAP_CREATE_TARGETS, MapCanvas, type MapTileLayer } from '../../../components/map';
import { useExplorerPanel } from '../../../hooks/explorer/use-explorer-panel';
import { useExplorerResource } from '../../../hooks/explorer/use-explorer-resource';
import { useSpeciesOptions } from '../../../hooks/explorer/use-species-options';
import { useSampleFilterState } from '../../../hooks/larval-surveillance/use-sample-filter-state';
import { formatListDate } from '../../../lib/local-date';
import { recordNoun } from '../../../lib/record-nouns';
import { sampleName } from '../../../lib/sample-name';
import { searchValidator } from '../../../lib/search-filters';

const SampleIcon = iconRegistry.entities.sample.icon;

export const Route = createFileRoute('/larval-surveillance/samples/')({
	component: SamplesExplorerRoute,
	validateSearch: searchValidator(sampleFilterCodecs),
});

/** How many species result chips a narrow list row shows before collapsing to "+N". */
const RESULT_CHIP_LIMIT = 1;

const PATH = '/map/samples';

function SamplesExplorerRoute() {
	// The filter state lives in the URL, so a deep link, a shared link, and Back
	// out of a record all land on the same view.
	const binding = useSampleFilterState();
	const { filters: query, reset: clearAll, activeCount: activeFilterCount } = binding;
	const [map, setMap] = useState<MapboxMap | null>(null);
	const [selectedId, setSelectedId] = useState<string | null>(null);
	const panel = useExplorerPanel();

	const { nameById } = useSpeciesOptions();

	const filters = sampleTileFilters(query);
	// What a move to the Table takes with it: every filter, since the Table
	// applies each one.
	const carried = sharedSampleSearch(Route.useSearch());

	const layer: MapTileLayer = {
		kind: 'samples',
		serverUrl: getServerUrl(),
		filters,
		selectedId,
		onSelectFeature: setSelectedId,
	};
	const layers: readonly MapTileLayer[] = [layer];
	const { rows, total, isLoading, isError, retry, page, pageCount, setPage, selected, empty } =
		useExplorerResource<SampleListRow>({
			path: PATH,
			rowsKey: 'samples',
			rowKey: 'sample',
			recordType: 'sample',
			params: sampleListParams(filters),
			layer,
			map,
			selectedId,
		});

	const handleMapReady = (instance: MapboxMap) => setMap(instance);

	const legend = sampleLegend(query.status);

	return (
		<ExplorerMapPage
			actions={<SampleSurfaceSwitch compact current="map" search={carried} />}
			activeFilterCount={activeFilterCount}
			filters={<SampleFilterFields binding={binding} />}
			footer={
				<ExplorerPagination
					noun={recordNoun('sample')}
					onPageChange={setPage}
					page={page}
					pageCount={pageCount}
					total={total}
				/>
			}
			heading={{
				title: recordNoun('sample').titleMany,
				icon: SampleIcon,
				total,
				isLoading,
			}}
			onResetFilters={clearAll}
			map={
				<>
					<MapCanvas
						inset={panel.inset}
						searchWidth={panel.width}
						contextMenu={{ create: [MAP_CREATE_TARGETS.inspection] }}
						controls={{ measure: true, readout: true }}
						fitToData
						layers={layers}
						legend={legend}
						onMapReady={handleMapReady}
					/>
					{selected === null ? null : (
						<SampleMapCard
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
				skeletonClassName: 'h-[64px]',
				empty,
				renderRow: (sample) => (
					<SampleListItem
						isSelected={sample.id === selectedId}
						key={sample.id}
						nameById={nameById}
						onSelect={setSelectedId}
						sample={sample}
					/>
				),
			}}
		/>
	);
}

function SampleListItem({
	sample,
	isSelected,
	nameById,
	onSelect,
}: {
	readonly sample: SampleListRow;
	readonly isSelected: boolean;
	readonly nameById: ReadonlyMap<string, string>;
	readonly onSelect: (id: string) => void;
}) {
	const label = sampleName(sample);
	return (
		<ExplorerRow
			/*
			 * Species only. The status pill repeated the dot at the left of the row,
			 * which is already the status and already the colour the map paints this
			 * sample. What was found in it is the one thing neither says.
			 *
			 * `null` rather than omitted for a sample that has no results yet, so every
			 * row in the rail keeps the same shape.
			 */
			badges={
				sample.status === 'identified' ? (
					<SpeciesResults limit={RESULT_CHIP_LIMIT} nameById={nameById} sample={sample} />
				) : null
			}
			date={formatListDate(sample.inspectionDate)}
			detailLabel={`View details for ${label}`}
			detailLink={{ to: '/larval-surveillance/samples/$id', params: { id: sample.id } }}
			isSelected={isSelected}
			onSelect={() => onSelect(sample.id)}
			selectLabel={`Show ${label} on the map`}
			subtitle={<SampleContext sample={sample} />}
			swatch={sampleSwatch(sample)}
			title={label}
		/>
	);
}
