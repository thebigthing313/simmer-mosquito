import {
	ADULT_COLLECTION_TIMING_MODES,
	type AdultCollectionTimingMode,
	type ServiceRequestContextSettings,
} from '@simmer-mosquito/domain';
import { CollectionTimingGuide } from './collection-timing-guide';
import { serviceRequestContextFrom } from './helpers';
import type { PublicSettingsFormValues, SettingsSection } from './types';

/** How adult surveillance forms ask when a trap was collected. */
export const collectionTimingSection: SettingsSection<
	{ readonly collectionTimingMode: AdultCollectionTimingMode },
	AdultCollectionTimingMode
> = {
	title: 'Edit Adult Surveillance',
	read: (settings) => ({
		collectionTimingMode: settings.adultSurveillance.collectionTimingMode,
	}),
	fields: [
		{
			kind: 'select',
			key: 'collectionTimingMode',
			label: 'Collection timing',
			options: [
				{ label: 'Exact timestamps', value: 'exact_timestamps' },
				{ label: 'Collection date and duration', value: 'collection_date_duration' },
			],
		},
	],
	convert: ({ collectionTimingMode }) => {
		if (!ADULT_COLLECTION_TIMING_MODES.includes(collectionTimingMode)) {
			throw new Error('Collection timing is required.');
		}
		return collectionTimingMode;
	},
	save: (mutations, mode) => mutations.setAdultCollectionTimingMode(mode),
	failureMessage: 'Unable to save adult surveillance settings.',
	preview: ({ collectionTimingMode }) => <CollectionTimingGuide mode={collectionTimingMode} />,
};

/** Whether chemical applications record the insecticide batch they drew from. */
export const batchTrackingSection: SettingsSection<
	{ readonly trackInsecticideBatches: boolean },
	boolean
> = {
	title: 'Edit Batch Tracking',
	read: (settings) => ({
		trackInsecticideBatches: settings.controlOperations.trackInsecticideBatches,
	}),
	fields: [{ kind: 'switch', key: 'trackInsecticideBatches', label: 'Track insecticide batches' }],
	convert: ({ trackInsecticideBatches }) => trackInsecticideBatches,
	save: (mutations, track) => mutations.setInsecticideBatchTracking(track),
	failureMessage: 'Unable to save batch tracking.',
};

/** Which nearby records a service request shows. */
export const serviceRequestContextSection: SettingsSection<
	PublicSettingsFormValues,
	ServiceRequestContextSettings
> = {
	title: 'Edit Public Engagement',
	read: (settings) => {
		const { radius, timeWindow } = settings.publicEngagement.serviceRequestContext;
		return {
			radiusAmount: radius.amount,
			radiusUnitCode: radius.unitCode,
			daysBefore: timeWindow.daysBefore,
			daysAfter: timeWindow.daysAfter,
		};
	},
	fields: [
		{ kind: 'number', key: 'radiusAmount', label: 'Search radius' },
		{ kind: 'text', key: 'radiusUnitCode', label: 'Radius unit' },
		{ kind: 'number', key: 'daysBefore', label: 'Days before' },
		{ kind: 'number', key: 'daysAfter', label: 'Days after' },
	],
	convert: serviceRequestContextFrom,
	save: (mutations, context) => mutations.setServiceRequestContext(context),
	failureMessage: 'Unable to save public engagement settings.',
};
