/**
 * A Route as the route-planning chrome shows one.
 *
 * The index list, the preview panel and the detail header between them read two
 * fields: which route it is, and what it is called. Naming that here is what lets
 * the same components serve both surfaces — habitat routes under larval
 * surveillance and trap routes under adult — while their data hooks migrate at
 * different times. A synced route row satisfies it structurally, and so does a
 * projection of one.
 *
 * Anything more about a route belongs to the surface that needs it. The stop
 * counts are already a separate hook for exactly that reason: a list of routes
 * does not want each route to carry its itinerary.
 */
export interface RouteSummary {
	readonly id: string;
	readonly routeName: string;
}
