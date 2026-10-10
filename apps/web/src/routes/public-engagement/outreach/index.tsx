import { iconRegistry } from '@simmer-mosquito/ui-web/icons/registry';
import { createFileRoute } from '@tanstack/react-router';
import { createLabel } from '../../../components/app-shell/navigation';
import { ExplorerMapPage, ExplorerRow } from '../../../components/explorer';
import { ExplorerCanvas } from '../../../components/explorer/explorer-canvas';
import { ExplorerSummary } from '../../../components/explorer/explorer-summary';
import { MAP_CREATE_TARGETS } from '../../../components/map';
import {
	outreachFilterCodecs,
	outreachListParams,
	outreachTileFilters,
	sharedOutreachSearch,
} from '../../../components/public-engagement/outreach/outreach-actions-search';
import {
	OutreachFilterChips,
	OutreachFilterFields,
} from '../../../components/public-engagement/outreach/outreach-filters';
import {
	type OutreachListRow,
	outreachMethodName,
	outreachTechnicianName,
} from '../../../components/public-engagement/outreach/outreach-row-parts';
import { outreachSummaryGroupings } from '../../../components/public-engagement/outreach/outreach-summary';
import { OutreachSurfaceSwitch } from '../../../components/public-engagement/outreach/outreach-surface-switch';
import { OutreachMapCard } from '../../../components/public-engagement/outreach-map-card';
import { formatReach } from '../../../components/public-engagement/public-engagement-display';
import { useCatalogOptions } from '../../../hooks/explorer/use-catalog-options';
import { useExplorerPanel } from '../../../hooks/explorer/use-explorer-panel';
import { useExplorerResource } from '../../../hooks/explorer/use-explorer-resource';
import { useOutreachFilterState } from '../../../hooks/public-engagement/use-outreach-filter-state';
import { catalogs } from '../../../hooks/queries/catalog-register';
import { formatListDate } from '../../../lib/local-date';
import { recordNoun } from '../../../lib/record-nouns';
import { searchValidator } from '../../../lib/search-filters';

const OutreachEntityIcon = iconRegistry.entities.outreachAction.icon;

export const Route = createFileRoute('/public-engagement/outreach/')({
	component: OutreachExplorerRoute,
	validateSearch: searchValidator(outreachFilterCodecs),
});

const PATH = '/map/outreach';

function OutreachExplorerRoute() {
	// The filter state lives in the URL, so a shared link and Back out of a record
	// both land on the list the operator had narrowed to.
	const binding = useOutreachFilterState();
	const { filters: query, setFilters, reset, activeCount: activeFilterCount } = binding;
	const panel = useExplorerPanel();

	const { nameById: methodNameById } = useCatalogOptions(catalogs.outreachMethods);
	const { nameById: personNameById } = useCatalogOptions(catalogs.profiles);

	// The server tiles + list read the same filter shape, so the map and the paged
	// rail stay in lockstep. Omitted keys (empty range / no selection) drop out.
	const filters = outreachTileFilters(query);
	// What a move to the Table takes with it: every filter, since the Table
	// applies each one.
	const carried = sharedOutreachSearch(Route.useSearch());
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
	} = useExplorerResource<OutreachListRow>({
		path: PATH,
		rowsKey: 'outreachActions',
		rowKey: 'outreachAction',
		recordType: 'outreachAction',
		params: outreachListParams(filters),
		tiles: { kind: 'outreach', filters },
		summarize: true,
	});

	return (
		<ExplorerMapPage
			actions={<OutreachSurfaceSwitch compact current="map" search={carried} />}
			activeFilterCount={activeFilterCount}
			filters={<OutreachFilterFields binding={binding} />}
			heading={{
				title: recordNoun('outreachAction').titleMany,
				icon: OutreachEntityIcon,
				total,
				isLoading,
				create: { to: '/public-engagement/outreach/create', label: createLabel('outreachAction') },
			}}
			onResetFilters={reset}
			map={
				<ExplorerCanvas
					canvas={canvas}
					card={(props) => <OutreachMapCard {...props} />}
					contextMenu={{
						create: [MAP_CREATE_TARGETS.outreach, MAP_CREATE_TARGETS.serviceRequest],
					}}
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
				// says what is in view instead (#1377).
				summary: summary.isShown ? (
					<ExplorerSummary
						chips={activeFilterCount === 0 ? null : <OutreachFilterChips binding={binding} />}
						groupings={
							summary.data === null
								? []
								: outreachSummaryGroupings({
										summary: summary.data,
										filters: query,
										setFilters,
										methodNameById,
										personNameById,
									})
						}
						recordType="outreachAction"
						state={summary}
					/>
				) : undefined,
				renderRow: (row) => (
					<OutreachListItem
						isSelected={row.id === selectedId}
						key={row.id}
						methodName={outreachMethodName(row, methodNameById)}
						onSelect={setSelectedId}
						row={row}
						technicianName={outreachTechnicianName(row, personNameById)}
					/>
				),
			}}
		/>
	);
}

function OutreachListItem({
	row,
	methodName,
	technicianName,
	isSelected,
	onSelect,
}: {
	readonly row: OutreachListRow;
	readonly methodName: string;
	readonly technicianName: string | null;
	readonly isSelected: boolean;
	readonly onSelect: (id: string) => void;
}) {
	const reach = `${formatReach(row.reach)} reached`;

	return (
		<ExplorerRow
			date={formatListDate(row.outreachDate)}
			detailLabel={`View details for ${methodName}`}
			detailLink={{ to: '/public-engagement/outreach/$id', params: { id: row.id } }}
			isSelected={isSelected}
			onSelect={() => onSelect(row.id)}
			personnel={technicianName}
			selectLabel={`Show ${methodName} on the map`}
			subtitle={row.reachDescription === null ? reach : `${reach} · ${row.reachDescription}`}
			title={methodName}
			titleLink={{ to: '/public-engagement/outreach/$id', params: { id: row.id } }}
		/>
	);
}
