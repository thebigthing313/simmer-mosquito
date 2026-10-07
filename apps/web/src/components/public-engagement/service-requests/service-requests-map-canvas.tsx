/**
 * The Service Requests Map's canvas: the request tiles, the create menu for a
 * request or an outreach action, and the key cut to the Status filter, with
 * the cluster circle while the maps are clustering. Takes the tile layers, the
 * status, the panel's inset and width, and the map-ready callback.
 */

import type { Map as MapboxMap } from 'mapbox-gl';
import type { ComponentProps } from 'react';
import { useMapClustering } from '../../../hooks/map/use-map-clustering';
import { MAP_CREATE_TARGETS, MapCanvas, type MapTileLayer } from '../../map';
import { type ServiceRequestStatusFilter, serviceRequestLegend } from './legend';

export function ServiceRequestsMapCanvas({
	inset,
	layers,
	onMapReady,
	searchWidth,
	status,
}: {
	readonly inset: ComponentProps<typeof MapCanvas>['inset'];
	readonly layers: readonly MapTileLayer[];
	readonly onMapReady: (map: MapboxMap) => void;
	readonly searchWidth: ComponentProps<typeof MapCanvas>['searchWidth'];
	readonly status: ServiceRequestStatusFilter;
}) {
	const [clustered] = useMapClustering();
	return (
		<MapCanvas
			contextMenu={{
				create: [MAP_CREATE_TARGETS.serviceRequest, MAP_CREATE_TARGETS.outreach],
			}}
			controls={{ measure: true, readout: true }}
			fitToData
			rememberCamera
			inset={inset}
			layers={layers}
			legend={serviceRequestLegend(status, clustered)}
			onMapReady={onMapReady}
			searchWidth={searchWidth}
		/>
	);
}
