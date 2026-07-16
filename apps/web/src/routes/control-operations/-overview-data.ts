import { gte, useLiveQuery } from '@tanstack/react-db';
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
	formatDate,
	formatMonthDay,
	todayInTimeZone,
} from '../larval-surveillance/-overview-data';

/** How far back the recent-activity panels reach. */
export const CONTROL_ACTIVITY_WINDOW_DAYS = 14;

const activityGcTimeMs = 30_000;

interface LoadState {
	readonly isReady: boolean;
	readonly isError: boolean;
}

export interface RecentApplication {
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
export function useRecentApplications(sinceDate: string): {
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
