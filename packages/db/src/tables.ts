import type { ColumnType, Generated, Kysely, RawBuilder, Transaction } from 'kysely';

type TimestampWithDefault = ColumnType<Date, Date | undefined, Date | undefined>;
type NullableTimestampWithDefault = ColumnType<
	Date | null,
	Date | null | undefined,
	Date | null | undefined
>;
type BooleanWithDefault = ColumnType<boolean, boolean | undefined, boolean>;
type JsonColumn = ColumnType<unknown | null, unknown | null | undefined, unknown | null>;
type GeneratedColumn<T> = ColumnType<T, never, never>;
type DateColumn = ColumnType<Date, Date, Date>;
type NullableDateColumn = ColumnType<Date | null, Date | null | undefined, Date | null | undefined>;
type GeometryColumn = ColumnType<
	string,
	string | RawBuilder<string> | undefined,
	string | RawBuilder<string> | undefined
>;

export type SimmerRole = 'owner' | 'admin' | 'manager' | 'collector' | 'viewer';
export type MembershipStatus = 'active' | 'inactive' | 'invited';
export type OrganizationSubscriptionStatus = 'trial' | 'active' | 'suspended' | 'canceled';
export type OrganizationBillingMode = 'manual_invoice';
export type SpeciesSex = 'male' | 'female';
export type SpeciesStatus = 'damaged' | 'unfed' | 'bloodfed' | 'gravid';
export type LarvalDensity = 'none' | 'light' | 'medium' | 'heavy' | 'very_heavy';
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
export type InsecticideType = 'larvicide' | 'adulticide' | 'pupicide' | 'other';
export type RequestIntakeType = 'online' | 'phone' | 'walk-in' | 'other';
export type RouteType = 'habitat' | 'trap';
export type ControlType = 'application' | 'source_reduction' | 'biocontrol' | 'outreach';
export type NotificationChannel = 'email' | 'sms' | 'phone';
export type MissionNotificationStatus = 'pending' | 'completed' | 'failed' | 'skipped';
export type WeatherSourceType = 'organization' | 'nws';
export type CollectionTimingMode = 'exact_timestamps' | 'collection_date_duration';

export type GeoJsonGeometry = Record<string, unknown>;

export interface UsersTable {
	id: Generated<string>;
	workos_user_id: string;
	email: string;
	display_name: string;
	first_name: string | null;
	last_name: string | null;
	email_verified: boolean | null;
	created_at: TimestampWithDefault;
	updated_at: TimestampWithDefault;
}

export interface OrganizationsTable {
	id: Generated<string>;
	workos_organization_id: string | null;
	name: string;
	slug: string | null;
	settings: unknown | null;
	subscription_status: ColumnType<
		OrganizationSubscriptionStatus,
		OrganizationSubscriptionStatus | undefined,
		OrganizationSubscriptionStatus
	>;
	billing_mode: ColumnType<
		OrganizationBillingMode,
		OrganizationBillingMode | undefined,
		OrganizationBillingMode
	>;
	billing_contact_name: string | null;
	billing_contact_email: string | null;
	subscription_notes: string | null;
	main_contact_email: string | null;
	phone_number: string | null;
	mailing_country: string | null;
	mailing_address_line_1: string | null;
	mailing_address_line_2: string | null;
	mailing_locality: string | null;
	mailing_region: string | null;
	mailing_postal_code: string | null;
	created_at: TimestampWithDefault;
	updated_at: TimestampWithDefault;
	updated_by_profile_id: string | null;
	deleted_at: NullableTimestampWithDefault;
	deleted_by_profile_id: string | null;
}

export interface ProfilesTable {
	id: Generated<string>;
	organization_id: string;
	user_id: string | null;
	display_name: string;
	email: string | null;
	is_active: BooleanWithDefault;
	created_at: TimestampWithDefault;
	updated_at: TimestampWithDefault;
	deleted_at: NullableTimestampWithDefault;
	deleted_by_profile_id: string | null;
}

export interface MembershipsTable {
	id: Generated<string>;
	organization_id: string;
	user_id: string | null;
	profile_id: string;
	role: SimmerRole;
	status: MembershipStatus;
	is_default: BooleanWithDefault;
	invited_email: string | null;
	workos_invitation_id: string | null;
	created_at: TimestampWithDefault;
	updated_at: TimestampWithDefault;
}

export interface AddressesTable {
	id: Generated<string>;
	organization_id: string;
	geom: GeometryColumn;
	lat: GeneratedColumn<number>;
	lng: GeneratedColumn<number>;
	geojson: GeneratedColumn<GeoJsonGeometry>;
	geom_type: GeneratedColumn<string>;
	display_name: string;
	country: string;
	address_line_1: string | null;
	address_line_2: string | null;
	locality: string | null;
	region: string | null;
	postal_code: string | null;
	geocoder_response: JsonColumn;
	created_by_profile_id: string | null;
	updated_by_profile_id: string | null;
	created_at: TimestampWithDefault;
	updated_at: TimestampWithDefault;
	deleted_at: NullableTimestampWithDefault;
	deleted_by_profile_id: string | null;
}

