/**
 * The body of a table command, as a type and as a reading.
 *
 * Two halves, and the first one runs at compile time. `CommandPayload` is what
 * makes a column name a question `tsc` answers, so the assertions about it are
 * `@ts-expect-error` lines: each one fails the build if the key it names starts
 * compiling. That direction matters. A test that only proved the good keys work
 * would pass just as well against `Record<string, unknown>`, which is what this
 * replaced (#426).
 *
 * It answers two questions, and the second is the columns the server owns.
 * `ColumnOf` subtracts them, so `payload.organization_id` is a build error
 * rather than a caller naming another organization's id (#478).
 *
 * The second half is `acknowledged`, which used to answer `!== false` while six
 * call sites spelled `=== true` by hand. One reader now, and the posture is a
 * property of the flag.
 */

import { ACKNOWLEDGEMENTS } from '@simmer-mosquito/domain';
import { describe, expect, it } from 'vitest';
import { EXPLICIT_ACKNOWLEDGEMENTS } from '../../acknowledgements.js';
import { acknowledged, type CommandPayload } from '../../command-payload.js';

describe('a command payload names its table columns', () => {
	const habitat = {} as CommandPayload<'habitats', 'locationSource'>;

	it('reads a column of its own table', () => {
		expect(habitat.habitat_name).toBeUndefined();
		expect(habitat.habitat_type_id).toBeUndefined();
	});

	it('reads a declared argument and any acknowledgement', () => {
		expect(habitat.locationSource).toBeUndefined();
		expect(habitat.acknowledgedHabitatDelete).toBeUndefined();
	});

	/*
	 * The five the compiler has to refuse. Each line is the assertion: if the
	 * property starts resolving, `tsc` fails on the unused `@ts-expect-error`,
	 * which is the mutation check this file exists to be. Deleting the union from
	 * `CommandPayload` turns all five green and the build red.
	 */
	it('refuses a key its table has no column for', () => {
		// @ts-expect-error `habitat_names` is a misspelling, which used to read undefined
		expect(habitat.habitat_names).toBeUndefined();
		// @ts-expect-error `trap_code` is a column of `traps`
		expect(habitat.trap_code).toBeUndefined();
		// @ts-expect-error `sourceHabitatIds` is a real argument this payload did not declare
		expect(habitat.sourceHabitatIds).toBeUndefined();
		// @ts-expect-error `acknowledgedHabitatDelet` is not in the vocabulary
		expect(habitat.acknowledgedHabitatDelet).toBeUndefined();
	});

	/*
	 * Same mutation check for the columns the server owns: dropping the
	 * `Exclude` in `ColumnOf` turns these four green and the build red.
	 */
	it('refuses a column the server owns', () => {
		// @ts-expect-error tenancy comes from `AuthContext`, never from a body
		expect(habitat.organization_id).toBeUndefined();
		// @ts-expect-error a delete is a named command, not a timestamp arriving
		expect(habitat.deleted_at).toBeUndefined();
		// @ts-expect-error geometry is snapshotted from `locationSource`
		expect(habitat.geom).toBeUndefined();
		// @ts-expect-error the centroid trigger writes it
		expect(habitat.lat).toBeUndefined();
	});

	/*
	 * The two near neighbours that stay. `id` is client-generated, which is what
	 * makes a create replay-safe, and `updated_by_profile_id` arrives from the
	 * client on some tables. Both would compile away silently if the rule in
	 * `scripts/generate-table-types.mjs` grew to cover them.
	 */
	it('keeps the columns a body does name', () => {
		expect(habitat.id).toBeUndefined();
		expect(habitat.updated_by_profile_id).toBeUndefined();
	});

	it('gives a shared factory the union of the tables it serves', () => {
		const lookup = {} as CommandPayload<'collection_methods' | 'collection_lures'>;

		// `custom_schema` is on collection methods and not on lures, and the one
		// reader both catalogs share has to be able to name it.
		expect(lookup.custom_schema).toBeUndefined();
		expect(lookup.name).toBeUndefined();
		// @ts-expect-error neither catalog has it
		expect(lookup.habitat_name).toBeUndefined();
	});
});

describe('acknowledged', () => {
	it('reads an absent flag as confirmed', () => {
		expect(acknowledged({}, 'acknowledgedRouteRemoval')).toBe(true);
	});

	it('reads an explicit false as withheld', () => {
		expect(acknowledged({ acknowledgedRouteRemoval: false }, 'acknowledgedRouteRemoval')).toBe(
			false,
		);
	});

	it('reads anything else as confirmed', () => {
		expect(acknowledged({ acknowledgedRouteRemoval: true }, 'acknowledgedRouteRemoval')).toBe(true);
		expect(acknowledged({ acknowledgedRouteRemoval: null }, 'acknowledgedRouteRemoval')).toBe(true);
	});

	/*
	 * The fork the flag now carries. A collision the caller could not have seen
	 * and a mismatch between what the crew did and what the plan said are not
	 * questions a body written earlier can have answered, so absent is not yes.
	 */
	it('reads an absent explicit flag as withheld', () => {
		for (const flag of EXPLICIT_ACKNOWLEDGEMENTS) {
			expect(acknowledged({}, flag), flag).toBe(false);
			expect(acknowledged({ [flag]: false }, flag), flag).toBe(false);
			expect(acknowledged({ [flag]: true }, flag), flag).toBe(true);
		}
	});

	it('names only flags that are in the vocabulary', () => {
		for (const flag of EXPLICIT_ACKNOWLEDGEMENTS) {
			expect(ACKNOWLEDGEMENTS, flag).toContain(flag);
		}
	});

	/*
	 * The default is the convention, and the exception is the list. A branch that
	 * moves a flag onto the explicit list is refusing writes that worked, so it is
	 * worth making that a visible number rather than a diff nobody reads.
	 */
	it('keeps the exception small', () => {
		expect(EXPLICIT_ACKNOWLEDGEMENTS.length).toBe(6);
	});
});
