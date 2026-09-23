/**
 * The memory harness's own rules, on the two things a suite cannot see from
 * a hook's result alone: whether the rows it seeded are there, and what
 * status a live query over the collection reads.
 *
 * A live query rather than the collection's own status, because a read hook
 * reports the query's status and the query derives it from every source at
 * subscribe time. So a held source has to hold a query opened over it, not
 * only its own flag.
 */

import { createLiveQueryCollection } from '@tanstack/db';
import { beforeEach, describe, expect, it } from 'vitest';
import { organizations } from '../../../../lib/collections/organizations';
import { service_requests } from '../../../../lib/collections/service_requests';
import { holdUnsynced, installMemoryCollections, markSynced, seedRows } from './memory-collections';

const ORG = { id: 'org-1', name: 'Test Mosquito Control', settings: {} };

/** A live query over the whole table, started, so its status is read off the source. */
function liveStatus(resolver: typeof organizations | typeof service_requests): string {
	const query = createLiveQueryCollection({
		query: (q) => q.from({ row: resolver() }),
		startSync: true,
	});
	return query.status;
}

beforeEach(() => {
	installMemoryCollections();
});

describe('holdUnsynced', () => {
	it('keeps seeded rows in place while a live query over them reads loading', () => {
		holdUnsynced(organizations);
		seedRows(organizations, [ORG]);

		expect(organizations().get('org-1')).toMatchObject({ name: 'Test Mosquito Control' });
		expect(organizations().isReady()).toBe(false);
		expect(liveStatus(organizations)).toBe('loading');
	});

	it('holds one table and leaves the rest synced', () => {
		seedRows(organizations, [ORG]);
		holdUnsynced(service_requests);

		expect(organizations().isReady()).toBe(true);
		expect(liveStatus(organizations)).toBe('ready');
		expect(liveStatus(service_requests)).toBe('loading');
	});

	it('is lifted by markSynced', () => {
		holdUnsynced(service_requests);
		seedRows(service_requests, [{ id: 'sr-1', organization_id: 'org-1' }]);
		markSynced(service_requests);

		expect(service_requests().get('sr-1')).toBeDefined();
		expect(liveStatus(service_requests)).toBe('ready');
	});

	it('refuses a collection that has already synced', () => {
		seedRows(organizations, [ORG]);

		expect(() => holdUnsynced(organizations)).toThrow(/already synced/);
	});
});
