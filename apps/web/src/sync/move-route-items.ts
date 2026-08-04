import type { OrderPlacement } from '../components/stop-order';
import { postCommand } from './post-command';

/**
 * Reorder route items server-side via the dedicated move endpoint.
 *
 * Reordering cannot ride a collection mutation: `position` is server-owned and a
 * move reindexes every stop after it, so the client sends a declarative
 * placement and the server resolves the sequence inside one transaction.
 *
 * The shared planner names the anchor `anchorId`; the route command endpoint
 * calls it `routeItemId`. Translating here keeps the wire vocabulary in one
 * place and the shared ordering code free of either name.
 *
 * Lives in `sync/` rather than beside one route surface because habitat routes
 * and trap routes are the same `routes`/`route_items` tables behind the same
 * endpoint — the previous copy sat in the habitat module, and the trap page
 * grew its own broken reorder instead of reaching across for it.
 */
export async function moveRouteItems(
	routeId: string,
	routeItemIds: readonly string[],
	placement: OrderPlacement,
): Promise<void> {
	const wirePlacement =
		placement.kind === 'before' || placement.kind === 'after'
			? { kind: placement.kind, routeItemId: placement.anchorId }
			: placement;
	await postCommand(
		`/field-work/routes/${routeId}/move-items`,
		{ routeItemIds: [...routeItemIds], placement: wirePlacement },
		'Unable to reorder the route.',
	);
}
