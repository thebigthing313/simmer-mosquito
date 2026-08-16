import { eq, gte, useLiveQuery } from '@tanstack/react-db';
import { useMemo } from 'react';
import { webCollections } from '../../sync/webCollections';

// The control-operations overview reads entirely from synced collections — there
// is no control read/aggregate endpoint. The method catalogs sync eagerly while
// the performed actions are on-demand shapes (docs/sync.md), so every action hook
// bounds its window by date and uses the status-gated `useLiveQuery`, not the
// suspense variant, which hangs after a navigation unmount over on-demand
// collections.

// Pure date helpers are shared with the surveillance overviews; re-exported here
// so every domain builds its windows from one implementation.
export {
	addDaysToDateString,
	buildWeek,
	dayOfMonth,
	startOfWeek,
	todayInTimeZone,
	weekdayLabel,
} from '../larval-surveillance/-overview-data';

/** How far back the recent-activity panels reach. */
export const CONTROL_ACTIVITY_WINDOW_DAYS = 14;

/** The windows the insecticide usage summary offers, shortest first. */
export const USAGE_WINDOW_DAYS = [7, 30] as const;
export type UsageWindowDays = (typeof USAGE_WINDOW_DAYS)[number];

const activityGcTimeMs = 30_000;

interface LoadState {
	readonly isReady: boolean;
	readonly isError: boolean;
}

interface RecentApplication {
	readonly id: string;
	readonly insecticideId: string;
	readonly applicationMethodId: string | null;
	readonly applicatorProfileId: string | null;
	readonly applicationDate: string;
	readonly amountApplied: number;
	readonly applicationUnitId: string;
	readonly habitatId: string | null;
	readonly inspectionId: string | null;
	readonly collectionId: string | null;
}

export interface RecentSourceReduction {
	readonly id: string;
	readonly sourceReductionMethodId: string;
	readonly technicianProfileId: string | null;
	readonly sourceReductionDate: string;
	readonly sourcesEliminatedAmount: number;
	readonly sourcesEliminatedUnitId: string;
	readonly habitatId: string | null;
	readonly inspectionId: string | null;
}

export interface RecentBiocontrolAction {
	readonly id: string;
	readonly biocontrolMethodId: string;
	readonly technicianProfileId: string | null;
	readonly biocontrolDate: string;
	readonly amountReleased: number;
	readonly releaseUnitId: string;
	readonly habitatId: string | null;
	readonly inspectionId: string | null;
}

/** Chemical applications made on or after `sinceDate` (a `YYYY-MM-DD`), newest first. */
function useRecentApplications(sinceDate: string): {
	readonly applications: readonly RecentApplication[];
} & LoadState {
	const result = useLiveQuery(
		{
			gcTime: activityGcTimeMs,
			query: (query) =>
				query
					.from({ application: webCollections.applications })
					.where(({ application }) => gte(application.applicationDate, sinceDate))
					.orderBy(({ application }) => application.applicationDate, 'desc')
					.select(({ application }) => ({
						id: application.id,
						insecticideId: application.insecticideId,
						applicationMethodId: application.applicationMethodId,
						applicatorProfileId: application.applicatorProfileId,
						applicationDate: application.applicationDate,
						amountApplied: application.amountApplied,
						applicationUnitId: application.applicationUnitId,
						habitatId: application.habitatId,
						inspectionId: application.inspectionId,
						collectionId: application.collectionId,
					})),
		},
		[sinceDate],
	);

	return {
		applications: (result.data ?? []) as unknown as readonly RecentApplication[],
		isReady: result.isReady,
		isError: result.isError,
	};
}

