/**
 * The comparison `pnpm fallow:health` and `pnpm fallow dupes` report through.
 *
 * Until this file the evidence that any of it worked was that the gate printed
 * a plausible line, which cannot tell a correct comparison from one that reads
 * nothing: a `findingCounts` that returned an empty map would report no
 * regression on every branch, under the same wording a clean run prints. The
 * functions lived in `scripts/fallow.mjs`, which spawns fallow on import, so
 * nothing could import them and nothing could ask.
 *
 * The guard is the other half. `unmodelledComparisonFlag` refuses a run whose
 * flags move fallow off the comparison the wrapper re-derives, and it fires on
 * a flag nothing in the workspace passes, so its own probes are the only thing
 * that can say it still reads one.
 */

import { describe, expect, it } from 'vitest';
import {
	baselineEntries,
	duplicationOutcome,
	fallowsCross,
	findingCounts,
	flagValue,
	freshnessArgs,
	type HealthBaseline,
	PROBES,
	probeFailures,
	regressionsBetween,
	standing,
	unmodelledComparisonFlag,
	verdictOutcome,
	withoutComments,
} from '../../../../lib/fallow-comparison.mjs';

/** A baseline carrying one finding per file and category named, at the count given. */
const baseline = (counts: Record<string, Record<string, number>>, targets: string[] = []) =>
	({
		finding_counts: Object.fromEntries(
			Object.entries(counts).map(([file, categories]) => [
				file,
				Object.fromEntries(
					Object.entries(categories).map(([category, count]) => [category, { count }]),
				),
			]),
		),
		target_keys: targets,
	}) satisfies HealthBaseline;

describe('flagValue', () => {
	it('reads the value after the flag', () => {
		expect(flagValue(['health', '--baseline', 'health.json'], '--baseline')).toBe('health.json');
	});

	it('reads the value out of the one-argument spelling', () => {
		expect(flagValue(['health', '--baseline=health.json'], '--baseline')).toBe('health.json');
	});

	it('answers null for a flag this run did not pass', () => {
		expect(flagValue(['health'], '--baseline')).toBeNull();
	});

	it('answers null for a flag passed with nothing after it', () => {
		expect(flagValue(['health', '--baseline'], '--baseline')).toBeNull();
	});

	// The whole-name match is the reason `--baseline-mode` and `--baseline` are
	// two flags to both halves of the reader rather than one prefix.
	it('does not read a longer flag that starts with the name', () => {
		expect(flagValue(['health', '--baseline-mode', 'identity'], '--baseline')).toBeNull();
		expect(flagValue(['health', '--baseline-mode=identity'], '--baseline')).toBeNull();
	});
});

describe('freshnessArgs', () => {
	it('keeps the scope flags and drops the comparison, valued flags with their values', () => {
		expect(
			freshnessArgs(
				[
					'health',
					'--workspace',
					'packages/db',
					'--baseline',
					'health.json',
					'--baseline-mode',
					'count',
					'--fail-on-regression',
				],
				'/tmp/fresh.json',
			),
		).toEqual([
			'health',
			'--workspace',
			'packages/db',
			'--save-baseline',
			'/tmp/fresh.json',
			'--quiet',
		]);
	});

	it('drops the one-argument spelling of both comparison flags', () => {
		expect(
			freshnessArgs(['health', '--baseline=health.json', '--baseline-mode=count'], '/tmp/f.json'),
		).toEqual(['health', '--save-baseline', '/tmp/f.json', '--quiet']);
	});

	// The child is spawned through a shell, which splits on the space in a
	// Windows temp path such as `C:\Users\Some One\AppData\Local\Temp`.
	it('quotes a destination with a space in it, and leaves one without alone', () => {
		expect(freshnessArgs(['health'], 'C:\\Some One\\health.json')).toContain(
			'"C:\\Some One\\health.json"',
		);
		expect(freshnessArgs(['health'], 'C:\\SomeOne\\health.json')).toContain(
			'C:\\SomeOne\\health.json',
		);
	});
});

