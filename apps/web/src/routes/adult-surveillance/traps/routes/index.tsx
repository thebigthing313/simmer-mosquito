import { createFileRoute } from '@tanstack/react-router';
import { RoutesIndexPage } from '../../../../components/route-planning';
import { useTrapRouteStopCounts } from '../../../../hooks/adult-surveillance/use-trap-route-stop-counts';
import { useTrapRouteStops } from '../../../../hooks/adult-surveillance/use-trap-route-stops';
import { useTrapRoutes } from '../../../../hooks/adult-surveillance/use-trap-routes';
import { useRouteSelection } from '../../../../hooks/route-planning/use-route-selection';
import { trapRouteSurface } from './-trap-route-surface';

export const Route = createFileRoute('/adult-surveillance/traps/routes/')({
	component: TrapRoutesIndexRoute,
});

function TrapRoutesIndexRoute() {
	const { routes, isLoading } = useTrapRoutes();
	const { countByRouteId, isLoading: countsLoading } = useTrapRouteStopCounts();
	const selection = useRouteSelection(routes);
	const selectedStops = useTrapRouteStops(selection.effectiveRouteId);

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
