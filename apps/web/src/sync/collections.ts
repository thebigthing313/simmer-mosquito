import {
	type AdditionalPersonnelRow,
	type AddressRow,
	type AdultCollectionRow,
	type ApplicationBatchRow,
	type ApplicationRow,
	type AssignmentItemRow,
	type AssignmentRow,
	type BiocontrolActionRow,
	type CollectionLureRow,
	type CollectionMethodRow,
	type CollectionSpeciesRow,
	type CommentRow,
	type ContactRow,
	type ControlMethodRow,
	type EquipmentRow,
	electricShapeCollectionOptions,
	type FormulationInsecticideRow,
	type FormulationRow,
	type GenusRow,
	type HabitatRow,
	type HabitatTypeRow,
	type InsecticideBatchRow,
	type InsecticideRow,
	type InspectionRow,
	type MembershipRow,
	type MissionNotificationRow,
	type NotificationRegistrationRow,
	type NotificationRegistrationTypeRow,
	type NotificationTypeRow,
	type OrganizationRow,
	type OrganizationSpeciesRow,
	type OutreachActionRow,
	type ProfileRow,
	type RegionFolderRow,
	type RegionRow,
	type RouteItemRow,
	type RouteRow,
	type SampleRow,
	type SampleSpeciesRow,
	type ServiceRequestRow,
	type SourceReductionRow,
	type SpeciesRow,
	shapePathFor,
	type TagItemRow,
	type TagRow,
	type TrapRow,
	type UnitRow,
	type VehicleRow,
	type WeatherSourceRow,
	type WeatherSummaryRow,
	type WebSyncMode,
} from '@simmer-mosquito/sync';
import { BasicIndex, type Collection, createCollection } from '@tanstack/react-db';
import { createAddressMutationHandlers } from './addressMutations';
import {
	createCollectionMutationHandlers,
	createCollectionSpeciesMutationHandlers,
	createTrapMutationHandlers,
} from './adultSurveillanceMutations';
import {
	createApplicationBatchMutationHandlers,
	createApplicationMutationHandlers,
	createBiocontrolActionMutationHandlers,
	createOutreachActionMutationHandlers,
	createSourceReductionMutationHandlers,
} from './controlOperationsMutations';
import {
	createAdditionalPersonnelMutationHandlers,
	createAssignmentItemMutationHandlers,
	createAssignmentMutationHandlers,
	createCommentMutationHandlers,
	createRouteItemMutationHandlers,
	createRouteMutationHandlers,
	createTagItemMutationHandlers,
} from './fieldWorkMissionMutations';
import {
	createOrganizationSpeciesMutationHandlers,
	createRegionFolderMutationHandlers,
	createRegionMutationHandlers,
} from './foundationGeographyMutations';
import { createHabitatMutationHandlers } from './habitatMutations';
import {
	createInspectionMutationHandlers,
	createSampleMutationHandlers,
	createSampleSpeciesMutationHandlers,
} from './larvalSurveillanceMutations';
import { createOrganizationMutationHandlers } from './organizationMutations';
import { createProfileMutationHandlers } from './profileMutations';
import {
	createContactMutationHandlers,
	createMissionNotificationMutationHandlers,
	createNotificationRegistrationMutationHandlers,
	createNotificationRegistrationTypeMutationHandlers,
	createServiceRequestMutationHandlers,
} from './publicEngagementMutations';
import { webSyncModes } from './sync-modes';
import { createTagMutationHandlers } from './tagMutations';

