import { createFileRoute } from '@tanstack/react-router';
import { RouteDetailPage } from '../../../../components/route-planning';
import { useHabitatRouteStops } from '../../../../hooks/larval-surveillance/use-habitat-route-stops';
import { useHabitatRoutes } from '../../../../hooks/larval-surveillance/use-habitat-routes';
import { RouteStopList } from '../-route-stop-list';
import { habitatRouteSurface } from '../-route-surface';

export const Route = createFileRoute('/larval-surveillance/habitats/routes/$id')({
	component: RouteDetailRoute,
});

function RouteDetailRoute() {
	const { id } = Route.useParams();
	const { routes, isReady } = useHabitatRoutes();
	const { stops, clusters, features, itemCount, isLoading } = useHabitatRouteStops(id);

	return (
		<RouteDetailPage
			features={features}
			isLoading={isLoading}
			isReady={isReady}
			itemCount={itemCount}
			route={routes.find((candidate) => candidate.id === id) ?? null}
			routeId={id}
			stopList={({ selectedStopId, onSelect, onHover }) => (
				// Habitats sharing a location collapse into one entry, so the list
				// walks clusters rather than stops.
				<div className="min-h-0 flex-1 overflow-y-auto">
					<RouteStopList
						clusters={clusters}
						onHover={onHover}
						onSelect={onSelect}
						selectedId={selectedStopId}
					/>
				</div>
			)}
			stops={stops}
			surface={habitatRouteSurface}
		/>
	);
}
