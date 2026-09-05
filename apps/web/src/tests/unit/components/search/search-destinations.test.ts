import type { SearchResult } from '@simmer-mosquito/domain';
import { describe, expect, it } from 'vitest';
import {
	type RouteTypeIndex,
	searchResultDestination,
} from '../../../../components/search/search-destinations';

const HABITAT_TREE = '/larval-surveillance/habitats/routes/$id';
const TRAP_TREE = '/adult-surveillance/traps/routes/$id';

const TRAP_ROUTE_ID = '00000000-0000-4000-8000-00000000trap';
const HABITAT_ROUTE_ID = '00000000-0000-4000-8000-0000000habit';

/** The collection has not answered yet, which is the cold start this covers. */
const LOADING: RouteTypeIndex = { status: 'loading' };

/** The collection has answered and holds one route of each type. */
const LOADED: RouteTypeIndex = {
	status: 'ready',
	routeTypeOf: (routeId) => {
		if (routeId === TRAP_ROUTE_ID) {
			return 'trap';
		}
		if (routeId === HABITAT_ROUTE_ID) {
			return 'habitat';
		}
		return undefined;
	},
};

function commentOnRoute(targetId: string): SearchResult {
	return {
		kind: 'comment',
		id: `comment-${targetId}`,
		title: 'Gate is locked before 7am',
		targetType: 'route',
		targetId,
		matchedField: 'body',
		matchClass: 'text',
	};
}

function routeRecord(routeType: string): SearchResult {
	return {
		kind: 'record',
		id: TRAP_ROUTE_ID,
		title: 'North loop',
		table: 'routes',
		matchedField: 'name',
		matchClass: 'exact',
		routeType,
	};
}

describe('a comment written on a route, before the routes collection answers', () => {
	// The bug: `undefined` used to read as "habitat", so this comment opened the
	// habitat tree, which filters to habitat routes, missed, and rendered a null
	// route reading as "this route does not exist".
	it('does not send a trap route comment to the habitat tree', () => {
		const resolution = searchResultDestination(commentOnRoute(TRAP_ROUTE_ID), LOADING);

		expect(resolution.status).toBe('pending');
	});

	// The same answer for a habitat route comment, and for the same reason: the
	// builder cannot yet tell the two apart, so it must not claim either.
	it('does not send a habitat route comment to the habitat tree either', () => {
		const resolution = searchResultDestination(commentOnRoute(HABITAT_ROUTE_ID), LOADING);

		expect(resolution.status).toBe('pending');
	});
});

describe('a comment written on a route, once the routes collection has answered', () => {
	it('opens the trap tree for a trap route', () => {
		const resolution = searchResultDestination(commentOnRoute(TRAP_ROUTE_ID), LOADED);

		expect(resolution).toEqual({
			status: 'ready',
			destination: { to: TRAP_TREE, params: { id: TRAP_ROUTE_ID } },
		});
	});

	it('opens the habitat tree for a habitat route', () => {
		const resolution = searchResultDestination(commentOnRoute(HABITAT_ROUTE_ID), LOADED);

		expect(resolution).toEqual({
			status: 'ready',
			destination: { to: HABITAT_TREE, params: { id: HABITAT_ROUTE_ID } },
		});
	});

	// An id a loaded collection does not hold names a route this organization
	// cannot see. Either tree would be a guess, so the row gets no destination at
	// all, which is a different answer from the wait above.
	it('opens neither tree for an id the collection does not hold', () => {
		const resolution = searchResultDestination(
			commentOnRoute('00000000-0000-4000-8000-000000absent'),
			LOADED,
		);

		expect(resolution.status).toBe('unresolved');
	});
});

describe('a route result', () => {
	// It carries `routeType` on the wire, so it never consults the collection and
	// resolves the same whether the collection has loaded or not.
	it('resolves from its own routeType with the collection still loading', () => {
		expect(searchResultDestination(routeRecord('trap'), LOADING)).toEqual({
			status: 'ready',
			destination: { to: TRAP_TREE, params: { id: TRAP_ROUTE_ID } },
		});
		expect(searchResultDestination(routeRecord('habitat'), LOADING)).toEqual({
			status: 'ready',
			destination: { to: HABITAT_TREE, params: { id: TRAP_ROUTE_ID } },
		});
	});
});

describe('every other result', () => {
	it('resolves a record to its one fixed route', () => {
		const habitat: SearchResult = {
			kind: 'record',
			id: 'habitat-1',
			title: 'Culvert at 4th',
			table: 'habitats',
			matchedField: 'name',
			matchClass: 'exact',
		};

		expect(searchResultDestination(habitat, LOADING)).toEqual({
			status: 'ready',
			destination: { to: '/larval-surveillance/habitats/$id', params: { id: 'habitat-1' } },
		});
	});

	it('resolves a comment on a non-route target with no lookup', () => {
		const onTrap: SearchResult = {
			kind: 'comment',
			id: 'comment-2',
			title: 'Battery replaced',
			targetType: 'trap',
			targetId: 'trap-1',
			matchedField: 'body',
			matchClass: 'text',
		};

		expect(searchResultDestination(onTrap, LOADING)).toEqual({
			status: 'ready',
			destination: { to: '/adult-surveillance/traps/$id', params: { id: 'trap-1' } },
		});
	});

	it('leaves a page row to the caller, which holds its own destination', () => {
		const page: SearchResult = { kind: 'route', id: 'habitats', title: 'Habitats' };

		expect(searchResultDestination(page, LOADED).status).toBe('unresolved');
	});
});
