import { createFileRoute } from '@tanstack/react-router';
import { TrapRouteStopList } from '../../../../components/adult-surveillance/traps/trap-route-stop-list';
import { trapRouteSurface } from '../../../../components/adult-surveillance/traps/trap-route-surface';
import { RouteDetailPage } from '../../../../components/route-planning';
import { useTrapRouteStops } from '../../../../hooks/adult-surveillance/use-trap-route-stops';
import { useTrapRoutes } from '../../../../hooks/adult-surveillance/use-trap-routes';

export const Route = createFileRoute('/adult-surveillance/traps/routes/$id')({
	component: RouteDetailRoute,
});

function RouteDetailRoute() {
	const { id } = Route.useParams();
	const { routes, isReady } = useTrapRoutes();
	const { stops, features, itemCount, isLoading } = useTrapRouteStops(id);

	return (
		<RouteDetailPage
			features={features}
			isLoading={isLoading}
			isReady={isReady}
			itemCount={itemCount}
			route={routes.find((candidate) => candidate.id === id) ?? null}
			routeId={id}
			stopList={(selection) => <TrapRouteStopList selection={selection} stops={stops} />}
			surface={trapRouteSurface}
		/>
	);
}
