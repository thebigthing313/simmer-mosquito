/**
 * Every Postgres enum type, as one TypeScript declaration each.
 *
 * A value set that is both a column type and domain vocabulary used to be
 * written out wherever a surface needed it. Larval Density was in thirteen
 * places (#432), none held to any other, and a sixth band would have compiled
 * everywhere and shown five options on the map legend. The role ladder had the
 * same shape before ADR 0013 collapsed it, which is why `SimmerRole` was already
 * here and the other sixteen were not.
 *
 * ## What belongs here
 *
 * A `create type ... as enum` in the migrations, and nothing else. That boundary
 * is what makes the gates mechanical: `pg_enum` is a catalog read with no
 * interpretation, so both halves of the check can answer from it. The read-side
 * and write-side vocabularies in `packages/db/src/domains/` are unions with no
 * column behind them and stay where they are.
 *
 * ## The shape
 *
 * The array is the declaration and the type derives from it, so a member can be
 * added in exactly one place. `COLUMN_VOCABULARIES` keys each array by the SQL
 * type name, which is what lets a generator and a catalog test find the entry
 * for a column without knowing its TypeScript name.
 *
 * ## Order is part of the contract
 *
 * Postgres gives an enum type a sort order and `pg_enum.enumsortorder` reads it
 * back, so each array is declared in that order and both gates compare ordered.
 * That is what lets a surface read its display order off the register instead of
 * writing a second list: `none, light, medium, heavy, very_heavy` is the whole
 * point of Larval Density, and `alter type ... add value` appends, which is
 * where a sixth band goes.
 *
 * A subset is derived from its array, never typed out. `RANGE_DENSITIES` is
 * `LARVAL_DENSITIES` without `none`, because the four bands with a
 * larvae-per-dip range are the ones an agency configures.
 *
 * ## What holds this to the database
 *
 * `pnpm check:column-vocabularies` compares the register to
 * `packages/db/schema.sql`, ordered, and refuses a member list written anywhere
 * else. `packages/db/src/tests/integration/column-vocabularies.integration.test.ts`
 * compares it to `pg_enum` in a real database, which is the half that catches a
 * stale dump. `packages/db/src/tables.ts` imports these types rather than
 * declaring them, so a column whose type is not registered does not compile.
 */

/** How an agency dates an Adult Collection, per `organization_settings`. */
export const ADULT_COLLECTION_TIMING_MODES = [
	'exact_timestamps',
	'collection_date_duration',
] as const;
export type AdultCollectionTimingMode = (typeof ADULT_COLLECTION_TIMING_MODES)[number];

/** What a Control Action, a Requested Control Action or a Mission does. */
export const CONTROL_TYPES = ['application', 'source_reduction', 'biocontrol', 'outreach'] as const;
export type ControlType = (typeof CONTROL_TYPES)[number];

/** Which life stage an insecticide is registered against. */
export const INSECTICIDE_TYPES = ['larvicide', 'adulticide', 'pupicide', 'other'] as const;
export type InsecticideType = (typeof INSECTICIDE_TYPES)[number];

/**
 * The Larval Density bands, weakest first.
 *
 * The bands are larvae per dip and the thresholds are an agency setting, so a
 * band is a reading rather than a count. An Inspection Sample records dips.
 */
export const LARVAL_DENSITIES = ['none', 'light', 'medium', 'heavy', 'very_heavy'] as const;
export type LarvalDensity = (typeof LARVAL_DENSITIES)[number];

/**
 * The four bands an agency gives a larvae-per-dip range.
 *
 * `none` has no range: it is what a sample with no larvae reads as, so a
 * threshold for it would be a threshold of zero.
 */
export const RANGE_DENSITIES = LARVAL_DENSITIES.filter(
	(density): density is Exclude<LarvalDensity, 'none'> => density !== 'none',
);
export type RangeDensity = (typeof RANGE_DENSITIES)[number];

/** Whether a Membership grants access now. */
export const MEMBERSHIP_STATUSES = ['active', 'inactive', 'invited'] as const;
export type MembershipStatus = (typeof MEMBERSHIP_STATUSES)[number];

/** How far a queued Mission notification got. */
export const MISSION_NOTIFICATION_STATUSES = ['pending', 'completed', 'failed', 'skipped'] as const;
export type MissionNotificationStatus = (typeof MISSION_NOTIFICATION_STATUSES)[number];

