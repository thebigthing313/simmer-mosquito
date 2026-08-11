/**
 * Turns a changesets-generated CHANGELOG.md into the releases the in-app
 * changelog page draws.
 *
 * The file is generated, so this parser reads a known shape rather than
 * markdown in general: `# <package>` once at the top, then one `## <version>`
 * per release, then `### <semver bump>` sections of `- ` bullets.
 *
 * It deliberately **ignores the `###` headings**. Changesets can only ever name
 * them after the semver bump, and "Minor Changes" is developer vocabulary; the
 * category a reader wants travels as a leading `Added:` / `Changed:` / `Fixed:`
 * token on each bullet instead (see `.changeset/README.md`). So every bullet in
 * a release is collected flat and regrouped by its own token.
 *
 * Pure and string-in/data-out: the page imports the markdown with Vite's `?raw`
 * and calls this at module load, so there is no fetch, no markdown renderer,
 * and nothing to go wrong at runtime that a unit test cannot catch first.
 */

/** The categories a changeset may declare, in the order they are drawn. */
export const CHANGELOG_CATEGORIES = ['Added', 'Changed', 'Fixed'] as const;

export type ChangelogCategory = (typeof CHANGELOG_CATEGORIES)[number];

export interface ChangelogGroup {
	readonly label: ChangelogCategory;
	readonly entries: readonly string[];
}

export interface ChangelogRelease {
	readonly version: string;
	/** `YYYY-MM-DD`, stamped by `scripts/release-version.mjs`. Absent on old or hand-written entries. */
	readonly date: string | null;
	/**
	 * Entries whose changeset declared no category.
	 *
	 * They are drawn above the groups rather than under an invented heading. An
	 * untokenized entry is a changeset that was written badly, and inventing a
	 * category for it would both add a heading nobody chose and make the mistake
	 * look deliberate — but dropping it would silently lose a change a user was
	 * told about, which is worse than either.
	 */
	readonly uncategorized: readonly string[];
	readonly groups: readonly ChangelogGroup[];
}

const RELEASE_HEADING = /^##\s+(\d+\.\d+\.\d+[^\s—-]*)\s*(?:[—-]\s*(\d{4}-\d{2}-\d{2}))?\s*$/;
const SECTION_HEADING = /^###\s+/;
const BULLET = /^[-*]\s+(.*)$/;
const CATEGORY_TOKEN = /^(Added|Changed|Fixed)\s*:\s*(.*)$/;

interface SortedEntries {
	readonly uncategorized: readonly string[];
	readonly groups: readonly ChangelogGroup[];
}

function sortEntries(entries: readonly string[]): SortedEntries {
	const byCategory = new Map<ChangelogCategory, string[]>();
	const uncategorized: string[] = [];

	for (const entry of entries) {
		const match = CATEGORY_TOKEN.exec(entry);
		const category = match?.[1] as ChangelogCategory | undefined;
		const text = match?.[2]?.trim() ?? entry;

		// A token with nothing after it describes no change; drop it rather than
		// drawing an empty bullet under a real heading.
		if (text === '') {
			continue;
		}

		if (category === undefined) {
			uncategorized.push(text);
			continue;
		}

		const bucket = byCategory.get(category);
		if (bucket === undefined) {
			byCategory.set(category, [text]);
		} else {
			bucket.push(text);
		}
	}

	// Draw order is the declared category order, not the order the file happened
	// to list them in — two releases should not disagree about where "Fixed" sits.
	const groups = CHANGELOG_CATEGORIES.flatMap((category) => {
		const entriesForCategory = byCategory.get(category);
		return entriesForCategory === undefined
			? []
			: [{ label: category, entries: entriesForCategory }];
	});

	return { uncategorized, groups };
}

/**
 * Parses the whole file. Releases come back in the order the file lists them,
 * which changesets keeps newest-first.
 */
export function parseChangelog(markdown: string): readonly ChangelogRelease[] {
	const releases: ChangelogRelease[] = [];

	let version: string | null = null;
	let date: string | null = null;
	let entries: string[] = [];

	const flush = () => {
		if (version === null) {
			return;
		}

		// A release whose every bullet was empty still shipped, and saying so is
		// more honest than hiding the version the sidebar is displaying.
		releases.push({ version, date, ...sortEntries(entries) });
	};

	for (const rawLine of markdown.split('\n')) {
		const line = rawLine.trim();

		const heading = RELEASE_HEADING.exec(line);
		if (heading !== null) {
			flush();
			version = heading[1] ?? null;
			date = heading[2] ?? null;
			entries = [];
			continue;
		}

		// Section headings are the semver bump and are intentionally dropped.
		if (SECTION_HEADING.test(line)) {
			continue;
		}

		if (version === null) {
			continue;
		}

		const bullet = BULLET.exec(line);
		if (bullet !== null) {
			entries.push(bullet[1]?.trim() ?? '');
			continue;
		}

		// An indented continuation line belongs to the bullet above it.
		if (line !== '' && entries.length > 0 && rawLine.startsWith('  ')) {
			const last = entries.length - 1;
			entries[last] = `${entries[last]} ${line}`;
		}
	}

	flush();

	return releases;
}
