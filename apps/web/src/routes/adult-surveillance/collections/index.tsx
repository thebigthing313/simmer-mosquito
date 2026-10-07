import { iconRegistry } from '@simmer-mosquito/ui-web/icons/registry';
import { createFileRoute } from '@tanstack/react-router';
import type { Map as MapboxMap } from 'mapbox-gl';
import { useState } from 'react';
import { getServerUrl } from '../../../auth';
import { collectionEffectiveDate } from '../../../components/adult-surveillance/adult-display';
import { CollectionMapCard } from '../../../components/adult-surveillance/collection-map-card';
import {
	CollectionFilterChips,
	CollectionFilterFields,
} from '../../../components/adult-surveillance/collections/collection-filters';
import {
	type CollectionListRow,
	collectionPersonnelName,
	collectionRowLabel,
	collectionSwatch,
} from '../../../components/adult-surveillance/collections/collection-row-parts';
import { collectionSummaryGroupings } from '../../../components/adult-surveillance/collections/collection-summary';
import { CollectionSurfaceSwitch } from '../../../components/adult-surveillance/collections/collection-surface-switch';
import {
	collectionFilterCodecs,
	collectionListParams,
	collectionTileFilters,
	sharedCollectionSearch,
} from '../../../components/adult-surveillance/collections/collections-search';
import { collectionLegend } from '../../../components/adult-surveillance/collections/legend';
import { createLabel } from '../../../components/app-shell/navigation';
import { ExplorerMapPage, ExplorerRow } from '../../../components/explorer';
import { ExplorerSummary } from '../../../components/explorer/explorer-summary';
import { MAP_CREATE_TARGETS, MapCanvas, type MapTileLayer } from '../../../components/map';
import { type RecordBadgeFacts, recordBadges } from '../../../components/record/record-badges';
import { useCollectionFilterState } from '../../../hooks/adult-surveillance/use-collection-filter-state';
import { useCollectionMethodOptions } from '../../../hooks/explorer/use-collection-method-options';
import { useExplorerPanel } from '../../../hooks/explorer/use-explorer-panel';
import { useExplorerResource } from '../../../hooks/explorer/use-explorer-resource';
import { usePersonnelOptions } from '../../../hooks/explorer/use-personnel-options';
import { useMapClustering } from '../../../hooks/map/use-map-clustering';
import { useTrapNames } from '../../../hooks/queries/use-trap-names';
import { useOrganizationTimeZone } from '../../../hooks/use-organization-time-zone';
import { formatListDate } from '../../../lib/local-date';
import { recordNoun } from '../../../lib/record-nouns';
import { searchValidator } from '../../../lib/search-filters';

const CollectionEntityIcon = iconRegistry.entities.collection.icon;

export const Route = createFileRoute('/adult-surveillance/collections/')({
	component: CollectionsExplorerRoute,
	validateSearch: searchValidator(collectionFilterCodecs),
});

const PATH = '/map/collections';

