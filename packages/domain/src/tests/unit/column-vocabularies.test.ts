import { describe, expect, it } from 'vitest';
import {
	COLUMN_VOCABULARIES,
	LARVAL_DENSITIES,
	RANGE_DENSITIES,
	SIMMER_ROLES,
} from '../../column-vocabularies.js';

/**
 * The register's own invariants.
 *
 * Its members are held to Postgres by `pnpm check:column-vocabularies` against
 * the schema dump and by `column-vocabularies.integration.test.ts` against
 * `pg_enum`. Neither of those can say anything about a list *derived* from an
 * entry, and every derived list is one a surface reads in order.
 */
describe('the column vocabulary register', () => {
	it('gives Larval Density its bands weakest first', () => {
		// Not alphabetical, not the order they were written. The inspections
		// legend, the density select and the map ramp all read this order, and a
		// scale that reads backwards is wrong in a way no type catches.
		expect(LARVAL_DENSITIES).toEqual(['none', 'light', 'medium', 'heavy', 'very_heavy']);
	});

	it('derives the configured range bands as the density scale without none', () => {
		expect(RANGE_DENSITIES).toEqual(LARVAL_DENSITIES.filter((band) => band !== 'none'));
		expect(RANGE_DENSITIES).not.toContain('none');
	});

	it('gives the role ladder strongest first', () => {
		expect(SIMMER_ROLES).toEqual(['owner', 'admin', 'manager', 'collector', 'viewer']);
	});

	it('holds every entry once, with no repeated member inside one', () => {
		const arrays = Object.values(COLUMN_VOCABULARIES);

		for (const members of arrays) {
			expect(new Set(members).size).toBe(members.length);
		}

		// Two SQL names pointing at one array would make a rename look harmless.
		expect(new Set(arrays).size).toBe(arrays.length);
	});
});
