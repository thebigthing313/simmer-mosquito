/**
 * One record per table the six edit loaders open, as the row its collection
 * holds, plus the catalog rows each record names.
 *
 * Every fixture goes through the table's generated row schema before a suite
 * sees it, so a column the schema does not declare, a wrong type, or an id that
 * is not a UUID fails at construction rather than seeding a row the query
 * engine reads back as something else. The input is typed as `z.input` of the
 * same schema, which is what makes a misspelled column a `tsc` error, and the
 * output is what `seedRows` puts in the memory collection: `created_at` and
 * `updated_at` arrive as `Date`, the way a synced row's do, which matters
 * because each loader keys its geometry read on `updatedAt.toISOString()`.
 *
 * The catalog rows are here rather than in the suite because a form draws the
 * name a record's id points at, not the id. A technician select reads
 * `Ana Rivera` off the profile row, so a case that asserts the field shows the
 * record's technician has to seed the profile the record names, and the record
 * and the profile agreeing on the id is this module's business.
 *
 * `edit-loaders.test.tsx` is the one reader today.
 */

import { type AdditionalPersonnelTargetType, toDbEntityType } from '@simmer-mosquito/domain';
import { type SyncedTable, tableSchemas } from '@simmer-mosquito/sync';
import type { z } from 'zod';

/** The row a table's schema parses to, which is what a collection holds. */
type FixtureRow<TTable extends SyncedTable> = z.output<(typeof tableSchemas)[TTable]>;

/**
 * A row checked against its table's schema.
 *
 * The generic is the table name rather than the schema so a call site reads
 * `row('addresses', {...})` and the input type follows from it.
 */
function row<TTable extends SyncedTable>(
	table: TTable,
	input: z.input<(typeof tableSchemas)[TTable]>,
): FixtureRow<TTable> {
	return tableSchemas[table].parse(input) as FixtureRow<TTable>;
}

export const ORGANIZATION_ID = 'a0000000-0000-4000-8000-000000000001';

/** The Organization every fixture belongs to, with default settings. */
export const ORGANIZATION = row('organizations', {
	id: ORGANIZATION_ID,
	workos_organization_id: null,
	name: 'Test Mosquito Control',
	slug: 'test-mosquito-control',
	settings: {},
	main_contact_email: null,
	phone_number: null,
	mailing_country: null,
	mailing_address_line_1: null,
	mailing_address_line_2: null,
	mailing_locality: null,
	mailing_region: null,
	mailing_postal_code: null,
});

export const TECHNICIAN_ID = 'b0000000-0000-4000-8000-000000000001';
const CREW_MEMBER_ID = 'b0000000-0000-4000-8000-000000000002';

/** Two active Profiles: one a record is attributed to, one on its crew. */
export const PROFILES = [
	row('profiles', {
		id: TECHNICIAN_ID,
		organization_id: ORGANIZATION_ID,
		user_id: null,
		display_name: 'Ana Rivera',
		email: null,
		is_active: true,
	}),
	row('profiles', {
		id: CREW_MEMBER_ID,
		organization_id: ORGANIZATION_ID,
		user_id: null,
		display_name: 'Ben Okafor',
		email: null,
		is_active: true,
	}),
];

const GALLON_UNIT_ID = 'c0000000-0000-4000-8000-000000000001';
const EACH_UNIT_ID = 'c0000000-0000-4000-8000-000000000002';

/** A volume unit for a product amount and a count unit for a release or a source. */
export const UNITS = [
	row('units', {
		id: GALLON_UNIT_ID,
		code: 'gal',
		unit_name: 'Gallon',
		abbreviation: 'gal',
		unit_type: 'volume',
		unit_system: 'us_customary',
	}),
	row('units', {
		id: EACH_UNIT_ID,
		code: 'each',
		unit_name: 'Each',
		abbreviation: 'ea',
		unit_type: 'count',
		unit_system: 'si',
	}),
];

const TIMESTAMP = '2026-06-02T14:30:00Z';

/** The columns every organization-owned catalog row carries the same way. */
const CATALOG = {
	organization_id: ORGANIZATION_ID,
	custom_schema: null,
	is_active: true,
} as const;

// --- Biocontrol action ---------------------------------------------------------

const BIOCONTROL_ACTION_ID = 'd0000000-0000-4000-8000-000000000001';
const BIOCONTROL_METHOD_ID = 'd0000000-0000-4000-8000-000000000002';

export const BIOCONTROL_METHOD = row('biocontrol_methods', {
	...CATALOG,
	id: BIOCONTROL_METHOD_ID,
	name: 'Gambusia stocking',
});

