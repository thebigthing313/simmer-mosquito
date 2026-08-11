/**
 * Changeset entry formatter for SIMMER's two user-facing apps.
 *
 * Changesets owns the section headings it writes into CHANGELOG.md — they are
 * always the semver bump ("Minor Changes", "Patch Changes") and there is no
 * hook to replace them. Those words mean nothing to an agency reading what
 * changed this week, so the category a reader actually wants travels *inside*
 * the line as a leading `Added:` / `Changed:` / `Fixed:` / `Removed:` token,
 * and the in-app changelog page regroups by that token and ignores the semver
 * headings entirely. The markdown file stays the developer artifact; the page
 * is the product one.
 *
 * This formatter therefore does two things: it keeps the summary verbatim
 * (token included) and it emits nothing else — no commit hashes, no PR links,
 * no "Updated dependencies" noise. Every workspace package but the two apps is
 * in `ignore`, so a dependency line here would name a package no user has
 * heard of.
 */

// Shape: `@changesets/types`' `ChangelogFunctions`. Named in prose rather than
// in a JSDoc `import()` so this file adds no dependency of its own — it is
// loaded by the changesets CLI from a path in config.json and belongs to no
// project's module graph.
const changelogFunctions = {
	getReleaseLine: async (changeset) => {
		const [firstLine, ...rest] = changeset.summary
			.trim()
			.split('\n')
			.map((line) => line.trimEnd());

		// Continuation lines are indented so markdown keeps them in the bullet.
		const continuation = rest.map((line) => (line === '' ? '' : `  ${line}`));

		return ['', `- ${firstLine}`, ...continuation].join('\n');
	},

	getDependencyReleaseLine: async () => '',
};

export default changelogFunctions;
