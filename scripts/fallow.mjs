// Wrapper around the `fallow` CLI that makes `--type-aware` work on Windows,
// and that turns the health baseline's staleness warning into a gate.
//
// fallow's semantic pass runs in a sidecar process, which fallow spawns using
// the path in that package's `bin` field: `fallow-type-aware.mjs`. On Unix the
// shebang makes that file directly executable. Windows has no shebang handling,
// so CreateProcess rejects it outright:
//
//   failed to spawn ...\fallow-type-aware.mjs:
//   %1 is not a valid Win32 application. (os error 193)
//
// fallow ignores `node_modules/.bin` when locating the sidecar, but it does
// honour FALLOW_TYPE_AWARE_BIN — so on Windows we hand it the pnpm-generated
// `.CMD` shim, which runs the same file through node. `fallow-type-aware` is a
// direct devDependency for exactly this reason: pnpm only links the bins of
// direct dependencies into the root `.bin`. Keep its version in lockstep with
// `fallow` itself.
//
// Every other platform gets no override and spawns fallow unchanged.
//
// The staleness half is #360. A saved baseline entry that matches no current
// finding is allowance nothing is using: the file it names was cleaned up, so a
// new finding there lands inside the old headroom and the gate stays quiet.
// `fallow health --baseline` warns about that, prints the warning second, ahead
// of 1500 lines of report, and exits 0, which is how the baseline sat five days
// with 358 of its 658 entries matching nothing. So the warning is the gate: it
// gets reprinted under the report, where the result line is read, and it fails
// the run. There is no quieter staleness for this to be strict about, because
// fallow says nothing until a quarter of the saved entries match nothing.
//
// That makes the gate one match against fallow's own wording, pinned to the
// version in package.json. Re-read this warning's text when `fallow` is
// upgraded: reworded, the match stops firing and the gate is off with nothing
// to show for it. Only a run that reads a baseline is watched, so the fix,
// `pnpm fallow:baseline`, cannot fail on the condition it removes.
//
// The save half is #668. `fallow health --save-baseline` writes the file and
// then still exits non-zero over findings above its threshold, because saving
// does not change what `health` gates on. A person reads past that. A script
// does not, and `CLAUDE.md` names `pnpm fallow:baseline` as the thing to run
// after real complexity comes out, so anything chaining off it stops on a
// successful save. A save run's exit code is decided below instead.
//
// The verdict half is #941. fallow's last line on a `health` run is `✗ n above
// threshold`, which is its own count of findings over its threshold and is the
// same line on a run that passes the baseline comparison and one that fails it:
// the two runs behind that issue printed `✗ 187 above threshold` and exited 0
// and 1. A reader sees the glyph at the bottom of 3000 lines and reads it as the
// gate's answer, and the issue it produced was a disagreement between local and
// CI that did not exist. So a run that compares prints its own verdict under
// fallow's, naming the regressions and this run's exit code. The regression
// count is re-derived rather than read off fallow, which prints no regression
// detail at all, only the exit code; the re-derivation is fallow's own `count`
// mode, a comparison per file and finding category, against the fresh baseline
// the freshness check below already saves. What fails a run whose flags move
// fallow off that mode is #972's guard. Refactoring targets are left out of
// it, being recommendations rather than findings. The verdict reports and never
// decides: every exit code here is what it was before.
//
// The duplication verdict is #971, the same reading error one gate over. A
// `dupes` run ends on `✗ 15,260 lines (4.7%) duplicated across 408 files` and
// exits 0, because 4.7% is under the 5.0 threshold in `.fallowrc.jsonc`. Run
// against `--threshold 1` the same line prints, and fallow adds `Duplication
// (4.7%) exceeds threshold (1.0%)` before exiting 1. So the cross says nothing
// about the gate either, and this prints a verdict naming the percentage, the
// threshold it was measured against and the exit code.
//
// Two verdict functions and one shared sentence, which is the design question
// the issue asked to settle rather than assume. What the two have in common is
// the disclaimer and the place it prints, and `fallowsCross` is that
// sentence, taking the noun for whatever fallow counted. Everything else
// differs: health names a baseline file and lists a regression per entry, and
// has to spawn a second fallow run to know them, while this reads two numbers
// off one line fallow already printed and spawns nothing. One function over
// both would be the two bodies behind a flag, with the shared half the one line
// that is now shared.
//
// The threshold is read from the config rather than written here, so the gate
// and the verdict cannot disagree about what the run was measured against, and
// `--threshold` on the command line wins because fallow lets it. The word
// before it, `under` or `over`, is read off the two numbers rather than off the
// exit code: a run that fails for another reason then says so, since the exit
// code is named separately. This reports and never decides, the same as #941's.
//
// The freshness half is #669, and it is the gate under fallow's quarter. Below
// that line fallow says nothing, so a baseline could carry any number of
// entries matching nothing and every one of them was headroom a new finding
// could land inside in silence. #605 was five of 166, three percent, and sat
// until a person read the file. So a gating run counts the stale entries
// itself, by saving a second baseline off the same tree and asking which of the
// checked-in entries the fresh one no longer names.
//
// The deciding half of all of that moved to `lib/fallow-comparison.mjs` under
// #972, because this file spawns fallow on import and so cannot be imported by
// a suite. What is left here is the spawning half: the child, its streams, the
// filesystem, and the exit code. The rule for which side a function is on, and
// the guard that fails a run whose flags the regression count is not derived
// under, are in that module's header.
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
	baselineEntries,
	duplicationOutcome,
	fallowsCross,
	freshnessArgs,
	probeFailures,
	flagValue as readFlag,
	regressionsBetween,
	unmodelledComparisonFlag,
	verdictOutcome,
	withoutComments,
} from './lib/fallow-comparison.mjs';

