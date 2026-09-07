/**
 * The frame the three style gates run in.
 *
 * `check-vocabulary.mjs`, `check-prose.mjs` and `check-copy-dashes.mjs` each
 * hold one rule at zero with no allowance list, and each lets one line out of
 * it with a marker on the line above. The rule differs and the corpus differs.
 * The frame does not, and it was written out three times until the third copy
 * tripped the duplication ratchet.
 *
 * What is here is the part that is the same in all three: sweeping a file for
 * markers, judging a reason, pairing markers against findings in both
 * directions, and the two counters the messages are written with. What is not
 * here is anything a gate decides for itself. Which lines are swept, what a
 * marker says after its word, what counts as a finding and what each message
 * reads are all the caller's.
 *
 * ## Two rules on a marker, and why both
 *
 * A marker is one line. #291 is the trap: a `biome-ignore` whose reason wrapped
 * onto a second line silently stopped suppressing, and nothing said so. A
 * reason that has to end in a full stop makes the first line of a wrapped one
 * fail at the marker, naming it.
 *
 * A marker that exempts nothing fails. An unused allowance is headroom the next
 * violation lands inside, which is the `fallow` baseline failure `CLAUDE.md`
 * describes, and a count of excused lines could say neither which nor why.
 */

// ---------------------------------------------------------------------------
// The markers
// ---------------------------------------------------------------------------

/**
 * Every marker in one file, well formed or not, and the line each is above.
 *
 * The sweep is for the word anywhere on a line rather than for the marker
 * shape, because a marker that does not parse is the case worth catching.
 * Somebody wrote it meaning to excuse something, and collecting only the ones
 * that match would report the line below as unmarked with nothing saying why.
 *
 * Which lines are swept is the caller's. `check-prose` sweeps the masked
 * markdown, so a marker written inside a code span to show a reader how to type
 * one is not a marker.
 *
 * @param {readonly string[]} sweep Lines searched for `word`, and the lines `target` counts over.
 * @param {string} word The word that opens a marker.
 * @param {(at: number) => object} read One marker, by zero-based line, as `{ reason }` or `{ problem }`.
 * @returns {Array<{ line: number, target: number }>} With one-based line numbers.
 */
export function markersIn(sweep, word, read) {
	return sweep.flatMap((line, at) =>
		line.includes(word)
			? [{ line: at + 1, target: targetOf(sweep, at, word) + 1, ...read(at) }]
			: [],
	);
}

/**
 * The line a marker is above: the first one below it that is not another
 * marker.
 *
 * Markers stack, because one line can carry two findings and each needs its own
 * reason. Nothing else may come between: a blank line or an ordinary comment
 * under a marker makes it exempt that line instead, and it then exempts
 * nothing, which is the failure below.
 */
function targetOf(sweep, at, word) {
	let target = at + 1;
	while (target < sweep.length && sweep[target].includes(word)) {
		target += 1;
	}
	return target;
}

/**
 * The reason a marker gives, with whatever closed the comment around it taken
 * off.
 *
 * A `//` marker ends at the newline and needs nothing, but the same word inside
 * a `/* ... *\/` or a `{/* ... *\/}` carries the closing delimiters into the
 * match, and a reason ending in `. *\/` does not end in a full stop.
 */
export const reasonOf = (text) => text.replace(/\*\/\s*\}?\s*$/, '').trim();

/** What is wrong with a marker's reason, or `null` when nothing is. */
export function reasonProblem(reason) {
	if (reason.split(/\s+/).filter((word) => word.length > 0).length < 3) {
		return 'it carries no reason, and the reason is the point of a marker';
	}
	if (!reason.endsWith('.')) {
		return 'its reason does not end in a full stop, which is what the first line of a wrapped reason looks like. A marker is one line';
	}
	return null;
}

/**
 * Whether one marker excuses one finding: well formed, and the line right above
 * it.
 *
 * Not exported, because `check-vocabulary` answers it differently. Its marker
 * names a refused word after it, so a marker over the right line and the wrong
 * word exempts nothing there, and it keeps its own `exempts` and its own
 * reporting for that.
 */
const exempts = (marker, finding) => marker.problem === undefined && marker.target === finding.line;

// ---------------------------------------------------------------------------
// Reporting
// ---------------------------------------------------------------------------

/**
 * Everything wrong across the files, or the summary line when nothing is.
 *
 * Both directions, because a gate at zero with no allowance list has two ways
 * to be wrong: a finding nothing excuses, and a marker excusing nothing.
 *
 * The two dash gates are the callers. `check-vocabulary` keeps its own, because
 * a marker there names a word and has to diagnose which of two ways it missed,
 * and it reports a third thing the other two have no equivalent of: a comment
 * written between two tags, which renders on screen.
 *
 * @param {Array<{ findings: object[], markers: object[], lines: string[] }>} files
 * @param {{ unmarked: (finding: object, lines: string[]) => string, stale: (marker: object) => string }} messages
 * @param {() => void} announce What to print when there is nothing to report.
 */
export function report(files, messages, announce) {
	const problems = files.flatMap((file) => problemsIn(file, messages));

	if (problems.length === 0) {
		announce();
		return;
	}

	console.error(problems.join('\n\n'));
	process.exit(1);
}

/**
 * A finding no marker excuses, and a marker excusing no finding, paired one to
 * one.
 *
 * One to one is the whole of it. Markers stack because a line can carry two
 * findings, so "some marker is over this line" and "some finding is under this
 * marker" both answer yes for two markers over one finding, and the spare
 * marker excuses nothing while nothing says so. That is the headroom a marker
 * is supposed to be incapable of. So each marker claims at most one finding and
 * each finding is claimed at most once, and whatever is left over on either
 * side gets reported.
 */
function problemsIn(file, messages) {
	const claimed = new Set();
	const excused = (finding) => claim(file.markers, finding, claimed);

	return [
		...file.findings
			.filter((finding) => !excused(finding))
			.map((finding) => messages.unmarked(finding, file.lines)),
		...file.markers.filter((marker) => !claimed.has(marker)).map(messages.stale),
	];
}

/** The first marker over this finding that has not already excused another one. */
function claim(markers, finding, claimed) {
	const marker = markers.find((each) => exempts(each, finding) && !claimed.has(each));
	if (marker === undefined) {
		return false;
	}
	claimed.add(marker);
	return true;
}

/** How many lines a marker excused, which every summary line ends with. */
export const markersAcross = (files) =>
	files.reduce((total, file) => total + file.markers.length, 0);

/** A line of a file, short enough to sit under a message. */
export const trim = (line) => (line.length > 100 ? `${line.slice(0, 100)}...` : line);

/** A count and its noun, pluralized the one way English is regular. */
export const count = (total, noun) => `${total} ${noun}${total === 1 ? '' : 's'}`;

/** A gate's refusal to run, which is not a finding and carries no marker. */
export const failure = (gate) => (message) => {
	console.error(`${gate}: ${message}`);
	process.exit(1);
};
