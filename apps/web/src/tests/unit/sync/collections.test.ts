import {
	addressesSyncDescriptor,
	collectionsSyncDescriptor,
	formulationsSyncDescriptor,
	habitatsSyncDescriptor,
	habitatTypesSyncDescriptor,
	inspectionsSyncDescriptor,
	sampleSpeciesSyncDescriptor,
	samplesSyncDescriptor,
	trapsSyncDescriptor,
	weatherSourceSubscriptionsSyncDescriptor,
	weatherSourcesSyncDescriptor,
	weatherSummariesSyncDescriptor,
} from '@simmer-mosquito/sync';
import { describe, expect, it } from 'vitest';
import {
	createWebCollections,
	preloadWebBaselineCollections,
	type WebCollections,
	webBaselineCollectionKeys,
} from '../../../sync/collections';

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
			'collectionMethods',
			'collectionLures',
			'habitatTypes',
			'applicationMethods',
			'sourceReductionMethods',
			'outreachMethods',
			'biocontrolMethods',
			'vehicles',
			'equipment',
			'insecticides',
			'notificationTypes',
			'tags',
			'routes',
			'regionFolders',
			'traps',
			'formulations',
			'formulationInsecticides',
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
		expect(collections.collectionMethods.config.onInsert).toBeTypeOf('function');
		expect(collections.collectionMethods.config.onUpdate).toBeTypeOf('function');
		expect(collections.collectionMethods.config.onDelete).toBeTypeOf('function');
		expect(collections.collectionLures.config.onInsert).toBeTypeOf('function');
		expect(collections.collectionLures.config.onUpdate).toBeTypeOf('function');
		expect(collections.collectionLures.config.onDelete).toBeTypeOf('function');
		expect(collections.habitatTypes.config.onInsert).toBeTypeOf('function');
		expect(collections.habitatTypes.config.onUpdate).toBeTypeOf('function');
		expect(collections.habitatTypes.config.onDelete).toBeTypeOf('function');
		expect(collections.tags.config.onInsert).toBeTypeOf('function');
		expect(collections.tags.config.onUpdate).toBeTypeOf('function');
		expect(collections.tags.config.onDelete).toBeTypeOf('function');
	});

	it('keeps larval surveillance operational collections on demand', () => {
		const collections = createWebCollections({ serverUrl: 'https://example.test' });

		expect(collections.addresses.config.id).toBe(addressesSyncDescriptor.id);
		expect(collections.addresses.config.onInsert).toBeTypeOf('function');
		expect(collections.habitats.config.id).toBe(habitatsSyncDescriptor.id);
		expect(collections.habitats.config.onInsert).toBeTypeOf('function');
		expect(collections.habitats.config.onUpdate).toBeTypeOf('function');
		expect(collections.habitats.config.onDelete).toBeTypeOf('function');
		expect(collections.inspections.config.id).toBe(inspectionsSyncDescriptor.id);
		expect(collections.inspections.config.onInsert).toBeTypeOf('function');
		expect(collections.inspections.config.onUpdate).toBeTypeOf('function');
		expect(collections.inspections.config.onDelete).toBeTypeOf('function');
		expect(collections.samples.config.id).toBe(samplesSyncDescriptor.id);
		expect(collections.samples.config.onInsert).toBeTypeOf('function');
		expect(collections.sampleSpecies.config.id).toBe(sampleSpeciesSyncDescriptor.id);
		expect(collections.sampleSpecies.config.onInsert).toBeTypeOf('function');
		expect(habitatTypesSyncDescriptor.syncMode).toBe('eager');
		expect(addressesSyncDescriptor.syncMode).toBe('on-demand');
		expect(habitatsSyncDescriptor.syncMode).toBe('on-demand');
		expect(inspectionsSyncDescriptor.syncMode).toBe('on-demand');
		expect(samplesSyncDescriptor.syncMode).toBe('on-demand');
		expect(sampleSpeciesSyncDescriptor.syncMode).toBe('on-demand');
	});

	it('wires the remaining web sync collections without mutation handlers', () => {
		const collections = createWebCollections({ serverUrl: 'https://example.test' });

		expect(collections.traps.config.id).toBe(trapsSyncDescriptor.id);
		expect(collections.collections.config.id).toBe(collectionsSyncDescriptor.id);
		expect(collections.weatherSources.config.id).toBe(weatherSourcesSyncDescriptor.id);
		expect(collections.weatherSummaries.config.id).toBe(weatherSummariesSyncDescriptor.id);

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

	it('attaches optimistic write handlers to adult surveillance collections', () => {
		const collections = createWebCollections({ serverUrl: 'https://example.test' });

		for (const key of ['traps', 'collections', 'collectionSpecies'] as const) {
			expect(collections[key].config.onInsert).toBeTypeOf('function');
			expect(collections[key].config.onUpdate).toBeTypeOf('function');
			expect(collections[key].config.onDelete).toBeTypeOf('function');
		}
	});

	it('attaches optimistic write handlers to control operations collections', () => {
		const collections = createWebCollections({ serverUrl: 'https://example.test' });

		expect(collections.formulations.config.id).toBe(formulationsSyncDescriptor.id);
		for (const key of [
			'formulations',
			'formulationInsecticides',
			'applications',
			'sourceReductions',
			'outreachActions',
			'biocontrolActions',
			'requestedControlActions',
		] as const) {
			expect(collections[key].config.onInsert).toBeTypeOf('function');
			expect(collections[key].config.onUpdate).toBeTypeOf('function');
			expect(collections[key].config.onDelete).toBeTypeOf('function');
		}
		// Application batches are add/remove only.
		expect(collections.applicationBatches.config.onInsert).toBeTypeOf('function');
		expect(collections.applicationBatches.config.onUpdate).toBeUndefined();
		expect(collections.applicationBatches.config.onDelete).toBeTypeOf('function');
	});

	it('attaches optimistic write handlers to field-work and mission collections', () => {
		const collections = createWebCollections({ serverUrl: 'https://example.test' });

		for (const key of [
			'comments',
			'routes',
			'routeItems',
			'assignments',
			'assignmentItems',
			'missions',
			'missionItems',
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

		for (const key of ['contacts', 'serviceRequests', 'notificationRegistrations'] as const) {
			expect(collections[key].config.onInsert).toBeTypeOf('function');
			expect(collections[key].config.onUpdate).toBeTypeOf('function');
			expect(collections[key].config.onDelete).toBeTypeOf('function');
		}
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

		expect(weatherSourceSubscriptionsSyncDescriptor.syncMode).toBe('on-demand');
		expect('weatherSourceSubscriptions' in collections).toBe(false);
	});
});