const args = process.argv.slice(2);
const readsBaseline = args.includes('--baseline');
const STALENESS_PATTERN = /health baseline is partially stale: \d+ of \d+ entries/;

// The summary fallow ends a `dupes` run on. The glyph is deliberately not part
// of the match, because it is the same cross on a run that passes the threshold
// and one that fails it.
const DUPLICATION_PATTERN = /([\d,]+) lines \(([\d.]+)%\) duplicated across ([\d,]+) files/;

/** The percentage and file count that summary carried, read off the run below. */
let duplication = null;

// Where the duplication threshold lives when `--config` does not point fallow
// somewhere else. The number itself is never written here.
const DEFAULT_CONFIG_PATH = '.fallowrc.jsonc';

// fallow's subcommand, which comes before the flags, so the first argument that
// is not one is it.
const subcommand = args.find((arg) => !arg.startsWith('-')) ?? null;

// More than five saved entries matching nothing fails the run. Five is #605's
// own number: five entries of 166 is three percent, nowhere near the quarter
// fallow warns at, and nobody was told. A limit above five would let that exact
// baseline through again, which is the gap this closes.
const STALE_ENTRY_LIMIT = 5;

// How many stale entries the failure prints before it stops naming them. A
// baseline that has gone this far wrong is re-saved wholesale, and the diff is
// where the rest are read.
const STALE_ENTRIES_SHOWN = 20;

// How many regressions the verdict names before it stops listing them. The
// report above already holds every one of them; this is the list a person reads
// first.
const REGRESSIONS_SHOWN = 20;

/** The value this run gave `flag`, read by the shared reader over this run's own arguments. */
const flagValue = (flag) => readFlag(args, flag);

// The path `--save-baseline` was given, or null when this run saves nothing.
const savesBaseline = flagValue('--save-baseline');

// The path `--baseline` was given, or null when this run compares against
// nothing.
const baselinePath = flagValue('--baseline');

// The config this run reads its threshold out of, which `--config` may move.
const configPath = flagValue('--config') ?? flagValue('-c') ?? DEFAULT_CONFIG_PATH;

