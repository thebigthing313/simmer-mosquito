import { createFileRoute } from '@tanstack/react-router';
import { RoutesIndexPage, useRouteSelection } from '../../../../components/route-planning';
import { useRouteStopCounts, useRouteStops, useTrapRoutes } from './-trap-route-data';
import { trapRouteSurface } from './-trap-route-surface';

export const Route = createFileRoute('/adult-surveillance/traps/routes/')({
	component: TrapRoutesIndexRoute,
});

function TrapRoutesIndexRoute() {
	const { routes, isLoading } = useTrapRoutes();
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
			surface={trapRouteSurface}
		/>
	);
}
