#!/usr/bin/env node
/**
 * Runs every static gate in one command and names all of them that failed.
 *
 * `pnpm check` is Biome alone and has never run a `check:*` gate, so a
 * contributor who wanted to know whether a branch passes ran a command per gate
 * or pushed and waited (#679). CI's `verify` job runs them as separate steps,
 * which is the split this closes from the local side: the same gates, in the
 * same order, under one command.
 *
 * Run it with `pnpm check:all`. Biome runs first, then each gate in turn.
 * Nothing stops at the first failure, because a person about to fix things
 * wants the whole list, so every gate runs and the summary at the end names the
 * ones that failed. The run exits non-zero when any did.
 *
 * ## Membership is derived, so it cannot go stale
 *
 * Every `check:*` script in the root `package.json` is a gate. There is no list
 * of gate names here, because a list is a register and this issue is what a
 * stale register costs: the issue was titled "the fourteen static gates", the
 * triage brief corrected that to twenty-three, and both were wrong by the time
 * they were read. A gate joins this command by being a `check:*` script, and
 * nothing else is needed.
 *
 * `NOT_A_GATE` below is the one register, and it is the three `check:*` scripts
 * that are not gates, each with the reason. An entry naming a script that no
 * longer exists fails, so it cannot rot into an exemption nothing is using.
 *
 * ## The workflow is the second half, and the ordering
 *
 * The derived set is asserted against the `pnpm check:*` steps of the `verify`
 * job in `.github/workflows/ci.yml`, in both directions. A gate CI never runs
 * fails, and a CI step naming something that is not a gate fails. That is what
 * keeps this command and CI from disagreeing, which is the failure the whole
 * thing is meant to prevent: a green local run against a red job.
 *
 * CI keeps its per-gate steps rather than calling this command, because a
 * failed step is a named line in the GitHub UI and a run of this would be one
 * step whose log a reader scrolls. So CI gains one cheap step instead,
 * `pnpm check:all --list`, which does the parity assertion and runs no gate.
 * That is the step that fails when a new gate is added to `package.json` and
 * not to the job.
 *
 * Run order is read off the workflow too, rather than written out again here.
 * The job already puts the cheap gates first, `check:build-graph` ahead of the
 * corpus walks, so a contributor sees a failure sooner; reordering happens in
 * one place and both halves move together.
 *
 * ## What it spawns
 *
 * Each gate's own command text from `package.json`, through a shell, from the
 * workspace root. Not `pnpm run <gate>`, which would pay pnpm's startup
 * twenty-five times over for nothing. What pnpm does that a bare shell does not
 * is put `node_modules/.bin` on PATH, so this does that itself: without it
 * `biome` is not a command, and the Biome step failed in a tenth of a second
 * while every gate, being `node scripts/...`, passed.
 *
 * Output is inherited rather than captured, so a slow run shows its progress and
 * a gate's failure message reads exactly as it does when run alone.
 *
 * Sequentially, and deliberately: the gates walk overlapping corpora and
 * running them at once interleaves their output, which is the half of a failure
 * a person actually reads.
 *
 * Two floors, #591's rule, because two parses are two ways to pass over
 * nothing. A `package.json` this has stopped reading and a workflow this has
 * stopped reading both leave the parity assertion true of two empty sets, under
 * the same summary line a clean run prints.
 */
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { delimiter, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const GATE = 'check:all';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PACKAGE_JSON = join(ROOT, 'package.json');
const WORKFLOW = join(ROOT, '.github/workflows/ci.yml');

/** The Biome script, which is not a gate and runs first because it is cheapest. */
const BIOME = 'check';

/**
 * The `check:*` scripts that are not static gates, with the reason each.
 *
 * The only hand-written membership here, and an entry naming a script that does
 * not exist fails, so it cannot outlive what it excuses.
 */
const NOT_A_GATE = new Map([
	['check:all', 'it is this command, and a gate list holding itself is a run that never ends.'],
	['check:write', 'it is `biome check --write`, a fixer rather than a gate.'],
	[
		'check:schema-drift',
		'it compares two live databases, needs `--observed` and `--expected` connection URLs, and exits 2 without them. CI does not run it either.',
	],
]);

/**
 * The floor under the `package.json` parse. Twenty-four gates today, and a
 * number well below that so an ordinary removal does not trip it.
 */
const MINIMUM_GATES = 20;

/** The floor under the workflow parse, for the same reason and at the same distance. */
const MINIMUM_WORKFLOW_GATES = 20;

/** A `run: pnpm check` or `run: pnpm check:<name>` line, and nothing else. */
const RUN_STEP = /^\s*run: pnpm (check(?::[a-z][a-z-]*)?)\s*$/;

/** The `verify:` job's own key, at the indentation a job key sits at. */
const VERIFY_KEY = '  verify:';

/** The start of the next top-level key, which is where the `verify` job ends. */
const NEXT_KEY = /^ {2}\S/;

/** The scripts block of the root `package.json`. */
const readScripts = () => JSON.parse(readFileSync(PACKAGE_JSON, 'utf8')).scripts ?? {};

/** Every `check:*` script that is not on `NOT_A_GATE`, in `package.json` order. */
const declaredGates = (scripts) =>
	Object.keys(scripts).filter((name) => name.startsWith('check:') && !NOT_A_GATE.has(name));

/** `NOT_A_GATE` entries naming a script the workspace no longer has. */
const staleExemptions = (scripts) => [...NOT_A_GATE.keys()].filter((name) => !(name in scripts));

/**
 * The lines of the `verify` job, or `null` when the workflow has no such job.
 *
 * Read as text rather than through a YAML parser, because the one question is
 * which `pnpm` commands the job runs and a dependency to answer it would be the
 * larger change.
 */
function verifyJobLines(workflow) {
	const lines = workflow.split('\n');
	const start = lines.indexOf(VERIFY_KEY);
	if (start < 0) return null;

	const body = lines.slice(start + 1);
	const end = body.findIndex((line) => NEXT_KEY.test(line));
	return end < 0 ? body : body.slice(0, end);
}

/** The `pnpm check` and `pnpm check:*` scripts the job runs, in job order. */
const workflowScripts = (lines) =>
	lines
		.map((line) => RUN_STEP.exec(line))
		.filter((match) => match !== null)
		.map((match) => match[1]);

/** The members of `left` that `right` does not hold. */
const missingFrom = (left, right) => left.filter((name) => !right.includes(name));

/** One line naming a set difference, or `null` when there is no difference. */
const difference = (names, sentence) =>
	names.length === 0 ? null : `${sentence}: ${names.join(', ')}.`;

/** Everything wrong with the two registers, as sentences, before any gate runs. */
function parityProblems(scripts, gates, ran) {
	const stale = staleExemptions(scripts);
	const workflowGates = ran.filter((name) => name !== BIOME);

	return [
		difference(stale, 'NOT_A_GATE names scripts that do not exist'),
		floorProblem(gates.length, MINIMUM_GATES, 'gates in package.json'),
		floorProblem(workflowGates.length, MINIMUM_WORKFLOW_GATES, 'gates in the verify job'),
		ran.includes(BIOME) ? null : `the verify job runs no \`pnpm ${BIOME}\` step.`,
		difference(missingFrom(gates, workflowGates), 'the verify job runs none of these gates'),
		difference(missingFrom(workflowGates, gates), 'the verify job runs these, which are not gates'),
	].filter((problem) => problem !== null);
}

/** One line when a count is under its floor, or `null` when it is not. */
const floorProblem = (found, floor, what) =>
	found >= floor ? null : `only ${found} ${what}, under the floor of ${floor}.`;

/** The environment a script runs in, which is this one with the workspace bins on PATH. */
const childEnv = () => ({
	...process.env,
	PATH: `${join(ROOT, 'node_modules', '.bin')}${delimiter}${process.env.PATH ?? ''}`,
});

/** Runs one script's command text and reports how it went. */
function runScript(name, command) {
	console.log(`\n${'-'.repeat(72)}\n${GATE}: ${name}\n${'-'.repeat(72)}`);
	const started = Date.now();
	const options = { cwd: ROOT, shell: true, stdio: 'inherit', env: childEnv() };
	const finished = spawnSync(command, options);
	return { name, ok: finished.status === 0, seconds: (Date.now() - started) / 1000 };
}

/** One script's line in the timing table. */
const timingLine = (result) =>
	`  ${result.ok ? 'pass' : 'FAIL'}  ${result.seconds.toFixed(1)}s  ${result.name}`;

/** The timing table, every script in the order it ran. */
function printTimings(results) {
	for (const result of results) console.log(timingLine(result));
}

/** Names every script that failed, and fails the run. */
function reportFailures(failed) {
	console.error(`\n${GATE}: these failed, and each one's output is above.\n`);
	for (const result of failed) console.error(`  pnpm ${result.name}`);
	process.exitCode = 1;
}

/** Prints the per-script timings, then the failures, and sets the exit code. */
function report(results) {
	const failed = results.filter((result) => !result.ok);
	console.log(`\n${GATE}: ${results.length} ran, ${failed.length} failed.\n`);
	printTimings(results);
	if (failed.length > 0) reportFailures(failed);
}

/** Fails the run over the registers, before a gate has run. */
function refuse(problems) {
	console.error(`${GATE}: this command and CI's verify job do not agree on the gates.\n`);
	for (const problem of problems) console.error(`  ${problem}`);
	console.error(
		'\nA gate is every `check:*` script in the root package.json. Add the gate to the verify job in .github/workflows/ci.yml, or say why it is not a gate in NOT_A_GATE in scripts/check-all.mjs.',
	);
	process.exitCode = 1;
}

/** Prints what the command would run, for `--list` and for the CI parity step. */
function list(order) {
	console.log(`${GATE}: ${order.length - 1} gates, plus \`pnpm ${BIOME}\`, in this order.\n`);
	for (const name of order) console.log(`  pnpm ${name}`);
}

function main() {
	const scripts = readScripts();
	const gates = declaredGates(scripts);
	const lines = verifyJobLines(readFileSync(WORKFLOW, 'utf8'));
	if (lines === null) {
		refuse([`${WORKFLOW} has no \`${VERIFY_KEY.trim()}\` job, so nothing here can be compared.`]);
		return;
	}

	const ran = workflowScripts(lines);
	const problems = parityProblems(scripts, gates, ran);
	if (problems.length > 0) {
		refuse(problems);
		return;
	}

	// The workflow's order, with Biome first whatever the job says, because it is
	// the cheapest failure to meet and the most likely one to have.
	const order = [BIOME, ...ran.filter((name) => name !== BIOME)];
	if (process.argv.includes('--list')) {
		list(order);
		return;
	}

	report(order.map((name) => runScript(name, scripts[name])));
}

main();
