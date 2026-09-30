import { describe, expect, it } from 'vitest';
import {
	isServiceRequestTab,
	mapFamiliesForTab,
	NEARBY_TABS,
	SERVICE_REQUEST_TAB_CODECS,
	SERVICE_REQUEST_TAB_LABEL,
	SERVICE_REQUEST_TABS,
	tabFamily,
} from '../../../../../components/public-engagement/service-requests/service-request-tabs';
import { searchValidator } from '../../../../../lib/search-filters';

describe('the service request tab register', () => {
	it('names six tabs, Details first, the other requests after Control, and Comments last', () => {
		expect(SERVICE_REQUEST_TABS).toEqual([
			'details',
			'infrastructure',
			'surveillance',
			'control',
			'serviceRequests',
			'comments',
		]);
		expect(SERVICE_REQUEST_TABS.map((tab) => SERVICE_REQUEST_TAB_LABEL[tab])).toEqual([
			'Details',
			'Infrastructure',
			'Surveillance',
			'Control',
			'Service Requests',
			'Comments',
		]);
	});

	it('lists the four nearby tabs with the family each one reads', () => {
		expect(NEARBY_TABS.map(({ tab, family }) => [tab, family])).toEqual([
			['infrastructure', 'infrastructure'],
			['surveillance', 'surveillance'],
			['control', 'control'],
			['serviceRequests', 'publicEngagement'],
		]);
	});

	// The empty state names what the tab lists, and a request is not a record
	// of a family the way a trap is Infrastructure.
	it('names what each nearby tab lists when nothing fell inside the radius', () => {
		expect(NEARBY_TABS.map(({ emptyDescription }) => emptyDescription)).toEqual([
			'No infrastructure records fell within this radius and time window.',
			'No surveillance records fell within this radius and time window.',
			'No control records fell within this radius and time window.',
			'No service requests fell within this radius and time window.',
		]);
	});

	it('reads a tab the strip hands back and refuses anything else', () => {
		expect(isServiceRequestTab('control')).toBe(true);
		expect(isServiceRequestTab('nearby')).toBe(false);
	});
});

describe('the tab search param', () => {
	const validate = searchValidator(SERVICE_REQUEST_TAB_CODECS);

	it('keeps a family tab in the URL and leaves Details out', () => {
		expect(validate({ tab: 'surveillance' })).toEqual({ tab: 'surveillance' });
		expect(validate({ tab: 'details' })).toEqual({});
	});

	it('keeps the Service Requests tab in the URL', () => {
		expect(validate({ tab: 'serviceRequests' })).toEqual({ tab: 'serviceRequests' });
	});

	// A hand-edited or truncated link lands on Details rather than on an error.
	it.each(['nearby', '', 3, undefined])('drops %o and falls back to Details', (raw) => {
		expect(validate({ tab: raw })).toEqual({});
		expect(SERVICE_REQUEST_TAB_CODECS.tab.decode(raw)).toBeUndefined();
	});
});

describe('what the map is handed per tab', () => {
	it.each([
		'infrastructure',
		'surveillance',
		'control',
	] as const)('draws only its own family on the %s tab', (family) => {
		expect(tabFamily(family)).toBe(family);
		expect([...mapFamiliesForTab(family)]).toEqual([family]);
	});

	it('draws the other service requests, and nothing else, on the Service Requests tab', () => {
		expect(tabFamily('serviceRequests')).toBe('publicEngagement');
		expect([...mapFamiliesForTab('serviceRequests')]).toEqual(['publicEngagement']);
	});

	// The other requests around this one are drawn beside the request's own
	// facts and its thread too (#1090), which the Service Requests tab lists.
	it.each([
		'details',
		'comments',
	] as const)('draws the other service requests, and no operational family, on the %s tab', (tab) => {
		expect(tabFamily(tab)).toBeNull();
		expect([...mapFamiliesForTab(tab)]).toEqual(['publicEngagement']);
	});
});
