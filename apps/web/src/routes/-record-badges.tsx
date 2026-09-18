import type { ActivityCategory, LarvalDensity } from '@simmer-mosquito/domain';
import { Badge } from '@simmer-mosquito/ui-web/components/ui/badge';
import type { ReactNode } from 'react';
import {
	DensityBadge,
	type LifeStageFlags,
	LifeStageStrip,
	WetnessBadge,
} from '../components/larval-display';
import type { CollectionStatus } from '../components/map';
import { BycatchBadge } from './adult-surveillance/-adult-display';
import { ContextBadge, type ControlContext } from './control-operations/-control-display';

// What each of the nine record kinds puts in the badge group beside its title,
// declared once for the two surfaces that draw it.
// Dash-prefixed so TanStack Router ignores this file as a route.

/**
 * A habitat's or a trap's lifecycle state. Traps have no inaccessible state;
 * habitats do.
 */
export type LifecycleStatus = 'active' | 'inactive' | 'inaccessible';

/**
 * What an inspection found.
 *
 * Dry and "wet with nothing counted" are different statements and never
 * collapse into one, which is why the wetness is its own field rather than
 * being read off a null density.
 */
export interface InspectionResult {
	readonly isWet: boolean;
	readonly density: LarvalDensity | null;
	/** The stages found, or null where none were. */
	readonly stages: LifeStageFlags | null;
}

/** A category with nothing to contribute beyond which category it is. */
type NoBadgeFacts = Record<never, never>;

/**
 * The facts each category contributes, keyed by category.
 *
 * Typed as a record over the domain's own `ActivityCategory` union, so a record
 * kind that is added to the log and forgotten here fails `tsc` rather than
 * drawing a row with no badges on it. A category with nothing to contribute
 * says so with an empty object rather than by being absent.
 */
interface BadgeFactsByCategory extends Record<ActivityCategory, object> {
	readonly habitat: { readonly status: LifecycleStatus };
	readonly inspection: { readonly result: InspectionResult };
	readonly trap: { readonly status: 'active' | 'inactive' };
	readonly collection: {
		readonly status: CollectionStatus;
		readonly hasBycatch: boolean;
	};
	readonly application: NoBadgeFacts;
	readonly sourceReduction: NoBadgeFacts;
	readonly biocontrol: { readonly context: ControlContext };
	readonly outreach: NoBadgeFacts;
	readonly serviceRequest: { readonly status: 'open' | 'closed' };
}

/** One record, as the badge group needs to read it. */
export type RecordBadgeFacts = {
	[Category in ActivityCategory]: { readonly category: Category } & BadgeFactsByCategory[Category];
}[ActivityCategory];

/**
 * Whether the caller has already drawn the record's state as the row's swatch.
 *
 * The one thing the two surfaces genuinely differ on, and it is a layout fact
 * rather than a taste. An explorer paints one record kind, so its row's leading
 * dot is free to be that record's state and the key above the map names the
 * colours. Daily Work paints nine kinds at once and spends the dot on which
 * family the work belongs to, so the state has nowhere to go but a pill.
 */
export type StatusPlacement = 'dot' | 'badge';

/**
 * The badges beside a record's title, for an explorer row or a log row alike.
 *
 * The two surfaces list the same nine record kinds through the same
 * `ExplorerRow`, and until this existed each decided the badges itself. They
 * had already drifted: an inspection read as a density pill in the Daily Work
 * log and as a life-stage strip on its own map page, so the same record said
 * one of two different things depending on which page reached it, and neither
 * page said the other's.
 *
 * A row takes this through {@link recordBadges} rather than as an element,
 * and that is the whole of #1107. `ExplorerRow` lays its badge container out
 * on the prop being there, and an element is there whatever it draws, so a
 * kind with nothing to draw still spent a line under its subtitle. The
 * decision has to be made before the element exists, and one function making
 * it is what keeps a sixth caller from writing the element bare.
 */
