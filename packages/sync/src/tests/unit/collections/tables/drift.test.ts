import type {
	AdditionalPersonnelTable,
	AddressesTable,
	ApplicationBatchesTable,
	ApplicationMethodsTable,
	ApplicationsTable,
	AssignmentItemsTable,
	AssignmentsTable,
	BiocontrolActionsTable,
	BiocontrolMethodsTable,
	CollectionLuresTable,
	CollectionMethodsTable,
	CollectionSpeciesTable,
	CollectionsTable,
	CommentsTable,
	ContactsTable,
	EquipmentTable,
	FormulationInsecticidesTable,
	FormulationsTable,
	GeneraTable,
	HabitatsTable,
	HabitatTypesTable,
	InsecticideBatchesTable,
	InsecticidesTable,
	InspectionsTable,
	MembershipsTable,
	MissionItemsTable,
	MissionNotificationsTable,
	MissionsTable,
	NotificationRegistrationsTable,
	NotificationRegistrationTypesTable,
	NotificationTypesTable,
	OrganizationSpeciesTable,
	OrganizationsTable,
	OutreachActionsTable,
	OutreachMethodsTable,
	ProfilesTable,
	RegionFoldersTable,
	RegionsTable,
	RequestedControlActionsTable,
	RouteItemsTable,
	RoutesTable,
	SampleSpeciesTable,
	SamplesTable,
	SelectType,
	ServiceRequestsTable,
	SourceReductionMethodsTable,
	SourceReductionsTable,
	SpeciesTable,
	TagItemsTable,
	TagsTable,
	TrapsTable,
	UnitsTable,
	UsersTable,
	VehiclesTable,
	WeatherSourceSubscriptionsTable,
	WeatherSourcesTable,
	WeatherSummariesTable,
} from '@simmer-mosquito/db';
import { describe, expect, it } from 'vitest';
import type { AdditionalPersonnel } from '../../../../collections/tables/additional_personnel.js';
import type { Address } from '../../../../collections/tables/addresses.js';
import type { ApplicationBatch } from '../../../../collections/tables/application_batches.js';
import type { ApplicationMethod } from '../../../../collections/tables/application_methods.js';
import type { Application } from '../../../../collections/tables/applications.js';
import type { AssignmentItem } from '../../../../collections/tables/assignment_items.js';
import type { Assignment } from '../../../../collections/tables/assignments.js';
import type { BiocontrolAction } from '../../../../collections/tables/biocontrol_actions.js';
import type { BiocontrolMethod } from '../../../../collections/tables/biocontrol_methods.js';
import type { CollectionLure } from '../../../../collections/tables/collection_lures.js';
import type { CollectionMethod } from '../../../../collections/tables/collection_methods.js';
import type { CollectionSpecies } from '../../../../collections/tables/collection_species.js';
import type { AdultCollection } from '../../../../collections/tables/collections.js';
import type { Comment } from '../../../../collections/tables/comments.js';
import type { Contact } from '../../../../collections/tables/contacts.js';
import type { Equipment } from '../../../../collections/tables/equipment.js';
import type { FormulationInsecticide } from '../../../../collections/tables/formulation_insecticides.js';
import type { Formulation } from '../../../../collections/tables/formulations.js';
import type { Genus } from '../../../../collections/tables/genera.js';
import type { HabitatType } from '../../../../collections/tables/habitat_types.js';
import type { Habitat } from '../../../../collections/tables/habitats.js';
import { tableSchemas } from '../../../../collections/tables/index.js';
import type { InsecticideBatch } from '../../../../collections/tables/insecticide_batches.js';
import type { Insecticide } from '../../../../collections/tables/insecticides.js';
import type { Inspection } from '../../../../collections/tables/inspections.js';
import type { Membership } from '../../../../collections/tables/memberships.js';
import type { MissionItem } from '../../../../collections/tables/mission_items.js';
import type { MissionNotification } from '../../../../collections/tables/mission_notifications.js';
import type { Mission } from '../../../../collections/tables/missions.js';
import type { NotificationRegistrationType } from '../../../../collections/tables/notification_registration_types.js';
import type { NotificationRegistration } from '../../../../collections/tables/notification_registrations.js';
import type { NotificationType } from '../../../../collections/tables/notification_types.js';
import type { OrganizationSpecies } from '../../../../collections/tables/organization_species.js';
import type { Organization } from '../../../../collections/tables/organizations.js';
import type { OutreachAction } from '../../../../collections/tables/outreach_actions.js';
import type { OutreachMethod } from '../../../../collections/tables/outreach_methods.js';
import type { Profile } from '../../../../collections/tables/profiles.js';
import type { RegionFolder } from '../../../../collections/tables/region_folders.js';
import type { Region } from '../../../../collections/tables/regions.js';
import type { RequestedControlAction } from '../../../../collections/tables/requested_control_actions.js';
import type { RouteItem } from '../../../../collections/tables/route_items.js';
import type { Route } from '../../../../collections/tables/routes.js';
import type { SampleSpecies } from '../../../../collections/tables/sample_species.js';
import type { Sample } from '../../../../collections/tables/samples.js';
import type { ServiceRequest } from '../../../../collections/tables/service_requests.js';
import type { SourceReductionMethod } from '../../../../collections/tables/source_reduction_methods.js';
import type { SourceReduction } from '../../../../collections/tables/source_reductions.js';
import type { Species } from '../../../../collections/tables/species.js';
import type { TagItem } from '../../../../collections/tables/tag_items.js';
import type { Tag } from '../../../../collections/tables/tags.js';
import type { Trap } from '../../../../collections/tables/traps.js';
import type { Unit } from '../../../../collections/tables/units.js';
import type { User } from '../../../../collections/tables/users.js';
import type { Vehicle } from '../../../../collections/tables/vehicles.js';
import type { WeatherSourceSubscription } from '../../../../collections/tables/weather_source_subscriptions.js';
import type { WeatherSource } from '../../../../collections/tables/weather_sources.js';
import type { WeatherSummary } from '../../../../collections/tables/weather_summaries.js';

