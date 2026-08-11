import { describe, expect, it } from 'vitest';
import { parseChangelog } from '../../../lib/changelog';

/**
 * The parser reads a file nobody writes by hand, so what is worth pinning is
 * the shape `changeset version` actually emits — including the parts the page
 * deliberately throws away.
 */
const GENERATED = `# @simmer-mosquito/web

## 0.3.0 — 2026-09-01

### Minor Changes

- Added: Region filters on every map page.

- Fixed: A closed service request no longer reopens on refresh.

### Patch Changes

- Added: A count beside each species in the identification list.

## 0.2.0

### Patch Changes

- Changed: The habitat list sorts by last inspection instead of by name.
`;

describe('parseChangelog', () => {
	it('reads releases newest-first, as the file lists them', () => {
		const releases = parseChangelog(GENERATED);

		expect(releases.map((release) => release.version)).toEqual(['0.3.0', '0.2.0']);
	});

	it('takes the date from the stamped heading and null from an unstamped one', () => {
		const [latest, previous] = parseChangelog(GENERATED);

		expect(latest?.date).toBe('2026-09-01');
		expect(previous?.date).toBeNull();
	});

	it('groups by the category token, not by the semver heading', () => {
		const [latest] = parseChangelog(GENERATED);

		// The two `Added:` entries sat under *different* semver headings — Minor
		// and Patch. A reader does not care which, so they land together.
		expect(latest?.groups).toEqual([
			{
				label: 'Added',
				entries: [
					'Region filters on every map page.',
					'A count beside each species in the identification list.',
				],
			},
			{ label: 'Fixed', entries: ['A closed service request no longer reopens on refresh.'] },
		]);
	});

	it('orders groups Added, Changed, Fixed regardless of file order', () => {
		const releases = parseChangelog(`# app

## 1.0.0

### Minor Changes

- Fixed: A crash on empty results.
- Added: A new export dialog.
- Changed: The default date range.
`);

		expect(releases[0]?.groups.map((group) => group.label)).toEqual(['Added', 'Changed', 'Fixed']);
	});

	it('drops the token from the entry text', () => {
		const releases = parseChangelog('# app\n\n## 1.0.0\n\n- Fixed: The thing.\n');

		expect(releases[0]?.groups[0]?.entries).toEqual(['The thing.']);
	});

	// Losing it would silently drop a change a user was told about; filing it
	// under an invented category would make a badly written changeset look
	// deliberate. It stays visible, and stays outside the three real groups.
	it('keeps an untokenized entry, ungrouped rather than under an invented heading', () => {
		const releases = parseChangelog('# app\n\n## 1.0.0\n\n- Something happened.\n');

		expect(releases[0]?.uncategorized).toEqual(['Something happened.']);
		expect(releases[0]?.groups).toEqual([]);
	});

	it('does not treat Removed: as a category — it is not one of the three', () => {
		const releases = parseChangelog('# app\n\n## 1.0.0\n\n- Removed: The old export button.\n');

		expect(releases[0]?.groups).toEqual([]);
		expect(releases[0]?.uncategorized).toEqual(['Removed: The old export button.']);
	});

	it('folds an indented continuation line into the bullet above it', () => {
		const releases = parseChangelog(
			'# app\n\n## 1.0.0\n\n- Added: A thing\n  that needed two lines.\n',
		);

		expect(releases[0]?.groups[0]?.entries).toEqual(['A thing that needed two lines.']);
	});

	it('keeps a release whose entries were all empty rather than hiding the version', () => {
		const releases = parseChangelog(
			'# app\n\n## 1.0.0 — 2026-01-02\n\n### Patch Changes\n\n- Fixed:\n',
		);

		expect(releases).toEqual([
			{ version: '1.0.0', date: '2026-01-02', uncategorized: [], groups: [] },
		]);
	});

	it('returns nothing for a changelog with no releases in it yet', () => {
		expect(parseChangelog('# @simmer-mosquito/web\n')).toEqual([]);
	});
});