function CollectionsExplorerRoute() {
	// The filter state lives in the URL, so a shared link and Back out of a record
	// both land on the list the operator had narrowed to.
	const binding = useCollectionFilterState();
	const { filters: query, setFilters, reset: clearAll, activeCount: activeFilterCount } = binding;
	const [map, setMap] = useState<MapboxMap | null>(null);
	const [selectedId, setSelectedId] = useState<string | null>(null);
	const panel = useExplorerPanel();

	const { nameById: methodNameById } = useCollectionMethodOptions();
	const trapNameById = useTrapNames();
	const personnel = usePersonnelOptions();

	// The server tiles + list read the same filter shape, so the map and the paged
	// rail stay in lockstep. Omitted keys (empty range / no selection) drop out.
	const filters = collectionTileFilters(query);
	// What a move to the Table takes with it: every filter, since the Table
	// applies each one.
	const carried = sharedCollectionSearch(Route.useSearch());
	const [clustered] = useMapClustering();
	const legend = collectionLegend(query.problems, clustered);
	const layer: MapTileLayer = {
		kind: 'collections',
		serverUrl: getServerUrl(),
		filters,
		selectedId,
		onSelectFeature: setSelectedId,
	};
	const { rows, total, isLoading, isError, retry, selected, empty, summary, layers } =
		useExplorerResource<CollectionListRow>({
			path: PATH,
			rowsKey: 'collections',
			rowKey: 'collection',
			recordType: 'collection',
			params: collectionListParams(filters),
			layer,
			map,
			selectedId,
			summarize: true,
		});

	const handleMapReady = (instance: MapboxMap) => setMap(instance);

	return (
		<ExplorerMapPage
			actions={<CollectionSurfaceSwitch compact current="map" search={carried} />}
			activeFilterCount={activeFilterCount}
			filters={<CollectionFilterFields binding={binding} />}
			heading={{
				title: recordNoun('collection').titleMany,
				icon: CollectionEntityIcon,
				total,
				isLoading,
				create: { to: '/adult-surveillance/collections/create', label: createLabel('collection') },
			}}
			onResetFilters={clearAll}
			map={
				<>
					<MapCanvas
						inset={panel.inset}
						searchWidth={panel.width}
						contextMenu={{ create: [MAP_CREATE_TARGETS.collection, MAP_CREATE_TARGETS.trap] }}
						layers={layers}
						controls={{ measure: true, readout: true }}
						fitToData
						rememberCamera
						legend={legend}
						onMapReady={handleMapReady}
					/>
					{selected === null ? null : (
						<CollectionMapCard
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
				// says what is in view instead (#1373).
				summary: summary.isShown ? (
					<ExplorerSummary
						chips={activeFilterCount === 0 ? null : <CollectionFilterChips binding={binding} />}
						groupings={
							summary.data === null
								? []
								: collectionSummaryGroupings({
										summary: summary.data,
										filters: query,
										setFilters,
										methodNameById,
									})
						}
						recordType="collection"
						state={summary}
					/>
				) : undefined,
				renderRow: (row) => (
					<CollectionListItem
						isSelected={row.id === selectedId}
						key={row.id}
						label={collectionRowLabel(row, trapNameById)}
						methodName={methodNameById.get(row.collectionMethodId) ?? 'Unknown method'}
						onSelect={setSelectedId}
						row={row}
						setByName={collectionPersonnelName(row, personnel.nameById)}
					/>
				),
			}}
		/>
	);
}

function CollectionListItem({
	row,
	label,
	methodName,
	setByName,
	isSelected,
	onSelect,
}: {
	readonly row: CollectionListRow;
	readonly label: string;
	readonly methodName: string;
	readonly setByName: string | null;
	readonly isSelected: boolean;
	readonly onSelect: (id: string) => void;
}) {
	const timeZone = useOrganizationTimeZone();
	const effectiveDate = collectionEffectiveDate(row, timeZone);
	/*
	 * Bycatch only. Trap out, Problem reported and Zero result are the
	 * collection's status, which the dot at the left of the row draws in the
	 * colour the map paints it and the key names. A collection with no bycatch
	 * passes nothing, so the row lays out no line for it.
	 */
	const facts: RecordBadgeFacts = {
		category: 'collection',
		status: row.status,
		hasBycatch: row.hasBycatch,
	};
	return (
		<ExplorerRow
			badges={recordBadges(facts, 'dot')}
			date={effectiveDate === null ? null : formatListDate(effectiveDate)}
			detailLabel={`View details for ${label}`}
			detailLink={{ to: '/adult-surveillance/collections/$id', params: { id: row.id } }}
			isSelected={isSelected}
			onSelect={() => onSelect(row.id)}
			personnel={setByName}
			selectLabel={`Show ${label} on the map`}
			subtitle={methodName}
			swatch={collectionSwatch(row.status)}
			title={label}
			titleLink={{ to: '/adult-surveillance/collections/$id', params: { id: row.id } }}
		/>
	);
}
