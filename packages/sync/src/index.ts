import {
	type ElectricCollectionConfig,
	electricCollectionOptions,
} from '@tanstack/electric-db-collection';
import type { SyncShapeScope } from './descriptor-factory.js';
import * as syncDescriptors from './descriptors/index.js';

export {
	isTxIdConfirmationTimeout,
	type PersistableTransaction,
	settleWrite,
} from './settle-write.js';

export type WebSyncMode = 'eager' | 'on-demand';

export interface SyncDescriptor<TRow extends { readonly id: string }> {
	readonly id: string;
	readonly table: string;
	readonly endpointPath: string;
	readonly syncMode: WebSyncMode;
	readonly scope: SyncShapeScope;
	readonly columns: readonly (keyof TRow & string)[];
	readonly getKey: (row: TRow) => string;
}

/**
 * Everything the server needs to register a shape route, with the row type
 * erased so one loop can carry all of them.
 */
export interface SyncShapeRoute {
	readonly id: string;
	readonly table: string;
	readonly endpointPath: string;
	readonly scope: SyncShapeScope;
	readonly columns: readonly string[];
}

export * from './descriptor-factory.js';
export * from './row-payload-mapper.js';
export * from './rows/index.js';

/**
 * Every shape the server exposes, read off the descriptor barrel rather than
 * listed again. Adding a descriptor file adds its route; there is no second
 * place to remember, and no way for a path or scope to be typed twice and
 * disagree.
 */
export const syncShapeDescriptors: readonly SyncShapeRoute[] = Object.values(syncDescriptors);

import {
	additionalPersonnelSyncDescriptor,
	addressesSyncDescriptor,
	applicationBatchesSyncDescriptor,
	applicationMethodsSyncDescriptor,
	applicationsSyncDescriptor,
	assignmentItemsSyncDescriptor,
	assignmentsSyncDescriptor,
	biocontrolActionsSyncDescriptor,
	biocontrolMethodsSyncDescriptor,
	collectionLuresSyncDescriptor,
	collectionMethodsSyncDescriptor,
	collectionSpeciesSyncDescriptor,
	collectionsSyncDescriptor,
	commentsSyncDescriptor,
	contactsSyncDescriptor,
	currentOrganizationSyncDescriptor,
	equipmentSyncDescriptor,
	formulationInsecticidesSyncDescriptor,
	formulationsSyncDescriptor,
	generaSyncDescriptor,
	habitatsSyncDescriptor,
	habitatTypesSyncDescriptor,
	insecticideBatchesSyncDescriptor,
	insecticidesSyncDescriptor,
	inspectionsSyncDescriptor,
	membershipsSyncDescriptor,
	missionItemsSyncDescriptor,
	missionNotificationsSyncDescriptor,
	missionsSyncDescriptor,
	notificationRegistrationsSyncDescriptor,
	notificationRegistrationTypesSyncDescriptor,
	notificationTypesSyncDescriptor,
	organizationSpeciesSyncDescriptor,
	outreachActionsSyncDescriptor,
	outreachMethodsSyncDescriptor,
	profilesSyncDescriptor,
	regionFoldersSyncDescriptor,
	regionsSyncDescriptor,
	requestedControlActionsSyncDescriptor,
	routeItemsSyncDescriptor,
	routesSyncDescriptor,
	sampleSpeciesSyncDescriptor,
	samplesSyncDescriptor,
	serviceRequestsSyncDescriptor,
	sourceReductionMethodsSyncDescriptor,
	sourceReductionsSyncDescriptor,
	speciesSyncDescriptor,
	tagItemsSyncDescriptor,
	tagsSyncDescriptor,
	trapsSyncDescriptor,
	unitsSyncDescriptor,
	vehiclesSyncDescriptor,
	weatherSourceSubscriptionsSyncDescriptor,
	weatherSourcesSyncDescriptor,
	weatherSummariesSyncDescriptor,
} from './descriptors/index.js';

