import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ActivityLookups } from '../../../../../components/activity/activity-data';
import {
	fetchLinkedRecords,
	type LinkedRecordItem,
	type LinkedRecordsResponse,
	linkedRecordKey,
	linkedRecordRow,
	linkedRecordsCaption,
} from '../../../../../components/gis/addresses/address-linked-records';
import { createOrganizationClock } from '../../../../../lib/organization-clock';

function linkedItem(overrides: Partial<LinkedRecordItem>): LinkedRecordItem {
	return {
		category: 'serviceRequest',
		family: 'requests',
		id: 'record-1',
		lat: 40.4,
		lng: -74.3,
		date: '2026-08-01',
		occurredAt: null,
		label: null,
		placeName: null,
		refId: null,
		methodRefId: null,
		amount: null,
		unitId: null,
		detail: null,
		stages: null,
		context: null,
		hasBycatch: null,
		tagIds: null,
		controlType: null,
		contactId: null,
		contactName: null,
		missionId: null,
		missionName: null,
		missionScheduledStartAt: null,
		closedByCategory: null,
		closedById: null,
		closedByRefId: null,
		...overrides,
	};
}

const lookups: ActivityLookups = {
	nameById: new Map([
		['method-1', 'CDC light trap'],
		['insecticide-1', 'Altosid XR-G'],
		['ulv-1', 'Truck ULV'],
	]),
	formatQuantity: (amount) => String(amount),
	tagById: new Map(),
};

const clock = createOrganizationClock('America/New_York');

describe('linkedRecordRow', () => {
	// Every row on the card names this Address, which the page heading already
	// shows, so a row whose place is the Address drops it (#1708).
	const address = '19 Mission Drive';

	it('keeps a service request titled by its summary and drops the Address from its subtitle', () => {
		const request = linkedRecordRow(
			linkedItem({ label: 'Request 15737', placeName: address, detail: 'open' }),
			lookups,
			clock,
			address,
		);
		expect(request).toMatchObject({
			title: 'Request 15737',
			subtitle: 'Service Request',
			date: 'Aug 1, 2026',
			link: { to: '/public-engagement/service-requests/$id', params: { id: 'record-1' } },
			badge: { kind: 'facts', facts: { category: 'serviceRequest', status: 'open' } },
		});
	});

	it('titles a record linked only to the Address by its kind', () => {
		const collection = linkedRecordRow(
			linkedItem({
				category: 'collection',
				family: 'collections',
				id: 'collection-1',
				placeName: address,
				refId: 'method-1',
				detail: 'collected',
			}),
			lookups,
			clock,
			address,
		);
		expect(collection).toMatchObject({
			title: 'Collection',
			subtitle: 'CDC light trap',
			date: 'Aug 1, 2026',
			link: { to: '/adult-surveillance/collections/$id', params: { id: 'collection-1' } },
		});

		const inspection = linkedRecordRow(
			linkedItem({ category: 'inspection', family: 'inspections', placeName: address }),
			lookups,
			clock,
			address,
		);
		expect(inspection).toMatchObject({ title: 'Inspection', subtitle: null });
	});

	it('drops the Address from a control action titled by its product', () => {
		const application = linkedRecordRow(
			linkedItem({
				category: 'application',
				family: 'controlActions',
				placeName: address,
				refId: 'insecticide-1',
				methodRefId: 'ulv-1',
				amount: 4,
			}),
			lookups,
			clock,
			address,
		);
		expect(application).toMatchObject({
			title: 'Altosid XR-G',
			subtitle: 'Application · 4 · Truck ULV',
		});

		const unnamed = linkedRecordRow(
			linkedItem({ category: 'sourceReduction', family: 'controlActions', placeName: address }),
			lookups,
			clock,
			address,
		);
		expect(unnamed).toMatchObject({ title: 'Source Reduction', subtitle: null });
	});

	it('keeps the trap a collection came out of as its title', () => {
		const collection = linkedRecordRow(
			linkedItem({
				category: 'collection',
				family: 'collections',
				placeName: 'Trap 12',
				refId: 'method-1',
			}),
			lookups,
			clock,
			address,
		);
		expect(collection).toMatchObject({
			title: 'Trap 12',
			subtitle: 'Collection · CDC light trap',
		});
	});

	it('never draws the Address as a title or subtitle', () => {
		const categories = [
			'serviceRequest',
			'inspection',
			'collection',
			'application',
			'sourceReduction',
			'biocontrol',
			'outreach',
		] as const;
		for (const category of categories) {
			const row = linkedRecordRow(
				linkedItem({ category, label: null, placeName: address }),
				lookups,
				clock,
				address,
			);
			expect(row.title).not.toContain(address);
			expect(row.subtitle ?? '').not.toContain(address);
		}
	});

	it('names a registration by its contact and links to their registrations', () => {
		const row = linkedRecordRow(
			linkedItem({
				category: 'notificationRegistration',
				id: 'registration-1',
				contactId: 'contact-1',
				contactName: 'J. Ortiz',
				detail: 'inactive',
			}),
			lookups,
			clock,
			address,
		);

		expect(row).toMatchObject({
			title: 'J. Ortiz',
			subtitle: 'Registration',
			badge: { kind: 'state', token: 'inactive' },
			link: {
				to: '/public-engagement/contacts/$id/registrations',
				params: { id: 'contact-1' },
			},
		});
	});

	// A Requested Control Action is its own record, with its own page.
	it('draws a resolved request for control as its own record', () => {
		const row = linkedRecordRow(
			linkedItem({
				category: 'requestedControlAction',
				family: 'requestedControlActions',
				id: 'rca-1',
				label: null,
				controlType: 'application',
				refId: 'ulv-1',
				detail: 'resolved',
			}),
			lookups,
			clock,
			address,
		);

		expect(row).toMatchObject({
			title: 'Application requested',
			subtitle: 'Request for Control · Truck ULV',
			badge: { kind: 'state', token: 'resolved' },
			link: { to: '/operations/requests-for-control/$id', params: { id: 'rca-1' } },
		});
	});

	// ADR 0012: a done stop names the record that closed it.
	it('titles a mission stop by its mission, links there, and names what closed it', () => {
		const row = linkedRecordRow(
			linkedItem({
				category: 'missionItem',
				family: 'missionStops',
				id: 'stop-1',
				label: 'Culvert behind the school',
				detail: 'done',
				controlType: 'application',
				missionId: 'mission-1',
				missionName: 'North ditches',
				missionScheduledStartAt: '2026-08-05T10:00:00Z',
				closedByCategory: 'application',
				closedById: 'application-1',
				closedByRefId: 'insecticide-1',
			}),
			lookups,
			clock,
			address,
		);

		expect(row).toMatchObject({
			title: 'North ditches',
			subtitle:
				'Mission Stop · Culvert behind the school · Closed by chemical application Altosid XR-G',
			badge: { kind: 'state', token: 'done' },
			link: { to: '/operations/missions/$id', params: { id: 'mission-1' } },
		});
	});

	it('names an unnamed mission by when it runs, and says nothing closed a skipped stop', () => {
		const row = linkedRecordRow(
			linkedItem({
				category: 'missionItem',
				family: 'missionStops',
				detail: 'skipped',
				controlType: 'source_reduction',
				missionId: 'mission-2',
				missionScheduledStartAt: '2026-08-05T10:00:00Z',
			}),
			lookups,
			clock,
			address,
		);

		expect(row.title).toBe('Source Reduction on Aug 5, 2026, 6:00 AM');
		expect(row.subtitle).toBe('Mission Stop');
		expect(row.badge).toEqual({ kind: 'state', token: 'skipped' });
	});
});

