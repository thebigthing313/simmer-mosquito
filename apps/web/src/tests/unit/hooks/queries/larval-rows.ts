/**
 * Rows for the larval surveillance read seams, as the collections hold them.
 *
 * Five hooks read an inspection with its habitat joined, and every one of them
 * has the same three answers to give for the habitat's name: the row arrived
 * and carries a name, the row arrived and carries none, and the row has not
 * arrived. The suites over those hooks seed the same inspection to ask, so the
 * row is built here once rather than in each of them.
 *
 * Every column an inspection carries is present, because a projection reading
 * a column the fixture omits reads `undefined`, and `undefined` is the value an
 * unmatched join reads too. A fixture with a hole in it would make the absent
 * habitat row and a missing column look the same.
 */

/** An inspection at the Alder catch basin, made by Rosa Lam on 12 August. */
export function inspection(
	id: string,
	overrides: {
		readonly inspection_date?: string;
		readonly created_at?: Date;
		readonly habitat_id?: string | null;
		readonly habitat_type_id?: string | null;
		readonly address_id?: string | null;
		readonly inspected_by_profile_id?: string | null;
		readonly is_wet?: boolean;
		readonly density?: string | null;
		readonly dip_count?: number | null;
		readonly larvae_count?: number | null;
		readonly has_eggs?: boolean;
		readonly has_first_instar?: boolean;
		readonly has_second_instar?: boolean;
		readonly has_third_instar?: boolean;
		readonly has_fourth_instar?: boolean;
		readonly has_pupae?: boolean;
		readonly lat?: number;
		readonly lng?: number;
	} = {},
) {
	return {
		id,
		organization_id: 'org-1',
		lat: 34.05213,
		lng: -118.24368,
		geom_type: 'ST_Point',
		habitat_id: 'h1',
		habitat_type_id: 't1',
		address_id: null,
		inspected_by_profile_id: 'p1',
		assignment_item_id: null,
		inspection_date: '2026-08-12',
		is_wet: true,
		dip_count: 10,
		density: 'light',
		larvae_count: 4,
		has_eggs: false,
		has_first_instar: true,
		has_second_instar: false,
		has_third_instar: false,
		has_fourth_instar: false,
		has_pupae: false,
		created_at: new Date('2026-08-12T10:00:00Z'),
		...overrides,
	};
}

/** A sample the inspection produced, named by the organization or not. */
export function sample(
	id: string,
	overrides: {
		readonly inspection_id?: string;
		readonly display_name?: string | null;
	} = {},
) {
	return {
		id,
		inspection_id: 'i1',
		display_name: null,
		is_zero_larvae: false,
		has_non_mosquito: false,
		unidentifiable_reason: null,
		created_at: new Date('2026-08-12T11:00:00Z'),
		...overrides,
	};
}

/**
 * The id of a habitat the collection has not streamed.
 *
 * The first eight hex are what `habitatLabel` reads out of it, so a label
 * built from this id reads `Habitat 1a2b3c4d`.
 */
export const UNSTREAMED_HABITAT_ID = '1a2b3c4d-0000-4000-8000-000000000001';
