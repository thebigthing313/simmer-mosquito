import { iconRegistry } from '@simmer-mosquito/ui-web/icons/registry';
import { createFileRoute } from '@tanstack/react-router';
import { TrapMapCard } from '../../../components/adult-surveillance/trap-map-card';
import { trapLegend } from '../../../components/adult-surveillance/traps/legend';
import {
	TrapFilterChips,
	TrapFilterFields,
} from '../../../components/adult-surveillance/traps/trap-filters';
import { trapSummaryGroupings } from '../../../components/adult-surveillance/traps/trap-summary';
import {
	trapFilterCodecs,
	trapRecordSet,
} from '../../../components/adult-surveillance/traps/traps-search';
import { createLabel } from '../../../components/app-shell/navigation';
import { ExplorerMapPage, ExplorerRow } from '../../../components/explorer';
import { ExplorerCanvas } from '../../../components/explorer/explorer-canvas';
import { ExplorerSummary } from '../../../components/explorer/explorer-summary';
import { RecordSetSwitch } from '../../../components/explorer/record-set-switch';
import { MAP_CREATE_TARGETS, TRAP_STATUS_COLORS } from '../../../components/map';
import { useCatalogOptions } from '../../../hooks/explorer/use-catalog-options';
import { useExplorerPanel } from '../../../hooks/explorer/use-explorer-panel';
import {
	type ExplorerResource,
	useExplorerResource,
} from '../../../hooks/explorer/use-explorer-resource';
import { useRecordSetFilters } from '../../../hooks/explorer/use-record-set-filters';
import { useMapClustering } from '../../../hooks/map/use-map-clustering';
import { catalogs } from '../../../hooks/queries/catalog-register';
import { trapDisplayName } from '../../../hooks/queries/trap-view';
import { recordNoun } from '../../../lib/record-nouns';
import { searchValidator } from '../../../lib/search-filters';

interface TrapRow {
	readonly id: string;
	readonly lat: number;
	readonly lng: number;
	readonly collectionMethodId: string;
	readonly collectionLureId: string | null;
	readonly addressId: string | null;
	readonly trapName: string | null;
	readonly trapCode: string | null;
	readonly description: string | null;
	readonly isActive: boolean;
}

export const Route = createFileRoute('/adult-surveillance/traps/')({
	component: TrapsExplorerRoute,
	validateSearch: searchValidator(trapFilterCodecs),
});

const TrapEntityIcon = iconRegistry.entities.trap.icon;

function TrapsExplorerRoute() {
	// The filter state lives in the URL, so a shared link and Back out of a trap
	// both land on the list the operator had narrowed to.
	const binding = useRecordSetFilters(trapRecordSet, 'map');
	const { filters: query, activeCount: activeFilterCount, clearAll, setFilters } = binding;
	const panel = useExplorerPanel();

	const { nameById: methodNameById } = useCatalogOptions(catalogs.collectionMethods);

	const routeSearch = Route.useSearch();
	const [clustered] = useMapClustering();
	const legend = trapLegend(query.status, clustered);
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
	}: ExplorerResource<TrapRow> = useExplorerResource({
		set: trapRecordSet,
		binding,
		tileset: 'traps',
		rowKey: 'trap',
		summarize: true,
	});

	return (
		<ExplorerMapPage
			actions={<RecordSetSwitch compact current="map" search={routeSearch} set={trapRecordSet} />}
			activeFilterCount={activeFilterCount}
			filters={<TrapFilterFields binding={binding} />}
			heading={{
				title: recordNoun('trap').titleMany,
				icon: TrapEntityIcon,
				total,
				isLoading,
				create: {
					to: '/adult-surveillance/traps/create',
					label: createLabel('trap'),
					minimum: 'manager',
				},
			}}
			onResetFilters={clearAll}
			map={
				<ExplorerCanvas
					canvas={canvas}
					card={(props) => <TrapMapCard {...props} />}
					contextMenu={{ create: [MAP_CREATE_TARGETS.trap] }}
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
				// says what is in view instead (#1244).
				summary: summary.isShown ? (
					<ExplorerSummary
						chips={activeFilterCount === 0 ? null : <TrapFilterChips binding={binding} />}
						groupings={
							summary.data === null
								? []
								: trapSummaryGroupings({
										summary: summary.data,
										filters: query,
										setFilters,
										methodNameById,
									})
						}
						recordType="trap"
						state={summary}
					/>
				) : undefined,
				renderRow: (trap) => (
					<TrapListItem
						isSelected={trap.id === selectedId}
						key={trap.id}
						methodName={methodNameById.get(trap.collectionMethodId) ?? 'Unknown method'}
						onSelect={setSelectedId}
						trap={trap}
					/>
				),
			}}
		/>
	);
}

function TrapListItem({
	trap,
	methodName,
	isSelected,
	onSelect,
}: {
	readonly trap: TrapRow;
	readonly methodName: string;
	readonly isSelected: boolean;
	readonly onSelect: (id: string) => void;
}) {
	return (
		<ExplorerRow
			detailLabel={`View details for ${trapDisplayName(trap)}`}
			detailLink={{ to: '/adult-surveillance/traps/$id', params: { id: trap.id } }}
			isSelected={isSelected}
			onSelect={() => onSelect(trap.id)}
			selectLabel={`Show ${trapDisplayName(trap)} on the map`}
			subtitle={methodName}
			/*
			 * The dot is the status now, so it has to be the colour the map paints
			 * this trap. It was on --success/--muted-foreground, close enough to look
			 * right beside a pill that spelled it out and never the map's own colours.
			 */
			swatch={{
				color: trap.isActive ? TRAP_STATUS_COLORS.active : TRAP_STATUS_COLORS.inactive,
				label: trap.isActive ? 'Active' : 'Inactive',
			}}
			title={trapDisplayName(trap)}
			titleLink={{ to: '/adult-surveillance/traps/$id', params: { id: trap.id } }}
		/>
	);
}
