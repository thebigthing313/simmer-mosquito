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
// count is measured here rather than read off fallow, which prints no regression
// detail at all, only the exit code; the measurement is fallow's own `count`
// mode, a comparison per file and finding category, against the fresh baseline
// the freshness check below already saves. Refactoring targets are left out of
// it, being recommendations rather than findings. The verdict reports and never
// decides: every exit code here is what it was before.
//
// The freshness half is #669, and it is the gate under fallow's quarter. Below
// that line fallow says nothing, so a baseline could carry any number of
// entries matching nothing and every one of them was headroom a new finding
// could land inside in silence. #605 was five of 166, three percent, and sat
// until a person read the file. So a gating run counts the stale entries
// itself, by saving a second baseline off the same tree and asking which of the
// checked-in entries the fresh one no longer names.
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const args = process.argv.slice(2);
const readsBaseline = args.includes('--baseline');
const STALENESS_PATTERN = /health baseline is partially stale: \d+ of \d+ entries/;

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

// The path `--save-baseline` was given, in either spelling fallow accepts, or
// null when this run saves nothing.
const savesBaseline = (() => {
	const flag = args.indexOf('--save-baseline');
	if (flag >= 0) return args[flag + 1] ?? null;
	const inline = args.find((arg) => arg.startsWith('--save-baseline='));
	return inline ? inline.slice('--save-baseline='.length) : null;
})();

// The path `--baseline` was given, in either spelling, or null when this run
// compares against nothing.
const baselinePath = (() => {
	const flag = args.indexOf('--baseline');
	if (flag >= 0) return args[flag + 1] ?? null;
	const inline = args.find((arg) => arg.startsWith('--baseline='));
	return inline ? inline.slice('--baseline='.length) : null;
})();

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

/**
 * What one baseline entry is named by, as a list of strings. Identity and never
 * the count: a saved entry whose count happens to match a different finding is
 * exactly what a stale entry looks like, so the count is not read at all.
 *
 * `finding_counts` is keyed by file and then by category, `crap_high` and its
 * six neighbours, which is the pair `--baseline-mode count` matches on.
 * `target_keys` is the refactoring targets, already one string each.
 * `runtime_coverage_findings` is deliberately not counted: it is empty in every
 * baseline this workspace has saved, so nothing here knows what identifies one,
 * and guessing would report entries that are fine. That leaves this able to
 * under-report and never to invent, which is the safe half to be wrong on.
 */
const baselineEntries = (baseline) => [
	...Object.entries(baseline.finding_counts ?? {}).flatMap(([file, categories]) =>
		Object.keys(categories).map((category) => `${file} (${category})`),
	),
	...(baseline.target_keys ?? []).map((key) => `refactoring target ${key}`),
];

// The flags that say this run compares against a baseline. The first two carry
// the value after them, so that value comes off with the flag; the third stands
// alone. Both spellings fallow accepts are covered, since `--baseline=path` is
// one argument.
const VALUED_COMPARISON_FLAGS = new Set(['--baseline', '--baseline-mode']);
const COMPARISON_FLAGS = new Set([...VALUED_COMPARISON_FLAGS, '--fail-on-regression']);
const INLINE_COMPARISON_FLAG = /^--baseline(-mode)?=/;

/** Whether `args[index]` belongs to this run's comparison rather than its scope. */
const isComparisonArg = (index) =>
	COMPARISON_FLAGS.has(args[index]) ||
	INLINE_COMPARISON_FLAG.test(args[index]) ||
	VALUED_COMPARISON_FLAGS.has(args[index - 1]);

/**
 * The arguments that save a baseline off the same tree the gating run reads.
 * Derived from this run's own arguments rather than written out, so a scope
 * flag such as `--workspace` reaches both halves and the two are measured over
 * the same corpus. Only the comparison flags come off, since there is nothing
 * to compare against yet.
 */
const freshnessArgs = (destination) => {
	// Quoted because the child is spawned through a shell, which splits on the
	// space in a temp path such as `C:\Users\Some One\AppData\Local\Temp`.
	const quoted = /\s/.test(destination) ? `"${destination}"` : destination;
	const scope = args.filter((_, index) => !isComparisonArg(index));
	return [...scope, '--save-baseline', quoted, '--quiet'];
};

