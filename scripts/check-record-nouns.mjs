#!/usr/bin/env node
/**
 * Holds what `apps/web` calls each record type to one register.
 *
 * `RECORD_NOUNS` in `apps/web/src/lib/record-nouns.ts` says what a record type
 * is called in the four shapes a screen asks for, keyed by the camelCase
 * domain vocabulary. Six components used to take a free-text noun instead and
 * every route spelled it at each call site, so one record type carried as many
 * spellings as it had call sites and seven of them disagreed with themselves: a
 * chemical application was an `application` in its result count and a `chemical
 * application` in its heading, a biocontrol action counted `releases`, an
 * outreach action counted `actions`, a weather station counted `stations`, and
 * a request for control and a service request both counted plain `requests`,
 * which is one word for two records on two surfaces a person moves between
 * (#894).
 *
 * Run it with `pnpm check:record-nouns`.
 *
 * ## What the compiler already holds, and what is left here
 *
 * Membership is the compiler's. The register is a `Record<RecordType, ...>`
 * over the domain's own `CommentTargetType` plus three widenings, and each of
 * the six components takes a `recordType` typed to that union, so a missing,
 * doubled or misspelled record type fails `tsc`. That is #644's shape and it
 * leaves this gate one question: is the noun written out again anywhere else.
 *
 * ## Three rules
 *
 * The register is whole: every entry carries all four forms, none empty, each
 * plural differs from the singular it pairs with, and **no two record types
 * share a form**.
 * That last one is the collision the sweep found rather than a tidiness rule:
 * `request` was the count noun for both a service request and a request for
 * control, and a person moving between those two surfaces read the same word
 * for two different records.
 *
 * Each of `NOUN_COMPONENTS` exists, declares the register-driven prop it is
 * listed with, and is passed no `noun` attribute at any call site. A component
 * on the list that no longer exists fails, so the list cannot go stale past a
 * rename.
 *
 * No `.tsx` under `apps/web/src` writes a register form as a noun literal.
 *
 * ## What a noun literal is, and what it deliberately is not
 *
 * A string literal whose **whole** text is exactly one of the register's forms,
 * given under one of `NOUN_KEYS`. Both halves are the rule, and both are
 * narrower than they could be for reasons measured rather than assumed.
 *
 * Whole and exact, because a register form inside a longer sentence is
 * English. "No batches have been linked to this application" names the record
 * inside a page whose heading has already named it, and #894's own triage says
 * those read as prose and are not a second name. Case-sensitive because the
 * register now carries both cases of the plural and they are two different
 * answers: `traps` is the count noun in "3 traps" and `Traps` is the heading
 * over the list, so folding the case would report one where the other is right
 * and say nothing about which.
 *
 * `NOUN_KEYS` is an allowlist of five rather than a denylist, because the
 * denylist was measured first and does not work. A register form is an ordinary
 * discriminator all over this app: `recordType="region"`, `kind: 'habitat'`,
 * `entity_type: 'habitat'`, `route_type: 'habitat'`. Scanning every copy
 * position reports 430 of those. Widening the keys to `label` and `title`
 * reports 73 more, nearly all of them a field label naming a linked record, as
 * in a Details row reading `Habitat` above a link. A label naming another
 * record is not this register's business; the surface's own noun is. `title`
 * stays out for that reason and `titleMany` is in, which is not an
 * inconsistency: a label above a link names a *linked* record in the singular,
 * and a plural title is a heading over a list of the surface's own.
 *
 * So what is left is the five keys the components' contracts are written in,
 * which is exactly the shape the sweep deleted, and the gate is at zero with no
 * allowance list and no marker vocabulary. A call site wanting an exemption is
 * a call site wanting its own spelling.
 *
 * The tests trees are out, which is `check:vocabulary`'s answer rather than
 * `check:map-palette`'s. `ResultMeta` takes a `CountNoun` pair, because a
 * surface may count something that is not a record, and the suite covering it
 * has to build one; a gate reading the suites would refuse the test that proves
 * the component works.
 *
 * `apps/admin` and `apps/mobile` are out, which is #894's own scope line: the
 * register is a web module until a second app needs it. Admin writes `title:
 * 'Contact'` and `label: 'Address'` about its own foundations screens, and
 * those are its copy rather than this register's.
 *
 * ## The floors, and the guard that is not one
 *
 * #591's rule twice. `MINIMUM_RECORD_TYPES` against a parse that has stopped
 * reading the register, which would leave nothing to look for and pass every
 * copy under the same summary line a clean run prints. `MINIMUM_FILES` against
 * a walk that has stopped finding the app.
 *
 * `PROBES` is the third guard and cannot be a floor. This gate is at zero, so
 * no count over the tree can say whether the detector still reads a noun: a
 * `NOUN_KEYS` that matched nothing at all would print the same clean line.
 * Seven sources with known answers go through the same scan the files do, four
 * holding a finding and three holding none, and the three noes are the shapes a
 * rule one notch wider reads wrong: a discriminator, a longer sentence, and a
 * plural heading, which is the one that stays a no now that the register
 * carries the plural title under its own key.
 */

