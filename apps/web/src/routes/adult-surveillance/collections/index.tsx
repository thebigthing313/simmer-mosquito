import { iconRegistry } from '@simmer-mosquito/ui-web/icons/registry';
import { createFileRoute } from '@tanstack/react-router';
import { CollectionMapCard } from '../../../components/adult-surveillance/collection-map-card';
import {
	CollectionFilterFields,
	collectionFilterDeclarations,
} from '../../../components/adult-surveillance/collections/collection-filters';
import {
	type CollectionListRow,
	collectionPersonnelName,
	collectionRowLabel,
	collectionSwatch,
} from '../../../components/adult-surveillance/collections/collection-row-parts';
import { collectionSummaryGroupings } from '../../../components/adult-surveillance/collections/collection-summary';
import {
	collectionFilterCodecs,
	collectionRecordSet,
} from '../../../components/adult-surveillance/collections/collections-search';
import { collectionLegend } from '../../../components/adult-surveillance/collections/legend';
import { createLabel } from '../../../components/app-shell/navigation';
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
import { useMapClustering } from '../../../hooks/map/use-map-clustering';
import { catalogs } from '../../../hooks/queries/catalog-register';
import { collectionEffectiveDate } from '../../../hooks/queries/collection-day';
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

function CollectionsExplorerRoute() {
	// The filter state lives in the URL, so a shared link and Back out of a record
	// both land on the list the operator had narrowed to.
	const binding = useRecordSetFilters(collectionRecordSet, 'map');
	const { filters: query, setFilters, reset: clearAll, activeCount: activeFilterCount } = binding;
	const panel = useExplorerPanel();

	const { nameById: methodNameById } = useCatalogOptions(catalogs.collectionMethods);
	const trapNameById = useTrapNames();
	const personnel = useCatalogOptions(catalogs.profiles);

	const routeSearch = Route.useSearch();
	const [clustered] = useMapClustering();
	const legend = collectionLegend(query.problems, clustered);
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
	}: ExplorerResource<CollectionListRow> = useExplorerResource({
		set: collectionRecordSet,
		binding,
		tileset: 'collections',
		rowKey: 'collection',
		summarize: true,
	});

	return (
		<ExplorerMapPage
			actions={
				<RecordSetSwitch compact current="map" search={routeSearch} set={collectionRecordSet} />
			}
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
				<ExplorerCanvas
					canvas={canvas}
					card={(props) => <CollectionMapCard {...props} />}
					contextMenu={{ create: [MAP_CREATE_TARGETS.collection, MAP_CREATE_TARGETS.trap] }}
					legend={legend}
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
				// says what is in view instead (#1373).
				summary: summary.isShown ? (
					<ExplorerSummary
						chips={
							<DeclaredFilterChips binding={binding} declarations={collectionFilterDeclarations} />
						}
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