/** What the second run said, kept for the message when it wrote nothing usable. */
let freshnessDetail = 'the second fallow run did not start';

/** One line naming how the second run ended, for a failure a reader has to act on. */
const describeRun = (run) => {
	const output = `${run.stderr ?? ''}`.trim();
	return `fallow exited ${run.status}${output ? `, saying: ${output}` : ' and said nothing'}`;
};

/**
 * How many findings each file and category carries, keyed the way
 * `baselineEntries` names them. This is the pair `--baseline-mode count`
 * matches on, and the count is what the verdict compares: a key whose fresh
 * count is above its saved one is the regression fallow failed the run over.
 */
const findingCounts = (baseline) =>
	new Map(
		Object.entries(baseline.finding_counts ?? {}).flatMap(([file, categories]) =>
			Object.entries(categories).map(([category, finding]) => [
				`${file} (${category})`,
				finding.count,
			]),
		),
	);

/**
 * The findings that have gone up between two baselines, one line each. A key
 * the saved baseline does not carry counts from zero, which is how a file that
 * was clean when the baseline was written reports its first finding.
 */
const regressionsBetween = (saved, fresh) => {
	const before = findingCounts(saved);
	const countBefore = (entry) => before.get(entry) ?? 0;
	return [...findingCounts(fresh)]
		.filter(([entry, count]) => count > countBefore(entry))
		.map(([entry, count]) => `${entry} ${countBefore(entry)} to ${count}`);
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
		const run = spawnSync('fallow', freshnessArgs(destination), {
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
 * What the comparison found, as the clause the verdict opens with. Null is the
 * run whose fresh baseline could not be read, which has already failed above.
 */
const verdictOutcome = (regressions) => {
	if (regressions === null)
		return `the comparison against ${baselinePath} could not be counted here, for the reason above`;
	if (regressions.length === 0) return `no regression against ${baselinePath}`;
	const plural = regressions.length === 1 ? 'regression' : 'regressions';
	return `${regressions.length} ${plural} against ${baselinePath}`;
};

/**
 * The gate's own answer, read last. The first line names the comparison's
 * outcome and this run's exit code, and the last says whose the `✗` count above
 * it is, which is the whole of #941: that count is fallow's and it prints the
 * same either way. This reports and never decides, so nothing here touches the
 * exit code.
 */
const reportVerdict = (regressions) => {
	const named = regressions ?? [];
	console.error(`\nfallow:health: ${verdictOutcome(regressions)}. This run exits ${exitCode()}.`);
	for (const regression of named.slice(0, REGRESSIONS_SHOWN)) console.error(`  ${regression}`);
	if (named.length > REGRESSIONS_SHOWN)
		console.error(`  and ${named.length - REGRESSIONS_SHOWN} more`);
	console.error(
		"The ✗ line above is fallow's own count of findings above its threshold. It prints the same on a run that passes this comparison and one that fails it, so it is not this gate's answer.",
	);
};

/** The #669 gate and #941's verdict, in that order: the verdict reads last. */
const reportComparison = () => {
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

// Bytes reach the terminal untouched; only whole lines are scanned, so a
// warning split across two chunks is still read.
const scan = (source, terminal) => {
	let carry = '';
	source.on('data', (chunk) => {
		terminal.write(chunk);
		const lines = (carry + chunk).split('\n');
		carry = lines.pop() ?? '';
		for (const line of lines) noteIfStale(line);
	});
	source.on('end', () => noteIfStale(carry));
};

scan(child.stdout, process.stdout);
scan(child.stderr, process.stderr);

// Setting `exitCode` rather than calling `process.exit` lets the writes above
// drain; nothing holds the loop open once the child has closed.
child.on('close', (code) => {
	process.exitCode = exitCodeFor(code);

	if (warning) {
		console.error(`\n${warning}`);
		console.error(
			'Re-save it with `pnpm fallow:baseline` and read the diff before committing: a re-save is also how a regression gets buried.',
		);
		process.exitCode = 1;
	}

	// A child killed by a signal analyzed nothing, so there is nothing to measure
	// freshness against and the run is already failing.
	if (code !== null && gatesOnBaseline) reportComparison();
});