// #668's distinction, read once: a run that saves is recording findings and a
// run that only compares is judging them. Freshness is a judgement, so the
// check below runs on the second kind alone and `pnpm fallow:baseline` cannot
// fail on the condition it fixes.
const gatesOnBaseline = readsBaseline && baselinePath !== null && savesBaseline === null;

/** Modification time of `path` in milliseconds, or null when there is no file. */
const modifiedAt = (path) => {
	try {
		return statSync(path).mtimeMs;
	} catch {
		return null;
	}
};

// Read before the child runs, so "did it write the file" is answered by the
// timestamp moving rather than by the file being there: the baseline is checked
// in, so an existence check would read every failed save as a successful one.
const savedBefore = savesBaseline === null ? null : modifiedAt(savesBaseline);

/** Whether this run asked for a baseline and the file's timestamp has moved. */
const savedTheBaseline = () => {
	if (savesBaseline === null) return false;
	const savedAfter = modifiedAt(savesBaseline);
	return savedAfter !== null && savedAfter !== savedBefore;
};

/** The code the run earns from the child's close code, before the staleness override. */
const exitCodeFor = (code) => {
	// A save run records findings rather than judging them, so findings above
	// the threshold are what it is writing down and not a verdict on the tree:
	// it exits 0 once the baseline is on disk. This is not a swallowed error.
	// A child killed by a signal reports a null code and is a failure like any
	// other, and a child that exited without moving the file's timestamp keeps
	// its code, so a crash, a rejected argument and an unwritable path all
	// still fail.
	if (code !== null && savedTheBaseline()) return 0;

	return code ?? 1;
};

const env = { ...process.env };

if (process.platform === 'win32') {
	env.FALLOW_TYPE_AWARE_BIN ??= 'node_modules/.bin/fallow-type-aware.CMD';
}

// Reading the child's output costs it the TTY it would otherwise inherit, so
// ask for colour by both of the conventional variables; fallow prints what it
// prints under a pipe if it honours neither.
if (process.stdout.isTTY) {
	env.FORCE_COLOR ??= '1';
	env.CLICOLOR_FORCE ??= '1';
}

/** What the second run said, kept for the message when it wrote nothing usable. */
let freshnessDetail = 'the second fallow run did not start';

/** One line naming how the second run ended, for a failure a reader has to act on. */
const describeRun = (run) => {
	const output = `${run.stderr ?? ''}`.trim();
	return `fallow exited ${run.status}${output ? `, saying: ${output}` : ' and said nothing'}`;
};

/**
 * The saved entries that no current finding matches, and the findings that have
 * gone up since the baseline was saved. Null when the second run could not be
 * read. Its exit code is ignored on purpose: a save run exits non-zero over
 * findings above the threshold, which is #668, and the file on disk is the
 * whole answer.
 *
 * One run answers both questions, so the verdict costs nothing on top of the
 * freshness gate: both are a comparison between the checked-in baseline and one
 * saved off the same tree.
 */
const measureBaseline = () => {
	const directory = mkdtempSync(join(tmpdir(), 'fallow-freshness-'));
	const destination = join(directory, 'health.json');
	try {
		const run = spawnSync('fallow', freshnessArgs(args, destination), {
			shell: true,
			// Only stderr is kept: the report on stdout is the same 1500 lines the
			// gating run already printed, and holding a second copy in memory buys
			// nothing. What stderr says is what the failure message needs.
			stdio: ['ignore', 'ignore', 'pipe'],
			encoding: 'utf8',
			env,
		});
		freshnessDetail = describeRun(run);
		const freshBaseline = JSON.parse(readFileSync(destination, 'utf8'));
		const savedBaseline = JSON.parse(readFileSync(baselinePath, 'utf8'));

		const fresh = new Set(baselineEntries(freshBaseline));

		return {
			stale: baselineEntries(savedBaseline).filter((entry) => !fresh.has(entry)),
			regressions: regressionsBetween(savedBaseline, freshBaseline),
		};
	} catch {
		return null;
	} finally {
		rmSync(directory, { recursive: true, force: true });
	}
};