import { readFileSync } from 'node:fs';
import { dirname, join, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { copyStrings } from './lib/copy-strings.mjs';
import { pathFrom } from './lib/relative-path.mjs';
import { typeScriptFilesUnder } from './lib/source-files.mjs';
import { lineOf } from './lib/source-position.mjs';
import { count, failure, trim } from './lib/style-gate.mjs';

const GATE = 'check-record-nouns';
const workspaceRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const fail = failure(GATE);

const WEB_ROOT = join(workspaceRoot, 'apps', 'web', 'src');
const REGISTER = join(WEB_ROOT, 'lib', 'record-nouns.ts');

/** The four shapes the register carries for every record type. */
const FORM_NAMES = ['one', 'many', 'title', 'titleMany'];

/**
 * The two forms that are a plural, each against the singular it pairs with.
 *
 * Read rather than written out a second time, so a form added to `FORM_NAMES`
 * with a plural beside it joins the "the two differ" rule by being named here
 * and nowhere else.
 */
const PLURAL_OF = { many: 'one', titleMany: 'title' };

/** One entry of `RECORD_NOUNS`, read off the source of the register. */
const REGISTER_ENTRY = /\n\t([A-Za-z]+): \{([^}]*)\}/g;

/** One form inside an entry. */
const ENTRY_FORM = /\b(one|many|title|titleMany): '([^']*)'/g;

/**
 * The keys under which a string is a record's own noun rather than anything
 * else. The gate's header carries why this is five names and not a denylist.
 */
const NOUN_KEYS = new Set(['noun', 'one', 'many', 'titleMany', 'unavailableTitle']);

/**
 * The components whose copy comes from the register, and the prop each takes
 * instead of a noun.
 *
 * `ExplorerHeader` takes `counts` rather than `recordType` because a surface
 * may count something that is not a record: the daily-work map counts entries,
 * which span four record types and are none of them. Its prop takes a record
 * type or a pair, and the pair is what keeps that one surface honest without a
 * free-text noun on the five components that name a record.
 */
const NOUN_COMPONENTS = [
	{
		name: 'RecordUnavailable',
		module: 'components/record/record-unavailable.tsx',
		prop: 'recordType',
	},
	{
		name: 'RecordDetailPage',
		module: 'components/record/record-detail-page.tsx',
		prop: 'recordType',
	},
	{
		name: 'RecordEditFrame',
		module: 'components/record/record-edit-frame.tsx',
		prop: 'recordType',
	},
	{
		name: 'RecordRegionsBand',
		module: 'components/map/record-regions-band.tsx',
		prop: 'recordType',
	},
	{ name: 'DangerZoneCard', module: 'components/danger-zone-card.tsx', prop: 'recordType' },
	{ name: 'ExplorerHeader', module: 'components/explorer/explorer-header.tsx', prop: 'counts' },
];

/**
 * The floors, both #591's.
 *
 * 15 record types against a parse that has stopped reading the register, under
 * the 20 it carries today. 250 modules against a walk that has stopped finding
 * the app, under the 318 `.tsx` outside its tests tree. Neither is a ratchet:
 * this gate is at zero, so the numbers move only when a screen or a record type
 * is added, and raising them buys nothing.
 */
const MINIMUM_RECORD_TYPES = 15;
const MINIMUM_FILES = 250;

/**
 * Seven sources with known answers, handed to the same scan the app goes
 * through.
 *
 * The three that hold nothing are the shapes a wider rule reads wrong: a
 * discriminator under a key that is not copy, a register form inside a longer
 * sentence, and a plural heading in the case an explorer writes it, which is
 * the same string as the `titleMany` probe above it under a key that is not
 * this register's.
 */
