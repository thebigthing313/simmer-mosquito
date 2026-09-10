#!/usr/bin/env node
/**
 * Asserts that every component module `packages/ui-web` ships from `components/`
 * and its four gallery roots is imported by `apps/preview`.
 *
 * Two documents say `apps/preview` is a contract. `docs/architecture.md` says
 * SIMMER does not use Storybook as a design-system contract and that this app
 * is where the styleguide pages, the kitchen-sink visual regression, the
 * sandbox controls and the template and accessibility stress tests go.
 * `packages/design-tokens/src/colors.ts` calls the design-token screen there
 * the one screen people open to look up a colour.
 * Nothing counted the set, so both claims were claims about somebody's habits:
 * the last commit to `apps/preview/src/routes` is dated 2026-05-18, and
 * `autocomplete.tsx`,
 * `date-picker.tsx` and `number-input.tsx` were added to `packages/ui-web`
 * after it with no preview section between them (#611).
 *
 * Run it with `pnpm check:preview-coverage`.
 *
 * ## What a component module is
 *
 * A `.tsx` file under one of the roots in `MODULE_ROOTS`. The rule is the
 * file extension and nothing else, because JSX is what a preview section
 * renders. Four `.ts` files sit under those roots and none of them is a
 * component: the three `index.ts` barrels, which re-export and draw nothing,
 * and `form/field-components/custom-schema.ts`, which exports helper functions
 * and types. Still four after `components/` joined, because every file directly
 * under `components/` is a `.tsx`. The rule is worth those four: with the `.ts`
 * files counted, 80 modules would have no preview section rather than 76 and
 * `UNCOVERED_MODULES` would read 79 rather than 75. So it is written here
 * rather than left to a reader to work out.
 *
 * ## Which roots, and why those
 *
 * `components/` itself and the four gallery folders below it. The files
 * directly under `components/` are components by the same test the gallery
 * folders pass: `absent-value`, `record-link`, `detail-row`, `panel` and
 * `color-picker` draw, they take props, and a preview section is worth having
 * for each (#686).
 *
 * The `app-shell/`, `auth/`, `changelog/` and `error-report/` folders stay out,
 * and that is the decision rather than an omission. A shell, a sign-in form, a
 * changelog page and an error page are screens rather than components. Nobody
 * looks a shell up, and a preview of one is a screenshot of the app.
 *
 * `components/` is read as its own files and no subdirectory, because every
 * subdirectory of it is either a gallery root or one of those four screen
 * folders. `assertEveryFolderIsClassified` is what holds that: a fifth folder
 * fails the gate until somebody says which of the two it is. Without it a new
 * folder of components would be invisible here, under a summary line that reads
 * like a pass.
 *
 * ## What counts as previewed
 *
 * An import under `apps/preview/src` whose specifier resolves to the module.
 * `packages/ui-web` exports `./components/*` as `./src/components/*.tsx`, and
 * the wildcard matches across `/`, so every one of these modules has a
 * specifier that names it exactly: `.../components/ui/button` is `ui/button.tsx`
 * and `.../components/form/field-components/select-field` is that file. The
 * existing seventeen preview sections are all written that way.
 *
 * This is where the gate departs from `check-mutation-coverage.mjs`, which it
 * is otherwise modelled on. That one asks whether the hook's name appears
 * anywhere in the suites, and it can, because `useCollectionMutations` is a
 * name nothing else spells. Half of these module names are ordinary English:
 * `table`, `card`, `field`, `input`, `label`, `item`, `empty`, `progress`,
 * `switch`, `chart`, `command`, `combobox`. A heading reading "Table" would
 * cover `ui/table.tsx` by accident, and a gate that goes green over a word is worse
 * than no gate. So the match is on the import rather than on the text.
 *
 * A barrel import covers nothing, and that falls out of the same rule rather
 * than being an exception to it. The gate reads a specifier by appending `.tsx`
 * to whatever follows the prefix, so `.../components/form` asks after
 * `form.tsx` and no module is called that. Node resolves that specifier
 * differently, through the literal `./components/form` key in
 * `packages/ui-web/package.json`, which beats the `./components/*` wildcard and
 * lands on `form/index.ts`. Either way it is not a component module: a barrel
 * is a `.ts` file and the extension rule above already has it. A preview
 * section that renders `SelectField` out of the barrel says nothing about which
 * of the twelve field components it drew; importing the module says it exactly.
 *
 * ## The checked-in count
 *
 * `UNCOVERED_MODULES` is how many modules have no preview section, checked in.
 * This fails when the real number differs in either direction. Up means a
 * branch added a component and no preview section with it. Down means a branch
 * wrote one and left the number behind, and that fails too: the falling number
 * is the progress bar, and a number nobody maintains stops being one. Same
 * shape as `UNCHECKED_ACKNOWLEDGEMENTS`, and the same caution. Lowering it is
 * normal. Raising it needs a reason in the commit message.
 *
 * It ships at 75 rather than at zero because that is the backlog: 76 modules
 * have no preview section and one of them can have none. A gate at zero would
 * fail every branch on history and be switched off within a day, which is the
 * same line the duplication threshold and the complexity baseline draw.
 *
 * ## The allowance, which is a different list
 *
 * `NO_PREVIEW` holds the modules that have no preview section anybody could
 * write, each with the reason. It does not shrink and it is not the backlog.
 *
 * An entry that excuses nothing fails, both ways it can happen: naming a module
 * that is not under the roots any more, and naming one `apps/preview` now
 * imports. An unused allowance is headroom the next module lands inside, which
 * is the `fallow` baseline failure `CLAUDE.md` describes (#360).
 *
 * `chart.tsx` was a candidate in #611 and is not on the list. `ChartContainer`
 * renders, `apps/web/src/routes/-habitat-inspection-stats.tsx` draws a real
 * chart with it, and a preview section is a config object and a few rows of
 * data. It is in the backlog.
 *
 * ## The floors
 *
 * #591 and #599, twice, because each guards a different silent pass.
 *
 * `MINIMUM_MODULES` fails when the walk stops finding the component roots. A
 * moved directory or a wrong skip would otherwise leave this counting nothing
 * under a summary line that reads like a pass. 70, against the 94 modules there
 * on 2026-09-08, once #686 added `components/` itself, so the 22 composites can
 * be moved out of `components/form` and `components/page` in one branch without
 * the floor needing an edit first.
 *
 * `MINIMUM_COVERED` fails when the roots are still found and the preview scan
 * stops resolving imports, which is what a change to the `exports` map in
 * `packages/ui-web/package.json` looks like from here. Without it that failure
 * arrives as the count having risen by seventeen, and the message would send a
 * reader looking for a component nobody added. 12, against the 17 previewed on
 * 2026-09-07: five sections can be rewritten or dropped before the floor is the
 * thing in the way. It did not move when `components/` joined the roots,
 * because `apps/preview` imports none of the fourteen modules that root adds.
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pathFrom } from './lib/relative-path.mjs';
import { typeScriptFilesUnder } from './lib/source-files.mjs';
import { count, failure } from './lib/style-gate.mjs';

const GATE = 'check-preview-coverage';
const workspaceRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const fail = failure(GATE);

/** Where a component module lives, and what a specifier is measured against. */
const COMPONENTS_ROOT = join(workspaceRoot, 'packages/ui-web/src/components');

