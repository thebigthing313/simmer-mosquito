/**
 * The `treatments` table, as a client receives it.
 *
 * Generated from the Kysely table type and the migrations, then owned by hand.
 * `geom`, `geojson`, `deleted_at` and `deleted_by_profile_id` are absent:
 * geometry is served by the `/map/*` endpoints, and the shape predicate filters
 * soft-deleted rows upstream, so neither ever reaches a collection.
 *
 * One row per visit's insecticide work: when, by whom, how and where, and what
 * it was linked to. The products that went out are its Chemical Applications,
 * one `applications` row each, read through `applications.treatment_id`. A row
 * backfilled from a Chemical Application that predates Treatments has that
 * row's id, so an old detail URL still opens it.
 *
 * `formulation_id`, `mix_amount` and `mix_unit_id` are all set or all null. Set,
 * they name the Formulation the Treatment was mixed from and how much finished
 * mix went out, in the unit the Formulation's batch was measured in when the
 * Treatment was saved. `metadata` is the method's custom fields, which is where
 * a catch basin job keeps its basin counts.
 *
 * A `date` column is a `YYYY-MM-DD` string rather than a `Date` — see
 * `functions/sync-collection.ts` for why parsing one loses a day.
 */

import { z } from 'zod';

export const treatmentSchema = z.object({
	id: z.uuid(),
	organization_id: z.uuid(),
	application_date: z.string(),
	applicator_profile_id: z.uuid().nullable(),
	application_method_id: z.uuid().nullable(),
	vehicle_id: z.uuid().nullable(),
	equipment_id: z.uuid().nullable(),
	address_id: z.uuid().nullable(),
	habitat_id: z.uuid().nullable(),
	inspection_id: z.uuid().nullable(),
	collection_id: z.uuid().nullable(),
	requested_control_action_id: z.uuid().nullable(),
	mission_item_id: z.uuid().nullable(),
	formulation_id: z.uuid().nullable(),
	mix_amount: z.number().nullable(),
	mix_unit_id: z.uuid().nullable(),
	lat: z.number(),
	lng: z.number(),
	geom_type: z.string(),
	metadata: z.unknown().nullable(),
	created_by_profile_id: z.uuid().nullable().default(null),
	updated_by_profile_id: z.uuid().nullable().default(null),
	created_at: z.coerce.date().default(() => new Date()),
	updated_at: z.coerce.date().default(() => new Date()),
});

export type Treatment = z.infer<typeof treatmentSchema>;
