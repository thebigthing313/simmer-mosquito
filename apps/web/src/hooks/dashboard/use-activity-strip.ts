/**
 * The Dashboard's last-7-days strip, read live: for each of the eight activity
 * types, how many records fall in the 7 days ending today and how many in the
 * 7 before, so a cell and its delta chip come from one read.
 *
 * Seven `useLiveQuery` subsets, one per table, each a 14-day window on the
 * date `ACTIVITY_DATES` names for the type, folded into the two counts here.
 * Samples have no date of their own and are counted on the parent
 * inspection's: the inspections read carries a correlated include of each
 * inspection's sample ids, so one subset serves both cells.
 *
 * Takes `today` as `YYYY-MM-DD` in the Organization's zone and the zone
 * itself, which the collections read needs to reduce `collected_at` to a day.
 * Answers every type, at `0` when there is nothing; a type the Organization
 * has never recorded is a cell like any other.
 */

import { OVERVIEW_RECORD_TYPES, type OverviewRecordType } from '@simmer-mosquito/domain';
import { eq, gte, toArray, useLiveQuery } from '@tanstack/react-db';
import type { ActivityCount, DateWindow } from '../../components/dashboard/dashboard-data';
import { applications } from '../../lib/collections/applications';
import { biocontrol_actions } from '../../lib/collections/biocontrol_actions';
import { collections } from '../../lib/collections/collections';
import { inspections } from '../../lib/collections/inspections';
import { outreach_actions } from '../../lib/collections/outreach_actions';
import { samples } from '../../lib/collections/samples';
import { service_requests } from '../../lib/collections/service_requests';
import { source_reductions } from '../../lib/collections/source_reductions';
import { addCalendarDays } from '../../lib/local-date';
import { ACTIVITY_DATES } from '../queries/activity-dates';
import { liveQueryGcTimeMs } from '../queries/shared';

/** The strip's window: today and the six days before it. */
const ACTIVITY_WINDOW_DAYS = 7;

export interface ActivityStripRead {
	/** How many days each window holds, which is what the strip's copy names. */
	readonly windowDays: number;
	readonly window: DateWindow;
	readonly priorWindow: DateWindow;
	readonly types: Readonly<Record<OverviewRecordType, ActivityCount>>;
	readonly isReady: boolean;
	readonly isError: boolean;
}

/** A row as every read here projects it: its operational date, and how many it counts for. */
interface DatedRow {
	readonly date: string | null;
	readonly weight: number;
}