/** Fails the run when the second fallow run left nothing to compare against. */
const reportUnmeasurable = () => {
	console.error(
		`\nCould not measure how much of ${baselinePath} still matches a finding: the second fallow run wrote no baseline this could read.`,
	);
	console.error(`  ${freshnessDetail}`);
	console.error('Nothing here gates baseline freshness until that run works again.');
	process.exitCode = 1;
};

/** Fails the run and names the saved entries that match nothing. */
const reportStale = (stale) => {
	console.error(
		`\n${stale.length} entries in ${baselinePath} match no current finding, and more than ${STALE_ENTRY_LIMIT} fails.`,
	);
	console.error(
		'This is not a regression. The complexity those entries stood for has come out, so the baseline is holding open headroom nothing is using, and the next finding in one of these places lands inside it with nothing said.',
	);
	for (const entry of stale.slice(0, STALE_ENTRIES_SHOWN)) console.error(`  ${entry}`);
	if (stale.length > STALE_ENTRIES_SHOWN)
		console.error(`  and ${stale.length - STALE_ENTRIES_SHOWN} more`);
	console.error(
		'Re-save it with `pnpm fallow:baseline` and read the diff before committing: a re-save is also how a regression gets buried.',
	);
	process.exitCode = 1;
};

/** The code this run is leaving with, read after every other check has spoken. */
const exitCode = () => process.exitCode ?? 0;

/**
 * The gate's own answer, read last. The first line names the comparison's
 * outcome and this run's exit code, and the last says whose the `✗` count above
 * it is, which is the whole of #941: that count is fallow's and it prints the
 * same either way. This reports and never decides, so nothing here touches the
 * exit code.
 */
const reportVerdict = (regressions) => {
	const named = regressions ?? [];
	console.error(
		`\nfallow:health: ${verdictOutcome(regressions, baselinePath)}. This run exits ${exitCode()}.`,
	);
	for (const regression of named.slice(0, REGRESSIONS_SHOWN)) console.error(`  ${regression}`);
	if (named.length > REGRESSIONS_SHOWN)
		console.error(`  and ${named.length - REGRESSIONS_SHOWN} more`);
	console.error(fallowsCross('count of findings above its threshold'));
};

/**
 * The duplication threshold the config sets, or null when it cannot be read. A
 * config with no `duplicates` block throws its way here rather than being asked
 * about, which is the same answer by a shorter route.
 */
const configuredThreshold = () => {
	try {
		const config = JSON.parse(withoutComments(readFileSync(configPath, 'utf8')));
		const threshold = config.duplicates.threshold;
		return typeof threshold === 'number' ? threshold : null;
	} catch {
		return null;
	}
};

/**
 * The threshold this run was gated against and where it came from, or null when
 * neither place names one. `--threshold` wins, because fallow takes it over the
 * config.
 */
const measuredAgainst = () => {
	const given = flagValue('--threshold');
	if (given === null) {
		const configured = configuredThreshold();
		return configured === null ? null : { value: configured, source: `in ${configPath}` };
	}
	const value = Number(given);
	return Number.isFinite(value) ? { value, source: 'this run was given' } : null;
};

/** The duplication gate's own answer, #941's shape and #971's sentence. */
const reportDuplicationVerdict = () => {
	console.error(
		`\nfallow dupes: ${duplicationOutcome(duplication, measuredAgainst())}. This run exits ${exitCode()}.`,
	);
	console.error(fallowsCross('count of duplicated lines'));
};

/**
 * Fails the run when the guard's own probes answer wrong. They are pure string
 * arithmetic over six argument lists, so this costs nothing and reads ahead of
 * the second fallow spawn.
 */
const reportBrokenProbes = (broken) => {
	console.error(
		`\nfallow:health: ${broken.length} of the guard's own probes answered wrong, so nothing here can say whether this run's flags are ones the regression count is derived under.`,
	);
	for (const failure of broken) console.error(`  ${failure}`);
	console.error('Fix `unmodelledComparisonFlag` in `scripts/lib/fallow-comparison.mjs`.');
	process.exitCode = 1;
};

