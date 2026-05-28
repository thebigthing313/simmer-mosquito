import {
	addressesSyncDescriptor,
	applicationsSyncDescriptor,
	collectionsSyncDescriptor,
	formulationInsecticidesSyncDescriptor,
	formulationsSyncDescriptor,
	habitatsSyncDescriptor,
	habitatTypesSyncDescriptor,
	inspectionsSyncDescriptor,
	regionFoldersSyncDescriptor,
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
} from './collections';

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
		expect(collections.inspections.config.id).toBe(inspectionsSyncDescriptor.id);
		expect(collections.samples.config.id).toBe(samplesSyncDescriptor.id);
		expect(collections.sampleSpecies.config.id).toBe(sampleSpeciesSyncDescriptor.id);
		expect(habitatTypesSyncDescriptor.syncMode).toBe('eager');
		expect(addressesSyncDescriptor.syncMode).toBe('on-demand');
		expect(habitatsSyncDescriptor.syncMode).toBe('on-demand');
		expect(inspectionsSyncDescriptor.syncMode).toBe('on-demand');
		expect(samplesSyncDescriptor.syncMode).toBe('on-demand');
		expect(sampleSpeciesSyncDescriptor.syncMode).toBe('on-demand');
	});

	it('wires the remaining web sync collections without mutation handlers', () => {
		const collections = createWebCollections({ serverUrl: 'https://example.test' });

		expect(collections.regionFolders.config.id).toBe(regionFoldersSyncDescriptor.id);
		expect(collections.traps.config.id).toBe(trapsSyncDescriptor.id);
		expect(collections.formulations.config.id).toBe(formulationsSyncDescriptor.id);
		expect(collections.formulationInsecticides.config.id).toBe(
			formulationInsecticidesSyncDescriptor.id,
		);
		expect(collections.collections.config.id).toBe(collectionsSyncDescriptor.id);
		expect(collections.applications.config.id).toBe(applicationsSyncDescriptor.id);
		expect(collections.weatherSources.config.id).toBe(weatherSourcesSyncDescriptor.id);
		expect(collections.weatherSummaries.config.id).toBe(weatherSummariesSyncDescriptor.id);

		expect(collections.regionFolders.config.onInsert).toBeUndefined();
		expect(collections.traps.config.onUpdate).toBeUndefined();
		expect(collections.applications.config.onDelete).toBeUndefined();
		expect(collections.weatherSummaries.config.onInsert).toBeUndefined();
	});

	it('leaves weather source subscriptions unwired for web', () => {
		const collections = createWebCollections({ serverUrl: 'https://example.test' });

		expect(weatherSourceSubscriptionsSyncDescriptor.syncMode).toBe('on-demand');
		expect('weatherSourceSubscriptions' in collections).toBe(false);
	});
});