const PROBES = [
	{ source: 'const a = <Thing noun="habitat" />;', finds: 'habitat' },
	{
		source: "const a = { one: 'service request', many: 'service requests' };",
		finds: 'service request',
	},
	{
		source: 'const a = <Thing unavailableTitle="Request for Control" />;',
		finds: 'Request for Control',
	},
	{ source: "const a = { titleMany: 'Traps' };", finds: 'Traps' },
	{ source: 'const a = <Thing recordType="habitat" kind="trap" />;', finds: null },
	{ source: 'const a = <p>No batches have been linked to this application.</p>;', finds: null },
	{ source: 'const a = <h1 title="Traps">Traps</h1>;', finds: null },
];

function main() {
	const register = readRegister();
	const forms = new Set(register.flatMap((entry) => FORM_NAMES.map((name) => entry.forms[name])));
	const problems = [...registerProblems(register), ...componentProblems()];

	const files = [...typeScriptFilesUnder(WEB_ROOT)].filter((file) => file.endsWith('.tsx'));
	if (files.length < MINIMUM_FILES) {
		fail(
			`found ${count(files.length, '.tsx module')} under apps/web/src, fewer than the ${MINIMUM_FILES} this expects. The walk has stopped finding the app, so a noun written outside the register now passes this. Fix the walk in scripts/check-record-nouns.mjs, or lower MINIMUM_FILES if that many modules were genuinely deleted.`,
		);
	}

	const findings = files
		.filter((file) => file !== REGISTER)
		.flatMap((file) =>
			nounLiteralsIn(file, readFileSync(file, 'utf8').replaceAll('\r\n', '\n'), forms),
		);

	if (problems.length > 0 || findings.length > 0) {
		report(problems, findings);
		return;
	}

	checkProbes(forms);

	console.log(
		`Record nouns: ${count(register.length, 'record type')} in the register, ${NOUN_COMPONENTS.length} components reading it, no noun written again across ${files.length} modules.`,
	);
}

/** `RECORD_NOUNS` as `[{ recordType, forms }]`, read off the register's source. */
function readRegister() {
	const source = readFileSync(REGISTER, 'utf8').replaceAll('\r\n', '\n');
	const body = source.slice(source.indexOf('const RECORD_NOUNS'));
	const entries = [...body.matchAll(REGISTER_ENTRY)].map((match) => ({
		recordType: match[1],
		forms: Object.fromEntries([...match[2].matchAll(ENTRY_FORM)].map((form) => [form[1], form[2]])),
	}));

	if (entries.length < MINIMUM_RECORD_TYPES) {
		fail(
			`read ${count(entries.length, 'record type')} out of ${pathFrom(workspaceRoot, REGISTER)}, fewer than the ${MINIMUM_RECORD_TYPES} this expects. The parse has stopped reading the register, so there is nothing left to look for and every copy of a noun passes. Fix REGISTER_ENTRY in scripts/check-record-nouns.mjs, or lower MINIMUM_RECORD_TYPES if that many record types were genuinely deleted.`,
		);
	}
	return entries;
}

/** What is wrong with the register itself, as sentences. */
function* registerProblems(register) {
	const seen = new Map();
	for (const entry of register) {
		yield* entryProblems(entry);
		yield* collisionProblems(entry, seen);
	}
}

/** What is wrong with one entry on its own: a missing form, or no plural in it. */
function* entryProblems({ recordType, forms }) {
	const missing = FORM_NAMES.filter((name) => (forms[name] ?? '') === '');
	if (missing.length > 0) {
		yield `${recordType} has no ${missing.join(' and no ')}. Every record type carries all ${FORM_NAMES.length} forms, because a component asking for one it has not got renders "undefined" on a heading.`;
		return;
	}
	for (const [plural, singular] of Object.entries(PLURAL_OF)) {
		if (forms[singular] === forms[plural]) {
			yield `${recordType} spells its ${singular} and its ${plural} the same way, "${forms[singular]}". A heading over a list then names one record where it means several.`;
		}
	}
}

/**
 * A form this entry shares with one already read, recording each as it goes.
 *
 * The collision is the finding rather than a tidiness rule: `request` was the
 * count noun for both a service request and a request for control, and a person
 * moving between those two surfaces read one word for two records.
 */
