import {
	ADULT_COLLECTION_TIMING_MODES,
	type AdultCollectionTimingMode,
	DEFAULT_SERVICE_REQUEST_OVERDUE_DAYS,
	type ServiceRequestContextSettings,
	type ServiceRequestOverdueDays,
} from '@simmer-mosquito/domain';
import { CollectionTimingGuide } from './collection-timing-guide';
import {
	OVERDUE_DAYS_LABEL,
	serviceRequestContextFrom,
	serviceRequestOverdueDaysFrom,
} from './helpers';
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

/** The two Public Engagement settings one Save writes. */
export interface PublicEngagementSettingsWrite {
	readonly serviceRequestContext: ServiceRequestContextSettings;
	readonly serviceRequestOverdueDays: ServiceRequestOverdueDays;
}

/**
 * Which nearby records a service request shows, and how many days an open one
 * may age before it is overdue. The threshold is a switch and a number rather
 * than one input: off is a value of its own, and the number keeps what it
 * held while the switch is off, so turning it back on starts from there.
 */
export const serviceRequestContextSection: SettingsSection<
	PublicSettingsFormValues,
	PublicEngagementSettingsWrite
> = {
	title: 'Edit Public Engagement',
	read: (settings) => {
		const { radius, timeWindow } = settings.publicEngagement.serviceRequestContext;
		const overdue = settings.publicEngagement.serviceRequestOverdueDays;
		return {
			radiusAmount: radius.amount,
			radiusUnitCode: radius.unitCode,
			daysBefore: timeWindow.daysBefore,
			daysAfter: timeWindow.daysAfter,
			overdueOn: overdue !== 'off',
			overdueDays: overdue === 'off' ? DEFAULT_SERVICE_REQUEST_OVERDUE_DAYS : overdue,
		};
	},
	fields: [
		{ kind: 'number', key: 'radiusAmount', label: 'Search radius' },
		{ kind: 'text', key: 'radiusUnitCode', label: 'Radius unit' },
		{ kind: 'number', key: 'daysBefore', label: 'Days before' },
		{ kind: 'number', key: 'daysAfter', label: 'Days after' },
		{ kind: 'switch', key: 'overdueOn', label: 'Mark overdue requests' },
		{ kind: 'number', key: 'overdueDays', label: OVERDUE_DAYS_LABEL },
	],
	convert: (values) => ({
		serviceRequestContext: serviceRequestContextFrom(values),
		serviceRequestOverdueDays: serviceRequestOverdueDaysFrom(values),
	}),
	// One after the other: the second states the stamp the first committed
	// under, and a write whose value did not move sends nothing.
	save: async (mutations, write) => {
		await mutations.setServiceRequestContext(write.serviceRequestContext);
		await mutations.setServiceRequestOverdueDays(write.serviceRequestOverdueDays);
	},
	failureMessage: 'Unable to save public engagement settings.',
};
