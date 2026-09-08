#!/usr/bin/env node
/**
 * Requires every `role="img"` element to name itself with `aria-label` or
 * `aria-labelledby`.
 *
 * `role="img"` on a span or an svg tells assistive technology that the element
 * is an image, and an image needs an accessible name. `aria-label` gives it
 * one. `title` does not: support for it as a name source varies by browser and
 * screen reader, and it is invisible to a touch device, so an element naming
 * itself that way is announced as "image" and nothing else.
 *
 * Six elements in the tree carry the role today and every one of them carries
 * an `aria-label`. The convention was written down twice and enforced nowhere:
 * `absent-value.tsx`'s docblock states the rule and counts the other elements,
 * and `explorer-row.tsx`'s says there is no `title` beside its `aria-label` and
 * why. Prose is what the next element is written against, and the swatch it
 * describes is the one that had a `title` (#606). So the rule is read off the
 * tree here instead, on the branch that breaks it (#672).
 *
 * Run it with `pnpm check:image-names`.
 *
 * ## The corpus, and what is out of it
 *
 * Every `.tsx` under `apps/` and `packages/`, tests aside. `.ts` is out because
 * a screen is JSX here and nothing in this workspace builds an element by
 * calling `createElement` with a props object.
 *
 * Tests are out, which is `check:vocabulary`'s answer rather than
 * `check:map-palette`'s. A suite renders fixtures, and a fixture is input to an
 * assertion rather than something a person meets on screen. A suite covering
 * this rule has to render an element that breaks it, and a gate that read the
 * suites would refuse the test proving the gate works.
 *
 * Generated component source is deliberately in. `packages/ui-web`'s shadcn
 * components are excluded from Biome and are still what draws on a screen, so a
 * role added there is the same failure as one added anywhere else.
 *
 * ## What counts as an element, and what this cannot see
 *
 * A `role` attribute in code whose value is the literal string `img`, and the
 * JSX opening tag around it. Literal only, because `role` is also an ordinary
 * prop name in this workspace: `role={workspace.role}` passes a Membership role
 * to a component and has nothing to do with ARIA. That is the same line Biome's
 * `useValidAriaRole` draws, and `link-destinations.test.tsx` already carries a
 * constant rather than a literal because of it.
 *
 * So a role computed at runtime is what this cannot see, along with a role
 * arriving through a spread of a props object. Both are unreadable off the
 * source, and refusing them would refuse the domain prop.
 *
 * Presence of `aria-label` or `aria-labelledby` is the test, with one case
 * taken further: a name whose value is a literal empty string is refused,
 * because it is present and announces nothing. Whether a name computed at
 * runtime is empty, and whether an `aria-labelledby` points at an id that
 * exists, are runtime questions this cannot answer.
 *
 * There is no marker vocabulary and no allowance list. An element wanting an
 * exemption is an element wanting no accessible name, and the fix for that is
 * to drop the role or to hide the element with `aria-hidden`, which is what the
 * segments inside `larval-display.tsx`'s bar already do.
 *
 * ## The floors
 *
 * #591's rule, twice: a scan that has stopped reading its corpus prints the
 * same summary line a clean run does. `MINIMUM_FILES` guards the walk that
 * finds the `.tsx` files, and `MINIMUM_ELEMENTS` guards the match that finds
 * the roles inside them, because a regression in the attribute scan leaves the
 * files found and reads zero elements out of them, which looks exactly like
 * every element being correct.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { maskedSource } from './lib/masked-source.mjs';
import { pathFrom } from './lib/relative-path.mjs';
import { sourceFiles } from './lib/source-files.mjs';
import { lineOf } from './lib/source-position.mjs';
import { count, failure, trim } from './lib/style-gate.mjs';

const GATE = 'check-image-names';
const workspaceRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const fail = failure(GATE);

/** A `role` attribute, found in code so a `[role=checkbox]` in a class string is not one. */
const ROLE_ATTRIBUTE = /\brole\s*=/g;

/** The attributes this reads off a tag, all of them at the tag's own brace depth. */
const READ_ATTRIBUTES = /\b(aria-label|aria-labelledby|title)\s*=/g;

/** What a brace the tag walk steps over does to its expression depth. */
const BRACE_DEPTH = { '{': 1, '}': -1 };

/** The two attributes that name an element. */
const NAMING_ATTRIBUTES = ['aria-label', 'aria-labelledby'];

/**
 * The floors, both #591's.
 *
 * 400 files against a walk that has stopped finding the workspace, under the
 * 479 `.tsx` modules outside the tests trees today. 5 elements against an
 * attribute scan that has stopped matching, under the 6 that carry the role.
 * Neither is a ratchet: this gate is at zero, so the numbers move only when a
 * screen is added or deleted, and raising them buys nothing.
 */
const MINIMUM_FILES = 400;
const MINIMUM_ELEMENTS = 5;

function main() {
	const files = [...sourceFiles(workspaceRoot)].filter((file) => file.endsWith('.tsx'));
	if (files.length < MINIMUM_FILES) {
		fail(
			`found ${count(files.length, '.tsx file')} under apps/ and packages/, fewer than the ${MINIMUM_FILES} this expects. The walk has stopped finding the workspace, so an unnamed role="img" now passes this. Fix the walk in scripts/check-image-names.mjs, or lower MINIMUM_FILES if that many modules were genuinely deleted.`,
		);
	}

	const elements = files.flatMap(elementsIn);
	const findings = elements.filter((element) => element.problem !== null);

	if (findings.length > 0) {
		report(findings);
		return;
	}

	// Only on a clean run. A report has already proved the scan reads the tags,
	// and this floor would bury it under a refusal.
	if (elements.length < MINIMUM_ELEMENTS) {
		fail(
			`found ${count(elements.length, 'role="img" element')} across ${files.length} modules, fewer than the ${MINIMUM_ELEMENTS} this expects. The files are being found and the roles inside them are not, so this run's clean zero is the scan failing rather than every image carrying a name.`,
		);
	}

	console.log(
		`Image names: ${count(elements.length, 'role="img" element')} across ${files.length} modules, each named with aria-label or aria-labelledby.`,
	);
}

