import type {
	CommentTargetType,
	CorpusTable,
	SearchCommentResult,
	SearchRecordResult,
	SearchResult,
} from '@simmer-mosquito/domain';
import { iconRegistry, type RegistryIcon } from '@simmer-mosquito/ui-web/icons/registry';
import type { LinkProps } from '@tanstack/react-router';

/**
 * Where a search result goes, and what it is drawn as.
 *
 * **The server never sends a route.** It sends a table and an id.
 * `LinkProps['to']` is generated from this app's `routeTree.gen.ts`, so putting
 * a route on the wire would make `apps/server` depend on web's route tree, and
 * `apps/mobile` has a different route table entirely. The cost of owning the map
 * here is two hand-kept objects; the return is that renaming a route is a
 * typecheck failure in this file rather than a dead link found in production.
 */
type DetailRoute = NonNullable<LinkProps['to']>;

/**
 * The eleven corpus tables that resolve to one fixed route.
 *
 * `routes` is absent: it resolves to the trap tree or the habitat tree depending
 * on its `route_type`, which is the one per-table rule that cannot be a constant.
 */
const RECORD_ROUTES: Record<Exclude<CorpusTable, 'routes'>, DetailRoute> = {
	habitats: '/larval-surveillance/habitats/$id',
	traps: '/adult-surveillance/traps/$id',
	service_requests: '/public-engagement/service-requests/$id',
	contacts: '/public-engagement/contacts/$id',
	addresses: '/gis/addresses/$id',
	regions: '/gis/regions/$id',
	assignments: '/operations/assignments/$id',
	missions: '/operations/missions/$id',
	requested_control_actions: '/operations/requests-for-control/$id',
	samples: '/larval-surveillance/samples/$id',
	weather_sources: '/gis/weather/$id',
};

const HABITAT_ROUTE_TREE: DetailRoute = '/larval-surveillance/habitats/routes/$id';
const TRAP_ROUTE_TREE: DetailRoute = '/adult-surveillance/traps/routes/$id';

/**
 * Where a comment's *target* lives, for all seventeen target types.
 *
 * Only seven of the seventeen occur in production today. The map still covers
 * every one, because a comment can be written on any of them tomorrow and a
 * missing entry would be a row that navigates nowhere.
 *
 * `route` is absent for the same reason it is absent above, and worse: a comment
 * document deliberately does not borrow anything from its target, so the
 * `route_type` is not on the wire at all. It is resolved from the synced
 * `routes` collection instead — see {@link searchResultDestination}.
 */
const COMMENT_TARGET_ROUTES: Record<Exclude<CommentTargetType, 'route'>, DetailRoute> = {
	address: '/gis/addresses/$id',
	region: '/gis/regions/$id',
	trap: '/adult-surveillance/traps/$id',
	collection: '/adult-surveillance/collections/$id',
	habitat: '/larval-surveillance/habitats/$id',
	inspection: '/larval-surveillance/inspections/$id',
	sample: '/larval-surveillance/samples/$id',
	application: '/control-operations/chemical/$id',
	sourceReduction: '/control-operations/source-reduction/$id',
	outreachAction: '/public-engagement/outreach/$id',
	biocontrolAction: '/control-operations/biocontrol/$id',
	contact: '/public-engagement/contacts/$id',
	serviceRequest: '/public-engagement/service-requests/$id',
	assignment: '/operations/assignments/$id',
	requestedControlAction: '/operations/requests-for-control/$id',
	mission: '/operations/missions/$id',
};

export interface SearchDestination {
	readonly to: DetailRoute;
	readonly params: { readonly id: string };
}

/**
 * What the synced `routes` collection can say about a route id.
 *
 * Three states, not two. A collection that has not answered yet and a collection
 * that has answered and does not hold the id are different facts, and the bug
 * this shape fixes was them sharing one `undefined`: a comment on a trap route
 * opened before the shape landed went to the habitat tree, which filtered it
 * out and rendered as "this route does not exist".
 */
export type RouteTypeIndex =
	| { readonly status: 'loading' }
	| { readonly status: 'ready'; readonly routeTypeOf: (routeId: string) => string | undefined };

/**
 * Where a row goes, or why it does not go anywhere yet.
 *
 * `pending` is a wait and the caller has to draw it as one; `unresolved` is a
 * row with no destination at all, which is a route this organization cannot see
 * or a kind that carries its own `to`.
 */
export type DestinationResolution<TDestination> =
	| { readonly status: 'ready'; readonly destination: TDestination }
	| { readonly status: 'pending' }
	| { readonly status: 'unresolved' };

const PENDING: DestinationResolution<never> = { status: 'pending' };
const UNRESOLVED: DestinationResolution<never> = { status: 'unresolved' };

function ready(to: DetailRoute, id: string): DestinationResolution<SearchDestination> {
	return { status: 'ready', destination: { to, params: { id } } };
}

/**
 * The record or comment a result resolves to.
 *
 * A route and an action carry the navigation item's own `to`, which the caller
 * already holds, so neither goes through this map.
 */
