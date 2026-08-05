import { createFileRoute } from '@tanstack/react-router';
import { OutletFullPageMap } from '../../components/app-shell/outlet/full-page-map';
import { MapCanvas } from '../../components/map';

export const Route = createFileRoute('/gis/data-explorer')({
	component: DataExplorerRoute,
});

function DataExplorerRoute() {
	return (
		<OutletFullPageMap>
			<MapCanvas controls={{ measure: true }} />
		</OutletFullPageMap>
	);
}
