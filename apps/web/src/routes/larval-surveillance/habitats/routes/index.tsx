import { createFileRoute } from '@tanstack/react-router';
import { RoutesIndexPage } from '../../../../components/route-planning';
import { useHabitatRoutes, useRouteStopCounts, useRouteStops } from '../-route-data';
import { habitatRouteSurface } from '../-route-surface';

export const Route = createFileRoute('/larval-surveillance/habitats/routes/')({
	component: RoutesIndexRoute,
});

function RoutesIndexRoute() {
	const { routes, isLoading } = useHabitatRoutes();
	const { countByRouteId, isLoading: countsLoading } = useRouteStopCounts();

	return (
		<RoutesIndexPage
			countByRouteId={countByRouteId}
			countsLoading={countsLoading}
			isLoading={isLoading}
			routes={routes}
			surface={habitatRouteSurface}
			useSelectedStops={useRouteStops}
		/>
	);
}
