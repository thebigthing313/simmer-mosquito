import { createFileRoute } from '@tanstack/react-router';
import { RoutesIndexPage, useRouteSelection } from '../../../../components/route-planning';
import { useHabitatRoutes, useRouteStopCounts, useRouteStops } from '../-route-data';
import { habitatRouteSurface } from '../-route-surface';

export const Route = createFileRoute('/larval-surveillance/habitats/routes/')({
	component: RoutesIndexRoute,
});

function RoutesIndexRoute() {
	const { routes, isLoading } = useHabitatRoutes();
	const { countByRouteId, isLoading: countsLoading } = useRouteStopCounts();
	const selection = useRouteSelection(routes);
	const selectedStops = useRouteStops(selection.effectiveRouteId);

	return (
		<RoutesIndexPage
			countByRouteId={countByRouteId}
			countsLoading={countsLoading}
			isLoading={isLoading}
			routes={routes}
			selectedStops={selectedStops}
			selection={selection}
			surface={habitatRouteSurface}
		/>
	);
}
