/**
 * The Dashboard's last-7-days strip, read live: for each of the eight activity
 * types, how many records fall in the 7 days ending today and how many in the
 * 7 before, so a cell and its delta chip come from one read.
 *
 * Eight `useLiveQuery` subsets, one per table, each a 14-day window on the
 * type's own operational date, folded into the two counts here. Samples have
 * no date of their own and are counted on the parent inspection's: the
 * inspections read carries a correlated include of each inspection's sample
 * ids, so one subset serves both cells.
 *
 * Takes `today` as `YYYY-MM-DD` in the Organization's zone and the zone
 * itself, which the collections read needs to reduce `collected_at` to a day.
 * Answers every type, at `0` when there is nothing; a type the Organization
 * has never recorded is a cell like any other.
 */

import { eq, gte, or, toArray, useLiveQuery } from '@tanstack/react-db';
import {
	ACTIVITY_TYPE_KEYS,
	type ActivityCount,
	type ActivityTypeKey,
	type DateWindow,
} from '../../components/dashboard/dashboard-data';
import { applications } from '../../lib/collections/applications';
import { biocontrol_actions } from '../../lib/collections/biocontrol_actions';
import { collections } from '../../lib/collections/collections';
import { inspections } from '../../lib/collections/inspections';
import { outreach_actions } from '../../lib/collections/outreach_actions';
import { samples } from '../../lib/collections/samples';
import { service_requests } from '../../lib/collections/service_requests';
import { source_reductions } from '../../lib/collections/source_reductions';
import { addCalendarDays, localCalendarDay, localDayStartAsInstant } from '../../lib/local-date';
import { activityGcTimeMs } from '../queries/shared';

/** The strip's window: today and the six days before it. */
const ACTIVITY_WINDOW_DAYS = 7;

export interface ActivityStripRead {
	readonly window: DateWindow;
	readonly priorWindow: DateWindow;
	readonly types: Readonly<Record<ActivityTypeKey, ActivityCount>>;
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
	const sinceInstant = localDayStartAsInstant(since, timeZone);

	const inspectionRows = useLiveQuery({
		gcTime: activityGcTimeMs,
		query: (query) =>
			query
				.from({ inspection: inspections() })
				.where(({ inspection }) => gte(inspection.inspection_date, since))
				.select(({ inspection }) => ({
					id: inspection.id,
					date: inspection.inspection_date,
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
		gcTime: activityGcTimeMs,
		query: (query) =>
			query
				.from({ collection: collections() })
				.where(({ collection }) =>
					or(gte(collection.collected_at, sinceInstant), gte(collection.collection_date, since)),
				)
				.select(({ collection }) => ({
					id: collection.id,
					collectedAt: collection.collected_at,
					collectionDate: collection.collection_date,
				})),
	});

	const applicationRows = useLiveQuery({
		gcTime: activityGcTimeMs,
		query: (query) =>
			query
				.from({ application: applications() })
				.where(({ application }) => gte(application.application_date, since))
				.select(({ application }) => ({ id: application.id, date: application.application_date })),
	});

	const sourceReductionRows = useLiveQuery({
		gcTime: activityGcTimeMs,
		query: (query) =>
			query
				.from({ reduction: source_reductions() })
				.where(({ reduction }) => gte(reduction.source_reduction_date, since))
				.select(({ reduction }) => ({ id: reduction.id, date: reduction.source_reduction_date })),
	});

	const releaseRows = useLiveQuery({
		gcTime: activityGcTimeMs,
		query: (query) =>
			query
				.from({ release: biocontrol_actions() })
				.where(({ release }) => gte(release.biocontrol_date, since))
				.select(({ release }) => ({ id: release.id, date: release.biocontrol_date })),
	});

	const serviceRequestRows = useLiveQuery({
		gcTime: activityGcTimeMs,
		query: (query) =>
			query
				.from({ request: service_requests() })
				.where(({ request }) => gte(request.request_date, since))
				.select(({ request }) => ({ id: request.id, date: request.request_date })),
	});

	const outreachRows = useLiveQuery({
		gcTime: activityGcTimeMs,
		query: (query) =>
			query
				.from({ outreach: outreach_actions() })
				.where(({ outreach }) => gte(outreach.outreach_date, since))
				.select(({ outreach }) => ({ id: outreach.id, date: outreach.outreach_date })),
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
	// The effective date, the way every collection read reduces it: `collected_at`
	// in the Organization's zone under exact timestamps, `collection_date` otherwise.
	const collectionDates = collectionRows.data.map((row) => ({
		date:
			row.collectedAt === null ? row.collectionDate : localCalendarDay(row.collectedAt, timeZone),
		weight: 1,
	}));

	const dated: Readonly<Record<ActivityTypeKey, readonly DatedRow[]>> = {
		inspections: inspectionDates,
		samples: sampleDates,
		collections: collectionDates,
		applications: applicationRows.data.map(one),
		sourceReductions: sourceReductionRows.data.map(one),
		releases: releaseRows.data.map(one),
		serviceRequests: serviceRequestRows.data.map(one),
		outreachActions: outreachRows.data.map(one),
	};

	const types = {} as Record<ActivityTypeKey, ActivityCount>;
	for (const key of ACTIVITY_TYPE_KEYS) {
		types[key] = windowCounts(dated[key], window, priorWindow);
	}

	return {
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
