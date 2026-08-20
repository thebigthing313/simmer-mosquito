/**
 * The column vocabularies a synced row can hold.
 *
 * What is left of this folder. It used to carry a hand-written camelCase
 * interface per table — `HabitatRow`, `ProfileRow`, sixty-odd of them — from
 * before the row schemas were generated. Those are gone: a collection's row type
 * comes from its Zod schema in `collections/tables/`, keyed by Postgres column
 * name, and the two spellings living side by side is what let a surface read
 * `unitType` off a row that had streamed `unit_type` and silently find nothing.
 *
 * These enums are not row types. They are the value sets a handful of columns
 * are drawn from, and the surfaces that narrow on one need it by name.
 *
 * ## They also exist in `packages/domain`, and that is the next step
 *
 * `LarvalDensity` and `UnitType` are domain vocabulary, and the domain declares
 * them too. Two declarations of one value set can disagree, and the one that
 * loses is this one — it is the copy nothing validates against. The cleanup is
 * to repoint the consumers at the canonical home and delete this file, which is
 * a change to about fifteen imports across three apps.
 *
 * `SimmerRole` is already done: ADR 0013 moved it to `packages/domain` and this
 * file's copy went with it. It cannot come back here, because `packages/sync`
 * must not depend on `packages/domain` — a transport that knew the domain
 * vocabulary would be a second place the domain is described.
 */

export type UnitType =
	| 'weight'
	| 'distance'
	| 'area'
	| 'volume'
	| 'temperature'
	| 'duration'
	| 'count'
	| 'speed';

export type UnitSystem = 'si' | 'imperial' | 'us_customary';

export type MembershipStatus = 'active' | 'inactive' | 'invited';

export type LarvalDensity = 'none' | 'light' | 'medium' | 'heavy' | 'very_heavy';

export type RouteType = 'habitat' | 'trap';
export type CollectionTimingMode = 'exact_timestamps' | 'collection_date_duration';
export type SpeciesSex = 'male' | 'female';
export type SpeciesStatus = 'damaged' | 'unfed' | 'bloodfed' | 'gravid';
export type ControlType = 'application' | 'source_reduction' | 'biocontrol' | 'outreach';
export type RequestIntakeType = 'online' | 'phone' | 'walk-in' | 'other';
export type WeatherSourceType = 'organization' | 'nws';