/** The four roots the gallery is for, as paths under `COMPONENTS_ROOT`. */
const GALLERY_ROOTS = ['ui', 'form/field-components', 'form/form-components', 'page'];

/**
 * Every root, `components/` itself first. It is read as its own files and no
 * subdirectory, which is what `assertEveryFolderIsClassified` earns.
 */
const MODULE_ROOTS = ['components/', ...GALLERY_ROOTS];

/**
 * The folders under `components/` that hold screens rather than components.
 *
 * A shell, a sign-in form, a changelog page and an error page are screens, and
 * a preview of one is a screenshot of the app. Nothing else may sit beside
 * them: a folder that is on neither this list nor `GALLERY_ROOTS` fails.
 */
const SCREEN_FOLDERS = ['app-shell', 'auth', 'changelog', 'error-report'];

/** The coverage root. A new preview section lands in `apps/preview/src/routes`. */
const PREVIEW_ROOT = join(workspaceRoot, 'apps/preview/src');

/** The half of a specifier that says the rest of it is a path under `COMPONENTS_ROOT`. */
const SPECIFIER_PREFIX = '@simmer-mosquito/ui-web/components/';

/**
 * A module specifier, in every form that reaches one.
 *
 * `import x from`, `export x from`, a bare `import` for a side effect and a
 * dynamic `import(...)` all end in a quoted specifier, and the two keywords
 * either open one or sit right in front of it. A match inside a comment or a
 * string costs nothing, because only a specifier under `SPECIFIER_PREFIX` is
 * read and anything else is dropped.
 */
