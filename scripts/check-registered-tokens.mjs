#!/usr/bin/env node
/**
 * Holds the design roles in `:root` to the roles registered in `@theme`.
 *
 * Tailwind emits a utility only for a theme variable it knows about. A role
 * declared in `packages/ui-web/src/styles.css`'s `:root` block and never
 * referenced from the `@theme inline` block below it is real CSS that no class
 * can reach: `bg-surface` and `border-border-strong` compile to nothing at all.
 * No error, no fallback, no visible symptom. The swatch on the admin
 * foundations screen drew its ring in the inherited `--border` for months for
 * exactly this reason, and the status palette had already been through the same
 * failure once before (#632, and DESIGN.md's Registered Token Rule).
 *
 * Two assertions:
 *
 * 1. **Every `:root` role is registered.** Registered means named by some
 *    `@theme` entry's value, not spelled identically: `--type-heading` is
 *    registered as `--text-heading` because Tailwind's font-size namespace is
 *    `--text-*`, and `--radius` is registered by the four `--radius-*` entries
 *    that compute from it. Reading the reference rather than the name is what
 *    lets a role cross namespaces without an allowance list.
 * 2. **No class names an unregistered role.** The scan reads candidate names
 *    out of `:root` and looks for each behind the utility prefixes a registered
 *    role would generate, so it reports only roles that exist and are unusable.
 *    That is the shape of the admin bug, and it is what puts a call site in the
 *    failure message rather than only a token name.
 *
 * Gated at zero, with no allowance list. A role that wants an exemption is a
 * role that wants to be unreachable, and deleting it is the other half of the
 * fix: nothing here says a role must exist, only that a declared one must work.
 *
 * Both counts carry a `MINIMUM_` floor, the one #591 and #599 established. The
 * failure this gate has is passing over nothing: reformat the file, or move a
 * block, and a parse that has stopped seeing either half reports no
 * discrepancies and reads as a clean run. The floors make it say so instead.
 *
 * The parse itself is not here. `scripts/lib/stylesheet-tokens.mjs` holds it,
 * shared with `packages/ui-web/src/tests/unit/styles.contrast.test.ts`, which
 * has read the same two files since the focus ring shipped at 1.24:1.
 *
 * Run it with `pnpm check:registered-tokens`.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pathFrom } from './lib/relative-path.mjs';
import { sourceFiles } from './lib/source-files.mjs';
import { lineOf } from './lib/source-position.mjs';
import { readBlockDeclarations } from './lib/stylesheet-tokens.mjs';

const workspaceRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const STYLESHEET = join(workspaceRoot, 'packages/ui-web/src/styles.css');

/**
 * Below these the parse has stopped seeing a block and is reporting a clean run
 * over nothing. They are the counts as they stand, and they move upward with a
 * deliberate edit when the register grows.
 */
const MINIMUM_ROOT_DECLARATIONS = 58;
const MINIMUM_THEME_ENTRIES = 61;

/**
 * The utility prefixes a registered role generates, for the call-site scan.
 *
 * Colour roles reach the sixteen `--color-*` prefixes; a font size reaches
 * `text-`, a line height `leading-`, a radius `rounded-`. The list is wider
 * than any one role needs on purpose: it is looking for somebody who named a
 * role in a class and got nothing, and which namespace they had in mind is not
 * something the class says.
 */
const UTILITY_PREFIXES = [
	'accent',
	'bg',
	'border',
	'caret',
	'decoration',
	'divide',
	'fill',
	'from',
	'leading',
	'outline',
	'placeholder',
	'ring',
	'rounded',
	'shadow',
	'stroke',
	'text',
	'to',
	'via',
];

/** Generated source, which nobody edits and which names no role by hand. */
const GENERATED_PATHS = [join('packages', 'ui-web', 'src', 'components', 'ui')];

