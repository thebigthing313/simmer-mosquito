import { iconRegistry } from '@simmer-mosquito/ui-web/icons/registry';
import { createFileRoute } from '@tanstack/react-router';
import { ExplorerMapPage, ExplorerRow } from '../../../components/explorer';
import { DeclaredFilterChips } from '../../../components/explorer/declared-filters';
import { DeclaredSummary } from '../../../components/explorer/declared-summary';
import { ExplorerCanvas } from '../../../components/explorer/explorer-canvas';
import { RecordSetSwitch } from '../../../components/explorer/record-set-switch';
import { SampleMapCard } from '../../../components/larval-surveillance/sample-map-card';
import { sampleLegend } from '../../../components/larval-surveillance/samples/legend';
import {
	SampleFilterFields,
	sampleFilterDeclarations,
} from '../../../components/larval-surveillance/samples/sample-filters';
import {
	SampleContext,
	type SampleListRow,
	SpeciesResults,
	sampleSwatch,
} from '../../../components/larval-surveillance/samples/sample-row-parts';
import { sampleSummaryFigures } from '../../../components/larval-surveillance/samples/sample-summary';
import {
	sampleFilterCodecs,
	sampleRecordSet,
} from '../../../components/larval-surveillance/samples-search';
import { MAP_CREATE_TARGETS } from '../../../components/map';
import { useExplorerPanel } from '../../../hooks/explorer/use-explorer-panel';
import {
	type ExplorerResource,
	useExplorerResource,
} from '../../../hooks/explorer/use-explorer-resource';
import { useRecordSetFilters } from '../../../hooks/explorer/use-record-set-filters';
import { useSpeciesOptions } from '../../../hooks/explorer/use-species-options';
import { useMapClustering } from '../../../hooks/map/use-map-clustering';
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

function SamplesExplorerRoute() {
	// The filter state lives in the URL, so a deep link, a shared link, and Back
	// out of a record all land on the same view.
	const binding = useRecordSetFilters(sampleRecordSet, 'map');
	const { filters: query, reset: clearAll, activeCount: activeFilterCount } = binding;
	const panel = useExplorerPanel();

	const { nameById } = useSpeciesOptions();

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
	}: ExplorerResource<SampleListRow> = useExplorerResource({
		set: sampleRecordSet,
		binding,
		summarize: true,
	});

	const [clustered] = useMapClustering();
	const legend = sampleLegend(query.status, clustered);

	return (
		<ExplorerMapPage
			actions={<RecordSetSwitch compact current="map" search={routeSearch} set={sampleRecordSet} />}
			activeFilterCount={activeFilterCount}
			filters={<SampleFilterFields binding={binding} />}
			heading={{
				title: recordNoun('sample').titleMany,
				icon: SampleIcon,
				total,
				isLoading,
			}}
			onResetFilters={clearAll}
			map={
				<ExplorerCanvas
					canvas={canvas}
					card={(props) => <SampleMapCard {...props} />}
					contextMenu={{ create: [MAP_CREATE_TARGETS.inspection] }}
					legend={legend}
					panel={panel}
				/>
			}
			panel={panel}
			results={{
				rows,
				isError,
				onRetry: retry,
				skeletonClassName: 'h-[64px]',
				empty,
				// Over 100 in view the rows would not fit on one page, so the panel
				// says what is in view instead (#1370).
				summary: summary.isShown ? (
					<DeclaredSummary
						binding={binding}
						chips={
							<DeclaredFilterChips binding={binding} declarations={sampleFilterDeclarations} />
						}
						declarations={sampleFilterDeclarations}
						figures={sampleSummaryFigures}
						order={['status', 'species', 'nonMosquito']}
						recordType="sample"
						state={summary}
					/>
				) : undefined,
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
