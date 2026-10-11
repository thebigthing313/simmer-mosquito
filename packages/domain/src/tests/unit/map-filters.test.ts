import { describe, expect, it } from 'vitest';
import {
	BIOCONTROL_MAP_FILTERS,
	encodeMapFilterParams,
	INSPECTION_MAP_FILTERS,
	REGION_MAP_FILTERS,
	SERVICE_REQUEST_MAP_FILTERS,
	SERVICE_REQUEST_ORDER_FILTERS,
	TRAP_MAP_FILTERS,
} from '../../index.js';

/**
 * The per-kind rules of the one `/map/*` filter encoder. That each spec
 * survives the server's parser is the round trip in `apps/server`.
 */
describe('the encoder', () => {
	it('sends a `trueOnly` field set to false as nothing', () => {
		expect(encodeMapFilterParams(BIOCONTROL_MAP_FILTERS, { habitatLinkedOnly: false })).toEqual({});
		expect(encodeMapFilterParams(BIOCONTROL_MAP_FILTERS, { habitatLinkedOnly: true })).toEqual({
			habitatLinked: 'true',
		});
	});

	it('sorts a list, so the same picks in another order are the same request', () => {
		expect(
			encodeMapFilterParams(INSPECTION_MAP_FILTERS, {
				densities: ['light', 'heavy'],
				inspectedByProfileIds: ['b', 'a'],
			}),
		).toEqual({ density: 'heavy,light', inspectedBy: 'a,b' });
	});

	it('spells the two-word statuses the way the server reads them', () => {
		expect(encodeMapFilterParams(TRAP_MAP_FILTERS, { isActive: true })).toEqual({
			status: 'active',
		});
		expect(encodeMapFilterParams(TRAP_MAP_FILTERS, { isActive: false })).toEqual({
			status: 'inactive',
		});
		expect(encodeMapFilterParams(SERVICE_REQUEST_MAP_FILTERS, { isOpen: true })).toEqual({
			status: 'open',
		});
		expect(encodeMapFilterParams(SERVICE_REQUEST_MAP_FILTERS, { isOpen: false })).toEqual({
			status: 'closed',
		});
	});

	it('sends nothing for an absent value, an empty list or a blank string', () => {
		expect(encodeMapFilterParams(REGION_MAP_FILTERS, {})).toEqual({});
		expect(encodeMapFilterParams(REGION_MAP_FILTERS, { ids: [], search: '  ' })).toEqual({});
		expect(encodeMapFilterParams(REGION_MAP_FILTERS, { search: ' pond ' })).toEqual({
			search: 'pond',
		});
	});

	it('keeps the rail order off the service request tile filters', () => {
		expect(SERVICE_REQUEST_MAP_FILTERS.map((field) => field.param)).not.toContain('oldest');
		expect(encodeMapFilterParams(SERVICE_REQUEST_ORDER_FILTERS, { oldestFirst: true })).toEqual({
			oldest: 'true',
		});
	});
});