export interface RegionFoldersTable {
	id: Generated<string>;
	organization_id: string;
	name: string;
	description: string | null;
	created_by_profile_id: string | null;
	updated_by_profile_id: string | null;
	created_at: TimestampWithDefault;
	updated_at: TimestampWithDefault;
	deleted_at: NullableTimestampWithDefault;
	deleted_by_profile_id: string | null;
}

export interface RegionsTable {
	id: Generated<string>;
	organization_id: string;
	region_folder_id: string | null;
	geom: GeometryColumn;
	lat: GeneratedColumn<number>;
	lng: GeneratedColumn<number>;
	geojson: GeneratedColumn<GeoJsonGeometry>;
	geom_type: GeneratedColumn<string>;
	name: string;
	description: string | null;
	metadata: JsonColumn;
	created_by_profile_id: string | null;
	updated_by_profile_id: string | null;
	created_at: TimestampWithDefault;
	updated_at: TimestampWithDefault;
	deleted_at: NullableTimestampWithDefault;
	deleted_by_profile_id: string | null;
}

export interface GeneraTable {
	id: Generated<string>;
	abbreviation: string;
	name: string;
	created_at: TimestampWithDefault;
	updated_at: TimestampWithDefault;
}

export interface SpeciesTable {
	id: Generated<string>;
	genus_id: string | null;
	epithet: string;
	common_name: string | null;
	display_name: string;
	created_at: TimestampWithDefault;
	updated_at: TimestampWithDefault;
}

export interface OrganizationSpeciesTable {
	id: Generated<string>;
	organization_id: string;
	species_id: string;
	created_by_profile_id: string | null;
	updated_by_profile_id: string | null;
	created_at: TimestampWithDefault;
	updated_at: TimestampWithDefault;
	deleted_at: NullableTimestampWithDefault;
	deleted_by_profile_id: string | null;
}

interface OrgLookupTableBase {
	id: Generated<string>;
	organization_id: string;
	name: string;
	description: string | null;
	is_active: BooleanWithDefault;
	created_by_profile_id: string | null;
	updated_by_profile_id: string | null;
	created_at: TimestampWithDefault;
	updated_at: TimestampWithDefault;
	deleted_at: NullableTimestampWithDefault;
	deleted_by_profile_id: string | null;
}

export interface CollectionMethodsTable extends OrgLookupTableBase {
	custom_schema: JsonColumn;
	action_threshold: number | null;
}
export interface CollectionLuresTable extends OrgLookupTableBase {}
export interface HabitatTypesTable extends OrgLookupTableBase {
	custom_schema: JsonColumn;
}

export interface TrapsTable {
	id: Generated<string>;
	organization_id: string;
	geom: GeometryColumn;
	lat: GeneratedColumn<number>;
	lng: GeneratedColumn<number>;
	geojson: GeneratedColumn<GeoJsonGeometry>;
	geom_type: GeneratedColumn<string>;
	collection_method_id: string;
	address_id: string | null;
	collection_lure_id: string | null;
	trap_name: string | null;
	trap_code: string | null;
	description: string | null;
	is_active: BooleanWithDefault;
	created_by_profile_id: string | null;
	updated_by_profile_id: string | null;
	created_at: TimestampWithDefault;
	updated_at: TimestampWithDefault;
	deleted_at: NullableTimestampWithDefault;
	deleted_by_profile_id: string | null;
}

export interface CollectionsTable {
	id: Generated<string>;
	organization_id: string;
	trap_id: string | null;
	collection_method_id: string;
	collection_lure_id: string | null;
	geom: GeometryColumn;
	lat: GeneratedColumn<number>;
	lng: GeneratedColumn<number>;
	geojson: GeneratedColumn<GeoJsonGeometry>;
	geom_type: GeneratedColumn<string>;
	address_id: string | null;
	collected_at: NullableTimestampWithDefault;
	collected_by_profile_id: string | null;
	started_at: NullableTimestampWithDefault;
	set_by_profile_id: string | null;
	set_assignment_item_id: string | null;
	collected_assignment_item_id: string | null;
	collection_timing_mode: ColumnType<
		CollectionTimingMode,
		CollectionTimingMode | undefined,
		CollectionTimingMode
	>;
	collection_date: NullableDateColumn;
	duration_amount: number | null;
	duration_unit_id: string | null;
	has_problem: BooleanWithDefault;
	is_zero_result: BooleanWithDefault;
	has_bycatch: BooleanWithDefault;
	metadata: JsonColumn;
	created_by_profile_id: string | null;
	updated_by_profile_id: string | null;
	created_at: TimestampWithDefault;
	updated_at: TimestampWithDefault;
	deleted_at: NullableTimestampWithDefault;
	deleted_by_profile_id: string | null;
}