describe('baselineEntries', () => {
	it('names one entry per file and category, and one per refactoring target', () => {
		expect(
			baselineEntries(baseline({ 'a.ts': { crap_high: 1, crap_moderate: 4 } }, ['a.ts::run'])),
		).toEqual(['a.ts (crap_high)', 'a.ts (crap_moderate)', 'refactoring target a.ts::run']);
	});

	// Identity and never the count: a saved entry whose count happens to match a
	// different finding is exactly what a stale entry looks like.
	it('names the same entry whatever the count is', () => {
		expect(baselineEntries(baseline({ 'a.ts': { crap_high: 1 } }))).toEqual(
			baselineEntries(baseline({ 'a.ts': { crap_high: 99 } })),
		);
	});

	it('reads a baseline carrying neither key as empty', () => {
		expect(baselineEntries({})).toEqual([]);
	});
});

describe('findingCounts', () => {
	it('keys the count the way baselineEntries names it', () => {
		expect([...findingCounts(baseline({ 'a.ts': { crap_high: 3 } }))]).toEqual([
			['a.ts (crap_high)', 3],
		]);
	});

	it('reads a baseline with no finding_counts as empty', () => {
		expect(findingCounts({}).size).toBe(0);
	});
});

describe('regressionsBetween', () => {
	it('names a count that went up, with both numbers', () => {
		expect(
			regressionsBetween(
				baseline({ 'a.ts': { crap_high: 1 } }),
				baseline({ 'a.ts': { crap_high: 3 } }),
			),
		).toEqual(['a.ts (crap_high) 1 to 3']);
	});

	it('counts a key the saved baseline does not carry from zero', () => {
		expect(regressionsBetween(baseline({}), baseline({ 'new.ts': { crap_moderate: 2 } }))).toEqual([
			'new.ts (crap_moderate) 0 to 2',
		]);
	});

	it('names nothing when every count is the same', () => {
		const same = baseline({ 'a.ts': { crap_high: 1 }, 'b.ts': { crap_moderate: 4 } });
		expect(regressionsBetween(same, same)).toEqual([]);
	});

	it('names nothing when a count came down', () => {
		expect(
			regressionsBetween(
				baseline({ 'a.ts': { crap_high: 5 } }),
				baseline({ 'a.ts': { crap_high: 2 } }),
			),
		).toEqual([]);
	});

	// A file cleaned out of the tree is a stale entry, which is the freshness
	// gate's finding, and never a regression.
	it('names nothing for a key the fresh baseline dropped', () => {
		expect(regressionsBetween(baseline({ 'gone.ts': { crap_high: 9 } }), baseline({}))).toEqual([]);
	});

	// Refactoring targets are recommendations rather than findings, so they are
	// in `baselineEntries` and deliberately out of the count.
	it('ignores refactoring targets', () => {
		expect(regressionsBetween(baseline({}, []), baseline({}, ['a.ts::run', 'b.ts::run']))).toEqual(
			[],
		);
	});
});

describe('unmodelledComparisonFlag', () => {
	it('passes the gate as `pnpm fallow:health` runs it', () => {
		expect(
			unmodelledComparisonFlag([
				'health',
				'--baseline',
				'.fallow-baseline/health.json',
				'--fail-on-regression',
			]),
		).toBeNull();
	});

	it('passes the two values the re-derivation models, written out', () => {
		expect(unmodelledComparisonFlag(['health', '--baseline-mode', 'count'])).toBeNull();
		expect(unmodelledComparisonFlag(['health', '--tolerance', '0'])).toBeNull();
	});

	it('refuses a baseline mode it does not model, in either spelling', () => {
		expect(unmodelledComparisonFlag(['health', '--baseline-mode', 'identity'])).toBe(
			'--baseline-mode identity',
		);
		expect(unmodelledComparisonFlag(['health', '--baseline-mode=identity'])).toBe(
			'--baseline-mode identity',
		);
	});

	it('refuses a tolerance that forgives what it would name', () => {
		expect(unmodelledComparisonFlag(['health', '--tolerance', '2'])).toBe('--tolerance 2');
	});

	// Nothing here knows what fallow made of a tolerance that is not a number,
	// so it is refused rather than read as the default.
	it('refuses a tolerance that is not a number', () => {
		expect(unmodelledComparisonFlag(['health', '--tolerance', 'lots'])).toBe('--tolerance lots');
	});
});

