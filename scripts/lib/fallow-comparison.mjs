/**
 * The deciding half of `scripts/fallow.mjs`: what fallow compared, what moved
 * between two baselines, and the sentences the two verdicts read.
 *
 * It lives here because the wrapper spawns fallow on import, so nothing can
 * import it and nothing could test it. #941 put three pure functions in the
 * wrapper and #971 put five more there, and the evidence that any of them
 * worked was that the gate printed a plausible line. This is the split the
 * contrast guard in `packages/ui-web` already makes: the module is JavaScript
 * because every gate under `scripts/` is, the suite reaches it through the
 * hand-written `fallow-comparison.d.mts` beside it, and that declaration emits
 * nothing and sits outside the vitest project's `rootDir` without complaint.
 *
 * **The rule for what is in here: a function moves when it is total in its
 * arguments and answers a question about the comparison.** What fallow was
 * scoped over, what it matched on, what regressed, and what the verdict says
 * about it. Everything that spawns a process, reads the filesystem, reads
 * `process.argv` or `process.exitCode`, or mutates the wrapper's line-scanning
 * state stays in the wrapper. That leaves one function behind that is pure and
 * could have come: `describeRun`, which formats a `spawnSync` result into the
 * failure message. It is total in its argument and fails the second half of the
 * rule, being about the spawn rather than about the comparison.
 *
 * The guard is #972's other half. The wrapper re-derives fallow's comparison
 * rather than reading its answer, because fallow prints no regression detail on
 * a failing comparison, only an exit code. `regressionsBetween` is fallow's
 * `count` baseline mode written out again, a comparison per file and finding
 * category, and it forgives nothing, which is `--tolerance 0`. It reads neither
 * flag, and nothing in the workspace passes either, so the assumption holds
 * today and nothing says when it stops.
 *
 * **The two flags are guarded for different reasons, and only one of them is a
 * live disagreement.** `--baseline-mode identity` is, measured on fallow
 * 3.14.0: a baseline saved under it carries a second key,
 * `identity_finding_counts`, keyed by file, function name and category, and
 * that is what fallow compares in identity mode. `findingCounts` below reads
 * `finding_counts` and never that key, so a baseline whose identity counts
 * regressed and whose file-and-category counts did not makes fallow exit 1
 * while the verdict reads `no regression`, which is #941's reading error
 * produced rather than argued.
 *
 * `--tolerance` is not that yet. fallow documents it as the allowed issue-count
 * increase before `--fail-on-regression` flags one, and `pnpm fallow:health`
 * passes that flag, but measured against a baseline holding a two-count
 * regression the run exits 1 at `--tolerance 0`, `2` and `100` alike, so on
 * 3.14.0 the flag does not reach the `--baseline` comparison at all. The two
 * therefore agree by accident rather than by design, which is the reason to
 * guard it: a fallow release that wires the flag up moves fallow and leaves the
 * re-derivation where it was, and the failure would be quiet and later.
 *
 * So `unmodelledComparisonFlag` refuses such a run rather than judging it, and
 * `PROBES` is what keeps that refusal honest.
 */

// Aliased so the name says which scan this is: the wrapper has one of its own
// over the child's streams.
import { scan as scanSource } from './masked-source.mjs';

/**
 * The value `args` gave `flag`, in either spelling fallow accepts, or null when
 * they did not give it one. `--baseline-mode` is a different flag from
 * `--baseline` to both halves, since the name is matched whole.
 */
export const flagValue = (args, flag) => {
	const at = args.indexOf(flag);
	if (at >= 0) return args[at + 1] ?? null;
	const inline = args.find((arg) => arg.startsWith(`${flag}=`));
	return inline ? inline.slice(flag.length + 1) : null;
};

// The flags that say this run compares against a baseline. The first two carry
// the value after them, so that value comes off with the flag; the third stands
// alone. Both spellings fallow accepts are covered, since `--baseline=path` is
// one argument.
const VALUED_COMPARISON_FLAGS = new Set(['--baseline', '--baseline-mode']);
const COMPARISON_FLAGS = new Set([...VALUED_COMPARISON_FLAGS, '--fail-on-regression']);
const INLINE_COMPARISON_FLAG = /^--baseline(-mode)?=/;

