#!/usr/bin/env node
/**
 * Asserts that every query-builder `.join()` passes its join type.
 *
 * `@tanstack/db` types the third argument as
 * `TJoinType extends 'inner' | 'left' | 'right' | 'full' = 'left'`, so a call
 * that leaves it out is a left join and nothing at the call site says so. #475
 * found four in `apps/web` whose comments said `inner`, one of them long enough
 * ago to have grown a test asserting the left-join behaviour with a note saying
 * the drift was known. A comment is not a gate: a reviewer reading a two
 * argument `.join()` beside a comment saying `inner` has nothing to compare
 * against. This is the thing to compare against.
 *
 * Run it with `pnpm check:join-types`.
 *
 * ## Telling the two joins apart
 *
 * `['a', 'b'].join(', ')` is in the same files, so the gate has to resolve the
 * call rather than match its text. It reads the argument list off
 * `masked-source.mjs`, which blanks every comment, string and regex body, and
 * then asks two questions of it. A call is a query-builder join when it passes
 * two or more arguments and either
 *
 * - its first argument is an object literal, which is how the builder names the
 *   joined collection and its alias (`{ tag: tags() }`), or
 * - its second argument is a function, which is how it writes the predicate.
 *
 * Neither is a shape `Array.prototype.join` or `path.join` can take: an array
 * join takes one separator, a path join takes strings, and no `.join()` in this
 * workspace passes a function at all except a query-builder predicate. The two
 * questions are separate so that hoisting either argument into a variable still
 * leaves the call recognisable.
 *
 * Measured over `apps/` and `packages/` on 2026-09-05: 257 `.join()` calls, 88
 * of them query-builder joins, 87 in `apps/web` and one in `apps/admin`, and all
 * 88 name their type. The other 169 are array joins and Kysely's
 * `sql.join(parts, separator)`, and none of them is misread as a builder join.
 * The 87 is the count #475 arrived at by hand, which is the check on the shape
 * rule.
 *
 * ## Which roots
 *
 * Everything `sourceFiles` walks, tests included. The builder belongs to
 * `@tanstack/db` and nothing scopes it to one app, so a gate that watched only
 * `apps/web` would miss the query `apps/admin` already has. Tests are in because
 * a suite is where #475's wrong assertion grew, and the default applies there
 * the same way. Nothing outside those roots calls the builder: `packages/db` is
 * Kysely, whose `.innerJoin` and `.leftJoin` name the type in the method, and
 * `scripts/` is Node.
 *
 * ## What it does not read
 *
 * The type itself, when it is not a literal. A call passing a variable has named
 * its join type, which is the rule here, and `tsc` holds that variable to the
 * four members. A literal is checked against them anyway, because it costs one
 * regex.
 *
 * It also cannot read a call written with explicit type arguments,
 * `.join<'inner'>(...)`, so it refuses one rather than skipping it. Nobody
 * writes that today, since the builder infers the type from the argument.
 */

import { readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { maskedSource } from './lib/masked-source.mjs';
import { sourceFiles } from './lib/source-files.mjs';

const workspaceRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

/** The join types `@tanstack/db` takes. The default, when the argument is absent, is `left`. */
const JOIN_TYPES = ['inner', 'left', 'right', 'full'];

/** A `.join(` call, or the `.join<` the gate refuses to guess at. */
const JOIN_CALL = /\.\s*join\s*(\(|<)/g;

/**
 * How few query-builder joins means the shape rule has stopped matching rather
 * than the queries having gone away.
 *
 * There were 88 on 2026-09-05. A refactor that moves the joined collection into
 * a variable and the predicate into a named function would slip past both halves
 * of the rule, and this is what turns that from a gate checking nothing into a
 * failure that says so.
 */
const MINIMUM_JOINS = 40;

function main() {
	const calls = [...sourceFiles(workspaceRoot, [], { tests: true })].flatMap(readCalls);

	const unresolved = calls.filter((call) => call.arguments === null);
	if (unresolved.length > 0) {
		reportUnresolved(unresolved);
	}

	const joins = calls.filter(isBuilderJoin);

	if (joins.length < MINIMUM_JOINS) {
		fail(
			`resolved only ${joins.length} query-builder joins out of ${calls.length} .join() calls, which is fewer than the ${MINIMUM_JOINS} this expects. The call shape has changed and the rule in this file no longer recognises it, so nothing is being checked. Read "Telling the two joins apart" in scripts/check-join-types.mjs and fix the rule before the joins go unchecked.`,
		);
	}

	report(joins, calls.length);
}

// ---------------------------------------------------------------------------
// Reading the calls
// ---------------------------------------------------------------------------

/**
 * Every `.join()` in one file, with its arguments as source text.
 *
 * `arguments` is `null` for a call this cannot resolve: an argument list with no
 * closing parenthesis in the masked source, or a call written with explicit type
 * arguments. Both are reported rather than dropped.
 */
function readCalls(path) {
	const source = readFileSync(path, 'utf8').replace(/\r\n/g, '\n');
	const file = {
		source,
		masked: maskedSource(source),
		where: relative(workspaceRoot, path).replaceAll('\\', '/'),
	};

	JOIN_CALL.lastIndex = 0;
	const calls = [];

	for (
		let found = JOIN_CALL.exec(file.masked);
		found !== null;
		found = JOIN_CALL.exec(file.masked)
	) {
		calls.push(readCall(file, found));
	}

	return calls;
}

/** One call, from the match that found it. */
function readCall(file, found) {
	const spans = found[1] === '<' ? null : argumentSpans(file.masked, JOIN_CALL.lastIndex - 1);
	return {
		where: file.where,
		line: file.source.slice(0, found.index).split('\n').length,
		text: callText(file.source, found.index, spans),
		arguments: argumentsIn(file.source, spans),
		masked: argumentsIn(file.masked, spans),
	};
}

/** Each span as text, trimmed. `null` spans stay null, which is how a call says it is unreadable. */
const argumentsIn = (text, spans) =>
	spans === null ? null : spans.map(([from, to]) => text.slice(from, to).trim());

/** How far each bracket moves the nesting depth. Everything else leaves it alone. */
const NESTING = { '(': 1, '[': 1, '{': 1, ')': -1, ']': -1, '}': -1 };

const depthAfter = (depth, character) => depth + (NESTING[character] ?? 0);

/** A comma between two arguments of this call rather than one inside an argument. */
const separatesArguments = (depth, character) => depth === 1 && character === ',';

/** The `=>` of an arrow function, which is two characters. */
const opensArrow = (masked, at) => masked[at] === '=' && masked[at + 1] === '>';

/**
 * The `[from, to]` span of each argument, read off the masked source, or `null`
 * when the list does not close.
 *
 * Brackets are counted and commas split at depth one, which is enough because
 * every comma and bracket that is not code has already been blanked. A call
 * writing no arguments, and a trailing comma before the closing parenthesis,
 * both leave an empty last span, and both mean one fewer argument than spans.
 */
function argumentSpans(masked, opened) {
	const spans = [];
	let depth = 0;
	let start = opened + 1;

	for (let at = opened; at < masked.length; at += 1) {
		depth = depthAfter(depth, masked[at]);

		if (depth === 0) {
			spans.push([start, at]);
			return trimEmptyTail(masked, spans);
		}
		if (separatesArguments(depth, masked[at])) {
			spans.push([start, at]);
			start = at + 1;
		}
	}

	return null;
}

function trimEmptyTail(masked, spans) {
	const last = spans.at(-1);
	return masked.slice(last[0], last[1]).trim() === '' ? spans.slice(0, -1) : spans;
}

/** The call as one line, for the failure to point at. */
function callText(source, from, spans) {
	const end = spans === null || spans.length === 0 ? from + 40 : spans.at(-1)[1] + 1;
	const text = source.slice(from, end).replace(/\s+/g, ' ').trim();
	return text.length > 110 ? `${text.slice(0, 110)}...` : text;
}

// ---------------------------------------------------------------------------
// Which calls are query-builder joins
// ---------------------------------------------------------------------------

/**
 * Whether a call is the query builder's join rather than an array's or a path's.
 *
 * Two arguments at least, and then either shape: the joined collection written
 * as an object literal, or a predicate written as a function. See the docblock
 * for why neither can be an array join.
 */
function isBuilderJoin(call) {
	if (call.arguments === null || call.arguments.length < 2) {
		return false;
	}
	return call.arguments[0].startsWith('{') || isFunction(call.masked[1]);
}

/**
 * Whether an argument is a function expression.
 *
 * An arrow is an `=>` outside every bracket in the argument: one inside is the
 * body of some other function, and one inside a string or a comment has been
 * blanked already.
 */
function isFunction(masked) {
	let depth = 0;

	for (let at = 0; at < masked.length; at += 1) {
		depth = depthAfter(depth, masked[at]);
		if (depth === 0 && opensArrow(masked, at)) {
			return true;
		}
	}

	return /^\s*(?:async\s+)?function\b/.test(masked);
}

// ---------------------------------------------------------------------------
// Reporting
// ---------------------------------------------------------------------------

const QUOTED_TYPE = /^(['"`])(.*)\1$/;

function report(joins, calls) {
	const untyped = joins.filter((site) => site.arguments.length < 3);
	const wrong = joins.filter((site) => isWrongType(site.arguments[2]));

	if (untyped.length === 0 && wrong.length === 0) {
		console.log(
			`check-join-types: ${joins.length} query-builder joins out of ${calls} .join() calls, all naming their join type.`,
		);
		return;
	}

	printUntyped(untyped);
	printWrong(wrong);
	process.exit(1);
}

/** A quoted third argument that is not one of the four. An unquoted one is `tsc`'s to hold. */
function isWrongType(written) {
	const quoted = written?.match(QUOTED_TYPE);
	return quoted != null && !JOIN_TYPES.includes(quoted[2]);
}

function printUntyped(untyped) {
	if (untyped.length === 0) {
		return;
	}

	console.error(
		`check-join-types: ${count(untyped.length, 'query-builder join')} ${agree(untyped.length, 'passes', 'pass')} no join type.\n`,
	);
	for (const site of untyped) {
		console.error(`  ${site.where}:${site.line}  ${site.text}`);
	}
	console.error(
		`\nAdd the type as the third argument: ${list(JOIN_TYPES)}. @tanstack/db defaults a missing one to 'left', so the call above is a left join today. A comment saying otherwise is what #475 found four times.\n`,
	);
}

function printWrong(wrong) {
	if (wrong.length === 0) {
		return;
	}

	console.error(
		`check-join-types: ${count(wrong.length, 'query-builder join')} ${agree(wrong.length, 'names', 'name')} a join type that does not exist.\n`,
	);
	for (const site of wrong) {
		console.error(`  ${site.where}:${site.line}  ${site.arguments[2]}`);
	}
	console.error(`\nThe join types are ${list(JOIN_TYPES)}.\n`);
}

function reportUnresolved(unresolved) {
	console.error(`check-join-types: ${count(unresolved.length, '.join() call')} cannot be read.\n`);
	for (const call of unresolved) {
		console.error(`  ${call.where}:${call.line}  ${call.text}`);
	}
	console.error(
		`\nEach one is either written with explicit type arguments, which this gate does not parse, or has an argument list this cannot find the end of. Rather than skip it and check nothing, the gate stops here. Write the call as .join(collection, predicate, type) and let the builder infer, or teach scripts/check-join-types.mjs the shape.\n`,
	);
	process.exit(1);
}

const list = (words) => `${words.slice(0, -1).map(quote).join(', ')} or ${quote(words.at(-1))}`;

const quote = (word) => `'${word}'`;

const count = (total, noun) => `${total} ${noun}${total === 1 ? '' : 's'}`;

const agree = (total, singular, plural) => (total === 1 ? singular : plural);

function fail(message) {
	console.error(`check-join-types: ${message}`);
	process.exit(1);
}

main();