describe('the guard probes', () => {
	it('answers every one of its own probes correctly', () => {
		expect(probeFailures()).toEqual([]);
	});

	// Three yeses and three noes: a guard refusing everything would pass a probe
	// set that only held refusals.
	it('holds both answers', () => {
		expect(PROBES.filter((probe) => probe.expected === null).length).toBeGreaterThanOrEqual(3);
		expect(PROBES.filter((probe) => probe.expected !== null).length).toBeGreaterThanOrEqual(3);
	});
});

describe('verdictOutcome', () => {
	it('says no regression when there is none', () => {
		expect(verdictOutcome([], 'health.json')).toBe('no regression against health.json');
	});

	it('counts one regression in the singular', () => {
		expect(verdictOutcome(['a.ts (crap_high) 1 to 2'], 'health.json')).toBe(
			'1 regression against health.json',
		);
	});

	it('counts more than one in the plural', () => {
		expect(verdictOutcome(['a', 'b'], 'health.json')).toBe('2 regressions against health.json');
	});

	// Null is the run whose fresh baseline could not be read, which has already
	// failed by the time the verdict is asked.
	it('points at the failure above it when nothing could be counted', () => {
		expect(verdictOutcome(null, 'health.json')).toBe(
			'the comparison against health.json could not be counted here, for the reason above',
		);
	});
});

describe('fallowsCross', () => {
	it('takes the noun for whatever fallow counted', () => {
		expect(fallowsCross('count of duplicated lines')).toContain(
			"fallow's own count of duplicated lines",
		);
		expect(fallowsCross('count of findings above its threshold')).toContain(
			"fallow's own count of findings above its threshold",
		);
	});
});

describe('standing', () => {
	it('reads the two numbers and never an exit code', () => {
		expect(standing(4.7, 5)).toBe('under');
		expect(standing(4.7, 1)).toBe('over');
		expect(standing(5, 5)).toBe('level with');
	});
});

describe('duplicationOutcome', () => {
	const measured = { percentage: 4.7, files: '408' };

	it('names the percentage, the files, the standing and where the threshold came from', () => {
		expect(duplicationOutcome(measured, { value: 5, source: 'in .fallowrc.jsonc' })).toBe(
			'4.7% duplicated across 408 files, under the 5.0% threshold in .fallowrc.jsonc',
		);
	});

	it('says over when the run is above the threshold it was given', () => {
		expect(duplicationOutcome(measured, { value: 1, source: 'this run was given' })).toBe(
			'4.7% duplicated across 408 files, over the 1.0% threshold this run was given',
		);
	});

	it('says so when no threshold could be read', () => {
		expect(duplicationOutcome(measured, null)).toBe(
			'4.7% duplicated across 408 files, against a threshold this could not read',
		);
	});

	// Zero is fallow's "do not gate", which is not the same as a threshold
	// nothing could read.
	it('says so when the threshold gates nothing', () => {
		expect(duplicationOutcome(measured, { value: 0, source: 'in .fallowrc.jsonc' })).toBe(
			'4.7% duplicated across 408 files, with no threshold set to gate it',
		);
	});

	it('says so when fallow printed no summary', () => {
		expect(duplicationOutcome(null, { value: 5, source: 'in .fallowrc.jsonc' })).toBe(
			'fallow printed no duplication summary for this to read',
		);
	});
});

describe('withoutComments', () => {
	it('leaves parseable JSON behind for a JSONC config', () => {
		const config = `{
	// The duplication ratchet.
	"duplicates": {
		/* block form too */
		"threshold": 5.0
	}
}`;
		expect(JSON.parse(withoutComments(config)).duplicates.threshold).toBe(5);
	});

	// The masker is written for TypeScript, and a `//` inside a string stays
	// inside a string either way, which is what makes it safe over JSON.
	it('leaves a comment marker inside a string alone', () => {
		expect(JSON.parse(withoutComments('{ "note": "https://example.test" }')).note).toBe(
			'https://example.test',
		);
	});

	it('leaves a config with no comments byte for byte', () => {
		expect(withoutComments('{"threshold":5}')).toBe('{"threshold":5}');
	});
});