/**
 * Fails the run rather than judging it, when a flag moves fallow's comparison
 * away from the one re-derived here.
 */
const reportUnmodelled = (flag) => {
	console.error(`\nfallow:health: this run passed ${flag}, and refuses to print a verdict.`);
	console.error(
		"The regressions below a verdict are re-derived here rather than read off fallow, which prints no regression detail on a failing comparison, and the re-derivation is fallow's `count` baseline mode forgiving nothing. Under this flag it would name regressions fallow forgave, or match on something fallow did not, so the verdict and the exit code beside it would disagree, which is the reading error #941 was filed about.",
	);
	console.error(
		'Nothing here gates baseline freshness or regressions on this run. Drop the flag, or teach `unmodelledComparisonFlag` in `scripts/lib/fallow-comparison.mjs` what fallow does under it.',
	);
	process.exitCode = 1;
};

/**
 * #972's guard, read before anything is spawned: whether this run is one the
 * comparison below cannot judge, having already said so and failed the run. The
 * broken-reader case comes first, because a guard that cannot read a flag
 * cannot be trusted to say the flags are fine.
 */
const refusedComparison = () => {
	const broken = probeFailures();
	if (broken.length > 0) {
		reportBrokenProbes(broken);
		return true;
	}
	const unmodelled = unmodelledComparisonFlag(args);
	if (unmodelled === null) return false;
	reportUnmodelled(unmodelled);
	return true;
};

/** The #669 gate and #941's verdict, in that order: the verdict reads last. */
const reportComparison = () => {
	if (refusedComparison()) return;
	const measured = measureBaseline();
	if (measured === null) {
		reportUnmeasurable();
		reportVerdict(null);
		return;
	}
	if (measured.stale.length > STALE_ENTRY_LIMIT) reportStale(measured.stale);
	reportVerdict(measured.regressions);
};

const child = spawn('fallow', args, {
	stdio: ['inherit', 'pipe', 'pipe'],
	shell: true,
	env,
});

/** The staleness warning fallow printed, if it printed one. @type {string | null} */
let warning = null;

const noteIfStale = (line) => {
	if (readsBaseline && STALENESS_PATTERN.test(line)) warning = line.trim();
};

const noteIfDuplication = (line) => {
	if (subcommand !== 'dupes') return;
	const summary = DUPLICATION_PATTERN.exec(line);
	if (summary) duplication = { percentage: Number(summary[2]), files: summary[3] };
};

/** Every line of the child's output goes past both gates' readers. */
const noteLine = (line) => {
	noteIfStale(line);
	noteIfDuplication(line);
};

// Bytes reach the terminal untouched; only whole lines are scanned, so a
// warning split across two chunks is still read.
const scan = (source, terminal) => {
	let carry = '';
	source.on('data', (chunk) => {
		terminal.write(chunk);
		const lines = (carry + chunk).split('\n');
		carry = lines.pop() ?? '';
		for (const line of lines) noteLine(line);
	});
	source.on('end', () => noteLine(carry));
};

scan(child.stdout, process.stdout);
scan(child.stderr, process.stderr);

/** Reprints fallow's staleness warning where the result line is read, and fails. */
const reportStaleWarning = () => {
	console.error(`\n${warning}`);
	console.error(
		'Re-save it with `pnpm fallow:baseline` and read the diff before committing: a re-save is also how a regression gets buried.',
	);
	process.exitCode = 1;
};

/** The verdict this run's subcommand owes, printed under fallow's report. */
const reportOwnVerdict = (code) => {
	// A child killed by a signal analyzed nothing, so there is nothing to measure
	// freshness against and the run is already failing.
	if (code !== null && gatesOnBaseline) reportComparison();
	if (subcommand === 'dupes') reportDuplicationVerdict();
};

// Setting `exitCode` rather than calling `process.exit` lets the writes above
// drain; nothing holds the loop open once the child has closed.
child.on('close', (code) => {
	process.exitCode = exitCodeFor(code);
	if (warning) reportStaleWarning();
	reportOwnVerdict(code);
});
