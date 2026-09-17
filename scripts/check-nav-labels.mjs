#!/usr/bin/env node
/**
 * Requires every sidebar entry that lands on a write surface to build its label
 * through the record-noun register.
 *
 * Run it with `pnpm check:nav-labels`.
 *
 * ## Why the sidebar and not the app
 *
 * `check:record-nouns` already refuses a register form written out again, and
 * it cannot reach these. Its `NOUN_KEYS` is an allowlist of five keys and
 * `label` is not one of them, for a reason that gate's header measures: widening
 * to `label` reported 73 findings, nearly all a field label naming a *linked*
 * record, as in a Details row reading `Habitat` above a link. A label naming
 * another record is not that register's business.
 *
 * A sidebar entry is the case the allowlist excludes and should not. It names
 * the surface it moves you to rather than a record beside it, and it is read on
 * its own, in the command palette or on a narrow rail with no group heading
 * beside it. #910 is what that costs: four entries leaned on the heading above
 * them and each named nothing in particular once separated from it, and `Record
 * Application` was landing on a page headed `Record Chemical Application`.
 *
 * So the key does not settle it and the destination does. An entry whose `to`
 * lands on a write surface is a form, an importer, a merge or a cleanup tool,
 * and every one of those is a page about one record type. Everything else in
 * the sidebar is a map, a table, a catalog or an overview, and those name a
 * surface rather than a record; they are #965's question and not this one.
 *
 * ## What it reads, and what a label reaching the register means
 *
 * `webShellDomains` in `apps/web/src/components/app-shell/navigation.ts`, as an
 * AST rather than as text. An entry is any object literal carrying a string
 * `to` and a `label`, which is 78 of them today, and 19 land on a write
 * surface. The verbs come from `scripts/lib/write-verbs.mjs`, the same list
 * `check:write-surfaces` classifies routes with, so the two gates cannot
 * disagree about what a write surface is.
 *
 * A label reaches the register when its expression calls `recordNoun`, or calls
 * a function in this module that does. Both, because the module wraps the
 * accessor twice: `createLabel` puts the record type's verb in front of
 * `title`, read from `CREATE_VERBS` beside it since #949, and
 * `createPluralLabel` puts the call site's own verb in front of `titleMany`,
 * because `Import` and `Cleanup` are not create verbs and no register carries
 * them.
 *
 * **Reaching the register is the rule, not being a call.** A helper that spells
 * a noun itself is a second spelling wearing a function's clothes, and it is
 * the shape a gate reading "the label is not a string literal" would pass. A
 * template literal is refused for the same reason, unless a `recordNoun` call
 * is inside it.
 *
 * What this cannot see is a label assembled at runtime or reached through a
 * variable, which is `check:image-names`' seam for a computed `role`. Nothing
 * in the sidebar is written that way and a label that were would be reported,
 * since it reaches no register call either.
 *
 * ## The explorer headers, since #949
 *
 * The sidebar is not the only place a create surface is named. Each paged
 * explorer draws a create control in its header, `create: { to, label }` on
 * `ExplorerHeader`, and #958's first-run empty state points at that control by
 * reading the same `label`. All thirteen were literals, agreeing with the
 * sidebar by copy: `Create Inspection` in the sidebar over a header reading
 * `Record Inspection`, `Add Station` in a header over a page titled `Add
 * Weather Station` (#949). They read `createLabel` now, and this gate reads
 * them, so a header that writes its own label fails the branch that writes it.
 *
 * The corpus is `apps/web/src/routes/**\/index.tsx`, the explorer routes, and
 * the shape is the same object literal with a string `to` and a `label`. The
 * one thing a route cannot do that the sidebar can is declare the helper: it
 * imports it. So a name imported from the navigation module is a reader when
 * it is one there, and only then, which is what keeps a `spell` imported from
 * anywhere a finding. Not the whole app, because a detail page's own menu is
 * the other create wording, `Record collection` under a trap's heading, and
 * that is #949's named follow-up rather than this gate's. Not JSX text either:
 * the Missions and Assignments indexes draw their control as a `<Link>` whose
 * text calls `createLabel`, and a call inside JSX is `check:image-names`' seam
 * again, unreadable by an object-literal rule and left to the reader.
 *
 * ## At zero, and what it cost to get there
 *
 * No allowance list and no marker vocabulary, because an entry wanting an
 * exemption is an entry wanting its own spelling of a record type.
 *
 * Seventeen of the nineteen already read the register: sixteen through
 * `createLabel` from #910, and `Import Regions` through `createPluralLabel`
 * once #947 put the title-cased plural in the register. The other two were the
 * two cleanup tools, both labelled `Cleanup Tools` and so carrying one name for
 * two different surfaces, which is #910's finding again on the pair nobody had
 * counted: the brief for this gate said sixteen entries and a seventeenth, and
 * the seventeenth it meant was the import. Both now read `createPluralLabel`.
 *
 * ## The floors and the probes
 *
 * Two floors, #591's rule. `MINIMUM_ENTRIES` against a parse that has stopped
 * finding navigation items, which would leave nothing to select from and print
 * the same clean summary line. `MINIMUM_SELECTED` against a parse that finds
 * the entries and reads no `to` out of them, which looks exactly the same. The
 * floor under the verb list is not here: `scripts/lib/write-verbs.mjs` throws on
 * import when the list is short, so every reader gets that refusal rather than
 * each writing its own, and this gate's summary line counts the verbs it
 * classified with so a reader can see the list was read.
 *
 * `MINIMUM_HEADER_CONTROLS` is the third floor, for the same reason over the
 * second corpus: a walk that has stopped finding the explorer routes selects
 * nothing and prints a clean line. There were 13 on 2026-09-15.
 *
 * `PROBES` is the fourth guard and cannot be a floor. The gate is at zero, so no
 * count over the sidebar can say whether the detector still reads a label
 * wrong: a rule that answered "reaches the register" to everything would print
 * the same clean line. Eight sources with known answers go through the same
 * reading the file does, four holding a finding and four holding none. The
 * noes are a helper call, a direct accessor call, an entry off a write surface
 * and a call to a helper imported from the navigation module; the yeses are a
 * literal, a template literal, a call to a helper that spells the noun itself,
 * which is the one a "not a string literal" rule would pass, and a call to an
 * imported name the navigation module does not read the register through.
 */

import { readFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseSync } from '@babel/core';
import { pathFrom } from './lib/relative-path.mjs';
import { typeScriptFilesUnder } from './lib/source-files.mjs';
import { count, failure } from './lib/style-gate.mjs';
import { isWriteSurfacePath, WRITE_VERBS } from './lib/write-verbs.mjs';

const GATE = 'check-nav-labels';
const workspaceRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const fail = failure(GATE);

const NAVIGATION = join(workspaceRoot, 'apps/web/src/components/app-shell/navigation.ts');
const REGISTER = join(workspaceRoot, 'apps/web/src/lib/record-nouns.ts');
const ROUTES = join(workspaceRoot, 'apps/web/src/routes');

/** The one accessor `RECORD_NOUNS` is reached through. */
const REGISTER_ACCESSOR = 'recordNoun';

/** How a route names the navigation module, however many `../` are in front. */
const NAVIGATION_SPECIFIER = /\/components\/app-shell\/navigation$/;

/**
 * How few navigation entries means the parse has stopped finding them rather
 * than the sidebar having shrunk. There were 78 on 2026-09-14.
 */
const MINIMUM_ENTRIES = 60;

/**
 * How few of those land on a write surface. There were 19 on the same day, and
 * a parse reading no `to` out of an entry selects none while finding every one.
 */
const MINIMUM_SELECTED = 15;

/**
 * How few explorer header controls means the walk has stopped finding the
 * explorer routes. There were 13 on 2026-09-15.
 */
const MINIMUM_HEADER_CONTROLS = 10;