export interface WebCollections {
	readonly additionalPersonnel: Collection<AdditionalPersonnelRow, string | number>;
	readonly addresses: Collection<AddressRow, string | number>;
	readonly applicationBatches: Collection<ApplicationBatchRow, string | number>;
	readonly applications: Collection<ApplicationRow, string | number>;
	readonly assignmentItems: Collection<AssignmentItemRow, string | number>;
	readonly assignments: Collection<AssignmentRow, string | number>;
	readonly biocontrolActions: Collection<BiocontrolActionRow, string | number>;
	readonly collectionSpecies: Collection<CollectionSpeciesRow, string | number>;
	readonly collections: Collection<AdultCollectionRow, string | number>;
	readonly comments: Collection<CommentRow, string | number>;
	readonly contacts: Collection<ContactRow, string | number>;
	readonly genera: Collection<GenusRow, string | number>;
	readonly habitats: Collection<HabitatRow, string | number>;
	readonly inspections: Collection<InspectionRow, string | number>;
	readonly memberships: Collection<MembershipRow, string | number>;
	readonly missionNotifications: Collection<MissionNotificationRow, string | number>;
	readonly notificationRegistrations: Collection<NotificationRegistrationRow, string | number>;
	readonly notificationRegistrationTypes: Collection<
		NotificationRegistrationTypeRow,
		string | number
	>;
	readonly currentOrganization: Collection<OrganizationRow, string | number>;
	readonly organizationSpecies: Collection<OrganizationSpeciesRow, string | number>;
	readonly outreachActions: Collection<OutreachActionRow, string | number>;
	readonly profiles: Collection<ProfileRow, string | number>;
	readonly regionFolders: Collection<RegionFolderRow, string | number>;
	readonly regions: Collection<RegionRow, string | number>;
	readonly routeItems: Collection<RouteItemRow, string | number>;
	readonly routes: Collection<RouteRow, string | number>;
	readonly samples: Collection<SampleRow, string | number>;
	readonly sampleSpecies: Collection<SampleSpeciesRow, string | number>;
	readonly serviceRequests: Collection<ServiceRequestRow, string | number>;
	readonly sourceReductions: Collection<SourceReductionRow, string | number>;
	readonly species: Collection<SpeciesRow, string | number>;
	readonly tagItems: Collection<TagItemRow, string | number>;
	readonly tags: Collection<TagRow, string | number>;
	readonly traps: Collection<TrapRow, string | number>;
	readonly units: Collection<UnitRow, string | number>;
	readonly weatherSources: Collection<WeatherSourceRow, string | number>;
	readonly weatherSummaries: Collection<WeatherSummaryRow, string | number>;
}

export const webBaselineCollectionKeys = [
	'units',
	'profiles',
	'memberships',
	'genera',
	'species',
	'organizationSpecies',
	'currentOrganization',
	'tags',
	'routes',
	'regionFolders',
	'traps',
	'weatherSources',
] as const satisfies readonly (keyof WebCollections)[];

interface PreloadableCollection {
	readonly preload: () => Promise<unknown>;
}

/**
 * Sort indexes.
 *
 * A TanStack DB query that pairs `orderBy` with `limit` can only page lazily
 * when the sorted column is indexed. Without one it silently sorts the whole
 * collection to hand back six rows, and says so in a console warning — which is
 * how the habitat pickers were found doing it on every keystroke.
 *
 * Indexes are declared per column rather than switching the collections to
 * `autoIndex: 'eager'`: only a handful of columns are ever sorted-and-limited
 * (the typeahead pickers), and eager auto-indexing would build and maintain
 * indexes for every column of every collection to serve them. Each one is
 * written next to its collection with a note naming the surface that sorts by
 * it, so an index that outlives its picker is visible as dead weight.
 */
function createReadOnlyWebCollection<TRow extends { readonly id: string }>(
	table: string,
	shapeServerUrl: string,
	syncMode: WebSyncMode,
): Collection<TRow, string | number> {
	return createCollection(
		electricShapeCollectionOptions<TRow>({
			table,
			url: `${shapeServerUrl}${shapePathFor(table)}`,
			syncMode,
		}),
	);
}