export function searchResultDestination(
	result: SearchResult,
	routeTypes: RouteTypeIndex,
): DestinationResolution<SearchDestination> {
	switch (result.kind) {
		case 'record':
			return recordDestination(result);
		case 'comment':
			return commentDestination(result, routeTypes);
		default:
			return UNRESOLVED;
	}
}

/** A record row, which always carries everything its destination needs. */
function recordDestination(result: SearchRecordResult): DestinationResolution<SearchDestination> {
	if (result.table === 'routes') {
		return ready(routeTree(result.routeType), result.id);
	}

	return ready(RECORD_ROUTES[result.table], result.id);
}

/**
 * A comment row, and the one lookup on this whole surface.
 *
 * Sixteen of the seventeen target types resolve to a fixed route. `route` is
 * the exception: the comment document borrows nothing from its target, so the
 * type comes from the synced collection. Until that collection is ready the
 * answer is `pending` rather than a tree, because guessing either one is a
 * confident wrong answer; once it is ready, an id it does not hold names a
 * route this organization cannot see.
 */
function commentDestination(
	result: SearchCommentResult,
	routeTypes: RouteTypeIndex,
): DestinationResolution<SearchDestination> {
	if (result.targetType !== 'route') {
		return ready(COMMENT_TARGET_ROUTES[result.targetType], result.targetId);
	}

	if (routeTypes.status === 'loading') {
		return PENDING;
	}

	const routeType = routeTypes.routeTypeOf(result.targetId);
	return routeType === undefined ? UNRESOLVED : ready(routeTree(routeType), result.targetId);
}

function routeTree(routeType: string | undefined): DetailRoute {
	return routeType === 'trap' ? TRAP_ROUTE_TREE : HABITAT_ROUTE_TREE;
}

/**
 * The glyph a result row draws.
 *
 * Keyed wider than the corpus on purpose: an action row draws the icon of the
 * record it creates, and six of the fourteen created things are not corpus
 * tables. Two maps would duplicate those six and drift.
 */
type SearchIconKey =
	| CorpusTable
	| 'inspections'
	| 'collections'
	| 'applications'
	| 'source_reductions'
	| 'biocontrol_actions'
	| 'outreach_actions';

const SEARCH_ICONS: Record<SearchIconKey, RegistryIcon> = {
	habitats: iconRegistry.entities.habitat.icon,
	traps: iconRegistry.entities.trap.icon,
	service_requests: iconRegistry.entities.serviceRequest.icon,
	contacts: iconRegistry.entities.contact.icon,
	addresses: iconRegistry.entities.address.icon,
	regions: iconRegistry.entities.region.icon,
	routes: iconRegistry.entities.route.icon,
	assignments: iconRegistry.entities.assignment.icon,
	missions: iconRegistry.entities.mission.icon,
	requested_control_actions: iconRegistry.entities.requestedControlAction.icon,
	samples: iconRegistry.entities.sample.icon,
	weather_sources: iconRegistry.entities.weatherSource.icon,
	inspections: iconRegistry.entities.inspection.icon,
	collections: iconRegistry.entities.collection.icon,
	applications: iconRegistry.entities.application.icon,
	source_reductions: iconRegistry.entities.sourceReductionAction.icon,
	biocontrol_actions: iconRegistry.entities.biocontrolAction.icon,
	outreach_actions: iconRegistry.entities.outreachAction.icon,
};

/**
 * The thing each promoted navigation item creates.
 *
 * Twelve of the fifteen carry `iconRegistry.actions.add.icon` on the nav item
 * itself, so inheriting it would draw a block of identical plus signs separated
 * only by the trailing noun. Drawing the entity instead makes the action and the
 * records it creates read as one thing.
 */
const ACTION_ICON_KEYS: Record<string, SearchIconKey> = {
	'habitats-create': 'habitats',
	'inspections-create': 'inspections',
	'traps-create': 'traps',
	'collections-create': 'collections',
	'chemical-create': 'applications',
	'source-reduction-create': 'source_reductions',
	'biocontrol-create': 'biocontrol_actions',
	'service-requests-create': 'service_requests',
	'outreach-create': 'outreach_actions',
	'contacts-create': 'contacts',
	'regions-create': 'regions',
	'regions-import': 'regions',
	'requests-for-control-create': 'requested_control_actions',
	'assignments-create': 'assignments',
	'missions-create': 'missions',
};

/** The glyph for one result row, whatever kind it is. */
export function searchResultIcon(result: SearchResult): RegistryIcon {
	switch (result.kind) {
		case 'record':
			return SEARCH_ICONS[result.table];
		case 'comment':
			return iconRegistry.actions.comment.icon;
		case 'action': {
			const key = ACTION_ICON_KEYS[result.id];
			return key === undefined ? iconRegistry.actions.add.icon : SEARCH_ICONS[key];
		}
		case 'route':
			return iconRegistry.arrows.arrowRight.icon;
	}
}