/** Eight sources with known answers, run through the same reading the file gets. */
const PROBES = [
	{
		name: 'probe-helper.ts',
		source: [
			'function createLabel(verb, type) {',
			"\treturn verb + ' ' + recordNoun(type).title;",
			'}',
			"const nav = [{ label: createLabel('Create', 'habitat'), to: '/larval/habitats/create' }];",
		].join('\n'),
		finds: 0,
	},
	{
		name: 'probe-accessor.ts',
		source: "const nav = [{ label: recordNoun('region').titleMany, to: '/gis/regions/import' }];",
		finds: 0,
	},
	{
		name: 'probe-read-surface.ts',
		source: "const nav = [{ label: 'Statistics', to: '/gis/weather/stats' }];",
		finds: 0,
	},
	{
		name: 'probe-literal.ts',
		source: "const nav = [{ label: 'Cleanup Tools', to: '/gis/addresses/cleanup' }];",
		finds: 1,
	},
	{
		name: 'probe-template.ts',
		source: "const nav = [{ label: `Create Habitat`, to: '/larval/habitats/create' }];",
		finds: 1,
	},
	{
		name: 'probe-spelling-helper.ts',
		source: [
			'function spell(type) {',
			"\treturn type === 'habitat' ? 'Habitat' : 'Trap';",
			'}',
			"const nav = [{ label: spell('habitat'), to: '/larval/habitats/create' }];",
		].join('\n'),
		finds: 1,
	},
	{
		name: 'probe-imported-helper.tsx',
		source: [
			"import { createLabel } from '../../components/app-shell/navigation';",
			"const page = { create: { label: createLabel('habitat'), to: '/larval/habitats/create' } };",
		].join('\n'),
		imported: ['createLabel'],
		finds: 0,
	},
	{
		name: 'probe-imported-spelling.tsx',
		source: [
			"import { spell } from '../../components/app-shell/navigation';",
			"const page = { create: { label: spell('habitat'), to: '/larval/habitats/create' } };",
		].join('\n'),
		imported: ['createLabel'],
		finds: 1,
	},
];

function main() {
	assertAccessorExists();
	runProbes();

	const navigation = parse(short(NAVIGATION), readFileSync(NAVIGATION, 'utf8'));
	const readers = registerReaders(navigation);
	const entries = entriesIn(navigation, readers, NAVIGATION);

	if (entries.length < MINIMUM_ENTRIES) {
		fail(
			`read ${entryCount(entries.length)} out of ${short(NAVIGATION)}, fewer than the ${MINIMUM_ENTRIES} this expects. The parse has stopped finding them, so there is nothing left to select from.`,
		);
	}

	const selected = entries.filter((entry) => isWriteSurfacePath(entry.to));
	if (selected.length < MINIMUM_SELECTED) {
		fail(
			`selected ${count(selected.length, 'write surface')} out of ${entryCount(entries.length)}, fewer than the ${MINIMUM_SELECTED} this expects. The parse is finding entries and reading no destination out of them.`,
		);
	}

	const controls = headerControls(readers);
	if (controls.length < MINIMUM_HEADER_CONTROLS) {
		fail(
			`read ${count(controls.length, 'header create control')} under ${short(ROUTES)}, fewer than the ${MINIMUM_HEADER_CONTROLS} this expects. The walk has stopped finding the explorer routes, so a header spelling its own label would pass.`,
		);
	}

	report(
		[...selected, ...controls].filter((entry) => !entry.readsRegister),
		selected.length,
		entries.length,
		controls.length,
	);
}

/**
 * Every explorer header's create control: an entry landing on a write surface
 * in an `index.tsx` under the route tree, read with the navigation module's
 * readers standing in for what the route imports from it.
 */
function headerControls(readers) {
	const controls = [];
	for (const path of typeScriptFilesUnder(ROUTES)) {
		if (basename(path) !== 'index.tsx') {
			continue;
		}
		const program = parse(short(path), readFileSync(path, 'utf8'));
		controls.push(
			...entriesIn(program, readers, path).filter((entry) => isWriteSurfacePath(entry.to)),
		);
	}
	return controls;
}

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------

/**
 * One module as an AST.
 *
 * A module that does not parse is a refusal rather than an empty answer,
 * because an empty answer here is the silent pass the gate exists to remove.
 */