/** Whether `args[index]` belongs to this run's comparison rather than its scope. */
const isComparisonArg = (args, index) =>
	COMPARISON_FLAGS.has(args[index]) ||
	INLINE_COMPARISON_FLAG.test(args[index]) ||
	VALUED_COMPARISON_FLAGS.has(args[index - 1]);

/**
 * The arguments that save a baseline off the same tree the gating run reads.
 * Derived from that run's own arguments rather than written out, so a scope
 * flag such as `--workspace` reaches both halves and the two are measured over
 * the same corpus. Only the comparison flags come off, since there is nothing
 * to compare against yet.
 */
export const freshnessArgs = (args, destination) => {
	// Quoted because the child is spawned through a shell, which splits on the
	// space in a temp path such as `C:\Users\Some One\AppData\Local\Temp`.
	const quoted = /\s/.test(destination) ? `"${destination}"` : destination;
	const scope = args.filter((_, index) => !isComparisonArg(args, index));
	return [...scope, '--save-baseline', quoted, '--quiet'];
};

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
export const baselineEntries = (baseline) => [
	...Object.entries(baseline.finding_counts ?? {}).flatMap(([file, categories]) =>
		Object.keys(categories).map((category) => `${file} (${category})`),
	),
	...(baseline.target_keys ?? []).map((key) => `refactoring target ${key}`),
];

/**
 * How many findings each file and category carries, keyed the way
 * `baselineEntries` names them. This is the pair `--baseline-mode count`
 * matches on, and the count is what the verdict compares: a key whose fresh
 * count is above its saved one is the regression fallow failed the run over.
 */
export const findingCounts = (baseline) =>
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
export const regressionsBetween = (saved, fresh) => {
	const before = findingCounts(saved);
	const countBefore = (entry) => before.get(entry) ?? 0;
	return [...findingCounts(fresh)]
		.filter(([entry, count]) => count > countBefore(entry))
		.map(([entry, count]) => `${entry} ${countBefore(entry)} to ${count}`);
};

/** The baseline mode `regressionsBetween` is `--baseline-mode count` written out again. */
const MODELLED_BASELINE_MODE = 'count';

/** The tolerance it forgives, which is none of it, and fallow's own default. */
const MODELLED_TOLERANCE = 0;

/**
 * The flag this run passed that the regression count is not derived under, as
 * the words to put in front of a reader, or null when the assumptions hold.
 *
 * Both flags are checked by value rather than by presence, so writing out what
 * the re-derivation already assumes is not a refusal: `--baseline-mode count`
 * and `--tolerance 0` are what it does. A tolerance that is not a number is
 * refused for the same reason the others are: nothing here knows what fallow
 * made of it. The header has the measurement behind each half.
 */
export const unmodelledComparisonFlag = (args) => {
	const mode = flagValue(args, '--baseline-mode');
	if (mode !== null && mode !== MODELLED_BASELINE_MODE) return `--baseline-mode ${mode}`;
	const tolerance = flagValue(args, '--tolerance');
	if (tolerance !== null && Number(tolerance) !== MODELLED_TOLERANCE)
		return `--tolerance ${tolerance}`;
	return null;
};

/**
 * Argument lists with known answers, handed to `unmodelledComparisonFlag` on
 * every gating run.
 *
 * This is a probe and not a floor, and no count can replace it. The guard fires
 * only on a flag, nothing in the workspace passes one, and `pnpm fallow:health`
 * is not one of the gates `pnpm check:all` runs. So a reader that has stopped
 * reading flags prints exactly the verdict a working one prints, over exactly
 * the same counts, and every number the run reports is unchanged. That is the
 * reasoning `check:record-nouns` and `check:compiler-coverage` both give for
 * theirs: the thing to ask is whether the rule still reads a case right, and
 * the corpus cannot be asked.
 *
 * Three yeses and three noes, the noes being the two values the re-derivation
 * does model written out and a run that passes neither flag, because a guard
 * refusing everything would be as broken as one refusing nothing.
 */