export function useActivityStrip(today: string, timeZone: string): ActivityStripRead {
	const window: DateWindow = {
		from: addCalendarDays(today, -(ACTIVITY_WINDOW_DAYS - 1)),
		to: today,
	};
	const priorWindow: DateWindow = {
		from: addCalendarDays(window.from, -ACTIVITY_WINDOW_DAYS),
		to: addCalendarDays(window.from, -1),
	};
	const since = priorWindow.from;

	const inspectionRows = useLiveQuery({
		gcTime: liveQueryGcTimeMs,
		query: (query) =>
			query
				.from({ inspection: inspections() })
				.where(({ inspection }) => gte(ACTIVITY_DATES.inspections.column(inspection), since))
				.select(({ inspection }) => ({
					id: inspection.id,
					// The inspection's date, which is also what its samples count on.
					date: ACTIVITY_DATES.samples.parentColumn(inspection),
					// Ids alone: the count is all the strip reads off a sample.
					sampleIds: toArray(
						query
							.from({ sample: samples() })
							.where(({ sample }) => eq(sample.inspection_id, inspection.id))
							.select(({ sample }) => ({ id: sample.id })),
					),
				})),
	});

	const collectionRows = useLiveQuery({
		gcTime: liveQueryGcTimeMs,
		query: (query) =>
			query
				.from({ collection: collections() })
				.where(({ collection }) => ACTIVITY_DATES.collections.since(collection, since, timeZone))
				.select(({ collection }) => ({
					id: collection.id,
					collectedAt: collection.collected_at,
					collectionDate: collection.collection_date,
				})),
	});

	const applicationRows = useLiveQuery({
		gcTime: liveQueryGcTimeMs,
		query: (query) =>
			query
				.from({ application: applications() })
				.where(({ application }) => gte(ACTIVITY_DATES.applications.column(application), since))
				.select(({ application }) => ({
					id: application.id,
					date: ACTIVITY_DATES.applications.column(application),
				})),
	});

	const sourceReductionRows = useLiveQuery({
		gcTime: liveQueryGcTimeMs,
		query: (query) =>
			query
				.from({ reduction: source_reductions() })
				.where(({ reduction }) => gte(ACTIVITY_DATES.sourceReductions.column(reduction), since))
				.select(({ reduction }) => ({
					id: reduction.id,
					date: ACTIVITY_DATES.sourceReductions.column(reduction),
				})),
	});

	const releaseRows = useLiveQuery({
		gcTime: liveQueryGcTimeMs,
		query: (query) =>
			query
				.from({ release: biocontrol_actions() })
				.where(({ release }) => gte(ACTIVITY_DATES.releases.column(release), since))
				.select(({ release }) => ({
					id: release.id,
					date: ACTIVITY_DATES.releases.column(release),
				})),
	});

	const serviceRequestRows = useLiveQuery({
		gcTime: liveQueryGcTimeMs,
		query: (query) =>
			query
				.from({ request: service_requests() })
				.where(({ request }) => gte(ACTIVITY_DATES.serviceRequests.column(request), since))
				.select(({ request }) => ({
					id: request.id,
					date: ACTIVITY_DATES.serviceRequests.column(request),
				})),
	});

	const outreachRows = useLiveQuery({
		gcTime: liveQueryGcTimeMs,
		query: (query) =>
			query
				.from({ outreach: outreach_actions() })
				.where(({ outreach }) => gte(ACTIVITY_DATES.outreachActions.column(outreach), since))
				.select(({ outreach }) => ({
					id: outreach.id,
					date: ACTIVITY_DATES.outreachActions.column(outreach),
				})),
	});

	const reads = [
		inspectionRows,
		collectionRows,
		applicationRows,
		sourceReductionRows,
		releaseRows,
		serviceRequestRows,
		outreachRows,
	];

	const inspectionDates = inspectionRows.data.map((row) => ({ date: row.date, weight: 1 }));
	const sampleDates = inspectionRows.data.map((row) => ({
		date: row.date,
		weight: (row.sampleIds as readonly unknown[]).length,
	}));
	const collectionDates = collectionRows.data.map((row) => ({
		date: ACTIVITY_DATES.collections.day(row, timeZone),
		weight: 1,
	}));

	const dated: Readonly<Record<OverviewRecordType, readonly DatedRow[]>> = {
		inspections: inspectionDates,
		samples: sampleDates,
		collections: collectionDates,
		applications: applicationRows.data.map(one),
		sourceReductions: sourceReductionRows.data.map(one),
		releases: releaseRows.data.map(one),
		serviceRequests: serviceRequestRows.data.map(one),
		outreachActions: outreachRows.data.map(one),
	};

	const types = {} as Record<OverviewRecordType, ActivityCount>;
	for (const key of OVERVIEW_RECORD_TYPES) {
		types[key] = windowCounts(dated[key], window, priorWindow);
	}

	return {
		windowDays: ACTIVITY_WINDOW_DAYS,
		window,
		priorWindow,
		types,
		isReady: reads.every((read) => read.isReady),
		isError: reads.some((read) => read.isError),
	};
}

function one(row: { readonly date: string }): DatedRow {
	return { date: row.date, weight: 1 };
}

/**
 * The two counts over rows already inside the 14-day subset. A `date` column
 * arrives as `YYYY-MM-DD`, so the bounds compare as strings; an undated row
 * falls out of both windows.
 */
function windowCounts(
	rows: readonly DatedRow[],
	window: DateWindow,
	priorWindow: DateWindow,
): ActivityCount {
	let count = 0;
	let prior = 0;
	for (const row of rows) {
		if (row.date === null || row.date === '') {
			continue;
		}
		if (row.date >= window.from && row.date <= window.to) {
			count += row.weight;
		} else if (row.date >= priorWindow.from && row.date <= priorWindow.to) {
			prior += row.weight;
		}
	}
	return { count, prior };
}
