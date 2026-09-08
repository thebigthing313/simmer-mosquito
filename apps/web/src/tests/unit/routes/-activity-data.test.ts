import { describe, expect, it } from 'vitest';
import {
	type ActivityEntry,
	ActivityRequestError,
	activityEntryKey,
	activityPanelMessage,
	activityPanelState,
	activityStatus,
	buildActivityMapData,
	describeActivityEntry,
	groupActivityByDay,
} from '../../../routes/-activity-data';
import { DAILY_WORK_COPY } from '../../../routes/daily-work/-daily-work';

// The pure half of one Profile's field work: how a flat, time-ordered array
// becomes days, families and pins, and which of the non-log states the panel is
// in. The server answers a data contract and this is what arranges it, so a
// regression here is a supervisor reading the wrong shape of somebody's day
// rather than an error.

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
		siteName: null,
		refId: null,
		methodRefId: null,
		amount: null,
		unitId: null,
		detail: null,
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

// A row reading "Inspection · Inspected" tells a supervisor nothing they did not
// already know from the page they are on. Each category is therefore described
// the way its own explorer describes it.
describe('describeActivityEntry', () => {
	const names = new Map([
		['type-1', 'Roadside ditch'],
		['product-1', 'Altosid'],
		['method-1', 'Backpack sprayer'],
		['sr-method-1', 'Container removal'],
		['outreach-1', 'Door hanger'],
	]);
	const quantity = (amount: number, unitId: string | null) =>
		unitId === null ? String(amount) : `${amount} gal`;

	function describe_(overrides: Partial<ActivityEntry>) {
		return describeActivityEntry(entry(overrides), names, quantity);
	}

	it('titles an inspection by the site it was performed at', () => {
		expect(describe_({ category: 'inspection', siteName: 'Culvert 12', refId: 'type-1' })).toEqual({
			title: 'Culvert 12',
			subtitle: 'Roadside ditch',
		});
	});

	it('titles an application by its product, and measures it', () => {
		expect(
			describe_({
				category: 'application',
				refId: 'product-1',
				methodRefId: 'method-1',
				amount: 2,
				unitId: 'unit-1',
				siteName: 'Culvert 12',
			}),
		).toEqual({ title: 'Altosid', subtitle: '2 gal · Backpack sprayer · Culvert 12' });
	});

	it('titles a source reduction by its method', () => {
		expect(
			describe_({
				category: 'sourceReduction',
				refId: 'sr-method-1',
				amount: 4,
				unitId: 'unit-1',
				siteName: 'Culvert 12',
			}),
		).toEqual({ title: 'Container removal', subtitle: '4 gal · Culvert 12' });
	});

	it('counts an outreach action in people, not units', () => {
		expect(
			describe_({ category: 'outreach', refId: 'outreach-1', amount: 30, detail: 'Block party' }),
		).toEqual({ title: 'Door hanger', subtitle: '30 people reached · Block party' });
	});

	it('names a collection by its trap, and says so when there is none', () => {
		expect(describe_({ category: 'collection', siteName: 'T-1 - North gate' }).title).toBe(
			'T-1 - North gate',
		);
		expect(describe_({ category: 'collection', siteName: null }).title).toBe('Ad-hoc collection');
	});

	// Nothing resolved and nothing joined still has to read as something.
	it('falls back to the category when a record names nothing', () => {
		expect(describe_({ category: 'biocontrol' })).toEqual({ title: 'Biocontrol', subtitle: null });
	});
});