describe('linkedRecordsCaption', () => {
	it('counts a family that fits whole', () => {
		const items = [linkedItem({}), linkedItem({ id: 'record-2' })];
		expect(linkedRecordsCaption({ family: 'requests', total: 2, items })).toBe(
			'2 records name this address.',
		);
		expect(linkedRecordsCaption({ family: 'requests', total: 1, items: [linkedItem({})] })).toBe(
			'1 record names this address.',
		);
	});

	it('says it shows the newest of a family past the cap', () => {
		const items = Array.from({ length: 25 }, (_, index) => linkedItem({ id: `record-${index}` }));
		expect(linkedRecordsCaption({ family: 'collections', total: 1211, items })).toBe(
			'Newest 25 of 1,211 records that name this address.',
		);
	});
});

describe('linkedRecordKey', () => {
	it('keys by kind and id, since ten kinds are ten tables', () => {
		expect(linkedRecordKey({ category: 'missionItem', id: 'a' })).toBe('missionItem:a');
	});
});

describe('fetchLinkedRecords', () => {
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	const answer: LinkedRecordsResponse = { addressId: 'address-1', families: [], limit: 25 };

	it('asks the address-scoped endpoint and keeps the answer whole', async () => {
		const requests: string[] = [];
		vi.stubGlobal('fetch', (url: URL | string) => {
			requests.push(String(url));
			return Promise.resolve(new Response(JSON.stringify(answer), { status: 200 }));
		});

		const read = await fetchLinkedRecords('address-1', new AbortController().signal);

		expect(new URL(requests[0] ?? '').pathname).toBe('/records/address/address-1/linked-records');
		expect(read).toEqual(answer);
	});

	it('throws on a refused read rather than drawing an empty section', async () => {
		vi.stubGlobal('fetch', () => Promise.resolve(new Response('', { status: 404 })));

		await expect(fetchLinkedRecords('address-1', new AbortController().signal)).rejects.toThrow(
			'Linked records request failed (404).',
		);
	});
});