export const BIOCONTROL_ACTION = row('biocontrol_actions', {
	id: BIOCONTROL_ACTION_ID,
	organization_id: ORGANIZATION_ID,
	biocontrol_method_id: BIOCONTROL_METHOD_ID,
	technician_profile_id: TECHNICIAN_ID,
	biocontrol_date: '2026-06-02',
	lat: 38.58,
	lng: -121.49,
	geom_type: 'st_point',
	address_id: null,
	habitat_id: null,
	inspection_id: null,
	amount_released: 250,
	release_unit_id: EACH_UNIT_ID,
	requested_control_action_id: null,
	mission_item_id: null,
	metadata: null,
	created_at: TIMESTAMP,
	updated_at: TIMESTAMP,
});

// --- Chemical application --------------------------------------------------------

const APPLICATION_ID = 'e0000000-0000-4000-8000-000000000001';
const INSECTICIDE_ID = 'e0000000-0000-4000-8000-000000000002';
const APPLICATION_METHOD_ID = 'e0000000-0000-4000-8000-000000000003';
const VEHICLE_ID = 'e0000000-0000-4000-8000-000000000004';
const EQUIPMENT_ID = 'e0000000-0000-4000-8000-000000000005';

export const INSECTICIDE = row('insecticides', {
	id: INSECTICIDE_ID,
	organization_id: ORGANIZATION_ID,
	trade_name: 'VectoBac 12AS',
	active_ingredient: 'Bti',
	is_active: true,
	type: 'larvicide',
	registration_number: '73049-38',
	default_unit_id: GALLON_UNIT_ID,
	inventory_unit_id: null,
	conversion_factor: null,
	label_url: null,
	msds_url: null,
	shorthand: null,
	metadata: null,
});

export const APPLICATION_METHOD = row('application_methods', {
	...CATALOG,
	id: APPLICATION_METHOD_ID,
	name: 'Backpack sprayer',
});

export const VEHICLE = row('vehicles', {
	id: VEHICLE_ID,
	organization_id: ORGANIZATION_ID,
	vehicle_name: 'Truck 7',
	metadata: null,
	is_active: true,
});

export const EQUIPMENT = row('equipment', {
	id: EQUIPMENT_ID,
	organization_id: ORGANIZATION_ID,
	equipment_name: 'Stihl SR 450',
	serial_number: null,
	metadata: null,
	is_active: true,
});

export const APPLICATION = row('applications', {
	id: APPLICATION_ID,
	organization_id: ORGANIZATION_ID,
	application_method_id: APPLICATION_METHOD_ID,
	insecticide_id: INSECTICIDE_ID,
	applicator_profile_id: TECHNICIAN_ID,
	application_date: '2026-06-03',
	lat: 38.58,
	lng: -121.49,
	geom_type: 'st_point',
	address_id: null,
	vehicle_id: VEHICLE_ID,
	equipment_id: EQUIPMENT_ID,
	amount_applied: 12.5,
	application_unit_id: GALLON_UNIT_ID,
	habitat_id: null,
	collection_id: null,
	inspection_id: null,
	requested_control_action_id: null,
	mission_item_id: null,
	metadata: null,
	created_at: TIMESTAMP,
	updated_at: TIMESTAMP,
});

// --- Source reduction ------------------------------------------------------------

const SOURCE_REDUCTION_ID = 'f0000000-0000-4000-8000-000000000001';
const SOURCE_REDUCTION_METHOD_ID = 'f0000000-0000-4000-8000-000000000002';

export const SOURCE_REDUCTION_METHOD = row('source_reduction_methods', {
	...CATALOG,
	id: SOURCE_REDUCTION_METHOD_ID,
	name: 'Tire removal',
});

/** Attributed to nobody, so the technician select draws `Unassigned`. */
export const SOURCE_REDUCTION = row('source_reductions', {
	id: SOURCE_REDUCTION_ID,
	organization_id: ORGANIZATION_ID,
	source_reduction_method_id: SOURCE_REDUCTION_METHOD_ID,
	technician_profile_id: null,
	source_reduction_date: '2026-06-04',
	lat: 38.58,
	lng: -121.49,
	geom_type: 'st_point',
	address_id: null,
	habitat_id: null,
	sources_eliminated_amount: 7,
	sources_eliminated_unit_id: EACH_UNIT_ID,
	inspection_id: null,
	requested_control_action_id: null,
	mission_item_id: null,
	metadata: null,
	created_at: TIMESTAMP,
	updated_at: TIMESTAMP,
});