/** Every `role="img"` element in one file, with what is wrong with each. */
function elementsIn(file) {
	const source = readFileSync(file, 'utf8').replaceAll('\r\n', '\n');
	const masked = maskedSource(source);

	return [...masked.matchAll(ROLE_ATTRIBUTE)]
		.filter((match) => literalValue(source, match.index + match[0].length) === 'img')
		.map((match) => readElement(file, source, masked, match.index));
}

/** The literal an attribute was given, or `null` when it was given an expression. */
function literalValue(source, from) {
	const literal = source.slice(from, from + 40).match(/^\s*\{?\s*(['"])([^'"]*)\1/);
	return literal === null ? null : literal[2];
}

/** One element, as its location and either a problem or `null`. */
function readElement(file, source, masked, index) {
	const at = `${pathFrom(workspaceRoot, file)}:${lineOf(source, index)}`;
	const line = trim(
		source
			.slice(source.lastIndexOf('\n', index) + 1)
			.split('\n')[0]
			.trim(),
	);
	const tag = enclosingTag(masked, index);

	if (tag === null) {
		return {
			at,
			line,
			problem: `this gate could not find the JSX tag around it, so it cannot say whether it is named. Rewrite the tag so the attribute list reads as one, or fix the scan in scripts/check-image-names.mjs`,
		};
	}

	return { at, line, problem: problemWith(attributesOf(source, masked, tag)) };
}

/** What is wrong with one tag's naming attributes, or `null` when nothing is. */
function problemWith(attributes) {
	const named = NAMING_ATTRIBUTES.filter((name) => attributes.has(name));
	if (named.some((name) => attributes.get(name) !== '')) {
		return null;
	}

	if (named.length > 0) {
		return `its ${named.join(' and ')} is the empty string, which is present and announces nothing. Give it the words a person needs, or drop role="img" and hide the element with aria-hidden`;
	}

	if (attributes.has('title')) {
		return 'its only naming attribute is title, which is not a reliable accessible name: support varies by browser and screen reader, and it is invisible to a touch device. Add aria-label';
	}

	return 'it has no aria-label and no aria-labelledby, so assistive technology announces "image" and nothing else. Add aria-label, or drop role="img" and hide the element with aria-hidden';
}

/**
 * The naming attributes on one tag, as `name -> literal value`, with `null` for
 * a value that is an expression.
 *
 * Only the ones at the tag's own brace depth, so a `<Badge aria-label="..." />`
 * passed through an attribute expression names the badge rather than the tag
 * around it.
 */
function attributesOf(source, masked, tag) {
	const region = masked.slice(tag.start, tag.end);
	const attributes = new Map();

	for (const match of region.matchAll(READ_ATTRIBUTES)) {
		if (tag.topLevel[match.index] === true) {
			attributes.set(match[1], literalValue(source, tag.start + match.index + match[0].length));
		}
	}
	return attributes;
}

/**
 * The JSX opening tag an attribute sits in, or `null` when nothing readable
 * holds it.
 *
 * Backwards to the nearest `<` that opens a tag whose end is past the
 * attribute. Nearest is not always the tag: a `<` inside an attribute
 * expression, as in `icon={<Pin />}`, opens and closes before the attributes
 * that follow it, and the walk steps over one that does.
 */
function enclosingTag(masked, index) {
	for (let at = index; at >= 0; at -= 1) {
		const tag = tagAt(masked, at);
		if (tag !== null && tag.end > index) {
			return tag;
		}
	}
	return null;
}

/** The tag opening at one position, or `null` when no tag opens there. */
const tagAt = (masked, at) => (opensTag(masked, at) ? tagFrom(masked, at) : null);

/** Whether a `<` here opens a tag, which is a `<` with a name against it. */
const opensTag = (masked, at) => masked[at] === '<' && /[A-Za-z_$]/.test(masked[at + 1] ?? '');

/**
 * One opening tag from its `<`, ending at the first `>` outside an attribute
 * expression.
 *
 * `topLevel` says, per character, whether it sits at the tag's own depth. The
 * masked copy has no string or comment bodies left in it, so the only thing
 * that can hide a `>` is a `{...}` expression, and counting braces is enough.
 */
function tagFrom(masked, start) {
	const topLevel = [];
	let depth = 0;

	for (let at = start; at < masked.length; at += 1) {
		const character = masked[at];
		if (closesTag(character, depth)) {
			return { start, end: at + 1, topLevel };
		}
		depth = depthAfter(character, depth);
		topLevel.push(depth === 0);
	}
	return null;
}

/** Whether this character ends the tag rather than sitting in an expression. */
const closesTag = (character, depth) => character === '>' && depth === 0;

/** What a brace does to the depth of an attribute expression. */
const depthAfter = (character, depth) => depth + (BRACE_DEPTH[character] ?? 0);

function report(findings) {
	console.error(
		`${GATE}: ${count(findings.length, 'role="img" element')} with no accessible name.\n`,
	);
	for (const finding of findings) {
		console.error(`  ${finding.at}\n    ${finding.line}\n    ${finding.problem}.\n`);
	}
	process.exitCode = 1;
}

main();