export interface CollectionSpeciesTable {
	id: Generated<string>;
	organization_id: string;
	collection_id: string;
	species_id: string;
	count: number;
	sex: ColumnType<SpeciesSex | null, SpeciesSex | null | undefined, SpeciesSex | null>;
	status: SpeciesStatus | null;
	identified_by_profile_id: string | null;
	identified_date: DateColumn;
	created_by_profile_id: string | null;
	updated_by_profile_id: string | null;
	created_at: TimestampWithDefault;
	updated_at: TimestampWithDefault;
	deleted_at: NullableTimestampWithDefault;
	deleted_by_profile_id: string | null;
}

export interface HabitatsTable {
	id: Generated<string>;
	organization_id: string;
	geom: GeometryColumn;
	lat: GeneratedColumn<number>;
	lng: GeneratedColumn<number>;
	geojson: GeneratedColumn<GeoJsonGeometry>;
	geom_type: GeneratedColumn<string>;
	address_id: string | null;
	habitat_type_id: string | null;
	habitat_name: string | null;
	description: string;
	is_active: BooleanWithDefault;
	is_inaccessible: BooleanWithDefault;
	metadata: JsonColumn;
	created_by_profile_id: string | null;
	updated_by_profile_id: string | null;
	created_at: TimestampWithDefault;
	updated_at: TimestampWithDefault;
	deleted_at: NullableTimestampWithDefault;
	deleted_by_profile_id: string | null;
}

export interface InspectionsTable {
	id: Generated<string>;
	organization_id: string;
	geom: GeometryColumn;
	lat: GeneratedColumn<number>;
	lng: GeneratedColumn<number>;
	geojson: GeneratedColumn<GeoJsonGeometry>;
	geom_type: GeneratedColumn<string>;
	habitat_id: string | null;
	habitat_type_id: string | null;
	address_id: string | null;
	inspected_by_profile_id: string | null;
	assignment_item_id: string | null;
	inspection_date: DateColumn;
	is_wet: BooleanWithDefault;
	dip_count: number | null;
	density: LarvalDensity | null;
	larvae_count: number | null;
	has_first_instar: BooleanWithDefault;
	has_second_instar: BooleanWithDefault;
	has_third_instar: BooleanWithDefault;
	has_fourth_instar: BooleanWithDefault;
	has_pupae: BooleanWithDefault;
	has_eggs: BooleanWithDefault;
	created_by_profile_id: string | null;
	updated_by_profile_id: string | null;
	created_at: TimestampWithDefault;
	updated_at: TimestampWithDefault;
	deleted_at: NullableTimestampWithDefault;
	deleted_by_profile_id: string | null;
}

export interface SamplesTable {
	id: Generated<string>;
	organization_id: string;
	inspection_id: string;
	display_name: string | null;
	is_zero_larvae: BooleanWithDefault;
	has_non_mosquito: BooleanWithDefault;
	unidentifiable_reason: string | null;
	created_by_profile_id: string | null;
	updated_by_profile_id: string | null;
	created_at: TimestampWithDefault;
	updated_at: TimestampWithDefault;
	deleted_at: NullableTimestampWithDefault;
	deleted_by_profile_id: string | null;
}

export interface SampleSpeciesTable {
	id: Generated<string>;
	organization_id: string;
	sample_id: string;
	species_id: string;
	identified_by_profile_id: string | null;
	identified_at: DateColumn;
	larvae_count: number;
	created_by_profile_id: string | null;
	updated_by_profile_id: string | null;
	created_at: TimestampWithDefault;
	updated_at: TimestampWithDefault;
	deleted_at: NullableTimestampWithDefault;
	deleted_by_profile_id: string | null;
}

export interface UnitsTable {
	id: Generated<string>;
	code: string;
	unit_name: string;
	abbreviation: string;
	unit_type: UnitType;
	unit_system: UnitSystem;
	created_at: TimestampWithDefault;
}

export interface SafeUnit {
	readonly id: string;
	readonly code: string;
	readonly unitName: string;
	readonly abbreviation: string;
	readonly unitType: UnitType;
	readonly unitSystem: UnitSystem;
	readonly createdAt: string;
}

export interface CreateUnitInput {
	readonly id?: string;
	readonly code: string;
	readonly unitName: string;
	readonly abbreviation: string;
	readonly unitType: UnitType;
	readonly unitSystem: UnitSystem;
}

export interface UpdateUnitInput extends CreateUnitInput {}

