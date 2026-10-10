import { iconRegistry } from '@simmer-mosquito/ui-web/icons/registry';
import { createFileRoute } from '@tanstack/react-router';
import { createLabel } from '../../../components/app-shell/navigation';
import { ApplicationMapCard } from '../../../components/control-operations/application-map-card';
import {
	ApplicationFilterFields,
	applicationFilterDeclarations,
} from '../../../components/control-operations/chemical/application-filters';
import {
	type ApplicationListRow,
	applicationMethodName,
	insecticideName,
	normalizeApplication,
} from '../../../components/control-operations/chemical/application-row-parts';
import { applicationSummaryGroupings } from '../../../components/control-operations/chemical/application-summary';
import {
	applicationFilterCodecs,
	applicationRecordSet,
} from '../../../components/control-operations/chemical/applications-search';
import { formatAmount } from '../../../components/control-operations/control-display';
import { ExplorerMapPage, ExplorerRow } from '../../../components/explorer';
import { DeclaredFilterChips } from '../../../components/explorer/declared-filters';
import { ExplorerCanvas } from '../../../components/explorer/explorer-canvas';
import { ExplorerSummary } from '../../../components/explorer/explorer-summary';
import { RecordSetSwitch } from '../../../components/explorer/record-set-switch';
import { MAP_CREATE_TARGETS } from '../../../components/map';
import { useCatalogOptions } from '../../../hooks/explorer/use-catalog-options';
import { useExplorerPanel } from '../../../hooks/explorer/use-explorer-panel';
import {
	type ExplorerResource,
	useExplorerResource,
} from '../../../hooks/explorer/use-explorer-resource';
import { useInsecticideOptions } from '../../../hooks/explorer/use-insecticide-options';
import { useRecordSetFilters } from '../../../hooks/explorer/use-record-set-filters';
import { catalogs } from '../../../hooks/queries/catalog-register';
import { useUnitLabels } from '../../../hooks/queries/use-unit-labels';
import { formatListDate } from '../../../lib/local-date';
import { recordNoun } from '../../../lib/record-nouns';
import { searchValidator } from '../../../lib/search-filters';

const ApplicationEntityIcon = iconRegistry.entities.application.icon;

export const Route = createFileRoute('/control-operations/chemical/')({
	component: ApplicationsExplorerRoute,
	validateSearch: searchValidator(applicationFilterCodecs),
});

function ApplicationsExplorerRoute() {
	// The filter state lives in the URL, so a shared link and Back out of a record
	// both land on the list the operator had narrowed to.
	const binding = useRecordSetFilters(applicationRecordSet, 'map');
	const { filters: query, setFilters, reset: clearAll, activeCount: activeFilterCount } = binding;
	const panel = useExplorerPanel();

	const { nameById: methodNameById } = useCatalogOptions(catalogs.applicationMethods);
	const { nameById: insecticideNameById } = useInsecticideOptions();
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
	}: ExplorerResource<ApplicationListRow> = useExplorerResource({
		set: applicationRecordSet,
		binding,
		tileset: 'chemical',
		rowKey: 'application',
		normalizeRow: normalizeApplication,
		summarize: true,
	});

	return (
		<ExplorerMapPage
			actions={
				<RecordSetSwitch compact current="map" search={routeSearch} set={applicationRecordSet} />
			}
			activeFilterCount={activeFilterCount}
			filters={<ApplicationFilterFields binding={binding} />}
			heading={{
				title: recordNoun('application').titleMany,
				icon: ApplicationEntityIcon,
				total,
				isLoading,
				create: { to: '/control-operations/chemical/create', label: createLabel('application') },
			}}
			onResetFilters={clearAll}
			map={
				<ExplorerCanvas
					canvas={canvas}
					card={(props) => <ApplicationMapCard {...props} />}
					contextMenu={{ create: [MAP_CREATE_TARGETS.chemical] }}
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
				// says what is in view instead (#1374).
				summary: summary.isShown ? (
					<ExplorerSummary
						chips={
							<DeclaredFilterChips binding={binding} declarations={applicationFilterDeclarations} />
						}
						groupings={
							summary.data === null
								? []
								: applicationSummaryGroupings({
										summary: summary.data,
										filters: query,
										setFilters,
										insecticideNameById,
										methodNameById,
										personNameById,
										unitById,
									})
						}
						recordType="application"
						state={summary}
					/>
				) : undefined,
				renderRow: (row) => (
					<ApplicationListItem
						amount={formatAmount(row.amountApplied, unitById.get(row.applicationUnitId))}
						isSelected={row.id === selectedId}
						key={row.id}
						methodName={applicationMethodName(row, methodNameById)}
						onSelect={setSelectedId}
						productName={insecticideName(row.insecticideId, insecticideNameById)}
						row={row}
					/>
				),
			}}
		/>
	);
}

function ApplicationListItem({
	row,
	productName,
	methodName,
	amount,
	isSelected,
	onSelect,
}: {
	readonly row: ApplicationListRow;
	readonly productName: string;
	readonly methodName: string | null;
	readonly amount: string;
	readonly isSelected: boolean;
	readonly onSelect: (id: string) => void;
}) {
	const batches = row.batchNames.length > 0 ? `Batch ${row.batchNames.join(', ')}` : null;
	return (
		<ExplorerRow
			date={formatListDate(row.applicationDate)}
			detailLabel={`View details for ${productName}`}
			detailLink={{ to: '/control-operations/chemical/$id', params: { id: row.id } }}
			isSelected={isSelected}
			onSelect={() => onSelect(row.id)}
			personnel={[row.applicatorName, batches].filter(Boolean).join(' · ') || null}
			selectLabel={`Show ${productName} on the map`}
			subtitle={`${amount}${methodName === null ? '' : ` · ${methodName}`}`}
			title={productName}
			titleLink={{ to: '/control-operations/chemical/$id', params: { id: row.id } }}
		/>
	);
}