function main() {
	const register = readRegister();
	const unregistered = register.roles.filter((role) => !register.registered.has(role));
	const failures = [
		...unregistered.map(
			(role) => `${role} is declared in :root and registered in no @theme entry.`,
		),
		...checkNoUnusableClasses(unregistered),
		...checkFloors(register),
	];

	if (failures.length > 0) {
		console.error('Registered token check failed:\n');
		for (const failure of failures) {
			console.error(`  - ${failure}`);
		}
		console.error(
			'\nA role Tailwind does not know about generates no utility, so the class naming it',
		);
		console.error('compiles to nothing: no error, no fallback, nothing on screen to say why.');
		console.error(
			'Register it in the @theme inline block of packages/ui-web/src/styles.css, under the',
		);
		console.error('namespace for its kind (--color-* for a colour, --text-* for a font size,');
		console.error('--leading-* for a line height), or delete the declaration and its uses.');
		process.exitCode = 1;
		return;
	}

	console.log(
		`Registered tokens: ${register.roles.length} roles in :root, ` +
			`${register.entries} entries in @theme, none unreachable.`,
	);
}

/**
 * The two blocks, and which `:root` role each `@theme` entry names.
 *
 * A role counts as registered when some entry's value mentions it, which is how
 * `--type-heading` is reached through `--text-heading` and `--radius` through
 * `--radius-sm`. An entry that names no role, such as a literal Tailwind
 * override, registers nothing and is still counted toward the floor.
 */
function readRegister() {
	const root = readBlockDeclarations(STYLESHEET, ':root');
	const theme = readBlockDeclarations(STYLESHEET, '@theme inline');
	const roles = root.map(({ name }) => name);
	const registered = new Set();
	for (const { value } of theme) {
		for (const [, name] of value.matchAll(/var\(\s*(--[a-z0-9-]+)/gi)) {
			registered.add(name);
		}
	}
	return { roles, registered, entries: theme.length };
}

/**
 * Refuse to report a clean run over a file the parse has stopped seeing.
 *
 * Reported beside the role failures rather than thrown ahead of them. A branch
 * that unregisters a role trips both, and the useful line is the one naming the
 * role: a floor that short-circuits would answer a real bug with a message
 * about parsing.
 */
function checkFloors({ roles, entries }) {
	const short = [];
	if (roles.length < MINIMUM_ROOT_DECLARATIONS) {
		short.push(`${roles.length} :root declarations, fewer than ${MINIMUM_ROOT_DECLARATIONS}`);
	}
	if (entries < MINIMUM_THEME_ENTRIES) {
		short.push(`${entries} @theme entries, fewer than ${MINIMUM_THEME_ENTRIES}`);
	}
	if (short.length === 0) {
		return [];
	}
	return [
		`Read ${short.join(' and ')} out of packages/ui-web/src/styles.css. Either a block ` +
			'moved or was reformatted past what scripts/lib/stylesheet-tokens.mjs reads, in which ' +
			'case nothing above this line checked anything, or the register really shrank and the ' +
			'MINIMUM_ floors in scripts/check-registered-tokens.mjs owe an edit.',
	];
}

/**
 * Class names that reach for a role Tailwind does not know about.
 *
 * Only unregistered roles are candidates, so a correct `border-border-strong`
 * is silent and the same class before the role was registered is not.
 *
 * The match is bounded by "not another name character" rather than by `\b`,
 * because a hyphen is a word boundary: `\bbg-surface\b` matches inside
 * `bg-surface-muted` and would report one class twice under two role names.
 */
function checkNoUnusableClasses(unregistered) {
	if (unregistered.length === 0) {
		return [];
	}
	const names = [...unregistered]
		.map((role) => role.slice(2))
		.sort((a, b) => b.length - a.length)
		.join('|');
	const pattern = new RegExp(
		`(?<![A-Za-z0-9-])(?:${UTILITY_PREFIXES.join('|')})-(?:${names})(?![A-Za-z0-9-])`,
		'g',
	);
	const failures = [];
	for (const file of sourceFiles(workspaceRoot, GENERATED_PATHS)) {
		const source = readFileSync(file, 'utf8');
		for (const match of source.matchAll(pattern)) {
			failures.push(
				`${pathFrom(workspaceRoot, file)}:${lineOf(source, match.index)} writes ` +
					`${match[0]}, which generates no rule.`,
			);
		}
	}
	return failures;
}

main();