export interface ApplicationMethodsTable {
	id: Generated<string>;
	organization_id: string;
	name: string;
	custom_schema: JsonColumn;
	is_active: BooleanWithDefault;
	created_by_profile_id: string | null;
	updated_by_profile_id: string | null;
	created_at: TimestampWithDefault;
	updated_at: TimestampWithDefault;
	deleted_at: NullableTimestampWithDefault;
	deleted_by_profile_id: string | null;
}

interface InterventionMethodTable {
	id: Generated<string>;
	organization_id: string;
	name: string;
	custom_schema: JsonColumn;
	is_active: BooleanWithDefault;
	created_by_profile_id: string | null;
	updated_by_profile_id: string | null;
	created_at: TimestampWithDefault;
	updated_at: TimestampWithDefault;
	deleted_at: NullableTimestampWithDefault;
	deleted_by_profile_id: string | null;
}

export interface SourceReductionMethodsTable extends InterventionMethodTable {}
export interface OutreachMethodsTable extends InterventionMethodTable {}
export interface BiocontrolMethodsTable extends InterventionMethodTable {}

export interface VehiclesTable {
	id: Generated<string>;
	organization_id: string;
	vehicle_name: string;
	metadata: JsonColumn;
	is_active: BooleanWithDefault;
	created_by_profile_id: string | null;
	updated_by_profile_id: string | null;
	created_at: TimestampWithDefault;
	updated_at: TimestampWithDefault;
	deleted_at: NullableTimestampWithDefault;
	deleted_by_profile_id: string | null;
}

export interface EquipmentTable {
	id: Generated<string>;
	organization_id: string;
	equipment_name: string;
	serial_number: string | null;
	metadata: JsonColumn;
	is_active: BooleanWithDefault;
	created_by_profile_id: string | null;
	updated_by_profile_id: string | null;
	created_at: TimestampWithDefault;
	updated_at: TimestampWithDefault;
	deleted_at: NullableTimestampWithDefault;
	deleted_by_profile_id: string | null;
}

export interface InsecticidesTable {
	id: Generated<string>;
	organization_id: string;
	trade_name: string;
	active_ingredient: string;
	is_active: BooleanWithDefault;
	type: InsecticideType;
	registration_number: string;
	default_unit_id: string;
	inventory_unit_id: string | null;
	conversion_factor: number | null;
	label_url: string | null;
	msds_url: string | null;
	shorthand: string | null;
	metadata: JsonColumn;
	created_by_profile_id: string | null;
	updated_by_profile_id: string | null;
	created_at: TimestampWithDefault;
	updated_at: TimestampWithDefault;
	deleted_at: NullableTimestampWithDefault;
	deleted_by_profile_id: string | null;
}

export interface InsecticideBatchesTable {
	id: Generated<string>;
	organization_id: string;
	insecticide_id: string;
	batch_name: string;
	is_active: BooleanWithDefault;
	created_by_profile_id: string | null;
	updated_by_profile_id: string | null;
	created_at: TimestampWithDefault;
	updated_at: TimestampWithDefault;
	deleted_at: NullableTimestampWithDefault;
	deleted_by_profile_id: string | null;
}

export interface FormulationsTable {
	id: Generated<string>;
	organization_id: string;
	formulation_name: string;
	description: string | null;
	is_active: BooleanWithDefault;
	/** What one batch of the mix makes, in `batch_unit_id`. */
	batch_size: number;
	batch_unit_id: string;
	created_by_profile_id: string | null;
	updated_by_profile_id: string | null;
	created_at: TimestampWithDefault;
	updated_at: TimestampWithDefault;
	deleted_at: NullableTimestampWithDefault;
	deleted_by_profile_id: string | null;
}

export interface FormulationInsecticidesTable {
	id: Generated<string>;
	organization_id: string;
	formulation_id: string;
	insecticide_id: string;
	/** How much of this product one batch takes, in `unit_id`. */
	amount: number;
	unit_id: string;
	created_by_profile_id: string | null;
	updated_by_profile_id: string | null;
	created_at: TimestampWithDefault;
	updated_at: TimestampWithDefault;
	deleted_at: NullableTimestampWithDefault;
	deleted_by_profile_id: string | null;
}

export interface ApplicationsTable {
	id: Generated<string>;
	organization_id: string;
	application_method_id: string | null;
	insecticide_id: string;
	applicator_profile_id: string | null;
	application_date: DateColumn;
	geom: GeometryColumn;
	lat: GeneratedColumn<number>;
	lng: GeneratedColumn<number>;
	geojson: GeneratedColumn<GeoJsonGeometry>;
	geom_type: GeneratedColumn<string>;
	address_id: string | null;
	vehicle_id: string | null;
	equipment_id: string | null;
	amount_applied: number;
	application_unit_id: string;
	habitat_id: string | null;
	collection_id: string | null;
	inspection_id: string | null;
	requested_control_action_id: string | null;
	mission_item_id: string | null;
	metadata: JsonColumn;
	created_by_profile_id: string | null;
	updated_by_profile_id: string | null;
	created_at: TimestampWithDefault;
	updated_at: TimestampWithDefault;
	deleted_at: NullableTimestampWithDefault;
	deleted_by_profile_id: string | null;
}