function parse(name, source) {
	try {
		return parseSync(source, {
			babelrc: false,
			configFile: false,
			filename: name,
			sourceType: 'module',
			parserOpts: { plugins: ['typescript', 'jsx'] },
		}).program;
	} catch (error) {
		return fail(`${name} did not parse, so no label in it can be read: ${error.message}`);
	}
}

/**
 * Every navigation entry in one module, with whether its label reaches the
 * register.
 *
 * An entry is an object literal carrying a string `to` and a `label`, which is
 * the shape a `ShellNavItem` and an `ExplorerCreateAction` have and nothing
 * else in either file does. A destination written as anything but a literal is
 * not an entry here, and nothing writes one that way.
 *
 * The readers are the module's own, plus whichever of `navigationReaders` it
 * imports from the navigation module under that name. A route reaches the
 * register through an import, and the import is a reader only when the name is
 * one where it was declared.
 */
function entriesIn(program, navigationReaders, file) {
	const readers = new Set([
		...registerReaders(program),
		...importedReaders(program, navigationReaders),
	]);
	return nodesIn(program)
		.filter((node) => node.type === 'ObjectExpression')
		.flatMap((node) => {
			const properties = propertiesOf(node);
			const to = properties.get('to');
			const label = properties.get('label');
			if (label === undefined || to?.type !== 'StringLiteral') {
				return [];
			}
			return [
				{
					file,
					to: to.value,
					line: label.loc.start.line,
					text: labelText(label),
					readsRegister: reachesRegister(label, readers),
				},
			];
		});
}

/**
 * The local names a module binds to the navigation module's readers.
 *
 * Read off the import specifiers rather than off the names alone, so a
 * `createLabel` imported from anywhere else, or a `spell` imported from the
 * navigation module, is not a reader. An alias is followed to its local name,
 * since that is the name a call site writes.
 */
function importedReaders(program, navigationReaders) {
	return program.body
		.filter(
			(statement) =>
				statement.type === 'ImportDeclaration' && NAVIGATION_SPECIFIER.test(statement.source.value),
		)
		.flatMap((statement) => statement.specifiers)
		.filter(
			(specifier) =>
				specifier.type === 'ImportSpecifier' &&
				specifier.imported.type === 'Identifier' &&
				navigationReaders.has(specifier.imported.name),
		)
		.map((specifier) => specifier.local.name);
}

/** The named properties of an object literal, by key. */
function propertiesOf(node) {
	return new Map(
		node.properties.flatMap((property) =>
			property.type === 'ObjectProperty' && property.key.type === 'Identifier'
				? [[property.key.name, property.value]]
				: [],
		),
	);
}

/**
 * The functions in this module that read the register.
 *
 * Read rather than named, so a third wrapper beside `createLabel` and
 * `createPluralLabel` joins by calling the accessor and by nothing else. A
 * helper that spells a noun itself is absent from this set, which is what makes
 * it a finding rather than a pass.
 */
function registerReaders(program) {
	const declared = program.body.flatMap(declarationsIn);
	return new Set(declared.filter(([, node]) => callsAccessor(node)).map(([name]) => name));
}

/** The named declarations one top-level statement makes, exported or not. */
function declarationsIn(statement) {
	const declaration = declaredBy(statement);
	if (declaration.type === 'VariableDeclaration') {
		return declaration.declarations.flatMap(boundValue);
	}
	return declaration.type === 'FunctionDeclaration' ? namedFunction(declaration) : [];
}

/** What a statement declares, unwrapped from the `export` in front of it. */
const declaredBy = (statement) =>
	statement.type === 'ExportNamedDeclaration' && statement.declaration !== null
		? statement.declaration
		: statement;

/** A function declaration under its name, which an anonymous default export has not got. */
const namedFunction = (declaration) =>
	declaration.id === null ? [] : [[declaration.id.name, declaration]];

/** One `const name = <expression>` binding, when it names an expression. */
const boundValue = (declarator) =>
	declarator.id.type === 'Identifier' && declarator.init !== null
		? [[declarator.id.name, declarator.init]]
		: [];