/** Source reductions performed on or after `sinceDate`, newest first. */
export function useRecentSourceReductions(sinceDate: string): {
	readonly sourceReductions: readonly RecentSourceReduction[];
} & LoadState {
	const result = useLiveQuery(
		{
			gcTime: activityGcTimeMs,
			query: (query) =>
				query
					.from({ sourceReduction: webCollections.sourceReductions })
					.where(({ sourceReduction }) => gte(sourceReduction.sourceReductionDate, sinceDate))
					.orderBy(({ sourceReduction }) => sourceReduction.sourceReductionDate, 'desc')
					.select(({ sourceReduction }) => ({
						id: sourceReduction.id,
						sourceReductionMethodId: sourceReduction.sourceReductionMethodId,
						technicianProfileId: sourceReduction.technicianProfileId,
						sourceReductionDate: sourceReduction.sourceReductionDate,
						sourcesEliminatedAmount: sourceReduction.sourcesEliminatedAmount,
						sourcesEliminatedUnitId: sourceReduction.sourcesEliminatedUnitId,
						habitatId: sourceReduction.habitatId,
						inspectionId: sourceReduction.inspectionId,
					})),
		},
		[sinceDate],
	);

	return {
		sourceReductions: (result.data ?? []) as unknown as readonly RecentSourceReduction[],
		isReady: result.isReady,
		isError: result.isError,
	};
}

/** Biocontrol releases made on or after `sinceDate`, newest first. */
export function useRecentBiocontrolActions(sinceDate: string): {
	readonly biocontrolActions: readonly RecentBiocontrolAction[];
} & LoadState {
	const result = useLiveQuery(
		{
			gcTime: activityGcTimeMs,
			query: (query) =>
				query
					.from({ biocontrol: webCollections.biocontrolActions })
					.where(({ biocontrol }) => gte(biocontrol.biocontrolDate, sinceDate))
					.orderBy(({ biocontrol }) => biocontrol.biocontrolDate, 'desc')
					.select(({ biocontrol }) => ({
						id: biocontrol.id,
						biocontrolMethodId: biocontrol.biocontrolMethodId,
						technicianProfileId: biocontrol.technicianProfileId,
						biocontrolDate: biocontrol.biocontrolDate,
						amountReleased: biocontrol.amountReleased,
						releaseUnitId: biocontrol.releaseUnitId,
						habitatId: biocontrol.habitatId,
						inspectionId: biocontrol.inspectionId,
					})),
		},
		[sinceDate],
	);

	return {
		biocontrolActions: (result.data ?? []) as unknown as readonly RecentBiocontrolAction[],
		isReady: result.isReady,
		isError: result.isError,
	};
}

// --- a crew's day of control work -------------------------------------------
//
// The daily panel covers every kind of control action, not just applications: a
// crew's day is a mix of spraying, dipping out a source, and dropping fish, and
// reading only one of the three understates what the person actually got through.
// Three date-equality subsets (one per collection) merge into one list, so
// browsing to a historical day loads that day's rows rather than a rolling window.

/** What kind of control action a row is — the icon and detail link follow from it. */
export type ControlActionKind = 'application' | 'sourceReduction' | 'biocontrol';

export interface DailyControlAction {
	readonly kind: ControlActionKind;
	readonly id: string;
	readonly actionDate: string;
	/** Applicator or technician: whoever performed the work. */
	readonly performedByProfileId: string | null;
	/** The insecticide (applications) or the control method (the other two). */
	readonly subjectId: string;
	readonly methodId: string | null;
	readonly amount: number;
	readonly unitId: string;
	readonly createdAt: string;
}