export interface ApplicationBatchesTable {
	id: Generated<string>;
	organization_id: string;
	application_id: string;
	insecticide_batch_id: string;
	created_by_profile_id: string | null;
	updated_by_profile_id: string | null;
	created_at: TimestampWithDefault;
	updated_at: TimestampWithDefault;
	deleted_at: NullableTimestampWithDefault;
	deleted_by_profile_id: string | null;
}

export interface SourceReductionsTable {
	id: Generated<string>;
	organization_id: string;
	source_reduction_method_id: string;
	technician_profile_id: string | null;
	source_reduction_date: DateColumn;
	geom: GeometryColumn;
	lat: GeneratedColumn<number>;
	lng: GeneratedColumn<number>;
	geojson: GeneratedColumn<GeoJsonGeometry>;
	geom_type: GeneratedColumn<string>;
	address_id: string | null;
	habitat_id: string | null;
	sources_eliminated_amount: number;
	sources_eliminated_unit_id: string;
	inspection_id: string | null;
	requested_control_action_id: string | null;
	mission_item_id: string | null;
	metadata: JsonColumn;
	created_by_profile_id: string | null;
	updated_by_profile_id: string | null;
	created_at: TimestampWithDefault;
	updated_at: TimestampWithDefault;
	deleted_at: NullableTimestampWithDefault;
	deleted_by_profile_id: string | null;
}

export interface OutreachActionsTable {
	id: Generated<string>;
	organization_id: string;
	outreach_method_id: string;
	technician_profile_id: string | null;
	outreach_date: DateColumn;
	geom: GeometryColumn;
	lat: GeneratedColumn<number>;
	lng: GeneratedColumn<number>;
	geojson: GeneratedColumn<GeoJsonGeometry>;
	geom_type: GeneratedColumn<string>;
	address_id: string | null;
	inspection_id: string | null;
	reach: number;
	reach_description: string | null;
	requested_control_action_id: string | null;
	mission_item_id: string | null;
	metadata: JsonColumn;
	created_by_profile_id: string | null;
	updated_by_profile_id: string | null;
	created_at: TimestampWithDefault;
	updated_at: TimestampWithDefault;
	deleted_at: NullableTimestampWithDefault;
	deleted_by_profile_id: string | null;
}

export interface BiocontrolActionsTable {
	id: Generated<string>;
	organization_id: string;
	biocontrol_method_id: string;
	technician_profile_id: string | null;
	biocontrol_date: DateColumn;
	geom: GeometryColumn;
	lat: GeneratedColumn<number>;
	lng: GeneratedColumn<number>;
	geojson: GeneratedColumn<GeoJsonGeometry>;
	geom_type: GeneratedColumn<string>;
	address_id: string | null;
	habitat_id: string | null;
	inspection_id: string | null;
	amount_released: number;
	release_unit_id: string;
	requested_control_action_id: string | null;
	mission_item_id: string | null;
	metadata: JsonColumn;
	created_by_profile_id: string | null;
	updated_by_profile_id: string | null;
	created_at: TimestampWithDefault;
	updated_at: TimestampWithDefault;
	deleted_at: NullableTimestampWithDefault;
	deleted_by_profile_id: string | null;
}

export interface ContactsTable {
	id: Generated<string>;
	organization_id: string;
	contact_name: string | null;
	preferred_phone: string | null;
	alternate_phone: string | null;
	email: string | null;
	company: string | null;
	department: string | null;
	title: string | null;
	wants_email: BooleanWithDefault;
	wants_sms: BooleanWithDefault;
	wants_phone: BooleanWithDefault;
	metadata: JsonColumn;
	created_by_profile_id: string | null;
	updated_by_profile_id: string | null;
	created_at: TimestampWithDefault;
	updated_at: TimestampWithDefault;
	deleted_at: NullableTimestampWithDefault;
	deleted_by_profile_id: string | null;
}

export interface ServiceRequestsTable {
	id: Generated<string>;
	organization_id: string;
	display_name: ColumnType<number | null, number | null | undefined, number | null>;
	intake_type: ColumnType<RequestIntakeType, RequestIntakeType | undefined, RequestIntakeType>;
	request_date: DateColumn;
	geom: GeometryColumn;
	lat: GeneratedColumn<number>;
	lng: GeneratedColumn<number>;
	geojson: GeneratedColumn<GeoJsonGeometry>;
	geom_type: GeneratedColumn<string>;
	address_id: string;
	contact_id: string;
	received_by_profile_id: string | null;
	details: string;
	closed_at: NullableTimestampWithDefault;
	closed_by_profile_id: string | null;
	metadata: JsonColumn;
	created_by_profile_id: string | null;
	updated_by_profile_id: string | null;
	created_at: TimestampWithDefault;
	updated_at: TimestampWithDefault;
	deleted_at: NullableTimestampWithDefault;
	deleted_by_profile_id: string | null;
}

