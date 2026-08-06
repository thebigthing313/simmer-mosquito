import { createFileRoute } from '@tanstack/react-router';
import { RoutesIndexPage } from '../../../../components/route-planning';
import { useRouteStopCounts, useRouteStops, useTrapRoutes } from './-trap-route-data';
import { trapRouteSurface } from './-trap-route-surface';

export const Route = createFileRoute('/adult-surveillance/traps/routes/')({
	component: TrapRoutesIndexRoute,
});

function TrapRoutesIndexRoute() {
	const { routes, isLoading } = useTrapRoutes();
	const { countByRouteId, isLoading: countsLoading } = useRouteStopCounts();

	return (
		<RoutesIndexPage
			countByRouteId={countByRouteId}
			countsLoading={countsLoading}
			isLoading={isLoading}
			routes={routes}
			surface={trapRouteSurface}
			useSelectedStops={useRouteStops}
		/>
	);
}
