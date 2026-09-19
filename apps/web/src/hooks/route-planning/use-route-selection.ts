import { useState } from 'react';
import type { RouteSummary } from '../../components/route-planning/route-summary';

/** The selected route, and the setter that changes it. */
export interface RouteSelection {
	readonly effectiveRouteId: string | null;
	readonly select: (routeId: string) => void;
}

/** The selected route, defaulted to the first and kept valid as the list moves. */
export function useRouteSelection(routes: readonly RouteSummary[]): RouteSelection {
	const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);
	// Default to the first route; fall back if the selection filtered/deleted away.
	const effectiveRouteId =
		selectedRouteId !== null && routes.some((route) => route.id === selectedRouteId)
			? selectedRouteId
			: (routes[0]?.id ?? null);
	return { effectiveRouteId, select: setSelectedRouteId };
}