// --- Address ---------------------------------------------------------------------

const ADDRESS_ID = 'a1000000-0000-4000-8000-000000000001';

export const ADDRESS = row('addresses', {
	id: ADDRESS_ID,
	organization_id: ORGANIZATION_ID,
	lat: 38.58,
	lng: -121.49,
	geom_type: 'st_point',
	display_name: '1 11th Street',
	country: 'US',
	address_line_1: '1 11th Street',
	address_line_2: 'Suite 4',
	locality: 'Sacramento',
	region: 'CA',
	postal_code: '95814',
	geocoder_response: null,
	created_at: TIMESTAMP,
	updated_at: TIMESTAMP,
});

// --- Inspection ------------------------------------------------------------------

const INSPECTION_ID = 'a2000000-0000-4000-8000-000000000001';
const HABITAT_TYPE_ID = 'a2000000-0000-4000-8000-000000000002';

export const HABITAT_TYPE = row('habitat_types', {
	id: HABITAT_TYPE_ID,
	organization_id: ORGANIZATION_ID,
	name: 'Roadside ditch',
	description: null,
	is_active: true,
	custom_schema: null,
});

/**
 * An ad-hoc inspection: no Habitat, so the form opens in its `adhoc` location
 * mode and draws the habitat type field, which a Habitat inspection hides.
 */
export const INSPECTION = row('inspections', {
	id: INSPECTION_ID,
	organization_id: ORGANIZATION_ID,
	lat: 38.58,
	lng: -121.49,
	geom_type: 'st_point',
	habitat_id: null,
	habitat_type_id: HABITAT_TYPE_ID,
	address_id: null,
	inspected_by_profile_id: TECHNICIAN_ID,
	assignment_item_id: null,
	inspection_date: '2026-06-05',
	is_wet: true,
	dip_count: 10,
	density: 'medium',
	larvae_count: 42,
	has_first_instar: false,
	has_second_instar: true,
	has_third_instar: true,
	has_fourth_instar: false,
	has_pupae: false,
	has_eggs: false,
	created_at: TIMESTAMP,
	updated_at: TIMESTAMP,
});

// --- Outreach action -------------------------------------------------------------

const OUTREACH_ACTION_ID = 'a3000000-0000-4000-8000-000000000001';
const OUTREACH_METHOD_ID = 'a3000000-0000-4000-8000-000000000002';

export const OUTREACH_METHOD = row('outreach_methods', {
	...CATALOG,
	id: OUTREACH_METHOD_ID,
	name: 'Door hangers',
});

export const OUTREACH_ACTION = row('outreach_actions', {
	id: OUTREACH_ACTION_ID,
	organization_id: ORGANIZATION_ID,
	outreach_method_id: OUTREACH_METHOD_ID,
	technician_profile_id: TECHNICIAN_ID,
	outreach_date: '2026-06-06',
	lat: 38.58,
	lng: -121.49,
	geom_type: 'st_point',
	address_id: null,
	inspection_id: null,
	reach: 120,
	reach_description: 'Every house on Elm Court',
	requested_control_action_id: null,
	mission_item_id: null,
	metadata: null,
	created_at: TIMESTAMP,
	updated_at: TIMESTAMP,
});

// --- Crew --------------------------------------------------------------------------

/**
 * One crew row per record that edits a crew, all naming the second Profile.
 * `entity_type` is written through `toDbEntityType`, since the column holds the
 * snake_case spelling and that is what `useAdditionalPersonnel` matches on.
 */
export const ADDITIONAL_PERSONNEL = (
	[
		['a4000000-0000-4000-8000-000000000001', 'biocontrolAction', BIOCONTROL_ACTION_ID],
		['a4000000-0000-4000-8000-000000000002', 'application', APPLICATION_ID],
		['a4000000-0000-4000-8000-000000000003', 'sourceReduction', SOURCE_REDUCTION_ID],
		['a4000000-0000-4000-8000-000000000004', 'inspection', INSPECTION_ID],
		['a4000000-0000-4000-8000-000000000005', 'outreachAction', OUTREACH_ACTION_ID],
	] as const satisfies readonly (readonly [string, AdditionalPersonnelTargetType, string])[]
).map(([id, type, record]) =>
	row('additional_personnel', {
		id,
		organization_id: ORGANIZATION_ID,
		personnel_profile_id: CREW_MEMBER_ID,
		entity_type: toDbEntityType(type),
		entity_id: record,
	}),
);
