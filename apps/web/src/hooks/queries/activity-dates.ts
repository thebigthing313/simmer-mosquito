/**
 * Which date each activity type is counted on, as a register a read imports.
 *
 * Not a hook, so not a `use-` file. The eight types are the domain's
 * `OVERVIEW_RECORD_TYPES`, and the columns are the ones the server's overview
 * reader windows on (#980). A service request is counted on the day it was
 * received, which is its request date in `CONTEXT.md`. `useActivityStrip`
 * reads all eight from here, `useDayActivity` reads the six it windows by a
 * date column, and `performed-action-reads.ts` hands the four performed
 * actions' columns on to the hooks that read those (#1428).
 *
 * Each column is a function from the row's ref to the column on it rather than
 * a column name in a string, so a misspelled column is a `tsc` error here, and
 * a ref from the wrong table is one at the call site. Each function is generic
 * over the ref it is handed, so a `left` join over the table passes through
 * with its nullable brand intact.
 *
 * Two types have no column of their own. A Sample is counted on its parent
 * inspection's date, so its entry is the inspection's column and a read reaches
 * it through the inspection. A collection is counted on its effective day,
 * which is one of two columns depending on how the Organization times
 * collections, so its entry is the window predicate and the day function from
 * `collection-day.ts`.
 */

import type { OverviewRecordType } from '@simmer-mosquito/domain';
import type {
	Application,
	BiocontrolAction,
	Inspection,
	OutreachAction,
	ServiceRequest,
	SourceReduction,
} from '@simmer-mosquito/sync';
import type { Ref } from '@tanstack/react-db';
import { collectedSince, collectionEffectiveDate } from './collection-day';

/**
 * A ref that carries `TKey` the way `TRow`'s table does: the table's own ref,
 * or a `left` join over it, whose nullable brand rides through to the column.
 */
export type HasColumn<TRow, TKey extends keyof TRow> = Pick<Ref<TRow>, TKey>;

function inspectionDate<TRef extends HasColumn<Inspection, 'inspection_date'>>(
	inspection: TRef,
): TRef['inspection_date'] {
	return inspection.inspection_date;
}

export const ACTIVITY_DATES = {
	inspections: { column: inspectionDate },
	/** Read through the parent inspection: a sample has no date of its own. */
	samples: { parentColumn: inspectionDate },
	collections: { since: collectedSince, day: collectionEffectiveDate },
	applications: {
		column: <TRef extends HasColumn<Application, 'application_date'>>(
			application: TRef,
		): TRef['application_date'] => application.application_date,
	},
	sourceReductions: {
		column: <TRef extends HasColumn<SourceReduction, 'source_reduction_date'>>(
			reduction: TRef,
		): TRef['source_reduction_date'] => reduction.source_reduction_date,
	},
	releases: {
		column: <TRef extends HasColumn<BiocontrolAction, 'biocontrol_date'>>(
			release: TRef,
		): TRef['biocontrol_date'] => release.biocontrol_date,
	},
	serviceRequests: {
		column: <TRef extends HasColumn<ServiceRequest, 'request_date'>>(
			request: TRef,
		): TRef['request_date'] => request.request_date,
	},
	outreachActions: {
		column: <TRef extends HasColumn<OutreachAction, 'outreach_date'>>(
			outreach: TRef,
		): TRef['outreach_date'] => outreach.outreach_date,
	},
} as const satisfies Readonly<Record<OverviewRecordType, object>>;
