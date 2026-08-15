/**
 * How this app wants each table streamed.
 *
 * `packages/sync` holds no opinion about this, and cannot: a schema is a fact
 * about a table and is the same everywhere, but how a table should stream is an
 * answer only an app can give, and the answers differ. `apps/mobile` needs
 * habitats `eager`, because working a marsh means having every habitat on the
 * device before the signal goes. `apps/web` is online-only and wants the same
 * table `on-demand`. A default in the package would be it quietly answering a
 * question it cannot know, and the wrong answer is either a whole snapshot
 * before first paint or an app that cannot work in the field.
 *
 * These are the values the sync descriptors used to carry, moved to the app whose
 * decisions they are. Nothing else was lost with them.
 *
 * ## The split
 *
 * `eager` streams the whole table up front. Right for a lookup an agency has
 * dozens of rows of and every screen reads: collection methods, habitat types,
 * the species taxonomy. Twenty-five tables.
 *
 * `on-demand` loads only the subsets a live query asks for, as a `where` pushed
 * down to Electric. Right for the records themselves, which grow without bound:
 * inspections, applications, service requests. Twenty-nine tables.
 *
 * It is a judgement about size and access, not importance, and it is the thing
 * here worth revisiting against real agency data. An `eager` table that grew is a
 * snapshot before first paint; an `on-demand` table every screen reads whole is a
 * request per screen.
 *
 * ## Two tables are absent
 *
 * `users` has no shape at all — see `shape-scopes.ts` on the server. An agency
 * reads Profiles, which are org-scoped, not logins, which are not.
 *
 * `weather_source_subscriptions` has a shape and this app has never collected it:
 * which sources an agency subscribes to is read through the weather screens' own
 * endpoints. Absent because it is absent today, not because it could not be.
 */

import type { WebSyncMode } from '@simmer-mosquito/sync';

export const webSyncModes = {
	// --- The agency and its people ---------------------------------------------
	organizations: 'eager',
	profiles: 'eager',
	memberships: 'eager',

	// --- Places, and what annotates any record ---------------------------------
	addresses: 'on-demand',
	region_folders: 'eager',
	regions: 'on-demand',
	tags: 'eager',
	tag_items: 'on-demand',
	comments: 'on-demand',

	// --- The taxonomy, and the measurements everything is recorded in ----------
	genera: 'eager',
	species: 'eager',
	organization_species: 'eager',
	units: 'eager',

	// --- Adult surveillance -----------------------------------------------------
	collection_methods: 'eager',
	collection_lures: 'eager',
	traps: 'eager',
	collections: 'on-demand',
	collection_species: 'on-demand',

	// --- Larval surveillance ----------------------------------------------------
	habitat_types: 'eager',
	habitats: 'on-demand',
	inspections: 'on-demand',
	samples: 'on-demand',
	sample_species: 'on-demand',

	// --- What control work is done with -----------------------------------------
	vehicles: 'eager',
	equipment: 'eager',
	insecticides: 'eager',
	insecticide_batches: 'on-demand',
	formulations: 'eager',
	formulation_insecticides: 'eager',

	// --- How it is done ----------------------------------------------------------
	application_methods: 'eager',
	source_reduction_methods: 'eager',
	outreach_methods: 'eager',
	biocontrol_methods: 'eager',

	// --- What was actually done ---------------------------------------------------
	applications: 'on-demand',
	application_batches: 'on-demand',
	source_reductions: 'on-demand',
	outreach_actions: 'on-demand',
	biocontrol_actions: 'on-demand',

	// --- Who is doing it, and in what order ----------------------------------------
	routes: 'eager',
	route_items: 'on-demand',
	assignments: 'on-demand',
	assignment_items: 'on-demand',
	additional_personnel: 'on-demand',
	missions: 'on-demand',
	mission_items: 'on-demand',
	requested_control_actions: 'on-demand',

	// --- The public -----------------------------------------------------------------
	contacts: 'on-demand',
	service_requests: 'on-demand',
	notification_types: 'eager',
	notification_registrations: 'on-demand',
	notification_registration_types: 'on-demand',
	mission_notifications: 'on-demand',

	// --- Weather --------------------------------------------------------------------
	weather_sources: 'eager',
	weather_summaries: 'on-demand',
} as const satisfies Readonly<Record<string, WebSyncMode>>;
