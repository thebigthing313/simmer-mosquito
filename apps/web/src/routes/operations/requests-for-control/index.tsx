import { boundsFromCoordinates } from '@simmer-mosquito/mapping';
import { iconRegistry } from '@simmer-mosquito/ui-web/icons/registry';
import { createFileRoute } from '@tanstack/react-router';
import type { Map as MapboxMap } from 'mapbox-gl';
import { useState } from 'react';
import { createLabel } from '../../../components/app-shell/navigation';
import { ExplorerMapPage } from '../../../components/explorer';
import { MapCanvas } from '../../../components/map';
import { RequestControlFilters } from '../../../components/operations/requests-for-control/request-control-filters';
import { RequestRow } from '../../../components/operations/requests-for-control/request-row';
import { useCatalogOptions } from '../../../hooks/explorer/use-catalog-options';
import { useControlMethodNames } from '../../../hooks/explorer/use-control-method-names';
import { useExplorerPanel } from '../../../hooks/explorer/use-explorer-panel';
import { useFlyToSelection } from '../../../hooks/explorer/use-fly-to-selection';
import {
	type RequestFilters,
	requestFilterCodecs,
	useRequestForControlFilterState,
} from '../../../hooks/operations/use-request-for-control-filter-state';
import { catalogs } from '../../../hooks/queries/catalog-register';
import { type RequestListing, requestStatus } from '../../../hooks/queries/operations-view';
import { useAssignedRequestIds } from '../../../hooks/queries/use-assigned-request-ids';
import { useRequestedControlActions } from '../../../hooks/queries/use-requested-control-actions';
import type { RecordType } from '../../../lib/record-nouns';
import { recordNoun } from '../../../lib/record-nouns';
import { searchValidator } from '../../../lib/search-filters';

const RequestIcon = iconRegistry.domains.controlOperations.icon;
const RECORD_TYPE: RecordType = 'requestedControlAction';

export const Route = createFileRoute('/operations/requests-for-control/')({
	component: RequestsForControlRoute,
	validateSearch: searchValidator(requestFilterCodecs),
});

function RequestsForControlRoute() {
	const binding = useRequestForControlFilterState();
	const { filters, reset, activeCount: activeFilterCount } = binding;

	const [selectedId, setSelectedId] = useState<string | null>(null);
	const panel = useExplorerPanel();
	const [map, setMap] = useState<MapboxMap | null>(null);

	const { requests, isLoading } = useRequestedControlActions(filters.from, filters.to);
	// The stops are a second subset rather than a join on the window, so the
	// window stays pushed down; the hook's header says why. Applied in memory
	// after the window, the way `status` is.
	const { assignedRequestIds, isReady: assignedReady } = useAssignedRequestIds();
	const { options: personnelOptions, nameById } = useCatalogOptions(catalogs.profiles);
	const methodNameById = useControlMethodNames();

	const visible = requests.filter((request) =>
		matchesFilters(request, filters, assignedRequestIds),
	);

	const mapped = mappable(visible);
	const geoJson = requestFeatures(mapped);
	// The points come from local rows, so the camera frames the filtered set from
	// the list rather than asking the server for an extent.
	const bounds = boundsFromCoordinates(
		mapped.map((request) => ({ lng: request.lng, lat: request.lat })),
	);
	useFlyToSelection(
		map,
		selectedId === null ? null : (visible.find((r) => r.id === selectedId) ?? null),
	);

	return (
		<ExplorerMapPage
			activeFilterCount={activeFilterCount}
			filters={
				<RequestControlFilters
					binding={binding}
					nameById={nameById}
					personnelOptions={personnelOptions}
				/>
			}
			heading={{
				title: recordNoun('requestedControlAction').titleMany,
				icon: RequestIcon,
				total: visible.length,
				isLoading: isLoading || (filters.unassigned && !assignedReady),
				counts: RECORD_TYPE,
				create: {
					to: '/operations/requests-for-control/create',
					label: createLabel('requestedControlAction'),
				},
			}}
			onResetFilters={reset}
			map={
				<MapCanvas
					contextMenu={{}}
					controls={{ measure: true, readout: true }}
					fitToData={bounds}
					geoJson={geoJson}
					geoJsonInteraction={{ selectedId, onSelectFeature: setSelectedId }}
					inset={panel.inset}
					onMapReady={setMap}
					searchWidth={panel.width}
				/>
			}
			panel={panel}
			results={{
				rows: visible,
				emptyTitle: 'No Requests in Range',
				emptyDescription:
					'Widen the time window or loosen the filters to bring requests into range.',
				skeletonClassName: 'h-[68px]',
				renderRow: (request) => (
					<RequestRow
						key={request.id}
						methodNameById={methodNameById}
						onSelect={setSelectedId}
						personNameById={nameById}
						request={request}
						selectedId={selectedId}
					/>
				),
			}}
		/>
	);
}

/** The requests that have somewhere to be drawn. */
function mappable(requests: readonly RequestListing[]): readonly RequestListing[] {
	return requests.filter((request) => Number.isFinite(request.lat) && Number.isFinite(request.lng));
}

function requestFeatures(mapped: readonly RequestListing[]): GeoJSON.GeoJSON | null {
	const features = mapped.map(
		(request): GeoJSON.Feature => ({
			type: 'Feature',
			id: request.id,
			properties: { id: request.id },
			geometry: { type: 'Point', coordinates: [request.lng, request.lat] },
		}),
	);
	return features.length === 0 ? null : { type: 'FeatureCollection', features };
}

/**
 * Status, control type, requester and assignment are matched here rather than
 * in the query: status derives from a nullable timestamp rather than a column,
 * assignment lives on another table, and narrowing the shape per filter change
 * would re-stream the whole window each time. An empty set means the filter is
 * off.
 */
function matchesFilters(
	request: RequestListing,
	filters: RequestFilters,
	assignedRequestIds: ReadonlySet<string>,
): boolean {
	return (
		(filters.status === 'all' || requestStatus(request) === filters.status) &&
		!(filters.unassigned && assignedRequestIds.has(request.id)) &&
		(filters.types.size === 0 || filters.types.has(request.controlType)) &&
		matchesRequester(request, filters.people)
	);
}

/** Whether the request was raised by one of the chosen people; an empty set is off. */
function matchesRequester(request: RequestListing, people: ReadonlySet<string>): boolean {
	if (people.size === 0) {
		return true;
	}
	const requester = request.requestedByProfileId;
	return requester !== null && people.has(requester);
}