function RecordBadges({
	facts,
	status,
}: {
	readonly facts: RecordBadgeFacts;
	readonly status: StatusPlacement;
}): ReactNode {
	return (
		<>
			{status === 'badge' ? <RecordStateBadge facts={facts} /> : null}
			<RecordDetailBadges facts={facts} />
		</>
	);
}

/**
 * The badges a row passes to `ExplorerRow`, or `undefined` for a record that
 * draws none, which is what the row reads as "no container".
 */
export function recordBadges(facts: RecordBadgeFacts, status: StatusPlacement): ReactNode {
	return hasBadges(facts, status) ? <RecordBadges facts={facts} status={status} /> : undefined;
}

/**
 * Whether the badge group draws anything for this record under this
 * placement.
 *
 * The one answer to "does this row have badges". An application or a source
 * reduction has none under either placement; a habitat's state is a pill under
 * `'badge'` and the row's dot under `'dot'`; a collected collection with no
 * bycatch has none even as a pill, because the log's verb already says it was
 * collected.
 */
export function hasBadges(facts: RecordBadgeFacts, status: StatusPlacement): boolean {
	return (status === 'badge' && hasStateBadge(facts)) || hasDetailBadges(facts);
}

/** The facts of one category, as the register's entry for it reads them. */
type FactsFor<Category extends ActivityCategory> = Extract<
	RecordBadgeFacts,
	{ readonly category: Category }
>;

/**
 * What one record kind puts in the badge group, as four answers over its own
 * narrowed facts.
 *
 * The predicate and the renderer for one kind are one entry, so "is there a
 * pill" and "which pill" cannot answer differently, and the same for the
 * second line. `hasState` is asked before `state` draws and `hasDetail` before
 * `detail`, because the row lays its container out on the answer and never on
 * the element.
 */
interface CategoryBadges<Category extends ActivityCategory> {
	/** Whether this record has a state to draw as a pill. */
	readonly hasState: (facts: FactsFor<Category>) => boolean;
	/** The pill that says what state the record is in. */
	readonly state: (facts: FactsFor<Category>) => ReactNode;
	/** Whether this record draws anything beyond its state. */
	readonly hasDetail: (facts: FactsFor<Category>) => boolean;
	/** The badges that stand whatever the row's dot is doing. */
	readonly detail: (facts: FactsFor<Category>) => ReactNode;
}

/** The entry for a kind with nothing to draw under either placement. */
const NO_BADGES = {
	hasState: () => false,
	state: () => null,
	hasDetail: () => false,
	detail: () => null,
} as const;

/**
 * The register: every category in the domain's union, each answering over
 * its own facts. Keyed by `ActivityCategory` so a category added to the log
 * fails `tsc` here until it says what it draws, and a category removed from
 * the union fails on the entry left behind.
 *
 * The state pill is only drawn where the row's dot is spent on something
 * else. A collection that was simply collected gets none: the log already
 * says "Collected" as the verb leading its subtitle, and a pill repeating that
 * on every row of a round stands where an exception would be. It is the one
 * record with a state and no pill for it.
 *
 * The detail badges take a line of their own under the row, which is why each
 * `hasDetail` is the exact condition its `detail` draws under: an inspection's
 * density plus its six-cell strip is 175px, which in a 380px panel left the
 * record with no room for its name. A dry site has no stages to report, and a
 * wet one that found none says so through the pill beside it.
 */
