import { describe, expect, it } from 'vitest';
import {
	CORPUS_TABLES,
	SEARCH_MATCH_CLASSES,
	SEARCH_QUERY_MAX_LENGTH,
	SEARCH_QUERY_MIN_LENGTH,
	type SearchResult,
	searchResultValue,
} from '../../index.js';

describe('searchResultValue', () => {
	// An action *is* a promoted navigation item, so the two share an id by
	// construction. The kind is the only thing keeping them apart in cmdk's
	// string-keyed selection.
	it('keeps a route and the action promoted from it distinct', () => {
		const route: SearchResult = { kind: 'route', id: 'habitats-create', title: 'Create Habitat' };
		const action: SearchResult = { kind: 'action', id: 'habitats-create', title: 'Create Habitat' };

		expect(searchResultValue(route)).not.toBe(searchResultValue(action));
	});

	it('namespaces every kind', () => {
		const id = '8f14e45f-ceea-467a-9c62-1a0f74a1b0e2';

		expect(
			searchResultValue({
				kind: 'record',
				id,
				title: 'Elm Ditch',
				table: 'habitats',
				matchedField: 'habitat_name',
				matchClass: 'exact',
			}),
		).toBe(`record:${id}`);
		expect(
			searchResultValue({
				kind: 'comment',
				id,
				title: 'Dry today',
				targetType: 'habitat',
				targetId: id,
				matchedField: 'comment_text',
				matchClass: 'text',
			}),
		).toBe(`comment:${id}`);
	});
});

describe('the search vocabulary', () => {
	// The order is what the tie-break sorts on, so a reordering is a behaviour
	// change and not a tidy-up.
	it('names the twelve corpus tables in tie-break order', () => {
		expect(CORPUS_TABLES).toEqual([
			'habitats',
			'traps',
			'service_requests',
			'contacts',
			'addresses',
			'regions',
			'routes',
			'assignments',
			'missions',
			'requested_control_actions',
			'samples',
			'weather_sources',
		]);
	});

	it('orders the match classes strongest first', () => {
		expect(SEARCH_MATCH_CLASSES).toEqual(['exact', 'prefix', 'fuzzy', 'text']);
	});

	// Stated once beside the type, because the palette guards on the floor and
	// the endpoint refuses on the cap, and two copies drift.
	it('holds the query bounds the client and the server share', () => {
		expect(SEARCH_QUERY_MIN_LENGTH).toBe(1);
		expect(SEARCH_QUERY_MAX_LENGTH).toBe(200);
	});
});