/** Every control action performed on one day, ordered as it was recorded. */
export function useControlActionsForDay(date: string): {
	readonly actions: readonly DailyControlAction[];
} & LoadState {
	const applicationResult = useLiveQuery(
		{
			gcTime: activityGcTimeMs,
			query: (query) =>
				query
					.from({ application: webCollections.applications })
					.where(({ application }) => eq(application.applicationDate, date))
					.orderBy(({ application }) => application.createdAt, 'asc')
					.select(({ application }) => ({
						id: application.id,
						actionDate: application.applicationDate,
						performedByProfileId: application.applicatorProfileId,
						subjectId: application.insecticideId,
						methodId: application.applicationMethodId,
						amount: application.amountApplied,
						unitId: application.applicationUnitId,
						createdAt: application.createdAt,
					})),
		},
		[date],
	);
	const sourceReductionResult = useLiveQuery(
		{
			gcTime: activityGcTimeMs,
			query: (query) =>
				query
					.from({ sourceReduction: webCollections.sourceReductions })
					.where(({ sourceReduction }) => eq(sourceReduction.sourceReductionDate, date))
					.orderBy(({ sourceReduction }) => sourceReduction.createdAt, 'asc')
					.select(({ sourceReduction }) => ({
						id: sourceReduction.id,
						actionDate: sourceReduction.sourceReductionDate,
						performedByProfileId: sourceReduction.technicianProfileId,
						subjectId: sourceReduction.sourceReductionMethodId,
						methodId: sourceReduction.sourceReductionMethodId,
						amount: sourceReduction.sourcesEliminatedAmount,
						unitId: sourceReduction.sourcesEliminatedUnitId,
						createdAt: sourceReduction.createdAt,
					})),
		},
		[date],
	);
	const biocontrolResult = useLiveQuery(
		{
			gcTime: activityGcTimeMs,
			query: (query) =>
				query
					.from({ biocontrol: webCollections.biocontrolActions })
					.where(({ biocontrol }) => eq(biocontrol.biocontrolDate, date))
					.orderBy(({ biocontrol }) => biocontrol.createdAt, 'asc')
					.select(({ biocontrol }) => ({
						id: biocontrol.id,
						actionDate: biocontrol.biocontrolDate,
						performedByProfileId: biocontrol.technicianProfileId,
						subjectId: biocontrol.biocontrolMethodId,
						methodId: biocontrol.biocontrolMethodId,
						amount: biocontrol.amountReleased,
						unitId: biocontrol.releaseUnitId,
						createdAt: biocontrol.createdAt,
					})),
		},
		[date],
	);

	const actions = useMemo(
		() =>
			[
				...tag('application', applicationResult.data),
				...tag('sourceReduction', sourceReductionResult.data),
				...tag('biocontrol', biocontrolResult.data),
			].sort((first, second) => first.createdAt.localeCompare(second.createdAt)),
		[applicationResult.data, sourceReductionResult.data, biocontrolResult.data],
	);

	return {
		actions,
		// One panel over three shapes: it is only trustworthy once all three have
		// landed, and any one failing means the day shown would be short some work.
		isReady: applicationResult.isReady && sourceReductionResult.isReady && biocontrolResult.isReady,
		isError: applicationResult.isError || sourceReductionResult.isError || biocontrolResult.isError,
	};
}

function tag(kind: ControlActionKind, rows: unknown): readonly DailyControlAction[] {
	return ((rows ?? []) as readonly Omit<DailyControlAction, 'kind'>[]).map((row) => ({
		...row,
		kind,
	}));
}

// --- insecticide usage summary ----------------------------------------------

/** One product's total over the window, per unit it was measured in. */
export interface InsecticideUsage {
	readonly insecticideId: string;
	readonly totalsByUnitId: ReadonlyMap<string, number>;
	readonly applicationCount: number;
}

/**
 * How much of each product went out over a window.
 *
 * Totals are kept per unit rather than summed across them: the same product can
 * be recorded in gallons on one job and pounds on the next, and adding those
 * together would report a quantity that was never applied.
 */
export function useInsecticideUsage(sinceDate: string): {
	readonly usage: readonly InsecticideUsage[];
} & LoadState {
	const { applications, isReady, isError } = useRecentApplications(sinceDate);

	const usage = useMemo(() => {
		const byInsecticide = new Map<string, { totals: Map<string, number>; count: number }>();
		for (const application of applications) {
			const entry = byInsecticide.get(application.insecticideId) ?? {
				totals: new Map<string, number>(),
				count: 0,
			};
			entry.totals.set(
				application.applicationUnitId,
				(entry.totals.get(application.applicationUnitId) ?? 0) + application.amountApplied,
			);
			entry.count += 1;
			byInsecticide.set(application.insecticideId, entry);
		}
		return [...byInsecticide.entries()].map(([insecticideId, entry]) => ({
			insecticideId,
			totalsByUnitId: entry.totals,
			applicationCount: entry.count,
		}));
	}, [applications]);

	return { usage, isReady, isError };
}
