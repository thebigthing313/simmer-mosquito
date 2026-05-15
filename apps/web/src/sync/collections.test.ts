import { describe, expect, it } from 'vitest';
import {
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
});
