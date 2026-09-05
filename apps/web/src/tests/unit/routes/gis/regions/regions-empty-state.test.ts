import { describe, expect, it } from 'vitest';
import { regionsEmptyState } from '../../../../../routes/gis/regions/index';

// Two empty panels that read the same and are escaped in opposite directions:
// an agency that has never drawn a Region, and a search that matched none of
// hundreds. Telling a reader with 400 Regions to import a KML file is advice
// that cannot work, which is the same failure the frame's failure state was
// added for.
describe('regionsEmptyState', () => {
	it('asks for a first Region when the organization has none', () => {
		expect(regionsEmptyState({ hasDirectory: false, hasMatches: false, query: '' })).toEqual({
			isEmpty: true,
			emptyTitle: 'No regions yet',
			emptyDescription: 'Create a region, or import boundaries from a KML, KMZ, or GeoJSON file.',
		});
	});

	// Still the first-Region reading, not "nothing matches": a search over an
	// empty directory has nothing to have missed.
	it('keeps the first-Region reading even with a search typed', () => {
		expect(
			regionsEmptyState({ hasDirectory: false, hasMatches: false, query: 'north' }),
		).toMatchObject({ emptyTitle: 'No regions yet' });
	});

	it('names the search that matched none of the Regions there are', () => {
		expect(regionsEmptyState({ hasDirectory: true, hasMatches: false, query: 'north' })).toEqual({
			isEmpty: true,
			emptyTitle: 'No matches',
			emptyDescription: 'Nothing matches “north”.',
		});
	});

	it('is not empty while the search is finding something', () => {
		expect(
			regionsEmptyState({ hasDirectory: true, hasMatches: true, query: 'north' }),
		).toMatchObject({ isEmpty: false });
	});
});