// Which of the non-log states the panel is in. The distinction that matters is
// a product one: an outage must never read as an empty day, because the two are
// indistinguishable on the page and one of them is a conclusion about a colleague.
describe('activityPanelMessage', () => {
	const ready = { isLoading: false, error: null, isEmpty: false };

	it('shows the log once there is one', () => {
		expect(activityPanelMessage(ready, DAILY_WORK_COPY)).toBeNull();
	});

	it('distinguishes a failed read from a day with no work in it', () => {
		const failed = activityPanelMessage(
			{ ...ready, error: new Error('boom'), isEmpty: true },
			DAILY_WORK_COPY,
		);
		const empty = activityPanelMessage({ ...ready, isEmpty: true }, DAILY_WORK_COPY);

		expect(failed).not.toEqual(empty);
		expect(failed).toMatchObject({ title: 'Activity could not be loaded' });
		expect(empty).toMatchObject({ title: 'Nothing recorded on this day' });
	});

	// A refusal is the server declining the question, so the panel repeats the
	// server's own reason rather than the generic failure copy. The endpoint still
	// reads a window, so a caller can still be told the window was too wide.
	it('repeats the reason when the server refuses the window', () => {
		const refused = new ActivityRequestError('The date range may span at most 92 days.', true);

		expect(
			activityPanelMessage({ ...ready, error: refused, isEmpty: true }, DAILY_WORK_COPY),
		).toEqual({
			title: 'That day was not read',
			body: 'The date range may span at most 92 days.',
		});
	});

	it('loads before it reports emptiness', () => {
		expect(
			activityPanelMessage({ ...ready, isLoading: true, isEmpty: true }, DAILY_WORK_COPY),
		).toBe('loading');
	});

	// The person and the day are both in the query key, so a change of the day
	// used to hand back an empty log for as long as the read took. A refetch with
	// entries on screen is not a loading state.
	it('is not loading while there is a log to keep reading', () => {
		expect(activityPanelMessage({ ...ready, isLoading: true }, DAILY_WORK_COPY)).toBeNull();
	});
});

// The frame draws the placeholder rows and the empty state on all fifteen
// explorers. This is which of the panel's states go to it and which the body
// keeps, and the ones it keeps are the ones that name a reason.
describe('activityPanelState', () => {
	const ready = { isLoading: false, error: null, isEmpty: false };

	it('hands a first load to the frame, so it draws placeholder rows', () => {
		expect(
			activityPanelState({ ...ready, isLoading: true, isEmpty: true }, DAILY_WORK_COPY),
		).toMatchObject({
			isEmpty: true,
			message: null,
		});
	});

	// A refusal names the window the server declined and an outage names neither.
	// The frame's copy has nowhere to put either, so the body keeps drawing them,
	// and neither may reach the reader as an empty day.
	it('keeps a refusal and an outage in the body, both reported as not empty', () => {
		const refused = activityPanelState(
			{
				...ready,
				error: new ActivityRequestError('The date range may span at most 92 days.', true),
				isEmpty: true,
			},
			DAILY_WORK_COPY,
		);
		const outage = activityPanelState(
			{ ...ready, error: new Error('boom'), isEmpty: true },
			DAILY_WORK_COPY,
		);

		expect(refused).toMatchObject({
			isEmpty: false,
			message: {
				title: 'That day was not read',
				body: 'The date range may span at most 92 days.',
			},
		});
		expect(outage).toMatchObject({
			isEmpty: false,
			message: { title: 'Activity could not be loaded' },
		});
	});

	// Story 26: reloading with a log on screen leaves the log there.
	it('leaves the log alone while a new day loads', () => {
		expect(activityPanelState({ ...ready, isLoading: true }, DAILY_WORK_COPY)).toMatchObject({
			isEmpty: false,
			message: null,
		});
	});
});

// One short token per category becomes one specific pill. The wrong answers
// here are silent: an unknown density rendering nothing, or a token from a
// build that predates the column.
describe('activityStatus', () => {
	it('reads an inspection by what was found', () => {
		expect(activityStatus(entry({ category: 'inspection', detail: 'heavy' }))).toEqual({
			kind: 'density',
			density: 'heavy',
		});
		expect(activityStatus(entry({ category: 'inspection', detail: 'dry' }))).toEqual({
			kind: 'wetness',
			isWet: false,
		});
	});

	// Wet with nothing counted, and a density this build does not know, both land
	// on "wet" rather than asserting a value the badge table cannot render.
	it.each(['wet', 'astronomical'])('falls back to wet for %s', (detail) => {
		expect(activityStatus(entry({ category: 'inspection', detail }))).toEqual({
			kind: 'wetness',
			isWet: true,
		});
	});

	it('reads a site or a request by its state', () => {
		expect(activityStatus(entry({ category: 'habitat', detail: 'inaccessible' }))).toEqual({
			kind: 'state',
			token: 'inaccessible',
		});
		expect(activityStatus(entry({ category: 'serviceRequest', detail: 'open' }))).toEqual({
			kind: 'state',
			token: 'open',
		});
	});

	it('has no pill for an outreach description, an absent detail, or an unknown token', () => {
		expect(activityStatus(entry({ category: 'outreach', detail: 'Block party' }))).toBeNull();
		expect(activityStatus(entry({ category: 'habitat', detail: null }))).toBeNull();
		expect(activityStatus(entry({ category: 'habitat', detail: 'mysterious' }))).toBeNull();
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
