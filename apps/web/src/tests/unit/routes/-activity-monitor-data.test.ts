import { describe, expect, it } from 'vitest';
import {
	type ActivityEntry,
	activityEntryKey,
	buildActivityMapData,
	countActivityByFamily,
	groupActivityByDay,
} from '../../../routes/-activity-monitor-data';

// The Activity Monitor's pure half: how a flat, time-ordered array becomes days,
// families, counts and pins. The server answers a data contract and this is what
// arranges it, so a regression here is a supervisor reading the wrong shape of a
// person's week rather than an error.

function entry(overrides: Partial<ActivityEntry> = {}): ActivityEntry {
	return {
		category: 'inspection',
		family: 'larval',
		involvement: 'primary',
		role: 'inspected',
		id: 'record-1',
		lat: 35.5,
		lng: -90.5,
		date: '2026-08-05',
		occurredAt: null,
		label: null,
		refId: null,
		...overrides,
	};
}

describe('activityEntryKey', () => {
	// A collection set on Monday and collected on Thursday is two entries sharing
	// one record id, so the id alone cannot say which visit is selected.
	it('separates the two entries one record can produce', () => {
		const set = entry({ category: 'collection', role: 'set', id: 'c-1' });
		const collected = entry({ category: 'collection', role: 'collected', id: 'c-1' });

		expect(activityEntryKey(set)).not.toBe(activityEntryKey(collected));
	});
});

describe('countActivityByFamily', () => {
	it('counts every family, including the ones with nothing in them', () => {
		const counts = countActivityByFamily([
			entry({ family: 'larval' }),
			entry({ family: 'larval' }),
			entry({ family: 'control' }),
		]);

		expect(counts).toEqual({ larval: 2, adult: 0, control: 1, publicEngagement: 0 });
	});
});

describe('groupActivityByDay', () => {
	it('reads as days newest first, each split into families in a fixed order', () => {
		const groups = groupActivityByDay([
			entry({ date: '2026-08-05', family: 'larval' }),
			entry({ date: '2026-08-07', family: 'control', category: 'application', role: 'applied' }),
			entry({ date: '2026-08-05', family: 'adult', category: 'trap', role: 'created' }),
			entry({ date: '2026-08-05', family: 'larval' }),
		]);

		expect(groups.map((group) => group.date)).toEqual(['2026-08-07', '2026-08-05']);
		// Families keep their declared order rather than a per-day order, so a week
		// of days reads down the same columns.
		expect(groups[1]?.families.map((family) => family.family)).toEqual(['larval', 'adult']);
		expect(groups[1]?.families[0]?.entries).toHaveLength(2);
	});

	it('leaves out families with nothing in them on a given day', () => {
		const groups = groupActivityByDay([entry({ family: 'publicEngagement' })]);

		expect(groups[0]?.families).toHaveLength(1);
		expect(groups[0]?.families[0]?.family).toBe('publicEngagement');
	});

	// Six of the nine categories are dated by a date with no time of day, so
	// within-day ordering is partial by nature: what is timed sorts, and what is
	// not keeps the order the server sent rather than being interleaved by guess.
	it('sorts the timed entries and keeps the undated ones after them', () => {
		const groups = groupActivityByDay([
			entry({ id: 'undated-first', occurredAt: null }),
			entry({ id: 'late', occurredAt: '2026-08-05T15:00:00Z' }),
			entry({ id: 'undated-second', occurredAt: null }),
			entry({ id: 'early', occurredAt: '2026-08-05T08:00:00Z' }),
		]);

		expect(groups[0]?.entries.map((item) => item.id)).toEqual([
			'early',
			'late',
			'undated-first',
			'undated-second',
		]);
	});

	it('answers nothing for an empty log', () => {
		expect(groupActivityByDay([])).toEqual([]);
	});
});

describe('buildActivityMapData', () => {
	it('keys each pin on the entry rather than the record', () => {
		const data = buildActivityMapData([
			entry({ category: 'collection', role: 'set', id: 'c-1' }),
			entry({ category: 'collection', role: 'collected', id: 'c-1' }),
		]);

		const ids = data?.features.map((feature) => feature.properties?.id);
		expect(ids).toEqual(['collection:c-1:set', 'collection:c-1:collected']);
		// The record id rides along for the card, which fetches by record.
		expect(data?.features[0]?.properties?.recordId).toBe('c-1');
	});

	it('carries the involvement the map draws hollow', () => {
		const data = buildActivityMapData([entry({ involvement: 'assisting', role: 'assisted' })]);

		expect(data?.features[0]?.properties).toMatchObject({
			involvement: 'assisting',
			family: 'larval',
			category: 'inspection',
		});
	});

	it('plots lng/lat in that order', () => {
		const data = buildActivityMapData([entry({ lat: 35.5, lng: -90.5 })]);

		expect(data?.features[0]?.geometry).toEqual({ type: 'Point', coordinates: [-90.5, 35.5] });
	});

	// `null` rather than an empty collection: the layer treats null as "not
	// mounted at all", which is what an empty day should leave on the map.
	it('answers null for an empty log', () => {
		expect(buildActivityMapData([])).toBeNull();
	});
});
