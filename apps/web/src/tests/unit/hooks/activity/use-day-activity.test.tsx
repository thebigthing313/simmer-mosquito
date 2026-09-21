/** @vitest-environment jsdom */

/**
 * One day of the Organization's field work off the synced tables: the
 * seventeen branches, each read through the real query engine against memory
 * collections, so a join on the wrong column, an include that loads nothing
 * and a predicate that misses a two-moment row all fail here.
 *
 * What is held: attribution by the record's own domain column and never
 * `created_by_profile_id` on the six kinds that have one; a collection and a
 * request each producing two entries on two days; assisting links dated by
 * the parent; Tags and place names riding on the row; and the Organization's
 * zone deciding which day a timestamp falls on.
 */

import { waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { useDayActivity } from '../../../../hooks/activity/use-day-activity';
import { additional_personnel } from '../../../../lib/collections/additional_personnel';
import { addresses } from '../../../../lib/collections/addresses';
import { applications } from '../../../../lib/collections/applications';
import { collections } from '../../../../lib/collections/collections';
import { habitats } from '../../../../lib/collections/habitats';
import { inspections } from '../../../../lib/collections/inspections';
import { service_requests } from '../../../../lib/collections/service_requests';
import { tag_items } from '../../../../lib/collections/tag_items';
import { traps } from '../../../../lib/collections/traps';
import { installMemoryCollections, seedRows } from '../../lib/collections/memory-collections';
import { renderRead } from '../queries/read-harness';

const ZONE = 'America/New_York';
const DAY = '2026-09-15';
const DANA = 'p-dana';
const MIGUEL = 'p-miguel';
const TYPIST = 'p-typist';

beforeEach(() => {
	installMemoryCollections();
});

async function readDay(day = DAY) {
	const rendered = await renderRead(() => useDayActivity(day, ZONE));
	await waitFor(() => expect(rendered.result.current.isReady).toBe(true));
	return rendered.result.current;
}

/** `who role category` per entry, sorted, which is the whole attribution question. */
function summary(read: Awaited<ReturnType<typeof readDay>>): readonly string[] {
	return read.entries.map((e) => `${e.profileId} ${e.role} ${e.category}`).sort();
}

describe('useDayActivity', () => {
	it('attributes an inspection to its inspector and its crew, never its typist', async () => {
		seedRows(habitats, [
			{ id: 'h-1', habitat_name: ' Culvert 12 ', created_at: new Date('2026-01-01T00:00:00Z') },
		]);
		seedRows(inspections, [
			{
				id: 'i-1',
				lat: 40.1,
				lng: -74.1,
				habitat_id: 'h-1',
				address_id: null,
				habitat_type_id: 'ht-1',
				inspection_date: DAY,
				inspected_by_profile_id: DANA,
				created_by_profile_id: TYPIST,
				is_wet: true,
				density: 'heavy',
				has_eggs: false,
				has_first_instar: true,
				has_second_instar: false,
				has_third_instar: true,
				has_fourth_instar: false,
				has_pupae: true,
				created_at: new Date('2026-09-15T22:00:00Z'),
			},
			{
				id: 'i-other-day',
				lat: 40.1,
				lng: -74.1,
				habitat_id: 'h-1',
				inspection_date: '2026-09-14',
				inspected_by_profile_id: DANA,
				is_wet: false,
				created_at: new Date('2026-09-14T22:00:00Z'),
			},
		]);
		seedRows(additional_personnel, [
			{ id: 'ap-1', entity_type: 'inspection', entity_id: 'i-1', personnel_profile_id: MIGUEL },
			{
				id: 'ap-wrong-kind',
				entity_type: 'collection',
				entity_id: 'i-1',
				personnel_profile_id: TYPIST,
			},
		]);

		const read = await readDay();

		expect(summary(read)).toEqual([
			`${DANA} inspected inspection`,
			`${MIGUEL} assisted inspection`,
		]);
		const primary = read.entries.find((e) => e.involvement === 'primary');
		expect(primary).toMatchObject({
			placeName: 'Culvert 12',
			refId: 'ht-1',
			detail: 'heavy',
			stages: '13P',
			occurredAt: null,
			recordedAt: '2026-09-15T22:00:00.000Z',
		});
	});

	it('gives a collection its set and its collect as two entries, each on its own day', async () => {
		seedRows(traps, [
			{
				id: 't-1',
				trap_code: 'GT-04',
				trap_name: 'Gravid 4',
				created_at: new Date('2026-01-01T00:00:00Z'),
			},
		]);
		seedRows(collections, [
			{
				id: 'c-1',
				lat: 40.2,
				lng: -74.2,
				trap_id: 't-1',
				collection_method_id: 'cm-1',
				collection_timing_mode: 'exact_timestamps',
				// Set at 9pm New York on the 14th, which is the 15th in UTC.
				started_at: new Date('2026-09-15T01:00:00Z'),
				set_by_profile_id: DANA,
				collected_at: new Date('2026-09-15T14:00:00Z'),
				collected_by_profile_id: MIGUEL,
				collection_date: null,
				has_problem: false,
				is_zero_result: false,
				has_bycatch: true,
				created_at: new Date('2026-09-15T01:00:00Z'),
			},
		]);

		const fifteenth = await readDay();
		expect(summary(fifteenth)).toEqual([`${MIGUEL} collected collection`]);
		expect(fifteenth.entries[0]).toMatchObject({
			placeName: 'GT-04 - Gravid 4',
			detail: 'collected',
			hasBycatch: true,
			occurredAt: '2026-09-15T14:00:00.000Z',
		});

		const fourteenth = await readDay('2026-09-14');
		expect(summary(fourteenth)).toEqual([`${DANA} set collection`]);
	});

	it('gives a request its receipt and its close, and carries its Tags', async () => {
		seedRows(addresses, [{ id: 'a-1', display_name: '12 Main St' }]);
		seedRows(service_requests, [
			{
				id: 'sr-1',
				lat: 40.3,
				lng: -74.3,
				display_name: 88,
				address_id: 'a-1',
				request_date: '2026-09-10',
				received_by_profile_id: DANA,
				closed_at: new Date('2026-09-15T16:30:00Z'),
				closed_by_profile_id: MIGUEL,
				created_at: new Date('2026-09-10T12:00:00Z'),
			},
		]);
		seedRows(tag_items, [
			{ id: 'ti-1', entity_type: 'service_request', entity_id: 'sr-1', tag_id: 'tag-urgent' },
			{ id: 'ti-other', entity_type: 'habitat', entity_id: 'sr-1', tag_id: 'tag-wrong' },
		]);

		const read = await readDay();
		expect(summary(read)).toEqual([`${MIGUEL} closed serviceRequest`]);
		expect(read.entries[0]).toMatchObject({
			label: 'Request 88',
			placeName: '12 Main St',
			detail: 'closed',
			tagIds: ['tag-urgent'],
		});

		const tenth = await readDay('2026-09-10');
		expect(summary(tenth)).toEqual([`${DANA} received serviceRequest`]);
	});

	it('counts a habitat for whoever created it, and an application for nobody when unattributed', async () => {
		seedRows(habitats, [
			{
				id: 'h-new',
				lat: 40.4,
				lng: -74.4,
				habitat_name: 'Ditch 7',
				habitat_type_id: 'ht-2',
				is_active: true,
				is_inaccessible: true,
				created_by_profile_id: DANA,
				created_at: new Date('2026-09-15T13:00:00Z'),
			},
		]);
		seedRows(applications, [
			{
				id: 'app-1',
				lat: 40.5,
				lng: -74.5,
				application_date: DAY,
				applicator_profile_id: null,
				created_by_profile_id: TYPIST,
				insecticide_id: 'ins-1',
				application_method_id: 'am-1',
				amount_applied: 2.5,
				application_unit_id: 'u-1',
				created_at: new Date('2026-09-15T13:00:00Z'),
			},
		]);

		const read = await readDay();
		expect(summary(read)).toEqual([`${DANA} created habitat`]);
		expect(read.entries[0]).toMatchObject({ label: 'Ditch 7', detail: 'inaccessible', tagIds: [] });
	});
});
