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
			'genera',
			'species',
			'organizationSpecies',
			'collectionMethods',
			'collectionLures',
			'habitatTypes',
			'tags',
			'routes',
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

		expect(collections.collectionMethods.config.onInsert).toBeTypeOf('function');
		expect(collections.collectionMethods.config.onUpdate).toBeTypeOf('function');
		expect(collections.collectionMethods.config.onDelete).toBeTypeOf('function');
		expect(collections.collectionLures.config.onInsert).toBeTypeOf('function');
		expect(collections.collectionLures.config.onUpdate).toBeTypeOf('function');
		expect(collections.collectionLures.config.onDelete).toBeTypeOf('function');
		expect(collections.habitatTypes.config.onInsert).toBeTypeOf('function');
		expect(collections.habitatTypes.config.onUpdate).toBeTypeOf('function');
		expect(collections.habitatTypes.config.onDelete).toBeTypeOf('function');
	});
});