const IMPORT = /(?:\bfrom|\bimport)\s*\(?\s*['"]([^'"]+)['"]/g;

/**
 * How many modules have no preview section. Read the docblock before changing
 * it: down is the normal direction and up needs a reason in the commit message.
 */
const UNCOVERED_MODULES = 75;

/**
 * The modules with no preview section anybody could write.
 *
 * Each was read rather than assumed. An entry that excuses nothing fails, so
 * this list cannot outlive what is on it.
 */
const NO_PREVIEW = [
	{
		module: 'ui/direction.tsx',
		reason:
			'DirectionProvider passes a `dir` down through context and renders its children, and useDirection is a hook. There is no visual to put on a page.',
	},
];

/** Below this the walk has stopped finding the component roots. */
const MINIMUM_MODULES = 70;

/** Below this the roots are found and the preview scan has stopped resolving imports. */
const MINIMUM_COVERED = 12;

function main() {
	const modules = readModules();
	if (modules.length < MINIMUM_MODULES) {
		fail(
			`read ${count(modules.length, 'component module')} under ${MODULE_ROOTS.join(', ')}, fewer than the ${MINIMUM_MODULES} this expects. The walk has stopped finding the component roots, so this gate is passing over components nobody is previewing. Fix MODULE_ROOTS in scripts/check-preview-coverage.mjs, or lower MINIMUM_MODULES if that many modules were genuinely deleted.`,
		);
	}

	const previewed = readPreviewed();
	const covered = modules.filter((module) => previewed.has(module));
	if (covered.length < MINIMUM_COVERED) {
		fail(
			`${count(covered.length, 'component module')} of ${modules.length} are imported by apps/preview, fewer than the ${MINIMUM_COVERED} this expects. The modules are being found and the specifiers are not resolving to them, which is a change to the exports map in packages/ui-web/package.json rather than anything about preview sections.`,
		);
	}

	assertAllowanceEarnsItsPlace(modules, previewed);

	const allowed = new Set(NO_PREVIEW.map((entry) => entry.module));
	const uncovered = modules.filter((module) => !allowed.has(module) && !previewed.has(module));
	report(uncovered, modules.length, covered.length);
}

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------

/**
 * Every component module under the roots, as a path under `COMPONENTS_ROOT`
 * with forward slashes, which is the shape a specifier resolves to.
 *
 * `components/` contributes its own files and nothing below them, and the
 * gallery roots are walked. The classification check runs first, because the
 * count it guards is the thing a reader would otherwise trust.
 */
function readModules() {
	assertEveryFolderIsClassified();

	const gallery = GALLERY_ROOTS.flatMap((root) => {
		const directory = join(COMPONENTS_ROOT, root);
		if (!existsSync(directory)) {
			fail(
				`packages/ui-web/src/components/${root} is not there. Fix GALLERY_ROOTS in scripts/check-preview-coverage.mjs to name where the components moved to.`,
			);
		}
		return [...typeScriptFilesUnder(directory)];
	});

	return [...ownFilesOf(COMPONENTS_ROOT), ...gallery].filter(isComponent).map(asModuleId);
}

/** The files directly inside a directory, with its subdirectories left alone. */
const ownFilesOf = (directory) =>
	readdirSync(directory, { withFileTypes: true })
		.filter((entry) => entry.isFile())
		.map((entry) => join(directory, entry.name));

/**
 * That every folder under `components/` is either a gallery root or a screen.
 *
 * `components/` is read one level deep, so a folder nobody classified would
 * hold components this gate never sees, and the summary line would read like a
 * pass. A fifth folder fails here until somebody adds it to `GALLERY_ROOTS` or
 * to `SCREEN_FOLDERS`, which is the decision #686 made for the four that exist.
 */
function assertEveryFolderIsClassified() {
	const classified = new Set([
		...GALLERY_ROOTS.map((root) => root.split('/')[0]),
		...SCREEN_FOLDERS,
	]);

	const folders = readdirSync(COMPONENTS_ROOT, { withFileTypes: true })
		.filter((entry) => entry.isDirectory())
		.map((entry) => entry.name);

	const gone = SCREEN_FOLDERS.filter((folder) => !folders.includes(folder));
	if (gone.length > 0) {
		fail(
			`${gone.map((folder) => `${folder}/`).join(', ')} is on SCREEN_FOLDERS in scripts/check-preview-coverage.mjs and is not under packages/ui-web/src/components any more. An entry that excuses nothing is headroom the next folder lands inside, so take it out or name where the screens moved to.`,
		);
	}

	const unclassified = folders.filter((folder) => !classified.has(folder));
	if (unclassified.length > 0) {
		fail(
			`packages/ui-web/src/components holds ${unclassified.map((name) => `${name}/`).join(', ')}, which is on neither GALLERY_ROOTS nor SCREEN_FOLDERS in scripts/check-preview-coverage.mjs. A folder of components goes on the first and this gate then reads it; a folder of screens goes on the second with the reason. Leaving it off makes the components in it invisible here.`,
		);
	}
}

/**
 * Whether a file is a component module.
 *
 * The extension is the whole rule. A `.ts` file under these roots is a barrel
 * or a helper and has no visual, and the docblock says which four they are.
 */
const isComponent = (file) => file.endsWith('.tsx');

const asModuleId = (file) => pathFrom(COMPONENTS_ROOT, file);

/**
 * Every module `apps/preview` imports, as the same ids `readModules` hands
 * back.
 *
 * A specifier that resolves to no module is dropped rather than reported. A
 * barrel import is one of those, and so is a preview section drawing something
 * from outside the module roots, which is allowed and says nothing about
 * coverage.
 *
 * The walk takes `{ tests: true }`, which is not about tests. `apps/preview`
 * has no `src/tests` today, and the default skip would make a directory of that
 * name invisible here: a section written under it would read as uncovered with
 * nothing on screen saying why. The modules walk keeps the default, because a
 * `tests` directory under `packages/ui-web/src/components` would hold suites
 * and counting one as a component is the opposite mistake.
 */
function readPreviewed() {
	if (!existsSync(PREVIEW_ROOT)) {
		fail(
			`apps/preview/src is not there, so nothing can be previewed. Fix PREVIEW_ROOT in scripts/check-preview-coverage.mjs, or delete this gate along with the app.`,
		);
	}

	return new Set(
		[...typeScriptFilesUnder(PREVIEW_ROOT, [], { tests: true })].flatMap((file) =>
			modulesNamedIn(readFileSync(file, 'utf8')),
		),
	);
}

/** The module ids one file's imports name. */
const modulesNamedIn = (text) =>
	[...text.matchAll(IMPORT)]
		.map(([, specifier]) => specifier)
		.filter((specifier) => specifier.startsWith(SPECIFIER_PREFIX))
		.map((specifier) => `${specifier.slice(SPECIFIER_PREFIX.length)}.tsx`);

// ---------------------------------------------------------------------------
// The allowance
// ---------------------------------------------------------------------------

/**
 * That every entry on `NO_PREVIEW` still excuses a module with no preview
 * section.
 *
 * Both directions, because an entry stops earning its place two ways. The
 * module can leave the roots, which makes the entry a reason for a file nobody
 * can read. And somebody can write the preview section anyway, which makes the
 * reason wrong; the entry then sits under the backlog as headroom the next
 * module lands inside, and nothing says so.
 */
function assertAllowanceEarnsItsPlace(modules, previewed) {
	const present = new Set(modules);

	const problems = NO_PREVIEW.flatMap((entry) => {
		if (!present.has(entry.module)) {
			return `${entry.module} is on NO_PREVIEW and is not one of the ${modules.length} component modules under the module roots. It was deleted, renamed or moved, so take the entry out.`;
		}
		if (previewed.has(entry.module)) {
			return `${entry.module} is on NO_PREVIEW and apps/preview imports it. The reason on the entry says a preview section cannot exist and one does, so take the entry out and lower UNCOVERED_MODULES by nothing, because an allowed module was never in the count.`;
		}
		return [];
	});

	if (problems.length > 0) {
		fail(
			`${problems.length === 1 ? 'an entry on NO_PREVIEW excuses' : `${problems.length} entries on NO_PREVIEW excuse`} nothing.\n\n${problems.map((problem) => `  ${problem}`).join('\n')}`,
		);
	}
}

// ---------------------------------------------------------------------------
// Reporting
// ---------------------------------------------------------------------------

function report(uncovered, moduleCount, coveredCount) {
	if (uncovered.length !== UNCOVERED_MODULES) {
		console.error(
			uncovered.length > UNCOVERED_MODULES
				? `${GATE}: UNCOVERED_MODULES says ${UNCOVERED_MODULES}, but ${uncovered.length} component modules have no preview section. A component was added and no preview section with it. Write one in apps/preview/src/routes and import the module by its own path, or raise the number and say why in the commit message.\n`
				: `${GATE}: UNCOVERED_MODULES says ${UNCOVERED_MODULES}, but only ${uncovered.length} component modules have no preview section. Lower it to ${uncovered.length}.\n`,
		);
		for (const module of uncovered) {
			console.error(`  packages/ui-web/src/components/${module}`);
		}
		console.error(
			`\nA preview section imports the module by its own path, ${SPECIFIER_PREFIX}<the path above without .tsx>. Importing a barrel covers nothing, because a barrel does not say which component was drawn.`,
		);
		process.exit(1);
	}

	console.log(
		`${GATE}: ${count(moduleCount, 'component module')} under ${MODULE_ROOTS.length} roots, ${coveredCount} previewed, ${uncovered.length} uncovered at the checked-in number, ${count(NO_PREVIEW.length, 'module')} on NO_PREVIEW.`,
	);
}

main();
