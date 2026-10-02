/**
 * PROTOTYPE, throwaway. Fake field work for the field loop prototype (#1338).
 *
 * Nothing here is read from the server. The shapes follow the real tables
 * loosely: a habitat route, a trap route and a Mission, plus one Assignment
 * belonging to another Profile so the read-only case is on screen.
 */

export type StopKind = 'habitat' | 'trap' | 'mission';

export type Stop = {
	readonly id: string;
	readonly kind: StopKind;
	readonly code: string;
	readonly name: string;
	readonly detail: string;
	readonly distance: string;
	readonly notes?: string;
	readonly directions?: string;
	readonly history: readonly string[];
	/** Trap stops: the trap has a set collection waiting to be collected. */
	readonly pendingSince?: string;
	/** Trap stops: the configuration a new set copies. */
	readonly trapConfig?: { readonly method: string; readonly lure: string };
	/** Mission stops: what the Manager asked for. */
	readonly requested?: {
		readonly action: string;
		readonly product: string;
		readonly amount: number;
		readonly unit: string;
	};
	/** Position on the fake map, 0 to 1 on each axis. */
	readonly x: number;
	readonly y: number;
};

export type Run = {
	readonly id: string;
	readonly kind: 'assignment' | 'mission';
	readonly title: string;
	readonly subtitle: string;
	readonly owner: string;
	readonly mine: boolean;
	readonly stops: readonly Stop[];
};

const habitatStops: Stop[] = [
	{
		id: 'h1',
		kind: 'habitat',
		code: 'HAB-0142',
		name: 'Roadside ditch, Elm St',
		detail: 'Ditch · 120 ft',
		distance: '0.3 mi',
		directions: 'Pull off at the hydrant; ditch runs north to the culvert.',
		history: ['Sep 24 · Wet · light · 12 dips · L3, L4 · you', 'Sep 10 · Dry · M. Chen'],
		x: 0.18,
		y: 0.72,
	},
	{
		id: 'h2',
		kind: 'habitat',
		code: 'HAB-0151',
		name: 'Catch basin cluster, Elm & 4th',
		detail: 'Catch basins · 6',
		distance: '0.5 mi',
		history: ['Sep 24 · Wet · none · 6 dips · you'],
		x: 0.3,
		y: 0.58,
	},
	{
		id: 'h3',
		kind: 'habitat',
		code: 'HAB-0088',
		name: 'Retention pond, Linden Park',
		detail: 'Pond · 0.4 ac',
		distance: '0.9 mi',
		notes: 'Gate code 4471. Dog at the north house.',
		history: [
			'Sep 24 · Wet · heavy · 20 dips · L2, L3, pupae · you',
			'Sep 24 · Chemical application · Altosid XR · 8 each · R. Patel',
		],
		x: 0.46,
		y: 0.44,
	},
	{
		id: 'h4',
		kind: 'habitat',
		code: 'HAB-0203',
		name: 'Tire pile, behind 18 Mill Rd',
		detail: 'Containers · tires',
		distance: '1.2 mi',
		history: ['Sep 17 · Wet · medium · 10 dips · L4 · M. Chen'],
		x: 0.62,
		y: 0.36,
	},
	{
		id: 'h5',
		kind: 'habitat',
		code: 'HAB-0019',
		name: 'Salt marsh edge, Bay Ave',
		detail: 'Marsh · 2 ac',
		distance: '1.6 mi',
		history: ['Sep 24 · Dry · you'],
		x: 0.74,
		y: 0.22,
	},
	{
		id: 'h6',
		kind: 'habitat',
		code: 'HAB-0177',
		name: 'Swale, Shore Rd school',
		detail: 'Swale · 300 ft',
		distance: '2.1 mi',
		history: ['Sep 24 · Wet · none · 8 dips · you'],
		x: 0.86,
		y: 0.12,
	},
];

