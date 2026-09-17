import { describe, expect, it } from 'vitest';
import { searchValidator } from '../../../../../lib/search-filters';
import {
	isServiceRequestTab,
	mapFamiliesForTab,
	SERVICE_REQUEST_TAB_CODECS,
	SERVICE_REQUEST_TAB_LABEL,
	SERVICE_REQUEST_TABS,
	tabFamily,
} from '../../../../../routes/public-engagement/service-requests/-service-request-tabs';

describe('the service request tab register', () => {
	it('names five tabs, Details first and Comments last', () => {
		expect(SERVICE_REQUEST_TABS).toEqual([
			'details',
			'infrastructure',
			'surveillance',
			'control',
			'comments',
		]);
		expect(SERVICE_REQUEST_TABS.map((tab) => SERVICE_REQUEST_TAB_LABEL[tab])).toEqual([
			'Details',
			'Infrastructure',
			'Surveillance',
			'Control',
			'Comments',
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

	// The other requests around this one are drawn beside the request's own
	// facts and its thread, and no tab lists them (#1090).
	it.each([
		'details',
		'comments',
	] as const)('draws the other service requests, and no operational family, on the %s tab', (tab) => {
		expect(tabFamily(tab)).toBeNull();
		expect([...mapFamiliesForTab(tab)]).toEqual(['publicEngagement']);
	});
});
