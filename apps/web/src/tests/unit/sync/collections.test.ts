import { describe, expect, it } from 'vitest';
import {
	createWebCollections,
	preloadWebBaselineCollections,
	type WebCollections,
	webBaselineCollectionKeys,
} from '../../../sync/collections';
import { webSyncModes } from '../../../sync/sync-modes';

describe('web sync baseline preload', () => {
	it('keeps the eager baseline bundle explicit', () => {
		expect(webBaselineCollectionKeys).toEqual([
			'units',
			'profiles',
			'memberships',
			'genera',
			'species',
			'organizationSpecies',
			'currentOrganization',
			'tags',
			'routes',
			'regionFolders',
			'weatherSources',
		]);
	});

	it('preloads only the baseline bundle collections', async () => {
		const calls: string[] = [];
		const collections = Object.fromEntries(
			webBaselineCollectionKeys.map((key) => [
				key,
				{
					preload: () => {
						calls.push(key);
						return Promise.resolve();
					},
				},
			]),
		) as unknown as WebCollections;

		await preloadWebBaselineCollections(collections);

		expect(calls).toEqual(webBaselineCollectionKeys);
	});

	it('attaches optimistic write handlers to eager org lookup catalogs', () => {
		const collections = createWebCollections({ serverUrl: 'https://example.test' });

		expect(collections.currentOrganization.config.onUpdate).toBeTypeOf('function');
		expect(collections.tags.config.onInsert).toBeTypeOf('function');
		expect(collections.tags.config.onUpdate).toBeTypeOf('function');
		expect(collections.tags.config.onDelete).toBeTypeOf('function');
	});

	it('wires the remaining web sync collections without mutation handlers', () => {
		const collections = createWebCollections({ serverUrl: 'https://example.test' });

		expect(collections.weatherSources.config.id).toBe('weather_sources');
		expect(collections.weatherSummaries.config.id).toBe('weather_summaries');

		expect(collections.weatherSummaries.config.onInsert).toBeUndefined();
		expect(collections.weatherSummaries.config.onUpdate).toBeUndefined();
		expect(collections.weatherSummaries.config.onDelete).toBeUndefined();
		expect(collections.weatherSources.config.onInsert).toBeUndefined();
	});

	it('attaches optimistic write handlers to foundation geography collections', () => {
		const collections = createWebCollections({ serverUrl: 'https://example.test' });

		for (const key of ['regionFolders', 'regions'] as const) {
			expect(collections[key].config.onInsert).toBeTypeOf('function');
			expect(collections[key].config.onUpdate).toBeTypeOf('function');
			expect(collections[key].config.onDelete).toBeTypeOf('function');
		}
		// Organization-species selection is add/remove only.
		expect(collections.organizationSpecies.config.onInsert).toBeTypeOf('function');
		expect(collections.organizationSpecies.config.onUpdate).toBeUndefined();
		expect(collections.organizationSpecies.config.onDelete).toBeTypeOf('function');
	});

	it('attaches optimistic write handlers to control operations collections', () => {
		const collections = createWebCollections({ serverUrl: 'https://example.test' });

		// Application batches are add/remove only.
		expect(collections.applicationBatches.config.onInsert).toBeTypeOf('function');
		expect(collections.applicationBatches.config.onUpdate).toBeUndefined();
		expect(collections.applicationBatches.config.onDelete).toBeTypeOf('function');
	});

	it('attaches optimistic write handlers to field-work collections', () => {
		const collections = createWebCollections({ serverUrl: 'https://example.test' });

		// `missions` and `mission_items` are not here any more: both write through
		// `lib/collections`, where the command a write means is named in the call.
		for (const key of [
			'comments',
			'routes',
			'routeItems',
			'assignments',
			'assignmentItems',
		] as const) {
			expect(collections[key].config.onInsert).toBeTypeOf('function');
			expect(collections[key].config.onUpdate).toBeTypeOf('function');
			expect(collections[key].config.onDelete).toBeTypeOf('function');
		}
		// Tag assignments and additional personnel are add/remove only.
		for (const key of ['tagItems', 'additionalPersonnel'] as const) {
			expect(collections[key].config.onInsert).toBeTypeOf('function');
			expect(collections[key].config.onUpdate).toBeUndefined();
			expect(collections[key].config.onDelete).toBeTypeOf('function');
		}
	});

	it('attaches optimistic write handlers to public engagement collections', () => {
		const collections = createWebCollections({ serverUrl: 'https://example.test' });

		// Contacts and service requests write through `hooks/mutations` now, so
		// what is left here is the notification half.
		expect(collections.notificationRegistrations.config.onInsert).toBeTypeOf('function');
		expect(collections.notificationRegistrations.config.onUpdate).toBeTypeOf('function');
		expect(collections.notificationRegistrations.config.onDelete).toBeTypeOf('function');
		// Subscriptions are add/remove only; mission notifications are status-only.
		expect(collections.notificationRegistrationTypes.config.onInsert).toBeTypeOf('function');
		expect(collections.notificationRegistrationTypes.config.onUpdate).toBeUndefined();
		expect(collections.notificationRegistrationTypes.config.onDelete).toBeTypeOf('function');
		expect(collections.missionNotifications.config.onInsert).toBeUndefined();
		expect(collections.missionNotifications.config.onUpdate).toBeTypeOf('function');
		expect(collections.missionNotifications.config.onDelete).toBeUndefined();
	});

	it('leaves weather source subscriptions unwired for web', () => {
		const collections = createWebCollections({ serverUrl: 'https://example.test' });

		expect('weather_source_subscriptions' in webSyncModes).toBe(false);
		expect('weatherSourceSubscriptions' in collections).toBe(false);
	});
});
