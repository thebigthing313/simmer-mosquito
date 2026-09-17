import { describe, expect, it } from 'vitest';
import type { Tag } from '../../../hooks/queries/tag-view';
import {
	type ActivityEntry,
	ActivityRequestError,
	activityBadgeFacts,
	activityEntryKey,
	activityPanelMessage,
	activityPanelState,
	activityRow,
	activityTags,
	buildActivityMapData,
	describeActivityEntry,
	groupActivityByFamily,
} from '../../../routes/-activity-data';
import { DAILY_WORK_COPY } from '../../../routes/daily-work/-daily-work';

// The pure half of one Profile's field work: how a flat, time-ordered array
// becomes families and pins, and which of the non-log states the panel is in. The server answers a data contract and this is what arranges it, so a
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

describe('groupActivityByFamily', () => {
	it('reads as families in a fixed order, with no day above them', () => {
		const groups = groupActivityByFamily([
			entry({ family: 'control', category: 'application', role: 'applied' }),
			entry({ family: 'larval' }),
			entry({ family: 'adult', category: 'trap', role: 'created' }),
			entry({ family: 'larval' }),
		]);

		// Declared order rather than first-seen order, so every day reads down the
		// same columns.
		expect(groups.map((group) => group.family)).toEqual(['larval', 'adult', 'control']);
		expect(groups[0]?.entries).toHaveLength(2);
		expect(groups.every((group) => !('date' in group))).toBe(true);
	});

	it('leaves out families with nothing in them', () => {
		const groups = groupActivityByFamily([entry({ family: 'publicEngagement' })]);

		expect(groups).toHaveLength(1);
		expect(groups[0]?.family).toBe('publicEngagement');
	});

	// Six of the nine categories are dated by a date with no time of day, so
	// within-day ordering is partial by nature: what is timed sorts, and what is
	// not keeps the order the server sent rather than being interleaved by guess.
	it('sorts the timed entries and keeps the undated ones after them', () => {
		const groups = groupActivityByFamily([
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

	// The page sends one day as both ends of the window, so this never arrives.
	// If it did, the two days would read as one: the grouping carries no date,
	// so a page reading a range owes its own day level rather than this.
	it('folds two days into one set of families, which is why a caller sends one', () => {
		const groups = groupActivityByFamily([
			entry({ id: 'monday', date: '2026-08-03' }),
			entry({ id: 'tuesday', date: '2026-08-04' }),
		]);

		expect(groups).toHaveLength(1);
		expect(groups[0]?.entries.map((item) => item.id)).toEqual(['monday', 'tuesday']);
	});

	it('answers nothing for an empty log', () => {
		expect(groupActivityByFamily([])).toEqual([]);
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
		expect(describe_({ category: 'inspection', placeName: 'Culvert 12', refId: 'type-1' })).toEqual(
			{
				title: 'Culvert 12',
				subtitle: 'Roadside ditch',
			},
		);
	});

	it('titles an application by its product, and measures it', () => {
		expect(
			describe_({
				category: 'application',
				refId: 'product-1',
				methodRefId: 'method-1',
				amount: 2,
				unitId: 'unit-1',
				placeName: 'Culvert 12',
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
				placeName: 'Culvert 12',
			}),
		).toEqual({ title: 'Container removal', subtitle: '4 gal · Culvert 12' });
	});

	it('counts an outreach action in people, not units', () => {
		expect(
			describe_({ category: 'outreach', refId: 'outreach-1', amount: 30, detail: 'Block party' }),
		).toEqual({ title: 'Door hanger', subtitle: '30 people reached · Block party' });
	});

	it('names a collection by its trap, and says so when there is none', () => {
		expect(describe_({ category: 'collection', placeName: 'T-1 - North gate' }).title).toBe(
			'T-1 - North gate',
		);
		expect(describe_({ category: 'collection', placeName: null }).title).toBe('Ad-hoc collection');
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

// One short token per category becomes the facts the shared badge register
// switches on. The wrong answers here are the silent ones: a density this build
// does not know rendering nothing, or a token from a server that predates a
// column.
describe('activityBadgeFacts', () => {
	it('reads an inspection by what was found, stages included', () => {
		expect(
			activityBadgeFacts(entry({ category: 'inspection', detail: 'heavy', stages: 'E13' })),
		).toEqual({
			category: 'inspection',
			result: {
				isWet: true,
				density: 'heavy',
				stages: {
					hasEggs: true,
					hasFirstInstar: true,
					hasSecondInstar: false,
					hasThirdInstar: true,
					hasFourthInstar: false,
					hasPupae: false,
				},
			},
		});
	});

	// A dry site has no density and no stages to report, and that is a different
	// statement from a wet one that found nothing.
	it('reads a dry site as dry', () => {
		expect(
			activityBadgeFacts(entry({ category: 'inspection', detail: 'dry', stages: 'E1' })),
		).toEqual({
			category: 'inspection',
			result: { isWet: false, density: null, stages: null },
		});
	});

	// Wet with nothing counted, and a density this build does not know, both land
	// on wet-with-no-density rather than asserting a value nothing can render.
	it.each(['wet', 'astronomical'])('falls back to wet with no density for %s', (detail) => {
		expect(activityBadgeFacts(entry({ category: 'inspection', detail }))).toEqual({
			category: 'inspection',
			result: { isWet: true, density: null, stages: null },
		});
	});

	// Codes this build knows none of are a server it cannot read, not a site with
	// nothing in it. Six empty cells would be a claim.
	it('draws no strip for stage codes it cannot read', () => {
		const facts = activityBadgeFacts(
			entry({ category: 'inspection', detail: 'light', stages: 'XY' }),
		);

		expect(facts).toEqual({
			category: 'inspection',
			result: { isWet: true, density: 'light', stages: null },
		});
	});

	it('reads a site or a request by its state', () => {
		expect(activityBadgeFacts(entry({ category: 'habitat', detail: 'inaccessible' }))).toEqual({
			category: 'habitat',
			status: 'inaccessible',
		});
		expect(activityBadgeFacts(entry({ category: 'serviceRequest', detail: 'open' }))).toEqual({
			category: 'serviceRequest',
			status: 'open',
		});
	});

	// Traps have no inaccessible state, so a token naming one cannot reach the
	// badge table through this branch.
	it('holds a trap to the two states it has', () => {
		expect(activityBadgeFacts(entry({ category: 'trap', detail: 'inaccessible' }))).toEqual({
			category: 'trap',
			status: 'active',
		});
	});

	it('reads a collection by its four-state status and its bycatch', () => {
		expect(
			activityBadgeFacts(entry({ category: 'collection', detail: 'pending', hasBycatch: true })),
		).toEqual({ category: 'collection', status: 'pending', hasBycatch: true });
	});

	// An unreadable status says the record was collected, which is what the row's
	// own verb already said, rather than claiming the trap is still out.
	it.each([null, 'mysterious'])('falls back to collected for %s', (detail) => {
		expect(activityBadgeFacts(entry({ category: 'collection', detail }))).toEqual({
			category: 'collection',
			status: 'collected',
			hasBycatch: false,
		});
	});

	it('reads a control action by what it was performed against', () => {
		expect(activityBadgeFacts(entry({ category: 'biocontrol', context: 'larval' }))).toEqual({
			category: 'biocontrol',
			context: 'larval',
		});
		expect(activityBadgeFacts(entry({ category: 'biocontrol', context: null }))).toEqual({
			category: 'biocontrol',
			context: 'standalone',
		});
	});

	// Outreach's extra is a description rather than a state; it is already in the
	// subtitle, and the three categories with no badges say so by carrying none.
	it('carries no facts for the categories with no badges', () => {
		expect(activityBadgeFacts(entry({ category: 'outreach', detail: 'Block party' }))).toEqual({
			category: 'outreach',
		});
	});
});

describe('activityTags', () => {
	const priority: Tag = { id: 'tag-1', name: 'Priority', color: null, description: null };
	// hex-color-ignore: a Tag's colour is a column an organization writes, not a role anything paints.
	const access: Tag = { id: 'tag-2', name: 'Access code', color: '#112233', description: null };
	const catalog = new Map<string, Tag>([
		[priority.id, priority],
		[access.id, access],
	]);

	// By name, which is the order `useEntityTags` returns them in on the
	// explorers, so one record's chips read the same on both surfaces.
	it('names and orders the ids against the catalog', () => {
		const tags = activityTags(entry({ tagIds: [priority.id, access.id] }), catalog);

		expect(tags.map((tag) => tag.name)).toEqual(['Access code', 'Priority']);
	});

	// There is no chip to make out of an id, so a tag this client holds no
	// catalog row for draws nothing rather than an id.
	it('drops an id the catalog does not name', () => {
		expect(activityTags(entry({ tagIds: ['tag-1', 'tag-missing'] }), catalog)).toHaveLength(1);
		expect(activityTags(entry({ tagIds: null }), catalog)).toEqual([]);
	});
});

// The parts of a row that Daily Work and the nearby list on a service request
// both draw, answered once. Each surface adds its own on top: the log puts the
// verb and the time of day around the subtitle, the nearby list puts the
// category ahead of it. One case per category, so a kind either surface forgets
// fails here rather than on whichever page a reader opens first.
describe('activityRow', () => {
	const priority: Tag = { id: 'tag-1', name: 'Priority', color: null, description: null };
	const lookups = {
		nameById: new Map([
			['type-1', 'Catch basin'],
			['method-1', 'CDC light trap'],
			['product-1', 'VectoBac 12AS'],
			['method-2', 'Backpack sprayer'],
			['outreach-1', 'Door hanger'],
		]),
		formatQuantity: (amount: number, unitId: string | null) => `${amount} ${unitId ?? 'each'}`,
		tagById: new Map([[priority.id, priority]]),
	};

	it.each([
		[
			'habitat',
			{ label: 'Elm St basin', refId: 'type-1' },
			{ title: 'Elm St basin', subtitle: 'Catch basin', categoryLabel: 'Habitat' },
		],
		[
			'trap',
			{ label: 'Trap 14', refId: 'method-1' },
			{ title: 'Trap 14', subtitle: 'CDC light trap', categoryLabel: 'Trap' },
		],
		[
			'inspection',
			{ placeName: 'Elm St basin', refId: 'type-1' },
			{ title: 'Elm St basin', subtitle: 'Catch basin', categoryLabel: 'Inspection' },
		],
		[
			'collection',
			{ placeName: 'Trap 14', refId: 'method-1' },
			{ title: 'Trap 14', subtitle: 'CDC light trap', categoryLabel: 'Collection' },
		],
		[
			'application',
			{
				refId: 'product-1',
				methodRefId: 'method-2',
				amount: 2,
				unitId: 'gal',
				placeName: 'Elm St basin',
			},
			{
				title: 'VectoBac 12AS',
				subtitle: '2 gal · Backpack sprayer · Elm St basin',
				categoryLabel: 'Application',
			},
		],
		[
			'sourceReduction',
			{ refId: 'method-2', placeName: 'Elm St basin' },
			{ title: 'Backpack sprayer', subtitle: 'Elm St basin', categoryLabel: 'Source Reduction' },
		],
		[
			'biocontrol',
			{ refId: 'method-2', amount: 40, placeName: 'Elm St basin' },
			{
				title: 'Backpack sprayer',
				subtitle: '40 each · Elm St basin',
				categoryLabel: 'Biocontrol',
			},
		],
		[
			'outreach',
			{ refId: 'outreach-1', amount: 30, detail: 'Block party' },
			{
				title: 'Door hanger',
				subtitle: '30 people reached · Block party',
				categoryLabel: 'Outreach',
			},
		],
		[
			'serviceRequest',
			{ label: '#88', placeName: '12 Elm St' },
			{ title: '#88', subtitle: '12 Elm St', categoryLabel: 'Service Request' },
		],
	] as const)('describes a %s the way its explorer does, and names its kind', (category, fields, expected) => {
		const row = activityRow(entry({ category, ...fields }), lookups);
		expect({ title: row.title, subtitle: row.subtitle, categoryLabel: row.categoryLabel }).toEqual(
			expected,
		);
	});

	// The subtitle is the describer's as it stands: a record with nothing to
	// name it is titled by its category and has none, and what a surface does
	// about that is the surface's.
	it('hands over the category as the title and no subtitle for a record naming nothing', () => {
		const row = activityRow(entry({ category: 'habitat' }), lookups);
		expect({ title: row.title, subtitle: row.subtitle }).toEqual({
			title: 'Habitat',
			subtitle: null,
		});
	});

	it('reads the badge facts and the Tags off the register', () => {
		const row = activityRow(
			entry({ category: 'inspection', detail: 'dry', tagIds: ['tag-1', 'unknown'] }),
			lookups,
		);
		expect(row.facts).toEqual({
			category: 'inspection',
			result: { isWet: false, density: null, stages: null },
		});
		expect(row.tags).toEqual([priority]);
	});

	it("links to the record's own detail page", () => {
		expect(activityRow(entry({ category: 'sourceReduction', id: 'sr-9' }), lookups).link).toEqual({
			to: '/control-operations/source-reduction/$id',
			params: { id: 'sr-9' },
		});
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