export interface CommentsTable {
	id: Generated<string>;
	organization_id: string;
	entity_type: string;
	entity_id: string;
	comment_text: string;
	commented_by_profile_id: string | null;
	commented_at: TimestampWithDefault;
	is_pinned: BooleanWithDefault;
	created_by_profile_id: string | null;
	updated_by_profile_id: string | null;
	created_at: TimestampWithDefault;
	updated_at: TimestampWithDefault;
	deleted_at: NullableTimestampWithDefault;
	deleted_by_profile_id: string | null;
}

export interface TagsTable {
	id: Generated<string>;
	organization_id: string;
	tag_name: string;
	description: string | null;
	color: string | null;
	is_active: BooleanWithDefault;
	created_by_profile_id: string | null;
	updated_by_profile_id: string | null;
	created_at: TimestampWithDefault;
	updated_at: TimestampWithDefault;
	deleted_at: NullableTimestampWithDefault;
	deleted_by_profile_id: string | null;
}

export interface TagItemsTable {
	id: Generated<string>;
	tag_id: string;
	organization_id: string;
	entity_type: string;
	entity_id: string;
	created_by_profile_id: string | null;
	updated_by_profile_id: string | null;
	created_at: TimestampWithDefault;
	updated_at: TimestampWithDefault;
	deleted_at: NullableTimestampWithDefault;
	deleted_by_profile_id: string | null;
}

export interface AdditionalPersonnelTable {
	id: Generated<string>;
	organization_id: string;
	personnel_profile_id: string;
	entity_type: string;
	entity_id: string;
	created_by_profile_id: string | null;
	updated_by_profile_id: string | null;
	created_at: TimestampWithDefault;
	updated_at: TimestampWithDefault;
	deleted_at: NullableTimestampWithDefault;
	deleted_by_profile_id: string | null;
}

export interface RoutesTable {
	id: Generated<string>;
	organization_id: string;
	route_name: string;
	route_type: ColumnType<RouteType, RouteType | undefined, RouteType>;
	created_by_profile_id: string | null;
	updated_by_profile_id: string | null;
	created_at: TimestampWithDefault;
	updated_at: TimestampWithDefault;
	deleted_at: NullableTimestampWithDefault;
	deleted_by_profile_id: string | null;
}

export interface RouteItemsTable {
	id: Generated<string>;
	organization_id: string;
	route_id: string;
	entity_type: string;
	entity_id: string;
	position: number;
	directions_to_next_item: string | null;
	created_by_profile_id: string | null;
	updated_by_profile_id: string | null;
	created_at: TimestampWithDefault;
	updated_at: TimestampWithDefault;
	deleted_at: NullableTimestampWithDefault;
	deleted_by_profile_id: string | null;
}

export interface AssignmentsTable {
	id: Generated<string>;
	organization_id: string;
	assignment_name: string | null;
	assigned_to_profile_id: string | null;
	assigned_by_profile_id: string | null;
	assignment_date: DateColumn;
	due_at: NullableTimestampWithDefault;
	started_at: NullableTimestampWithDefault;
	completed_at: NullableTimestampWithDefault;
	cancelled_at: NullableTimestampWithDefault;
	cancellation_reason: string | null;
	created_by_profile_id: string | null;
	updated_by_profile_id: string | null;
	created_at: TimestampWithDefault;
	updated_at: TimestampWithDefault;
	deleted_at: NullableTimestampWithDefault;
	deleted_by_profile_id: string | null;
}

export interface AssignmentItemsTable {
	id: Generated<string>;
	organization_id: string;
	assignment_id: string;
	entity_type: string;
	entity_id: string;
	position: number;
	directions_to_next_item: string | null;
	completed_at: NullableTimestampWithDefault;
	completed_by_profile_id: string | null;
	skipped_at: NullableTimestampWithDefault;
	skipped_by_profile_id: string | null;
	skip_reason: string | null;
	created_by_profile_id: string | null;
	updated_by_profile_id: string | null;
	created_at: TimestampWithDefault;
	updated_at: TimestampWithDefault;
	deleted_at: NullableTimestampWithDefault;
	deleted_by_profile_id: string | null;
}