/**
 * Drift between a collection schema and the database.
 *
 * Most of it fails `tsc`, not the runner. A column added to a table in a
 * migration, renamed, dropped, or given a different type shows up here as a build
 * error naming the column, rather than as a row that silently arrives with a field
 * no schema knows about or a field whose type is a lie.
 *
 * The one runtime test is the one thing `tsc` cannot say: that every table with a
 * row schema has a pair below. A hand-written schema module with no pair used to
 * be a table nothing checked at all.
 *
 * Generated by `pnpm generate:schemas`.
 */

/** Columns no client receives, on any table, so their absence is correct. */
type ClientOmitted = 'geom' | 'geojson' | 'deleted_at' | 'deleted_by_profile_id';

/**
 * Exact type identity.
 *
 * Assignability is the wrong question in both directions: a schema that dropped
 * an enum member still assigns to the column, and one that gained a member is
 * still assignable from it.
 */
type Equals<A, B> =
	(<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;

/**
 * A key in the table that no schema field covers, or the reverse.
 *
 * `TWithheld` is what one table keeps from its readers, passed at the call sites
 * below and declared in `WITHHELD` in `scripts/withheld-columns.mjs`, which
 * generates both this file and the schema the column is missing from. It is
 * constrained to `keyof TTable`, so withholding a column a migration has since
 * renamed or dropped is an error here rather than a line that quietly withholds
 * nothing.
 */
type MissingColumns<TSchema, TTable, TWithheld extends keyof TTable> =
	| Exclude<keyof TTable, keyof TSchema | ClientOmitted | TWithheld>
	| Exclude<keyof TSchema, keyof TTable>;

/**
 * A column both sides carry whose type they disagree about.
 *
 * `SelectType` is the half of a `ColumnType` a read yields, which is the half a
 * client sees. Comparing the key union alone passed a column that went nullable,
 * gained an enum member, or changed from `text` to `integer`.
 *
 * `TWireDate` is the columns that are a SQL `date`. They reach a collection as
 * the `YYYY-MM-DD` string Electric streams and reach Kysely as whatever the pg
 * driver parses, so the two transports genuinely differ and only the column is
 * compared.
 */
type ChangedColumns<TSchema, TTable, TWireDate> = {
	[K in Extract<keyof TSchema, keyof TTable>]: K extends TWireDate
		? never
		: Equals<TSchema[K], SelectType<TTable[K]>> extends true
			? never
			: K;
}[Extract<keyof TSchema, keyof TTable>];

type Drift<
	TSchema,
	TTable,
	TWithheld extends keyof TTable = never,
	TWireDate extends keyof TSchema & keyof TTable = never,
> = MissingColumns<TSchema, TTable, TWithheld> | ChangedColumns<TSchema, TTable, TWireDate>;

/** Errors with the offending column names when `T` is not `never`. */
type Assert<T extends never> = T;

type AdditionalPersonnelDrift = Drift<AdditionalPersonnel, AdditionalPersonnelTable>;
type _AdditionalPersonnel = Assert<AdditionalPersonnelDrift>;
type AddressDrift = Drift<Address, AddressesTable>;
type _Address = Assert<AddressDrift>;
type ApplicationBatchDrift = Drift<ApplicationBatch, ApplicationBatchesTable>;
type _ApplicationBatch = Assert<ApplicationBatchDrift>;
type ApplicationMethodDrift = Drift<ApplicationMethod, ApplicationMethodsTable>;
type _ApplicationMethod = Assert<ApplicationMethodDrift>;
type ApplicationDrift = Drift<Application, ApplicationsTable, never, 'application_date'>;
type _Application = Assert<ApplicationDrift>;
type AssignmentItemDrift = Drift<AssignmentItem, AssignmentItemsTable>;
type _AssignmentItem = Assert<AssignmentItemDrift>;
type AssignmentDrift = Drift<Assignment, AssignmentsTable, never, 'assignment_date'>;
type _Assignment = Assert<AssignmentDrift>;
type BiocontrolActionDrift = Drift<
	BiocontrolAction,
	BiocontrolActionsTable,
	never,
	'biocontrol_date'
>;
type _BiocontrolAction = Assert<BiocontrolActionDrift>;
type BiocontrolMethodDrift = Drift<BiocontrolMethod, BiocontrolMethodsTable>;
type _BiocontrolMethod = Assert<BiocontrolMethodDrift>;
type CollectionLureDrift = Drift<CollectionLure, CollectionLuresTable>;
type _CollectionLure = Assert<CollectionLureDrift>;
type CollectionMethodDrift = Drift<CollectionMethod, CollectionMethodsTable>;
type _CollectionMethod = Assert<CollectionMethodDrift>;
type CollectionSpeciesDrift = Drift<
	CollectionSpecies,
	CollectionSpeciesTable,
	never,
	'identified_date'
>;
type _CollectionSpecies = Assert<CollectionSpeciesDrift>;
type AdultCollectionDrift = Drift<AdultCollection, CollectionsTable, never, 'collection_date'>;
type _AdultCollection = Assert<AdultCollectionDrift>;
type CommentDrift = Drift<Comment, CommentsTable>;
type _Comment = Assert<CommentDrift>;
type ContactDrift = Drift<Contact, ContactsTable>;
type _Contact = Assert<ContactDrift>;
type EquipmentDrift = Drift<Equipment, EquipmentTable>;
type _Equipment = Assert<EquipmentDrift>;
type FormulationInsecticideDrift = Drift<FormulationInsecticide, FormulationInsecticidesTable>;
type _FormulationInsecticide = Assert<FormulationInsecticideDrift>;
type FormulationDrift = Drift<Formulation, FormulationsTable>;
type _Formulation = Assert<FormulationDrift>;
type GenusDrift = Drift<Genus, GeneraTable>;
type _Genus = Assert<GenusDrift>;
type HabitatTypeDrift = Drift<HabitatType, HabitatTypesTable>;
type _HabitatType = Assert<HabitatTypeDrift>;
type HabitatDrift = Drift<Habitat, HabitatsTable>;
type _Habitat = Assert<HabitatDrift>;
type InsecticideBatchDrift = Drift<InsecticideBatch, InsecticideBatchesTable>;
type _InsecticideBatch = Assert<InsecticideBatchDrift>;
type InsecticideDrift = Drift<Insecticide, InsecticidesTable>;
type _Insecticide = Assert<InsecticideDrift>;
type InspectionDrift = Drift<Inspection, InspectionsTable, never, 'inspection_date'>;
type _Inspection = Assert<InspectionDrift>;
type MembershipDrift = Drift<
	Membership,
	MembershipsTable,
	'invited_email' | 'workos_invitation_id'
>;
type _Membership = Assert<MembershipDrift>;
type MissionItemDrift = Drift<MissionItem, MissionItemsTable>;
type _MissionItem = Assert<MissionItemDrift>;
type MissionNotificationDrift = Drift<MissionNotification, MissionNotificationsTable>;
type _MissionNotification = Assert<MissionNotificationDrift>;
type MissionDrift = Drift<Mission, MissionsTable, never, 'rain_date'>;
type _Mission = Assert<MissionDrift>;
type NotificationRegistrationTypeDrift = Drift<
	NotificationRegistrationType,
	NotificationRegistrationTypesTable
>;
type _NotificationRegistrationType = Assert<NotificationRegistrationTypeDrift>;
type NotificationRegistrationDrift = Drift<
	NotificationRegistration,
	NotificationRegistrationsTable
>;
type _NotificationRegistration = Assert<NotificationRegistrationDrift>;
type NotificationTypeDrift = Drift<NotificationType, NotificationTypesTable>;
type _NotificationType = Assert<NotificationTypeDrift>;
type OrganizationSpeciesDrift = Drift<OrganizationSpecies, OrganizationSpeciesTable>;
type _OrganizationSpecies = Assert<OrganizationSpeciesDrift>;
type OrganizationDrift = Drift<
	Organization,
	OrganizationsTable,
	| 'subscription_status'
	| 'billing_mode'
	| 'billing_contact_name'
	| 'billing_contact_email'
	| 'subscription_notes'
>;
type _Organization = Assert<OrganizationDrift>;
type OutreachActionDrift = Drift<OutreachAction, OutreachActionsTable, never, 'outreach_date'>;
type _OutreachAction = Assert<OutreachActionDrift>;
type OutreachMethodDrift = Drift<OutreachMethod, OutreachMethodsTable>;
type _OutreachMethod = Assert<OutreachMethodDrift>;
type ProfileDrift = Drift<Profile, ProfilesTable>;
type _Profile = Assert<ProfileDrift>;
type RegionFolderDrift = Drift<RegionFolder, RegionFoldersTable>;
type _RegionFolder = Assert<RegionFolderDrift>;
type RegionDrift = Drift<Region, RegionsTable>;
type _Region = Assert<RegionDrift>;
type RequestedControlActionDrift = Drift<RequestedControlAction, RequestedControlActionsTable>;
type _RequestedControlAction = Assert<RequestedControlActionDrift>;
type RouteItemDrift = Drift<RouteItem, RouteItemsTable>;
type _RouteItem = Assert<RouteItemDrift>;
type RouteDrift = Drift<Route, RoutesTable>;
type _Route = Assert<RouteDrift>;
type SampleSpeciesDrift = Drift<SampleSpecies, SampleSpeciesTable, never, 'identified_at'>;
type _SampleSpecies = Assert<SampleSpeciesDrift>;
type SampleDrift = Drift<Sample, SamplesTable>;
type _Sample = Assert<SampleDrift>;
type ServiceRequestDrift = Drift<ServiceRequest, ServiceRequestsTable, never, 'request_date'>;
type _ServiceRequest = Assert<ServiceRequestDrift>;
type SourceReductionMethodDrift = Drift<SourceReductionMethod, SourceReductionMethodsTable>;
type _SourceReductionMethod = Assert<SourceReductionMethodDrift>;
type SourceReductionDrift = Drift<
	SourceReduction,
	SourceReductionsTable,
	never,
	'source_reduction_date'
>;
type _SourceReduction = Assert<SourceReductionDrift>;
type SpeciesDrift = Drift<Species, SpeciesTable>;
type _Species = Assert<SpeciesDrift>;
type TagItemDrift = Drift<TagItem, TagItemsTable>;
type _TagItem = Assert<TagItemDrift>;
type TagDrift = Drift<Tag, TagsTable>;
type _Tag = Assert<TagDrift>;
type TrapDrift = Drift<Trap, TrapsTable>;
type _Trap = Assert<TrapDrift>;
type UnitDrift = Drift<Unit, UnitsTable>;
type _Unit = Assert<UnitDrift>;
type UserDrift = Drift<User, UsersTable>;
type _User = Assert<UserDrift>;
type VehicleDrift = Drift<Vehicle, VehiclesTable>;
type _Vehicle = Assert<VehicleDrift>;
type WeatherSourceSubscriptionDrift = Drift<
	WeatherSourceSubscription,
	WeatherSourceSubscriptionsTable
>;
type _WeatherSourceSubscription = Assert<WeatherSourceSubscriptionDrift>;
type WeatherSourceDrift = Drift<WeatherSource, WeatherSourcesTable>;
type _WeatherSource = Assert<WeatherSourceDrift>;
type WeatherSummaryDrift = Drift<
	WeatherSummary,
	WeatherSummariesTable,
	never,
	'start_date' | 'end_date'
>;
type _WeatherSummary = Assert<WeatherSummaryDrift>;

/** The tables with a pair above, which is meant to be every table with a schema. */
const CHECKED_TABLES = [
	'additional_personnel',
	'addresses',
	'application_batches',
	'application_methods',
	'applications',
	'assignment_items',
	'assignments',
	'biocontrol_actions',
	'biocontrol_methods',
	'collection_lures',
	'collection_methods',
	'collection_species',
	'collections',
	'comments',
	'contacts',
	'equipment',
	'formulation_insecticides',
	'formulations',
	'genera',
	'habitat_types',
	'habitats',
	'insecticide_batches',
	'insecticides',
	'inspections',
	'memberships',
	'mission_items',
	'mission_notifications',
	'missions',
	'notification_registration_types',
	'notification_registrations',
	'notification_types',
	'organization_species',
	'organizations',
	'outreach_actions',
	'outreach_methods',
	'profiles',
	'region_folders',
	'regions',
	'requested_control_actions',
	'route_items',
	'routes',
	'sample_species',
	'samples',
	'service_requests',
	'source_reduction_methods',
	'source_reductions',
	'species',
	'tag_items',
	'tags',
	'traps',
	'units',
	'users',
	'vehicles',
	'weather_source_subscriptions',
	'weather_sources',
	'weather_summaries',
];

describe('collection schemas against the database', () => {
	it('is checked by tsc rather than by the runner', () => {
		// Every assertion above is a type. This keeps the file a valid suite.
		expect(true).toBe(true);
	});

	it('pairs every row schema with a table type', () => {
		// Against the registry rather than the directory, because the registry is
		// what the server reads columns out of. A schema in it and not here is a
		// table streaming to clients with nothing holding it to the database.
		expect([...CHECKED_TABLES].sort()).toEqual(Object.keys(tableSchemas).sort());
	});
});