function* collisionProblems({ recordType, forms }, seen) {
	for (const name of FORM_NAMES) {
		const first = seen.get(forms[name]);
		if (first !== undefined && first !== recordType) {
			yield `${recordType} and ${first} both say "${forms[name]}". One word for two records is what #894 found in the count nouns, where a service request and a request for control both counted "requests", and a person moving between the two surfaces cannot tell them apart.`;
		}
		seen.set(forms[name], recordType);
	}
}

/** What is wrong with the six components, as sentences. */
function* componentProblems() {
	for (const component of NOUN_COMPONENTS) {
		yield* listedComponentProblems(component);
	}
	for (const file of [...typeScriptFilesUnder(WEB_ROOT)].filter((file) => file.endsWith('.tsx'))) {
		yield* nounPropsAt(file, readSource(file) ?? '');
	}
}

/** Whether one listed component is still there and still declares its prop. */
function* listedComponentProblems(component) {
	const source = readSource(join(WEB_ROOT, ...component.module.split('/')));
	if (source === null) {
		yield `${component.name} is listed here as reading the register and ${component.module} does not exist. Point NOUN_COMPONENTS at where it moved, or drop the entry if the component is gone.`;
		return;
	}
	if (!source.includes(component.prop)) {
		yield `${component.module} no longer declares a ${component.prop} prop, so nothing says where its copy comes from. A component naming a record takes the register's key and looks the noun up.`;
	}
}

/** A `noun` attribute passed to one of the six, which is the prop the register replaced. */
function* nounPropsAt(file, source) {
	const names = NOUN_COMPONENTS.map((component) => component.name).join('|');
	const element = new RegExp(`<(${names})\\b[^>]*?\\bnoun\\s*=`, 'gs');

	for (const match of source.matchAll(element)) {
		yield `${pathFrom(workspaceRoot, file)}:${lineOf(source, match.index)} passes a noun to <${match[1]}>. That prop is the register's now: pass the record type and the component looks the noun up.`;
	}
}

/** Every register form written as a noun literal in one file. */
function nounLiteralsIn(file, source, forms) {
	return copyStrings(source)
		.filter((literal) => forms.has(literal.text) && NOUN_KEYS.has(keyBefore(source, literal.index)))
		.map((literal) => ({
			at: `${pathFrom(workspaceRoot, file)}:${lineOf(source, literal.index)}`,
			line: trim(
				source
					.slice(source.lastIndexOf('\n', literal.index) + 1)
					.split('\n')[0]
					.trim(),
			),
			text: literal.text,
		}));
}

/**
 * The attribute or property name a literal was given under, or `-`.
 *
 * Read off the raw source rather than the masked copy, because masking blanks a
 * string body and the name in front of it is code either way.
 */
function keyBefore(source, index) {
	const before = source.slice(Math.max(0, index - 60), index);
	return before.match(/([A-Za-z][\w-]*)\s*[=:]\s*['"`]?$/)?.[1] ?? '-';
}

/** Refuse a run whose scan reads any of the six known-answer sources wrong. */
function checkProbes(forms) {
	const wrong = PROBES.filter((probe) => {
		const found = nounLiteralsIn('probe.tsx', probe.source, forms);
		return probe.finds === null ? found.length > 0 : found[0]?.text !== probe.finds;
	});

	if (wrong.length > 0) {
		fail(
			`the scan read ${count(wrong.length, 'probe')} wrong, so this run's clean zero is the detector failing rather than the app being consistent. No count over the tree can catch that, because this gate is at zero. The first is: ${wrong[0].source}`,
		);
	}
}

function report(problems, findings) {
	console.error(`${GATE}: ${count(problems.length + findings.length, 'problem')}.\n`);
	for (const problem of problems) {
		console.error(`  ${problem}\n`);
	}
	for (const finding of findings) {
		console.error(
			`  ${finding.at}\n    ${finding.line}\n    "${finding.text}" is the register's word for a record type. Read it out of ${pathFrom(workspaceRoot, REGISTER).split(sep).join('/')} rather than writing it here.\n`,
		);
	}
	process.exitCode = 1;
}

/** One module's source, or `null` when it is not there. */
function readSource(module) {
	try {
		return readFileSync(module, 'utf8').replaceAll('\r\n', '\n');
	} catch {
		return null;
	}
}

main();