export function createWebCollections(options: {
	readonly serverUrl: string;
	readonly shapeServerUrl?: string;
}): WebCollections {
	const shapeServerUrl = options.shapeServerUrl ?? options.serverUrl;
	const units = createCollection(
		electricShapeCollectionOptions<UnitRow>({
			table: 'units',
			syncMode: webSyncModes.units,
			url: `${shapeServerUrl}${shapePathFor('units')}`,
		}),
	);
	const profiles = createCollection(
		electricShapeCollectionOptions<ProfileRow>({
			table: 'profiles',
			syncMode: webSyncModes.profiles,
			url: `${shapeServerUrl}${shapePathFor('profiles')}`,
			...createProfileMutationHandlers({
				serverUrl: options.serverUrl,
			}),
		}),
	);
	const memberships = createCollection(
		electricShapeCollectionOptions<MembershipRow>({
			table: 'memberships',
			syncMode: webSyncModes.memberships,
			url: `${shapeServerUrl}${shapePathFor('memberships')}`,
		}),
	);
	const genera = createCollection(
		electricShapeCollectionOptions<GenusRow>({
			table: 'genera',
			syncMode: webSyncModes.genera,
			url: `${shapeServerUrl}${shapePathFor('genera')}`,
		}),
	);
	const species = createCollection(
		electricShapeCollectionOptions<SpeciesRow>({
			table: 'species',
			syncMode: webSyncModes.species,
			url: `${shapeServerUrl}${shapePathFor('species')}`,
		}),
	);
	const organizationSpecies = createCollection(
		electricShapeCollectionOptions<OrganizationSpeciesRow>({
			table: 'organization_species',
			syncMode: webSyncModes.organization_species,
			url: `${shapeServerUrl}${shapePathFor('organization_species')}`,
			...createOrganizationSpeciesMutationHandlers({ serverUrl: options.serverUrl }),
		}),
	);
	const currentOrganization = createCollection(
		electricShapeCollectionOptions<OrganizationRow>({
			table: 'organizations',
			syncMode: webSyncModes.organizations,
			url: `${shapeServerUrl}${shapePathFor('organizations')}`,
			...createOrganizationMutationHandlers({
				serverUrl: options.serverUrl,
			}),
		}),
	);
	const addresses = createCollection(
		electricShapeCollectionOptions<AddressRow>({
			table: 'addresses',
			syncMode: webSyncModes.addresses,
			url: `${shapeServerUrl}${shapePathFor('addresses')}`,
			...createAddressMutationHandlers({
				serverUrl: options.serverUrl,
			}),
		}),
	);
	// The address picker on every location-bearing form.
	addresses.createIndex((row) => row.displayName, { indexType: BasicIndex });
	const tags = createCollection(
		electricShapeCollectionOptions<TagRow>({
			table: 'tags',
			syncMode: webSyncModes.tags,
			url: `${shapeServerUrl}${shapePathFor('tags')}`,
			...createTagMutationHandlers({
				serverUrl: options.serverUrl,
			}),
		}),
	);
	const routes = createCollection(
		electricShapeCollectionOptions<RouteRow>({
			table: 'routes',
			syncMode: webSyncModes.routes,
			url: `${shapeServerUrl}${shapePathFor('routes')}`,
			...createRouteMutationHandlers({ serverUrl: options.serverUrl }),
		}),
	);
	const habitats = createCollection(
		electricShapeCollectionOptions<HabitatRow>({
			table: 'habitats',
			syncMode: webSyncModes.habitats,
			url: `${shapeServerUrl}${shapePathFor('habitats')}`,
			...createHabitatMutationHandlers({
				serverUrl: options.serverUrl,
			}),
		}),
	);
	// The habitat pickers on the control-action and inspection forms.
	habitats.createIndex((row) => row.habitatName, { indexType: BasicIndex });
	const inspections = createCollection(
		electricShapeCollectionOptions<InspectionRow>({
			table: 'inspections',
			syncMode: webSyncModes.inspections,
			url: `${shapeServerUrl}${shapePathFor('inspections')}`,
			...createInspectionMutationHandlers({
				serverUrl: options.serverUrl,
			}),
		}),
	);
	const samples = createCollection(
		electricShapeCollectionOptions<SampleRow>({
			table: 'samples',
			syncMode: webSyncModes.samples,
			url: `${shapeServerUrl}${shapePathFor('samples')}`,
			...createSampleMutationHandlers({
				serverUrl: options.serverUrl,
			}),
		}),
	);
	const sampleSpecies = createCollection(
		electricShapeCollectionOptions<SampleSpeciesRow>({
			table: 'sample_species',
			syncMode: webSyncModes.sample_species,
			url: `${shapeServerUrl}${shapePathFor('sample_species')}`,
			...createSampleSpeciesMutationHandlers({
				serverUrl: options.serverUrl,
			}),
		}),
	);
	const regionFolders = createCollection(
		electricShapeCollectionOptions<RegionFolderRow>({
			table: 'region_folders',
			syncMode: webSyncModes.region_folders,
			url: `${shapeServerUrl}${shapePathFor('region_folders')}`,
			...createRegionFolderMutationHandlers({ serverUrl: options.serverUrl }),
		}),
	);
	const regions = createCollection(
		electricShapeCollectionOptions<RegionRow>({
			table: 'regions',
			syncMode: webSyncModes.regions,
			url: `${shapeServerUrl}${shapePathFor('regions')}`,
			...createRegionMutationHandlers({ serverUrl: options.serverUrl }),
		}),
	);
	// The region boundary picker on the habitat and region forms.
	regions.createIndex((row) => row.name, { indexType: BasicIndex });
	const traps = createCollection(
		electricShapeCollectionOptions<TrapRow>({
			table: 'traps',
			syncMode: webSyncModes.traps,
			url: `${shapeServerUrl}${shapePathFor('traps')}`,
			...createTrapMutationHandlers({
				serverUrl: options.serverUrl,
			}),
		}),
	);
	const collections = createCollection(
		electricShapeCollectionOptions<AdultCollectionRow>({
			table: 'collections',
			syncMode: webSyncModes.collections,
			url: `${shapeServerUrl}${shapePathFor('collections')}`,
			...createCollectionMutationHandlers({
				serverUrl: options.serverUrl,
			}),
		}),
	);
	const collectionSpecies = createCollection(
		electricShapeCollectionOptions<CollectionSpeciesRow>({
			table: 'collection_species',
			syncMode: webSyncModes.collection_species,
			url: `${shapeServerUrl}${shapePathFor('collection_species')}`,
			...createCollectionSpeciesMutationHandlers({
				serverUrl: options.serverUrl,
			}),
		}),
	);
	const comments = createCollection(
		electricShapeCollectionOptions<CommentRow>({
			table: 'comments',
			syncMode: webSyncModes.comments,
			url: `${shapeServerUrl}${shapePathFor('comments')}`,
			...createCommentMutationHandlers({ serverUrl: options.serverUrl }),
		}),
	);
	const tagItems = createCollection(
		electricShapeCollectionOptions<TagItemRow>({
			table: 'tag_items',
			syncMode: webSyncModes.tag_items,
			url: `${shapeServerUrl}${shapePathFor('tag_items')}`,
			...createTagItemMutationHandlers({ serverUrl: options.serverUrl }),
		}),
	);
	const additionalPersonnel = createCollection(
		electricShapeCollectionOptions<AdditionalPersonnelRow>({
			table: 'additional_personnel',
			syncMode: webSyncModes.additional_personnel,
			url: `${shapeServerUrl}${shapePathFor('additional_personnel')}`,
			...createAdditionalPersonnelMutationHandlers({ serverUrl: options.serverUrl }),
		}),
	);
	const routeItems = createCollection(
		electricShapeCollectionOptions<RouteItemRow>({
			table: 'route_items',
			syncMode: webSyncModes.route_items,
			url: `${shapeServerUrl}${shapePathFor('route_items')}`,
			...createRouteItemMutationHandlers({ serverUrl: options.serverUrl }),
		}),
	);
	const assignments = createCollection(
		electricShapeCollectionOptions<AssignmentRow>({
			table: 'assignments',
			syncMode: webSyncModes.assignments,
			url: `${shapeServerUrl}${shapePathFor('assignments')}`,
			...createAssignmentMutationHandlers({ serverUrl: options.serverUrl }),
		}),
	);
	const assignmentItems = createCollection(
		electricShapeCollectionOptions<AssignmentItemRow>({
			table: 'assignment_items',
			syncMode: webSyncModes.assignment_items,
			url: `${shapeServerUrl}${shapePathFor('assignment_items')}`,
			...createAssignmentItemMutationHandlers({ serverUrl: options.serverUrl }),
		}),
	);
	const applications = createCollection(
		electricShapeCollectionOptions<ApplicationRow>({
			table: 'applications',
			syncMode: webSyncModes.applications,
			url: `${shapeServerUrl}${shapePathFor('applications')}`,
			...createApplicationMutationHandlers({ serverUrl: options.serverUrl }),
		}),
	);
	const applicationBatches = createCollection(
		electricShapeCollectionOptions<ApplicationBatchRow>({
			table: 'application_batches',
			syncMode: webSyncModes.application_batches,
			url: `${shapeServerUrl}${shapePathFor('application_batches')}`,
			...createApplicationBatchMutationHandlers({ serverUrl: options.serverUrl }),
		}),
	);
	const sourceReductions = createCollection(
		electricShapeCollectionOptions<SourceReductionRow>({
			table: 'source_reductions',
			syncMode: webSyncModes.source_reductions,
			url: `${shapeServerUrl}${shapePathFor('source_reductions')}`,
			...createSourceReductionMutationHandlers({ serverUrl: options.serverUrl }),
		}),
	);
	const outreachActions = createCollection(
		electricShapeCollectionOptions<OutreachActionRow>({
			table: 'outreach_actions',
			syncMode: webSyncModes.outreach_actions,
			url: `${shapeServerUrl}${shapePathFor('outreach_actions')}`,
			...createOutreachActionMutationHandlers({ serverUrl: options.serverUrl }),
		}),
	);
	const biocontrolActions = createCollection(
		electricShapeCollectionOptions<BiocontrolActionRow>({
			table: 'biocontrol_actions',
			syncMode: webSyncModes.biocontrol_actions,
			url: `${shapeServerUrl}${shapePathFor('biocontrol_actions')}`,
			...createBiocontrolActionMutationHandlers({ serverUrl: options.serverUrl }),
		}),
	);
	const contacts = createCollection(
		electricShapeCollectionOptions<ContactRow>({
			table: 'contacts',
			syncMode: webSyncModes.contacts,
			url: `${shapeServerUrl}${shapePathFor('contacts')}`,
			...createContactMutationHandlers({ serverUrl: options.serverUrl }),
		}),
	);
	// The contact picker on the service-request and outreach forms.
	contacts.createIndex((row) => row.contactName, { indexType: BasicIndex });
	const serviceRequests = createCollection(
		electricShapeCollectionOptions<ServiceRequestRow>({
			table: 'service_requests',
			syncMode: webSyncModes.service_requests,
			url: `${shapeServerUrl}${shapePathFor('service_requests')}`,
			...createServiceRequestMutationHandlers({ serverUrl: options.serverUrl }),
		}),
	);
	const notificationRegistrations = createCollection(
		electricShapeCollectionOptions<NotificationRegistrationRow>({
			table: 'notification_registrations',
			syncMode: webSyncModes.notification_registrations,
			url: `${shapeServerUrl}${shapePathFor('notification_registrations')}`,
			...createNotificationRegistrationMutationHandlers({ serverUrl: options.serverUrl }),
		}),
	);
	const notificationRegistrationTypes = createCollection(
		electricShapeCollectionOptions<NotificationRegistrationTypeRow>({
			table: 'notification_registration_types',
			syncMode: webSyncModes.notification_registration_types,
			url: `${shapeServerUrl}${shapePathFor('notification_registration_types')}`,
			...createNotificationRegistrationTypeMutationHandlers({ serverUrl: options.serverUrl }),
		}),
	);
	const missionNotifications = createCollection(
		electricShapeCollectionOptions<MissionNotificationRow>({
			table: 'mission_notifications',
			syncMode: webSyncModes.mission_notifications,
			url: `${shapeServerUrl}${shapePathFor('mission_notifications')}`,
			...createMissionNotificationMutationHandlers({ serverUrl: options.serverUrl }),
		}),
	);
	const weatherSources = createReadOnlyWebCollection<WeatherSourceRow>(
		'weather_sources',
		shapeServerUrl,
		webSyncModes.weather_sources,
	);
	const weatherSummaries = createReadOnlyWebCollection<WeatherSummaryRow>(
		'weather_summaries',
		shapeServerUrl,
		webSyncModes.weather_summaries,
	);

	return {
		additionalPersonnel,
		addresses,
		applicationBatches,
		applications,
		assignmentItems,
		assignments,
		biocontrolActions,
		collectionSpecies,
		collections,
		comments,
		contacts,
		genera,
		habitats,
		inspections,
		memberships,
		missionNotifications,
		notificationRegistrations,
		notificationRegistrationTypes,
		currentOrganization,
		organizationSpecies,
		outreachActions,
		profiles,
		regionFolders,
		regions,
		routeItems,
		routes,
		samples,
		sampleSpecies,
		serviceRequests,
		sourceReductions,
		species,
		tagItems,
		tags,
		traps,
		units,
		weatherSources,
		weatherSummaries,
	};
}

export async function preloadWebBaselineCollections(collections: WebCollections): Promise<void> {
	await Promise.all(
		webBaselineCollectionKeys.map((key) => (collections[key] as PreloadableCollection).preload()),
	);
}
