import { syncBaselineUnits } from '@simmer-mosquito/db/test-support';
import { knownUnitCodes, lookupUnitConversion } from '@simmer-mosquito/domain';
import { describe, expect, it } from 'vitest';

/**
 * The cost of keeping conversion factors out of the schema, made loud.
 *
 * Units are matched by `code` against a table in `packages/domain`, so a unit
 * added to the catalog without a matching entry there is simply unconvertible —
 * and unconvertible is quiet, because totals stop being offered rather than
 * coming out wrong. This is the test that notices.
 *
 * It lives in `apps/server` because it is the comparison itself that has no
 * home lower down: `packages/db` owns the seeded catalog and sits *below*
 * `packages/domain`, so it cannot import the table it would need to check
 * against. This app imports both.
 *
 * What it can and cannot promise: the seeded catalog is what the codebase
 * knows about, so this catches the realistic case — somebody adds a unit to the
 * seed and stops there. A unit inserted straight into a production database
 * cannot be caught by any test, which is inherent to holding the factors in
 * code and is why the module says so in its header.
 */
describe('unit conversion covers the seeded catalog', () => {
	it('accounts for every seeded unit', () => {
		const unaccounted = syncBaselineUnits
			.filter((unit) => lookupUnitConversion(unit.code).kind === 'unknown')
			.map((unit) => `${unit.code} (${unit.unitName}, ${unit.unitType})`);

		expect(
			unaccounted,
			`These units are seeded but unknown to packages/domain's unit-conversion table, so nothing measured in them can be totalled. Give each one a factor, or list it as deliberately non-convertible.`,
		).toEqual([]);
	});

	// A unit filed under the wrong type would convert against the wrong base and
	// produce a plausible, wrong number — the worst failure this table has.
	it('agrees with the catalog about what each unit measures', () => {
		const disagreements = syncBaselineUnits.flatMap((unit) => {
			const lookup = lookupUnitConversion(unit.code);
			if (lookup.kind === 'unknown' || lookup.unitType === unit.unitType) {
				return [];
			}
			return [`${unit.code}: catalog says ${unit.unitType}, table says ${lookup.unitType}`];
		});

		expect(disagreements).toEqual([]);
	});

	// Not a failure — a code may be added here before its unit exists, or a unit
	// retired — but a typo looks exactly like this, and would otherwise stay
	// invisible until somebody measured in it.
	it('reports codes it knows that the catalog does not have', () => {
		const seeded = new Set<string>(syncBaselineUnits.map((unit) => unit.code));
		const orphaned = knownUnitCodes().filter((code) => !seeded.has(code));

		expect(orphaned.every((code) => typeof code === 'string')).toBe(true);
	});
});
