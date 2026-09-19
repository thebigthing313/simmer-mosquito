/**
 * The region tree's two pure halves: the fold of a flat region list under its
 * folders, and the search that narrows the folded tree (#937).
 *
 * Search is two-level, and that rule is what this suite holds. A folder that
 * matches keeps every region in it, because the reader searched for the folder
 * and wants its contents; a folder that does not match keeps only the regions
 * that do, and drops out when none do. The unfiled list narrows by region name
 * alone. These cases were run green against the functions while they still sat
 * inline in the route, and then the functions moved.
 */

import { describe, expect, it } from 'vitest';
import { groupByFolder, searchTree } from '../../../../../components/gis/regions/region-tree';
import type { RegionListing } from '../../../../../hooks/queries/use-region-directory';
import type { RegionFolderListing } from '../../../../../hooks/queries/use-region-folders';

function folder(id: string, name: string, description: string | null = null): RegionFolderListing {
	return { id, name, description };
}

function region(id: string, name: string, folderId: string | null): RegionListing {
	return { id, name, description: null, folderId };
}

/** Sorted the way the route sorts, by name, so the tree's order is the fixture's. */
const NORTH = folder('f-north', 'North side', 'Everything above the river');
const SOUTH = folder('f-south', 'South side');
const EMPTY = folder('f-empty', 'Unused');
const FOLDERS = [NORTH, SOUTH, EMPTY];

const ELM = region('r-elm', 'Elm St', 'f-north');
const OAK = region('r-oak', 'Oak Ave', 'f-north');
const PINE = region('r-pine', 'Pine Ct', 'f-south');
const ELMWOOD = region('r-elmwood', 'Elmwood Park', 'f-south');
const RIVER = region('r-river', 'River walk', null);
const ELM_LOOSE = region('r-elm-loose', 'Elm Loop', null);
const REGIONS = [ELM, OAK, PINE, ELMWOOD, RIVER, ELM_LOOSE];

describe('groupByFolder', () => {
	it('files each region under its folder id and the rest at the root', () => {
		const grouped = groupByFolder(REGIONS);

		expect([...grouped.byFolder.entries()]).toEqual([
			['f-north', [ELM, OAK]],
			['f-south', [PINE, ELMWOOD]],
		]);
		expect(grouped.root).toEqual([RIVER, ELM_LOOSE]);
	});

	// The map is keyed by what the regions name, so a folder nothing is filed
	// under has no entry, and the search reads that as an empty folder.
	it('has no entry for a folder with nothing in it', () => {
		expect(groupByFolder(REGIONS).byFolder.has('f-empty')).toBe(false);
	});

	it('keeps the incoming order inside each bucket', () => {
		const grouped = groupByFolder([OAK, ELM]);

		expect(grouped.byFolder.get('f-north')).toEqual([OAK, ELM]);
	});

	it('folds nothing into an empty map and an empty root', () => {
		expect(groupByFolder([])).toEqual({ byFolder: new Map(), root: [] });
	});
});

describe('searchTree with no query', () => {
	it('lists every folder in the given order, with its regions, and the root unfiled', () => {
		const tree = searchTree(FOLDERS, groupByFolder(REGIONS), '');

		expect(tree.folders).toEqual([
			{ folder: NORTH, regions: [ELM, OAK] },
			{ folder: SOUTH, regions: [PINE, ELMWOOD] },
			{ folder: EMPTY, regions: [] },
		]);
		expect(tree.unfiled).toEqual([RIVER, ELM_LOOSE]);
	});
});

describe('searchTree narrowing', () => {
	// The first level: the folder matched, so all of it is kept, Oak Ave
	// included, which on its own matches nothing.
	it('keeps every region of a folder whose name matches', () => {
		const tree = searchTree(FOLDERS, groupByFolder(REGIONS), 'north');

		expect(tree.folders).toEqual([{ folder: NORTH, regions: [ELM, OAK] }]);
		expect(tree.unfiled).toEqual([]);
	});

	// A folder matches on its description too. That is what the search box
	// offers today and the extraction does not change it.
	it('keeps every region of a folder whose description matches', () => {
		const tree = searchTree(FOLDERS, groupByFolder(REGIONS), 'river');

		expect(tree.folders).toEqual([{ folder: NORTH, regions: [ELM, OAK] }]);
		// The unfiled list narrows by name at the same time.
		expect(tree.unfiled).toEqual([RIVER]);
	});

	// The second level: neither folder matched, so each keeps only the regions
	// that did, and the folder with none drops out.
	it('keeps only the matching regions of a folder that does not match', () => {
		const tree = searchTree(FOLDERS, groupByFolder(REGIONS), 'elm');

		expect(tree.folders).toEqual([
			{ folder: NORTH, regions: [ELM] },
			{ folder: SOUTH, regions: [ELMWOOD] },
		]);
		expect(tree.unfiled).toEqual([ELM_LOOSE]);
	});

	it('drops a folder that matches nothing at either level', () => {
		const tree = searchTree(FOLDERS, groupByFolder(REGIONS), 'pine');

		expect(tree.folders).toEqual([{ folder: SOUTH, regions: [PINE] }]);
		expect(tree.unfiled).toEqual([]);
	});

	// An empty folder is listed under no query and dropped under any query it
	// does not match by name or description.
	it('drops an empty folder that does not match', () => {
		const tree = searchTree(FOLDERS, groupByFolder(REGIONS), 'oak');

		expect(tree.folders.map((match) => match.folder.id)).toEqual(['f-north']);
	});

	it('keeps an empty folder that matches, with nothing under it', () => {
		const tree = searchTree(FOLDERS, groupByFolder(REGIONS), 'unused');

		expect(tree.folders).toEqual([{ folder: EMPTY, regions: [] }]);
	});

	// The route lowercases and trims the term before it arrives, so what the
	// function does is match that lowercase term against the lowercased names.
	it('matches case-insensitively on the folder and region side', () => {
		const tree = searchTree(FOLDERS, groupByFolder(REGIONS), 'ELM'.toLowerCase());

		expect(tree.folders.flatMap((match) => match.regions.map((row) => row.name))).toEqual([
			'Elm St',
			'Elmwood Park',
		]);
	});

	// A region's description is not searched, only its name, even though the
	// listing type says it is. Held here so the extraction cannot change it
	// quietly; whether the search should read it is a separate question.
	it('does not match a region on its description', () => {
		const described: RegionListing = { ...PINE, description: 'north of the tracks' };
		const tree = searchTree([SOUTH], groupByFolder([described]), 'tracks');

		expect(tree).toEqual({ folders: [], unfiled: [] });
	});

	it('returns an empty tree when nothing matches anywhere', () => {
		const tree = searchTree(FOLDERS, groupByFolder(REGIONS), 'nowhere');

		expect(tree).toEqual({ folders: [], unfiled: [] });
	});
});