export interface RequestedControlActionsTable {
	id: Generated<string>;
	organization_id: string;
	control_type: ControlType;
	recommended_method_id: string | null;
	summary: string | null;
	habitat_id: string | null;
	inspection_id: string | null;
	collection_id: string | null;
	geom: GeometryColumn;
	lat: GeneratedColumn<number>;
	lng: GeneratedColumn<number>;
	geojson: GeneratedColumn<GeoJsonGeometry>;
	geom_type: GeneratedColumn<string>;
	address_id: string | null;
	requested_by_profile_id: string | null;
	requested_at: TimestampWithDefault;
	resolved_at: NullableTimestampWithDefault;
	resolved_by_profile_id: string | null;
	created_by_profile_id: string | null;
	updated_by_profile_id: string | null;
	created_at: TimestampWithDefault;
	updated_at: TimestampWithDefault;
	deleted_at: NullableTimestampWithDefault;
	deleted_by_profile_id: string | null;
}

export interface MissionsTable {
	id: Generated<string>;
	organization_id: string;
	mission_name: string | null;
	control_type: ControlType;
	planned_method_id: string | null;
	assigned_to_profile_id: string | null;
	assigned_by_profile_id: string | null;
	scheduled_start_at: Date;
	scheduled_end_at: NullableTimestampWithDefault;
	rain_date: NullableDateColumn;
	started_at: NullableTimestampWithDefault;
	completed_at: NullableTimestampWithDefault;
	cancelled_at: NullableTimestampWithDefault;
	cancellation_reason: string | null;
	notification_type_id: string | null;
	created_by_profile_id: string | null;
	updated_by_profile_id: string | null;
	created_at: TimestampWithDefault;
	updated_at: TimestampWithDefault;
	deleted_at: NullableTimestampWithDefault;
	deleted_by_profile_id: string | null;
}

export interface MissionItemsTable {
	id: Generated<string>;
	organization_id: string;
	mission_id: string;
	requested_control_action_id: string | null;
	geom: GeometryColumn;
	lat: GeneratedColumn<number>;
	lng: GeneratedColumn<number>;
	geojson: GeneratedColumn<GeoJsonGeometry>;
	geom_type: GeneratedColumn<string>;
	address_id: string | null;
	position: number;
	completed_at: NullableTimestampWithDefault;
	completed_by_profile_id: string | null;
	skipped_at: NullableTimestampWithDefault;
	skipped_by_profile_id: string | null;
	skip_reason: string | null;
	created_by_profile_id: string | null;
	updated_by_profile_id: string | null;
	created_at: TimestampWithDefault;
	updated_at: TimestampWithDefault;
	deleted_at: NullableTimestampWithDefault;
	deleted_by_profile_id: string | null;
}

export interface NotificationTypesTable {
	id: Generated<string>;
	organization_id: string;
	name: string;
	description: string | null;
	is_active: BooleanWithDefault;
	created_by_profile_id: string | null;
	updated_by_profile_id: string | null;
	created_at: TimestampWithDefault;
	updated_at: TimestampWithDefault;
	deleted_at: NullableTimestampWithDefault;
	deleted_by_profile_id: string | null;
}

export interface NotificationRegistrationsTable {
	id: Generated<string>;
	organization_id: string;
	contact_id: string;
	geom: GeometryColumn;
	lat: GeneratedColumn<number>;
	lng: GeneratedColumn<number>;
	geojson: GeneratedColumn<GeoJsonGeometry>;
	geom_type: GeneratedColumn<string>;
	address_id: string | null;
	buffer_distance: number | null;
	buffer_unit_id: string | null;
	has_bees: BooleanWithDefault;
	is_no_spray: BooleanWithDefault;
	is_active: BooleanWithDefault;
	created_by_profile_id: string | null;
	updated_by_profile_id: string | null;
	created_at: TimestampWithDefault;
	updated_at: TimestampWithDefault;
	deleted_at: NullableTimestampWithDefault;
	deleted_by_profile_id: string | null;
}

export interface NotificationRegistrationTypesTable {
	id: Generated<string>;
	organization_id: string;
	notification_registration_id: string;
	notification_type_id: string;
	created_by_profile_id: string | null;
	updated_by_profile_id: string | null;
	created_at: TimestampWithDefault;
	updated_at: TimestampWithDefault;
	deleted_at: NullableTimestampWithDefault;
	deleted_by_profile_id: string | null;
}

export interface MissionNotificationsTable {
	id: Generated<string>;
	organization_id: string;
	mission_id: string;
	notification_registration_id: string;
	contact_id: string;
	notification_type_id: string;
	channel: NotificationChannel;
	destination: string | null;
	status: ColumnType<
		MissionNotificationStatus,
		MissionNotificationStatus | undefined,
		MissionNotificationStatus
	>;
	status_changed_at: NullableTimestampWithDefault;
	status_changed_by_profile_id: string | null;
	created_by_profile_id: string | null;
	updated_by_profile_id: string | null;
	created_at: TimestampWithDefault;
	updated_at: TimestampWithDefault;
	deleted_at: NullableTimestampWithDefault;
	deleted_by_profile_id: string | null;
}

