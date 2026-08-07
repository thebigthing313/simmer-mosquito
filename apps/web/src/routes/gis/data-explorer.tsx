import { createFileRoute } from '@tanstack/react-router';
import { OutletFullPageMap } from '../../components/app-shell/outlet/full-page-map';
import { MAP_CREATE_TARGETS, MapCanvas } from '../../components/map';

export const Route = createFileRoute('/gis/data-explorer')({
	component: DataExplorerRoute,
});

function DataExplorerRoute() {
	return (
		<OutletFullPageMap>
			<MapCanvas
				contextMenu={{
					create: [
						MAP_CREATE_TARGETS.habitat,
						MAP_CREATE_TARGETS.trap,
						MAP_CREATE_TARGETS.address,
						MAP_CREATE_TARGETS.serviceRequest,
					],
				}}
				controls={{ measure: true }}
			/>
		</OutletFullPageMap>
	);
}
