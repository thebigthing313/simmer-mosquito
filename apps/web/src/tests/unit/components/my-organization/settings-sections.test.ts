import type { AdultCollectionTimingMode, OrganizationSettings } from '@simmer-mosquito/domain';
import { describe, expect, it, vi } from 'vitest';
import {
	batchTrackingSection,
	collectionTimingSection,
	serviceRequestContextSection,
} from '../../../../components/my-organization/settings-sections';
import type { OrganizationSettingsMutations } from '../../../../hooks/mutations/use-organization-settings-mutations';

/**
 * Each settings section's descriptor, without rendering: the settings it reads
 * into the values a sheet opens with, and the values it converts into the write
 * it makes (#1431).
 */

const SETTINGS = {
	adultSurveillance: { collectionTimingMode: 'collection_date_duration' },
	controlOperations: { trackInsecticideBatches: true },
	publicEngagement: {
		serviceRequestContext: {
			radius: { amount: 0.5, unitCode: 'mi' },
			timeWindow: { daysBefore: 7, daysAfter: 14 },
		},
	},
} as unknown as OrganizationSettings;

function fakeMutations() {
	return {
		setAdultCollectionTimingMode: vi.fn().mockResolvedValue(undefined),
		setInsecticideBatchTracking: vi.fn().mockResolvedValue(undefined),
		setServiceRequestContext: vi.fn().mockResolvedValue(undefined),
	};
}

function asMutations(fake: ReturnType<typeof fakeMutations>): OrganizationSettingsMutations {
	return fake as unknown as OrganizationSettingsMutations;
}

describe('collectionTimingSection', () => {
	it('opens on the saved collection timing', () => {
		expect(collectionTimingSection.read(SETTINGS)).toEqual({
			collectionTimingMode: 'collection_date_duration',
		});
	});

	it('saves the chosen collection timing', async () => {
		const mutations = fakeMutations();
		const payload = collectionTimingSection.convert({ collectionTimingMode: 'exact_timestamps' });
		await collectionTimingSection.save(asMutations(mutations), payload);

		expect(mutations.setAdultCollectionTimingMode).toHaveBeenCalledWith('exact_timestamps');
	});

	it('refuses a value that is not a collection timing', () => {
		expect(() =>
			collectionTimingSection.convert({
				collectionTimingMode: '' as AdultCollectionTimingMode,
			}),
		).toThrow('Collection timing is required.');
	});
});

describe('batchTrackingSection', () => {
	it('opens on the saved batch tracking flag', () => {
		expect(batchTrackingSection.read(SETTINGS)).toEqual({ trackInsecticideBatches: true });
	});

	it('saves the switch as it stands', async () => {
		const mutations = fakeMutations();
		const payload = batchTrackingSection.convert({ trackInsecticideBatches: false });
		await batchTrackingSection.save(asMutations(mutations), payload);

		expect(mutations.setInsecticideBatchTracking).toHaveBeenCalledWith(false);
	});
});

describe('serviceRequestContextSection', () => {
	it('opens on the saved radius and day window', () => {
		expect(serviceRequestContextSection.read(SETTINGS)).toEqual({
			radiusAmount: 0.5,
			radiusUnitCode: 'mi',
			daysBefore: 7,
			daysAfter: 14,
		});
	});

	it('saves the context the values describe', async () => {
		const mutations = fakeMutations();
		const payload = serviceRequestContextSection.convert({
			radiusAmount: 2,
			radiusUnitCode: ' km ',
			daysBefore: 0,
			daysAfter: 3,
		});
		await serviceRequestContextSection.save(asMutations(mutations), payload);

		expect(mutations.setServiceRequestContext).toHaveBeenCalledWith({
			radius: { amount: 2, unitCode: 'km' },
			timeWindow: { daysBefore: 0, daysAfter: 3 },
		});
	});

	it('refuses an emptied field, naming it', () => {
		const values = serviceRequestContextSection.read(SETTINGS);
		expect(() => serviceRequestContextSection.convert({ ...values, daysAfter: null })).toThrow(
			'Days after is required.',
		);
	});

	it('names every field by a key of the values, never by its label', () => {
		const values = serviceRequestContextSection.read(SETTINGS);
		for (const field of serviceRequestContextSection.fields) {
			expect(Object.keys(values)).toContain(field.key);
		}
	});
});
