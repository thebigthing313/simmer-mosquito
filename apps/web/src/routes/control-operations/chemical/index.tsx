import { iconRegistry } from '@simmer-mosquito/ui-web/icons/registry';
import { createFileRoute } from '@tanstack/react-router';
import { createLabel } from '../../../components/app-shell/navigation';
import { ApplicationMapCard } from '../../../components/control-operations/application-map-card';
import {
	ApplicationFilterFields,
	applicationFilterDeclarations,
} from '../../../components/control-operations/chemical/application-filters';
import {
	applicationMethodName,
	normalizeTreatment,
	type TreatmentListRow,
	treatmentAmounts,
	treatmentBatchNames,
	treatmentProductNames,
} from '../../../components/control-operations/chemical/application-row-parts';
import { applicationSummaryFigures } from '../../../components/control-operations/chemical/application-summary';
import {
	applicationFilterCodecs,
	applicationRecordSet,
} from '../../../components/control-operations/chemical/applications-search';
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
import { useInsecticideOptions } from '../../../hooks/explorer/use-insecticide-options';
import { useRecordSetFilters } from '../../../hooks/explorer/use-record-set-filters';
import { catalogs } from '../../../hooks/queries/catalog-register';
import { useUnitLabels } from '../../../hooks/queries/use-unit-labels';
import { formatListDate } from '../../../lib/local-date';
import { recordNoun } from '../../../lib/record-nouns';
import { searchValidator } from '../../../lib/search-filters';

const TreatmentEntityIcon = iconRegistry.entities.application.icon;

export const Route = createFileRoute('/control-operations/chemical/')({
	component: ApplicationsExplorerRoute,
	validateSearch: searchValidator(applicationFilterCodecs),
});

function ApplicationsExplorerRoute() {
	// The filter state lives in the URL, so a shared link and Back out of a record
	// both land on the list the operator had narrowed to.
	const binding = useRecordSetFilters(applicationRecordSet, 'map');
	const { reset: clearAll, activeCount: activeFilterCount } = binding;
	const panel = useExplorerPanel();

	const { nameById: methodNameById } = useCatalogOptions(catalogs.applicationMethods);
	const { nameById: insecticideNameById } = useInsecticideOptions();
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
		exportRequest,
	}: ExplorerResource<TreatmentListRow> = useExplorerResource({
		set: applicationRecordSet,
		binding,
		normalizeRow: normalizeTreatment,
		summarize: true,
	});

	return (
		<ExplorerMapPage
			exportRequest={exportRequest}
			actions={
				<RecordSetSwitch compact current="map" search={routeSearch} set={applicationRecordSet} />
			}
			activeFilterCount={activeFilterCount}
			filters={<ApplicationFilterFields binding={binding} />}
			heading={{
				title: recordNoun('treatment').titleMany,
				icon: TreatmentEntityIcon,
				total,
				isLoading,
				create: { to: '/control-operations/chemical/create', label: createLabel('treatment') },
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
					<DeclaredSummary
						binding={binding}
						chips={
							<DeclaredFilterChips binding={binding} declarations={applicationFilterDeclarations} />
						}
						declarations={applicationFilterDeclarations}
						figures={(data) => applicationSummaryFigures(data, { insecticideNameById, unitById })}
						order={['insecticides', 'methods', 'people']}
						recordType="treatment"
						state={summary}
					/>
				) : undefined,
				renderRow: (row) => (
					<TreatmentListItem
						amounts={treatmentAmounts(row, unitById)}
						isSelected={row.id === selectedId}
						key={row.id}
						methodName={applicationMethodName(row, methodNameById)}
						onSelect={setSelectedId}
						productNames={treatmentProductNames(row, insecticideNameById)}
						row={row}
					/>
				),
			}}
		/>
	);
}

/**
 * One Treatment on the rail, titled by its products and measured by each
 * product's amount in the same order. Selecting it opens the Treatment.
 */
function TreatmentListItem({
	row,
	productNames,
	methodName,
	amounts,
	isSelected,
	onSelect,
}: {
	readonly row: TreatmentListRow;
	readonly productNames: string;
	readonly methodName: string | null;
	readonly amounts: string;
	readonly isSelected: boolean;
	readonly onSelect: (id: string) => void;
}) {
	const batchNames = treatmentBatchNames(row);
	const batches = batchNames.length > 0 ? `Batch ${batchNames.join(', ')}` : null;
	return (
		<ExplorerRow
			date={formatListDate(row.applicationDate)}
			detailLabel={`View details for ${productNames}`}
			detailLink={{ to: '/control-operations/chemical/$id', params: { id: row.id } }}
			isSelected={isSelected}
			onSelect={() => onSelect(row.id)}
			personnel={[row.applicatorName, batches].filter(Boolean).join(' · ') || null}
			selectLabel={`Show ${productNames} on the map`}
			subtitle={`${amounts}${methodName === null ? '' : ` · ${methodName}`}`}
			title={productNames}
			titleLink={{ to: '/control-operations/chemical/$id', params: { id: row.id } }}
		/>
	);
}
