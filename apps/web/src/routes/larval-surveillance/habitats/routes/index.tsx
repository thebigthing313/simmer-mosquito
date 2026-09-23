import { createFileRoute } from '@tanstack/react-router';
import { habitatRouteSurface } from '../../../../components/larval-surveillance/habitats/route-surface';
import { RoutesIndexPage } from '../../../../components/route-planning';
import { useHabitatRouteStopCounts } from '../../../../hooks/larval-surveillance/use-habitat-route-stop-counts';
import { useHabitatRouteStops } from '../../../../hooks/larval-surveillance/use-habitat-route-stops';
import { useHabitatRoutes } from '../../../../hooks/larval-surveillance/use-habitat-routes';
import { useRouteSelection } from '../../../../hooks/route-planning/use-route-selection';

export const Route = createFileRoute('/larval-surveillance/habitats/routes/')({
	component: RoutesIndexRoute,
});

function RoutesIndexRoute() {
	const { routes, isLoading } = useHabitatRoutes();
	const { countByRouteId, isLoading: countsLoading } = useHabitatRouteStopCounts();
	const selection = useRouteSelection(routes);
	const selectedStops = useHabitatRouteStops(selection.effectiveRouteId);

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
