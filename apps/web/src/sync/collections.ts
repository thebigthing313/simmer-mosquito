import {
	type AdditionalPersonnelRow,
	type ApplicationBatchRow,
	type AssignmentItemRow,
	type AssignmentRow,
	type CommentRow,
	electricShapeCollectionOptions,
	type GenusRow,
	type MembershipRow,
	type MissionNotificationRow,
	type NotificationRegistrationRow,
	type NotificationRegistrationTypeRow,
	type OrganizationRow,
	type OrganizationSpeciesRow,
	type ProfileRow,
	type RouteItemRow,
	type RouteRow,
	type SpeciesRow,
	shapePathFor,
	type TagItemRow,
	type TagRow,
	type UnitRow,
	type WeatherSourceRow,
	type WeatherSummaryRow,
	type WebSyncMode,
} from '@simmer-mosquito/sync';
import { BasicIndex, type Collection, createCollection } from '@tanstack/react-db';
import { createApplicationBatchMutationHandlers } from './controlOperationsMutations';
import {
	createAdditionalPersonnelMutationHandlers,
	createAssignmentItemMutationHandlers,
	createAssignmentMutationHandlers,
	createCommentMutationHandlers,
	createRouteItemMutationHandlers,
	createRouteMutationHandlers,
	createTagItemMutationHandlers,
} from './fieldWorkMissionMutations';
import { createOrganizationSpeciesMutationHandlers } from './foundationGeographyMutations';
import { createOrganizationMutationHandlers } from './organizationMutations';
import { createProfileMutationHandlers } from './profileMutations';
import {
	createMissionNotificationMutationHandlers,
	createNotificationRegistrationMutationHandlers,
	createNotificationRegistrationTypeMutationHandlers,
} from './publicEngagementMutations';
import { webSyncModes } from './sync-modes';
import { createTagMutationHandlers } from './tagMutations';

export interface WebCollections {
	readonly additionalPersonnel: Collection<AdditionalPersonnelRow, string | number>;
	readonly applicationBatches: Collection<ApplicationBatchRow, string | number>;
	readonly assignmentItems: Collection<AssignmentItemRow, string | number>;
	readonly assignments: Collection<AssignmentRow, string | number>;
	readonly comments: Collection<CommentRow, string | number>;
	readonly genera: Collection<GenusRow, string | number>;
	readonly memberships: Collection<MembershipRow, string | number>;
	readonly missionNotifications: Collection<MissionNotificationRow, string | number>;
	readonly notificationRegistrations: Collection<NotificationRegistrationRow, string | number>;
	readonly notificationRegistrationTypes: Collection<
		NotificationRegistrationTypeRow,
		string | number
	>;
	readonly currentOrganization: Collection<OrganizationRow, string | number>;
	readonly organizationSpecies: Collection<OrganizationSpeciesRow, string | number>;
	readonly profiles: Collection<ProfileRow, string | number>;
	readonly routeItems: Collection<RouteItemRow, string | number>;
	readonly routes: Collection<RouteRow, string | number>;
	readonly species: Collection<SpeciesRow, string | number>;
	readonly tagItems: Collection<TagItemRow, string | number>;
	readonly tags: Collection<TagRow, string | number>;
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
	const applicationBatches = createCollection(
		electricShapeCollectionOptions<ApplicationBatchRow>({
			table: 'application_batches',
			syncMode: webSyncModes.application_batches,
			url: `${shapeServerUrl}${shapePathFor('application_batches')}`,
			...createApplicationBatchMutationHandlers({ serverUrl: options.serverUrl }),
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
		applicationBatches,
		assignmentItems,
		assignments,
		comments,
		genera,
		memberships,
		missionNotifications,
		notificationRegistrations,
		notificationRegistrationTypes,
		currentOrganization,
		organizationSpecies,
		profiles,
		routeItems,
		routes,
		species,
		tagItems,
		tags,
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
