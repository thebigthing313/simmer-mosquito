/**
 * PROTOTYPE. Static data for the Dashboard variants (#981).
 *
 * Nothing here is read from a collection or a server. The numbers are shaped to
 * exercise the page: one empty queue, one two-count row, one type absent for
 * the Organization, one type at zero for the week, a delta in each direction.
 */

export const TODAY = '2026-09-15';
/** Rolling 7 days ending today, and the 7 before it. */
export const WINDOW = { from: '2026-09-09', to: '2026-09-15' } as const;
export const PRIOR_WINDOW = { from: '2026-09-02', to: '2026-09-08' } as const;

export type QueuePath =
	| '/larval-surveillance/samples'
	| '/adult-surveillance/collections'
	| '/public-engagement/service-requests'
	| '/operations/requests-for-control'
	| '/operations/assignments'
	| '/operations/missions'
	| '/larval-surveillance/habitats';

export interface QueueRow {
	readonly key: string;
	/** The row's name, a noun phrase over the record. */
	readonly label: string;
	/** What the count counts, for the variants that spell it out. */
	readonly what: string;
	readonly count: number;
	/** A second count, drawn beside the first with its own label. */
	readonly split?: { readonly label: string; readonly count: number; readonly rest: string };
	/** Age of the oldest row in days; null when the queue is empty. */
	readonly oldestDays: number | null;
	readonly to: QueuePath;
	readonly domain: 'surveillance' | 'operations';
}

export const QUEUES: readonly QueueRow[] = [
	{
		key: 'samples-awaiting',
		label: 'Samples awaiting identification',
		what: 'samples',
		count: 23,
		oldestDays: 19,
		to: '/larval-surveillance/samples',
		domain: 'surveillance',
	},
	{
		key: 'collections-awaiting',
		label: 'Collections awaiting identification',
		what: 'collections',
		count: 41,
		oldestDays: 12,
		to: '/adult-surveillance/collections',
		domain: 'surveillance',
	},
	{
		key: 'collections-problem',
		label: 'Collections with a problem',
		what: 'collections, last 14 days',
		count: 3,
		oldestDays: 9,
		to: '/adult-surveillance/collections',
		domain: 'surveillance',
	},
	{
		key: 'service-requests-open',
		label: 'Open service requests',
		what: 'requests',
		count: 58,
		split: { label: 'new', count: 14, rest: 'in progress' },
		oldestDays: 112,
		to: '/public-engagement/service-requests',
		domain: 'operations',
	},
	{
		key: 'requests-unassigned',
		label: 'Requests for control not yet assigned',
		what: 'requests',
		count: 6,
		oldestDays: 4,
		to: '/operations/requests-for-control',
		domain: 'operations',
	},
	{
		key: 'assignments-in-progress',
		label: 'Assignments started and not finished',
		what: 'assignments',
		count: 0,
		oldestDays: null,
		to: '/operations/assignments',
		domain: 'operations',
	},
	{
		key: 'missions-due',
		label: 'Missions due today or overdue',
		what: 'missions',
		count: 2,
		oldestDays: 1,
		to: '/operations/missions',
		domain: 'operations',
	},
];

export const FLAGS: readonly QueueRow[] = [
	{
		key: 'untreated-habitats',
		label: 'Untreated habitats',
		what: 'habitats heavy in the last 7 days with no control action since',
		count: 5,
		oldestDays: 6,
		to: '/larval-surveillance/habitats',
		domain: 'surveillance',
	},
];

export interface ActivityType {
	readonly key: string;
	readonly label: string;
	/** Count in the window; null when the Organization has never recorded the type. */
	readonly count: number | null;
	readonly prior: number;
}

export const ACTIVITY: readonly ActivityType[] = [
	{ key: 'inspections', label: 'Inspections', count: 212, prior: 187 },
	{ key: 'samples', label: 'Samples', count: 31, prior: 44 },
	{ key: 'collections', label: 'Collections', count: 66, prior: 66 },
	{ key: 'applications', label: 'Applications', count: 17, prior: 9 },
	{ key: 'source-reductions', label: 'Source reductions', count: 4, prior: 11 },
	{ key: 'releases', label: 'Releases', count: null, prior: 0 },
	{ key: 'service-requests', label: 'Service requests received', count: 29, prior: 25 },
	{ key: 'outreach', label: 'Outreach actions', count: 0, prior: 2 },
];

export interface PersonToday {
	readonly profileId: string;
	readonly name: string;
	readonly records: number;
	/** HH:MM in the Organization's zone. */
	readonly lastAt: string;
	/** Which record types, for the variants that show them. */
	readonly kinds: readonly string[];
}

export const PEOPLE: readonly PersonToday[] = [
	{
		profileId: '11111111-1111-4111-8111-111111111111',
		name: 'Dana Okafor',
		records: 38,
		lastAt: '14:52',
		kinds: ['inspections', 'samples'],
	},
	{
		profileId: '22222222-2222-4222-8222-222222222222',
		name: 'Miguel Herrera',
		records: 21,
		lastAt: '14:10',
		kinds: ['collections'],
	},
	{
		profileId: '33333333-3333-4333-8333-333333333333',
		name: 'Priya Natarajan',
		records: 12,
		lastAt: '13:38',
		kinds: ['applications', 'inspections'],
	},
	{
		profileId: '44444444-4444-4444-8444-444444444444',
		name: 'Tom Adebayo',
		records: 7,
		lastAt: '11:05',
		kinds: ['source reductions'],
	},
	{
		profileId: '55555555-5555-4555-8555-555555555555',
		name: 'Lena Fischer',
		records: 2,
		lastAt: '09:41',
		kinds: ['service requests'],
	},
];

export function ageLabel(days: number | null): string {
	if (days === null) return '';
	if (days === 0) return 'today';
	if (days === 1) return '1 day';
	return `${days} days`;
}

export function deltaOf(type: ActivityType): number | null {
	return type.count === null ? null : type.count - type.prior;
}