const BADGES_BY_CATEGORY: { readonly [Category in ActivityCategory]: CategoryBadges<Category> } = {
	habitat: {
		hasState: () => true,
		state: (facts) => <StateBadge token={facts.status} />,
		hasDetail: () => false,
		detail: () => null,
	},
	inspection: {
		hasState: () => true,
		state: (facts) => inspectionStateBadge(facts.result),
		hasDetail: (facts) => facts.result.isWet && facts.result.stages !== null,
		detail: (facts) =>
			facts.result.stages === null ? null : (
				<LifeStageStrip size="sm" stages={facts.result.stages} />
			),
	},
	trap: {
		hasState: () => true,
		state: (facts) => <StateBadge token={facts.status} />,
		hasDetail: () => false,
		detail: () => null,
	},
	collection: {
		hasState: (facts) => facts.status !== 'collected',
		state: (facts) => <StateBadge token={facts.status} />,
		hasDetail: (facts) => facts.hasBycatch,
		detail: () => <BycatchBadge hasBycatch={true} />,
	},
	application: NO_BADGES,
	sourceReduction: NO_BADGES,
	biocontrol: {
		hasState: () => false,
		state: () => null,
		hasDetail: () => true,
		detail: (facts) => <ContextBadge context={facts.context} />,
	},
	outreach: NO_BADGES,
	serviceRequest: {
		hasState: () => true,
		state: (facts) => <StateBadge token={facts.status} />,
		hasDetail: () => false,
		detail: () => null,
	},
};

/**
 * The register's entry for this record, typed to take it.
 *
 * Generic over the category rather than over the union, because indexing the
 * register with the union hands back a union of entries, and an entry for one
 * kind does not take another kind's facts. Every caller passes the whole
 * union, so `Category` is the whole union there and the entry takes it; the
 * pairing of a key to the facts of that key is the mapped type's.
 */
function badgesFor<Category extends ActivityCategory>(
	facts: FactsFor<Category>,
): CategoryBadges<Category> {
	return BADGES_BY_CATEGORY[facts.category];
}

function RecordStateBadge({ facts }: { readonly facts: RecordBadgeFacts }): ReactNode {
	return hasStateBadge(facts) ? badgesFor(facts).state(facts) : null;
}

function hasStateBadge(facts: RecordBadgeFacts): boolean {
	return badgesFor(facts).hasState(facts);
}

/** Dry, the density found, or wet where the site held water and nothing was counted. */
function inspectionStateBadge(result: InspectionResult): ReactNode {
	if (!result.isWet) {
		return <WetnessBadge isWet={false} />;
	}
	return result.density === null ? (
		<WetnessBadge isWet={true} />
	) : (
		<DensityBadge density={result.density} />
	);
}

function RecordDetailBadges({ facts }: { readonly facts: RecordBadgeFacts }): ReactNode {
	return hasDetailBadges(facts) ? badgesFor(facts).detail(facts) : null;
}

/**
 * Whether this record draws anything beyond its state, which is what the row
 * asks before it lays the badges out: a state pill on its own sits beside the
 * title, and anything more takes a line of its own.
 */
export function hasDetailBadges(facts: RecordBadgeFacts): boolean {
	return badgesFor(facts).hasDetail(facts);
}

/** The states a pill can name, across the four categories that have one. */
type StateToken = LifecycleStatus | CollectionStatus | 'open' | 'closed';

const STATE_BADGE: Readonly<
	Record<StateToken, { readonly label: string; readonly tone: BadgeTone }>
> = {
	active: { label: 'Active', tone: 'success' },
	inactive: { label: 'Inactive', tone: 'neutral' },
	inaccessible: { label: 'Inaccessible', tone: 'warning' },
	pending: { label: 'Trap out', tone: 'info' },
	collected: { label: 'Collected', tone: 'neutral' },
	zero_result: { label: 'Zero result', tone: 'neutral' },
	problem: { label: 'Problem reported', tone: 'warning' },
	open: { label: 'Open', tone: 'info' },
	closed: { label: 'Closed', tone: 'neutral' },
};

type BadgeTone = 'success' | 'neutral' | 'warning' | 'info';

function StateBadge({ token }: { readonly token: StateToken }) {
	const { label, tone } = STATE_BADGE[token];
	return (
		<Badge tone={tone} variant="outline">
			{label}
		</Badge>
	);
}