export const PROBES = [
	{
		name: 'the gate as `pnpm fallow:health` runs it',
		args: ['health', '--baseline', '.fallow-baseline/health.json', '--fail-on-regression'],
		expected: null,
	},
	{
		name: 'the modelled baseline mode written out',
		args: ['health', '--baseline-mode', 'count', '--baseline', 'health.json'],
		expected: null,
	},
	{
		name: 'the modelled tolerance written out',
		args: ['health', '--tolerance', '0', '--baseline', 'health.json'],
		expected: null,
	},
	{
		name: 'a baseline mode the re-derivation does not model',
		args: ['health', '--baseline', 'health.json', '--baseline-mode', 'identity'],
		expected: '--baseline-mode identity',
	},
	{
		name: 'that baseline mode written as one argument',
		args: ['health', '--baseline=health.json', '--baseline-mode=identity'],
		expected: '--baseline-mode identity',
	},
	{
		name: 'a tolerance that forgives what the re-derivation would name',
		args: ['health', '--baseline', 'health.json', '--tolerance', '2'],
		expected: '--tolerance 2',
	},
];

/** The probes the guard answered wrong, one line each. Empty is the working reader. */
export const probeFailures = () =>
	PROBES.filter((probe) => unmodelledComparisonFlag(probe.args) !== probe.expected).map(
		(probe) =>
			`${probe.name}: expected ${probe.expected ?? 'no refusal'}, got ${
				unmodelledComparisonFlag(probe.args) ?? 'no refusal'
			}`,
	);

/**
 * What the comparison found, as the clause the health verdict opens with. Null
 * regressions is the run whose fresh baseline could not be read, which has
 * already failed by the time this is asked.
 */
export const verdictOutcome = (regressions, baselinePath) => {
	if (regressions === null)
		return `the comparison against ${baselinePath} could not be counted here, for the reason above`;
	if (regressions.length === 0) return `no regression against ${baselinePath}`;
	const plural = regressions.length === 1 ? 'regression' : 'regressions';
	return `${regressions.length} ${plural} against ${baselinePath}`;
};

/**
 * The sentence both verdicts end on, taking the noun for whatever fallow
 * counted. It is the one thing the two gates share, and #971's answer to
 * whether one function serves both: what fallow counted differs between them,
 * and that its cross prints either way does not.
 */
export const fallowsCross = (counted) =>
	`The ✗ line above is fallow's own ${counted}. It prints the same on a run that passes this comparison and one that fails it, so it is not this gate's answer.`;

/**
 * How the measured percentage sits against the threshold, as one word. Read off
 * the two numbers and never off the exit code, so a run that fails for some
 * other reason says `under` and names the exit code beside it.
 */
export const standing = (measured, threshold) => {
	if (measured > threshold) return 'over';
	if (measured < threshold) return 'under';
	return 'level with';
};

/**
 * What the duplication run measured, as the clause that verdict opens with.
 * `duplication` is the percentage and file count read off fallow's own summary,
 * or null when it printed none; `threshold` is the number this run was gated
 * against and where it came from, or null when neither place named one.
 */
export const duplicationOutcome = (duplication, threshold) => {
	if (duplication === null) return 'fallow printed no duplication summary for this to read';
	const measured = `${duplication.percentage}% duplicated across ${duplication.files} files`;
	if (threshold === null) return `${measured}, against a threshold this could not read`;
	if (threshold.value === 0) return `${measured}, with no threshold set to gate it`;
	const word = standing(duplication.percentage, threshold.value);
	return `${measured}, ${word} the ${threshold.value.toFixed(1)}% threshold ${threshold.source}`;
};

/**
 * `source` with its comment spans removed, so `JSON.parse` can read a JSONC
 * config. The shared masker is written for TypeScript, which costs nothing
 * here: JSON is a subset of what it walks, and a `//` inside a string stays
 * inside a string either way.
 */
export const withoutComments = (source) => {
	let code = '';
	let from = 0;
	for (const comment of scanSource(source).comments) {
		code += source.slice(from, comment.index);
		from = comment.end;
	}
	return code + source.slice(from);
};