export * from './descriptors/index.js';

export const observationalReadOnlySyncDescriptors = [
	unitsSyncDescriptor,
	profilesSyncDescriptor,
	membershipsSyncDescriptor,
	generaSyncDescriptor,
	speciesSyncDescriptor,
	organizationSpeciesSyncDescriptor,
	applicationMethodsSyncDescriptor,
	sourceReductionMethodsSyncDescriptor,
	outreachMethodsSyncDescriptor,
	biocontrolMethodsSyncDescriptor,
	vehiclesSyncDescriptor,
	equipmentSyncDescriptor,
	insecticidesSyncDescriptor,
	insecticideBatchesSyncDescriptor,
	notificationTypesSyncDescriptor,
	inspectionsSyncDescriptor,
	samplesSyncDescriptor,
	sampleSpeciesSyncDescriptor,
	routesSyncDescriptor,
	regionFoldersSyncDescriptor,
	regionsSyncDescriptor,
	trapsSyncDescriptor,
	collectionsSyncDescriptor,
	collectionSpeciesSyncDescriptor,
	commentsSyncDescriptor,
	tagItemsSyncDescriptor,
	additionalPersonnelSyncDescriptor,
	routeItemsSyncDescriptor,
	assignmentsSyncDescriptor,
	assignmentItemsSyncDescriptor,
	formulationsSyncDescriptor,
	formulationInsecticidesSyncDescriptor,
	applicationsSyncDescriptor,
	applicationBatchesSyncDescriptor,
	sourceReductionsSyncDescriptor,
	outreachActionsSyncDescriptor,
	biocontrolActionsSyncDescriptor,
	contactsSyncDescriptor,
	serviceRequestsSyncDescriptor,
	requestedControlActionsSyncDescriptor,
	missionsSyncDescriptor,
	missionItemsSyncDescriptor,
	notificationRegistrationsSyncDescriptor,
	notificationRegistrationTypesSyncDescriptor,
	missionNotificationsSyncDescriptor,
	weatherSourcesSyncDescriptor,
	weatherSourceSubscriptionsSyncDescriptor,
	weatherSummariesSyncDescriptor,
] as const;

export const foundationWritableSyncDescriptors = [
	currentOrganizationSyncDescriptor,
	addressesSyncDescriptor,
	collectionMethodsSyncDescriptor,
	collectionLuresSyncDescriptor,
	habitatTypesSyncDescriptor,
	habitatsSyncDescriptor,
	tagsSyncDescriptor,
] as const;

export const webReadOnlyTracerDescriptors = observationalReadOnlySyncDescriptors;
export const webCommandMutationDescriptors = foundationWritableSyncDescriptors;

export function electricShapeCollectionOptions<TRow extends { readonly id: string }>(
	input: {
		readonly descriptor: SyncDescriptor<TRow>;
		readonly url: string;
	} & Pick<ElectricCollectionConfig<TRow, never>, 'onInsert' | 'onUpdate' | 'onDelete'>,
) {
	return electricCollectionOptions<TRow>({
		id: input.descriptor.id,
		getKey: input.descriptor.getKey,
		syncMode: input.descriptor.syncMode,
		...(input.onInsert === undefined ? {} : { onInsert: input.onInsert }),
		...(input.onUpdate === undefined ? {} : { onUpdate: input.onUpdate }),
		...(input.onDelete === undefined ? {} : { onDelete: input.onDelete }),
		shapeOptions: {
			url: input.url,
			// Subset snapshot requests ride in a POST body so large id/predicate sets
			// never hit the URL-length ceiling (and align with Electric 2.0, which
			// deprecates GET for subsets). The live shape-log stream stays on GET.
			subsetMethod: 'POST',
			fetchClient: (request, init) =>
				fetch(request, {
					...init,
					credentials: 'include',
				}),
			params: {
				table: input.descriptor.table,
				columns: [...input.descriptor.columns],
			},
		},
	});
}