export interface WeatherSourcesTable {
	id: Generated<string>;
	organization_id: string | null;
	geom: GeometryColumn;
	lat: GeneratedColumn<number>;
	lng: GeneratedColumn<number>;
	geojson: GeneratedColumn<GeoJsonGeometry>;
	geom_type: GeneratedColumn<string>;
	source_type: WeatherSourceType;
	source_name: string;
	source_code: string | null;
	provider_source_id: string | null;
	is_active: BooleanWithDefault;
	created_by_profile_id: string | null;
	updated_by_profile_id: string | null;
	created_at: TimestampWithDefault;
	updated_at: TimestampWithDefault;
	deleted_at: NullableTimestampWithDefault;
	deleted_by_profile_id: string | null;
}

export interface WeatherSourceSubscriptionsTable {
	id: Generated<string>;
	organization_id: string;
	weather_source_id: string;
	is_active: BooleanWithDefault;
	created_by_profile_id: string | null;
	updated_by_profile_id: string | null;
	created_at: TimestampWithDefault;
	updated_at: TimestampWithDefault;
	deleted_at: NullableTimestampWithDefault;
	deleted_by_profile_id: string | null;
}

export interface WeatherSummariesTable {
	id: Generated<string>;
	organization_id: string | null;
	weather_source_id: string;
	start_date: DateColumn;
	end_date: DateColumn;
	temperature_min_f: number | null;
	temperature_max_f: number | null;
	precipitation_inches: number | null;
	relative_humidity_min: number | null;
	relative_humidity_max: number | null;
	wind_speed_min_mph: number | null;
	wind_speed_max_mph: number | null;
	created_by_profile_id: string | null;
	updated_by_profile_id: string | null;
	created_at: TimestampWithDefault;
	updated_at: TimestampWithDefault;
}

export interface SimmerDatabase {
	users: UsersTable;
	organizations: OrganizationsTable;
	profiles: ProfilesTable;
	memberships: MembershipsTable;
	addresses: AddressesTable;
	region_folders: RegionFoldersTable;
	regions: RegionsTable;
	genera: GeneraTable;
	species: SpeciesTable;
	organization_species: OrganizationSpeciesTable;
	collection_methods: CollectionMethodsTable;
	collection_lures: CollectionLuresTable;
	habitat_types: HabitatTypesTable;
	traps: TrapsTable;
	collections: CollectionsTable;
	collection_species: CollectionSpeciesTable;
	habitats: HabitatsTable;
	inspections: InspectionsTable;
	samples: SamplesTable;
	sample_species: SampleSpeciesTable;
	units: UnitsTable;
	application_methods: ApplicationMethodsTable;
	vehicles: VehiclesTable;
	equipment: EquipmentTable;
	insecticides: InsecticidesTable;
	insecticide_batches: InsecticideBatchesTable;
	formulations: FormulationsTable;
	formulation_insecticides: FormulationInsecticidesTable;
	applications: ApplicationsTable;
	application_batches: ApplicationBatchesTable;
	source_reduction_methods: SourceReductionMethodsTable;
	outreach_methods: OutreachMethodsTable;
	biocontrol_methods: BiocontrolMethodsTable;
	source_reductions: SourceReductionsTable;
	outreach_actions: OutreachActionsTable;
	biocontrol_actions: BiocontrolActionsTable;
	contacts: ContactsTable;
	service_requests: ServiceRequestsTable;
	comments: CommentsTable;
	tags: TagsTable;
	tag_items: TagItemsTable;
	additional_personnel: AdditionalPersonnelTable;
	routes: RoutesTable;
	route_items: RouteItemsTable;
	assignments: AssignmentsTable;
	assignment_items: AssignmentItemsTable;
	requested_control_actions: RequestedControlActionsTable;
	missions: MissionsTable;
	mission_items: MissionItemsTable;
	notification_types: NotificationTypesTable;
	notification_registrations: NotificationRegistrationsTable;
	notification_registration_types: NotificationRegistrationTypesTable;
	mission_notifications: MissionNotificationsTable;
	weather_sources: WeatherSourcesTable;
	weather_source_subscriptions: WeatherSourceSubscriptionsTable;
	weather_summaries: WeatherSummariesTable;
}

/**
 * Anything that can run a query: the pool-backed instance or a transaction on it.
 *
 * Every reader and writer in `domains/` and `seeds/` takes one of these so the
 * same function works inside a server-authorized transaction and standalone.
 * It was declared identically in eight modules before living here, which made it
 * a private type in each of their exported signatures — callers could pass one
 * but could not name it.
 */
export type DbExecutor = Kysely<SimmerDatabase> | Transaction<SimmerDatabase>;