/** How a Notification Registration asks to be reached. */
export const NOTIFICATION_CHANNELS = ['email', 'sms', 'phone'] as const;
export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];

/** How an Organization pays. One member today, and the column exists so a second can arrive. */
export const ORGANIZATION_BILLING_MODES = ['manual_invoice'] as const;
export type OrganizationBillingMode = (typeof ORGANIZATION_BILLING_MODES)[number];

/** Where an Organization sits in its subscription. */
export const ORGANIZATION_SUBSCRIPTION_STATUSES = [
	'trial',
	'active',
	'suspended',
	'canceled',
] as const;
export type OrganizationSubscriptionStatus = (typeof ORGANIZATION_SUBSCRIPTION_STATUSES)[number];

/** How a Service Request reached the Organization. */
export const REQUEST_INTAKE_TYPES = ['online', 'phone', 'walk-in', 'other'] as const;
export type RequestIntakeType = (typeof REQUEST_INTAKE_TYPES)[number];

/** What a Route runs over. A Route holds one kind of stop, never both. */
export const ROUTE_TYPES = ['habitat', 'trap'] as const;
export type RouteType = (typeof ROUTE_TYPES)[number];

/**
 * The Organization role ladder, as five names.
 *
 * The ordering here is the database's, which happens to run strongest first.
 * Which role outranks which is an authorization question and stays the server's:
 * `apps/server/src/roles.ts` holds the rank and the floors it decides.
 */
export const SIMMER_ROLES = ['owner', 'admin', 'manager', 'collector', 'viewer'] as const;
export type SimmerRole = (typeof SIMMER_ROLES)[number];

/** The sex recorded against a Sample Species Count or a Collection Species Count. */
export const SPECIES_SEXES = ['male', 'female'] as const;
export type SpeciesSex = (typeof SPECIES_SEXES)[number];

/** The physiological status recorded alongside the sex. */
export const SPECIES_STATUSES = ['damaged', 'unfed', 'bloodfed', 'gravid'] as const;
export type SpeciesStatus = (typeof SPECIES_STATUSES)[number];

/** Which measurement system a Unit belongs to. */
export const UNIT_SYSTEMS = ['si', 'imperial', 'us_customary'] as const;
export type UnitSystem = (typeof UNIT_SYSTEMS)[number];

/** What a Unit measures. An Organization picks one default Unit per type. */
export const UNIT_TYPES = [
	'weight',
	'distance',
	'area',
	'volume',
	'temperature',
	'duration',
	'count',
	'speed',
] as const;
export type UnitType = (typeof UNIT_TYPES)[number];

/** Who owns a Weather Station: the Organization, or the National Weather Service. */
export const WEATHER_SOURCE_TYPES = ['organization', 'nws'] as const;
export type WeatherSourceType = (typeof WEATHER_SOURCE_TYPES)[number];

/**
 * The register, keyed by SQL type name.
 *
 * Every entry above appears here exactly once, and every enum type in the
 * database is named by exactly one key. The key is the SQL name rather than the
 * TypeScript one because that is what a generator reading `schema.sql` and a
 * test reading `pg_enum` both have in hand: `collection_timing_mode` is
 * `AdultCollectionTimingMode` here, and nothing mechanical would guess that.
 */
export const COLUMN_VOCABULARIES = {
	collection_timing_mode: ADULT_COLLECTION_TIMING_MODES,
	control_type: CONTROL_TYPES,
	insecticide_type: INSECTICIDE_TYPES,
	larval_density: LARVAL_DENSITIES,
	membership_status: MEMBERSHIP_STATUSES,
	mission_notification_status: MISSION_NOTIFICATION_STATUSES,
	notification_channel: NOTIFICATION_CHANNELS,
	organization_billing_mode: ORGANIZATION_BILLING_MODES,
	organization_subscription_status: ORGANIZATION_SUBSCRIPTION_STATUSES,
	request_intake_type: REQUEST_INTAKE_TYPES,
	route_type: ROUTE_TYPES,
	simmer_role: SIMMER_ROLES,
	species_sex: SPECIES_SEXES,
	species_status: SPECIES_STATUSES,
	unit_system: UNIT_SYSTEMS,
	unit_type: UNIT_TYPES,
	weather_source_type: WEATHER_SOURCE_TYPES,
} as const satisfies Record<string, readonly string[]>;

/** The SQL name of every enum type the register holds. */
export type ColumnVocabularyName = keyof typeof COLUMN_VOCABULARIES;