/** Whether a subtree calls the register's accessor. */
const callsAccessor = (node) =>
	nodesIn(node).some(
		(each) =>
			each.type === 'CallExpression' &&
			each.callee.type === 'Identifier' &&
			each.callee.name === REGISTER_ACCESSOR,
	);

/** Whether a label expression reaches the register, directly or through a wrapper. */
const reachesRegister = (label, readers) =>
	callsAccessor(label) ||
	nodesIn(label).some(
		(each) =>
			each.type === 'CallExpression' &&
			each.callee.type === 'Identifier' &&
			readers.has(each.callee.name),
	);

/** How a label reads in a message: its own text when it has one, its shape otherwise. */
function labelText(label) {
	if (label.type === 'StringLiteral') {
		return `the literal '${label.value}'`;
	}
	return label.type === 'TemplateLiteral' ? 'a template literal' : 'an expression';
}

/** The keys a walk never enters: a position, and the comments around a node. */
const UNWALKED_KEYS = new Set(['loc', 'leadingComments', 'trailingComments']);

/** Every node of a subtree, the parent first. */
function nodesIn(value) {
	const below = childrenOf(value).flatMap(nodesIn);
	return typeof value?.type === 'string' ? [value, ...below] : below;
}

/**
 * The values a walk descends into: an array's items, or an object's own
 * properties less the unwalked keys. A primitive has none.
 */
const childrenOf = (value) =>
	value === null || typeof value !== 'object'
		? []
		: Object.entries(value)
				.filter(([key]) => !UNWALKED_KEYS.has(key))
				.map(([, each]) => each);

// ---------------------------------------------------------------------------
// The guards
// ---------------------------------------------------------------------------

/**
 * That the register still publishes the accessor this gate looks for.
 *
 * A rename would report every entry at once rather than passing silently, which
 * is the right way round, but the message would send a reader to nineteen
 * sidebar entries when one export moved.
 */
function assertAccessorExists() {
	const source = readFileSync(REGISTER, 'utf8');
	if (!new RegExp(`export function ${REGISTER_ACCESSOR}\\b`).test(source)) {
		fail(
			`${short(REGISTER)} no longer exports ${REGISTER_ACCESSOR}, which is the call this gate reads a label through. Point REGISTER_ACCESSOR at whatever the register is reached by now.`,
		);
	}
}

/** That the reading still tells a compliant label from a second spelling. */
function runProbes() {
	for (const probe of PROBES) {
		const found = entriesIn(
			parse(probe.name, probe.source),
			new Set(probe.imported ?? []),
			probe.name,
		)
			.filter((entry) => isWriteSurfacePath(entry.to))
			.filter((entry) => !entry.readsRegister).length;
		if (found !== probe.finds) {
			fail(
				`${probe.name} should read as ${count(probe.finds, 'finding')} and read as ${found}. The label rule is broken, so a clean run over the sidebar would say nothing about it.`,
			);
		}
	}
}

// ---------------------------------------------------------------------------
// Reporting
// ---------------------------------------------------------------------------

const short = (path) => pathFrom(workspaceRoot, path);

/** A count of entries, which `count` cannot spell: English pluralizes it irregularly. */
const entryCount = (total) => `${total} ${total === 1 ? 'entry' : 'entries'}`;

function report(findings, selected, entries, controls) {
	if (findings.length === 0) {
		console.log(
			`${GATE}: ${entryCount(selected)} of ${entries} land on a write surface, named with one of the ${WRITE_VERBS.length} write verbs, ${count(controls, 'explorer header control')} land on one too, and every one builds its label through the register.`,
		);
		return;
	}

	console.error(
		`${GATE}: ${entryCount(findings.length)} spelling a record type rather than reading it.\n`,
	);
	for (const finding of findings) {
		console.error(
			`  ${short(finding.file)}:${finding.line} '${finding.to}' writes its label as ${finding.text}. That entry lands on a write surface, so its label names one record type, and the name comes from RECORD_NOUNS: build it with createLabel for the singular or createPluralLabel for the plural, so the sidebar and the explorer headers cannot spell a record type a second way.`,
		);
	}
	console.error(`\nThe register is ${short(REGISTER)}.`);
	process.exit(1);
}

main();