const trapStops: Stop[] = [
	{
		id: 't1',
		kind: 'trap',
		code: 'TRP-021',
		name: 'Oak Park pavilion',
		detail: 'CDC light trap',
		distance: '0.2 mi',
		pendingSince: 'Set yesterday 4:10 PM · you',
		trapConfig: { method: 'CDC light trap', lure: 'CO₂ (dry ice)' },
		history: ['Sep 30 · 142 females · you', 'Sep 23 · 98 females · you'],
		x: 0.22,
		y: 0.3,
	},
	{
		id: 't2',
		kind: 'trap',
		code: 'TRP-034',
		name: 'Firehouse lot, Main St',
		detail: 'Gravid trap',
		distance: '0.7 mi',
		pendingSince: 'Set yesterday 4:32 PM · you',
		trapConfig: { method: 'Gravid trap', lure: 'Hay infusion' },
		history: ['Sep 30 · 37 females · you'],
		x: 0.4,
		y: 0.5,
	},
	{
		id: 't3',
		kind: 'trap',
		code: 'TRP-040',
		name: 'Community garden, Pine St',
		detail: 'BG-Sentinel',
		distance: '1.1 mi',
		trapConfig: { method: 'BG-Sentinel', lure: 'BG-Lure' },
		history: ['Sep 23 · 0 · trap problem: fan dead · you'],
		x: 0.56,
		y: 0.62,
	},
	{
		id: 't4',
		kind: 'trap',
		code: 'TRP-045',
		name: 'Water tower',
		detail: 'CDC light trap',
		distance: '1.5 mi',
		pendingSince: 'Set yesterday 5:05 PM · M. Chen',
		trapConfig: { method: 'CDC light trap', lure: 'CO₂ (dry ice)' },
		history: ['Sep 30 · 211 females · M. Chen'],
		x: 0.72,
		y: 0.74,
	},
	{
		id: 't5',
		kind: 'trap',
		code: 'TRP-051',
		name: 'Marina fence',
		detail: 'Gravid trap',
		distance: '2.4 mi',
		pendingSince: 'Set yesterday 5:20 PM · you',
		trapConfig: { method: 'Gravid trap', lure: 'Hay infusion' },
		history: ['Sep 30 · 12 females · you'],
		x: 0.84,
		y: 0.86,
	},
];

const missionStops: Stop[] = [
	{
		id: 'm1',
		kind: 'mission',
		code: 'HAB-0088',
		name: 'Retention pond, Linden Park',
		detail: 'From request for control · heavy breeding',
		distance: '0.9 mi',
		notes: 'Gate code 4471.',
		requested: {
			action: 'Chemical application',
			product: 'Altosid XR briquets',
			amount: 8,
			unit: 'each',
		},
		history: ['Sep 24 · Wet · heavy · 20 dips · L2, L3, pupae · you'],
		x: 0.46,
		y: 0.44,
	},
	{
		id: 'm2',
		kind: 'mission',
		code: 'ADR',
		name: '22 Birch Ln (backyard)',
		detail: 'Service Request · containers reported',
		distance: '1.3 mi',
		requested: {
			action: 'Source reduction',
			product: 'Containers emptied',
			amount: 1,
			unit: 'site',
		},
		history: ['Sep 29 · Service Request opened · "buckets and a kiddie pool"'],
		x: 0.3,
		y: 0.8,
	},
	{
		id: 'm3',
		kind: 'mission',
		code: 'HAB-0203',
		name: 'Tire pile, behind 18 Mill Rd',
		detail: 'From request for control',
		distance: '1.2 mi',
		requested: {
			action: 'Chemical application',
			product: 'VectoBac G',
			amount: 2.5,
			unit: 'lb',
		},
		history: ['Sep 17 · Wet · medium · 10 dips · L4 · M. Chen'],
		x: 0.62,
		y: 0.36,
	},
];

export const RUNS: readonly Run[] = [
	{
		id: 'a1',
		kind: 'assignment',
		title: 'North marsh habitats',
		subtitle: 'Habitat route · today',
		owner: 'you',
		mine: true,
		stops: habitatStops,
	},
	{
		id: 'a2',
		kind: 'assignment',
		title: 'East trap line',
		subtitle: 'Trap route · today',
		owner: 'you',
		mine: true,
		stops: trapStops,
	},
	{
		id: 'ms1',
		kind: 'mission',
		title: 'Larvicide follow-ups',
		subtitle: 'Mission · due today',
		owner: 'you',
		mine: true,
		stops: missionStops,
	},
	{
		id: 'a3',
		kind: 'assignment',
		title: 'South ditches',
		subtitle: 'Habitat route · today',
		owner: 'J. Ortiz',
		mine: false,
		stops: habitatStops.slice(0, 3).map((s) => ({ ...s, id: `o-${s.id}` })),
	},
];

export const SKIP_REASONS = [
	'No access',
	'Weather',
	'Unsafe',
	'Already serviced',
	'Could not locate',
] as const;

export const DENSITIES = ['none', 'light', 'medium', 'heavy', 'very heavy'] as const;
export const STAGES = ['L1', 'L2', 'L3', 'L4', 'Pupae'] as const;
