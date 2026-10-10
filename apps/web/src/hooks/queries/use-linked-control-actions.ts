/**
 * Every intervention that cites one Inspection.
 *
 * Five tables in control operations carry an `inspection_id` — the four
 * performed actions and the requested one — so an inspection can show what was
 * done, or asked for, as a follow-up to what it found. They are five queries
 * rather than one because they are five tables with nothing in common but that
 * column, and the union is built here.
 *
 * ## Why the shape is a discriminated union
 *
 * The actions do not describe themselves the same way: an application names a
 * product and an amount, a source reduction names a method and a count of
 * sources, an outreach action names how many people it reached, and a requested
 * action has not happened yet and names a summary instead. Flattening them into
 * one row shape would mean a pile of nullable columns and a renderer that has to
 * guess which are meaningful. `kind` says it instead.
 *
 * ## Two spellings of a date
 *
 * The four performed actions date themselves with a `date` column, which is a
 * `YYYY-MM-DD` string. `requested_at` is a `timestamptz`, so it arrives parsed
 * as a `Date`. Both are rendered to an ISO string here, which is what the shared
 * shape holds and what the sort compares — `YYYY-MM-DD` and a full ISO stamp
 * both sort lexicographically, and both sort correctly against each other.
 *
 * ## Names are joined, not looked up
 *
 * Each row carries the names it is drawn with: the insecticide, the method, the
 * unit and the Profile. Every join is `left` and only feeds a label, so the
 * where clause, and the subset Electric is asked for, stay on the action
 * table's own `inspection_id`. A catalog entry missing from the client reads as
 * `null` and the row is kept (#874).
 *
 * All five collections are on-demand, so this uses the status-gated
 * `useLiveQuery` rather than the suspense variant.
 */

import type { ControlType } from '@simmer-mosquito/domain';
import { coalesce, eq, useLiveQuery } from '@tanstack/react-db';
import { applications } from '../../lib/collections/applications';
import { biocontrol_actions } from '../../lib/collections/biocontrol_actions';
import { biocontrol_methods } from '../../lib/collections/biocontrol_methods';
import { insecticides } from '../../lib/collections/insecticides';
import { outreach_actions } from '../../lib/collections/outreach_actions';
import { outreach_methods } from '../../lib/collections/outreach_methods';
import { profiles } from '../../lib/collections/profiles';
import { requested_control_actions } from '../../lib/collections/requested_control_actions';
import { source_reduction_methods } from '../../lib/collections/source_reduction_methods';
import { source_reductions } from '../../lib/collections/source_reductions';
import { units } from '../../lib/collections/units';
import { activityGcTimeMs } from './shared';

interface LinkedActionBase {
	readonly id: string;
	/** `YYYY-MM-DD` for a performed action, a full ISO stamp for a requested one. */
	readonly date: string;
	/** `null` when nobody was recorded, which the page says as unassigned. */
	readonly actorProfileId: string | null;
	/** The Profile's name, or `null` when there is none or it is not in the client. */
	readonly actorName: string | null;
}

/**
 * A catalog name on the row, or `null` when the entry it points at is not in
 * the client. The join is `left`, so the action is kept either way and the page
 * says the name is unknown rather than dropping the row.
 */
type JoinedName = string | null;

export type LinkedControlAction =
	| (LinkedActionBase & {
			readonly kind: 'application';
			readonly insecticideName: JoinedName;
			readonly amount: number;
			readonly unitAbbreviation: JoinedName;
	  })
	| (LinkedActionBase & {
			readonly kind: 'sourceReduction';
			readonly methodName: JoinedName;
			readonly amount: number;
			readonly unitAbbreviation: JoinedName;
	  })
	| (LinkedActionBase & {
			readonly kind: 'outreachAction';
			readonly methodName: JoinedName;
			readonly reach: number;
	  })
	| (LinkedActionBase & {
			readonly kind: 'biocontrolAction';
			readonly methodName: JoinedName;
			readonly amount: number;
			readonly unitAbbreviation: JoinedName;
	  })
	| (LinkedActionBase & {
			readonly kind: 'requestedControlAction';
			readonly controlType: ControlType;
			readonly summary: string | null;
			readonly resolvedAt: Date | null;
	  });

export function useLinkedControlActions(inspectionId: string): {
	readonly actions: readonly LinkedControlAction[];
	readonly isReady: boolean;
	readonly isError: boolean;
} {
	const applicationResult = useLiveQuery({
		gcTime: activityGcTimeMs,
		query: (query) =>
			query
				.from({ application: applications() })
				.where(({ application }) => eq(application.inspection_id, inspectionId))
				.join(
					{ insecticide: insecticides() },
					({ application, insecticide }) => eq(application.insecticide_id, insecticide.id),
					'left',
				)
				.join(
					{ unit: units() },
					({ application, unit }) => eq(application.application_unit_id, unit.id),
					'left',
				)
				.join(
					{ actor: profiles() },
					({ application, actor }) => eq(application.applicator_profile_id, actor.id),
					'left',
				)
				.select(({ application, insecticide, unit, actor }) => ({
					id: application.id,
					date: application.application_date,
					actorProfileId: application.applicator_profile_id,
					actorName: coalesce(actor.display_name, null),
					insecticideName: coalesce(insecticide.trade_name, null),
					amount: application.amount_applied,
					unitAbbreviation: coalesce(unit.abbreviation, null),
				})),
	});

	const sourceReductionResult = useLiveQuery({
		gcTime: activityGcTimeMs,
		query: (query) =>
			query
				.from({ sourceReduction: source_reductions() })
				.where(({ sourceReduction }) => eq(sourceReduction.inspection_id, inspectionId))
				.join(
					{ method: source_reduction_methods() },
					({ sourceReduction, method }) =>
						eq(sourceReduction.source_reduction_method_id, method.id),
					'left',
				)
				.join(
					{ unit: units() },
					({ sourceReduction, unit }) => eq(sourceReduction.sources_eliminated_unit_id, unit.id),
					'left',
				)
				.join(
					{ actor: profiles() },
					({ sourceReduction, actor }) => eq(sourceReduction.technician_profile_id, actor.id),
					'left',
				)
				.select(({ sourceReduction, method, unit, actor }) => ({
					id: sourceReduction.id,
					date: sourceReduction.source_reduction_date,
					actorProfileId: sourceReduction.technician_profile_id,
					actorName: coalesce(actor.display_name, null),
					methodName: coalesce(method.name, null),
					amount: sourceReduction.sources_eliminated_amount,
					unitAbbreviation: coalesce(unit.abbreviation, null),
				})),
	});

	const outreachResult = useLiveQuery({
		gcTime: activityGcTimeMs,
		query: (query) =>
			query
				.from({ outreachAction: outreach_actions() })
				.where(({ outreachAction }) => eq(outreachAction.inspection_id, inspectionId))
				.join(
					{ method: outreach_methods() },
					({ outreachAction, method }) => eq(outreachAction.outreach_method_id, method.id),
					'left',
				)
				.join(
					{ actor: profiles() },
					({ outreachAction, actor }) => eq(outreachAction.technician_profile_id, actor.id),
					'left',
				)
				.select(({ outreachAction, method, actor }) => ({
					id: outreachAction.id,
					date: outreachAction.outreach_date,
					actorProfileId: outreachAction.technician_profile_id,
					actorName: coalesce(actor.display_name, null),
					methodName: coalesce(method.name, null),
					reach: outreachAction.reach,
				})),
	});

	const biocontrolResult = useLiveQuery({
		gcTime: activityGcTimeMs,
		query: (query) =>
			query
				.from({ biocontrolAction: biocontrol_actions() })
				.where(({ biocontrolAction }) => eq(biocontrolAction.inspection_id, inspectionId))
				.join(
					{ method: biocontrol_methods() },
					({ biocontrolAction, method }) => eq(biocontrolAction.biocontrol_method_id, method.id),
					'left',
				)
				.join(
					{ unit: units() },
					({ biocontrolAction, unit }) => eq(biocontrolAction.release_unit_id, unit.id),
					'left',
				)
				.join(
					{ actor: profiles() },
					({ biocontrolAction, actor }) => eq(biocontrolAction.technician_profile_id, actor.id),
					'left',
				)
				.select(({ biocontrolAction, method, unit, actor }) => ({
					id: biocontrolAction.id,
					date: biocontrolAction.biocontrol_date,
					actorProfileId: biocontrolAction.technician_profile_id,
					actorName: coalesce(actor.display_name, null),
					methodName: coalesce(method.name, null),
					amount: biocontrolAction.amount_released,
					unitAbbreviation: coalesce(unit.abbreviation, null),
				})),
	});

	const requestedResult = useLiveQuery({
		gcTime: activityGcTimeMs,
		query: (query) =>
			query
				.from({ requestedControlAction: requested_control_actions() })
				.where(({ requestedControlAction }) =>
					eq(requestedControlAction.inspection_id, inspectionId),
				)
				.join(
					{ actor: profiles() },
					({ requestedControlAction, actor }) =>
						eq(requestedControlAction.requested_by_profile_id, actor.id),
					'left',
				)
				.select(({ requestedControlAction, actor }) => ({
					id: requestedControlAction.id,
					date: requestedControlAction.requested_at,
					actorProfileId: requestedControlAction.requested_by_profile_id,
					actorName: coalesce(actor.display_name, null),
					controlType: requestedControlAction.control_type,
					summary: requestedControlAction.summary,
					resolvedAt: requestedControlAction.resolved_at,
				})),
	});

	const results = [
		applicationResult,
		sourceReductionResult,
		outreachResult,
		biocontrolResult,
		requestedResult,
	];

	const applicationRows = applicationResult.data;
	const sourceReductionRows = sourceReductionResult.data;
	const outreachRows = outreachResult.data;
	const biocontrolRows = biocontrolResult.data;
	const requestedRows = requestedResult.data;

	// Five queries cannot return one interleaved list, so the union is assembled
	// after them rather than inside.
	const actions = interleaved({
		applicationRows,
		sourceReductionRows,
		outreachRows,
		biocontrolRows,
		requestedRows,
	});

	return {
		actions,
		isReady: results.every((result) => result.isReady),
		isError: results.some((result) => result.isError),
	};
}

/** The five subsets as one list, newest first. */
function interleaved(subsets: {
	readonly applicationRows: readonly Record<string, unknown>[] | undefined;
	readonly sourceReductionRows: readonly Record<string, unknown>[] | undefined;
	readonly outreachRows: readonly Record<string, unknown>[] | undefined;
	readonly biocontrolRows: readonly Record<string, unknown>[] | undefined;
	readonly requestedRows: readonly { readonly date: Date }[] | undefined;
}): readonly LinkedControlAction[] {
	const list: LinkedControlAction[] = [];
	for (const row of subsets.applicationRows ?? []) {
		list.push({ kind: 'application', ...row } as LinkedControlAction);
	}
	for (const row of subsets.sourceReductionRows ?? []) {
		list.push({ kind: 'sourceReduction', ...row } as LinkedControlAction);
	}
	for (const row of subsets.outreachRows ?? []) {
		list.push({ kind: 'outreachAction', ...row } as LinkedControlAction);
	}
	for (const row of subsets.biocontrolRows ?? []) {
		list.push({ kind: 'biocontrolAction', ...row } as LinkedControlAction);
	}
	for (const row of subsets.requestedRows ?? []) {
		list.push({
			kind: 'requestedControlAction',
			...row,
			date: row.date.toISOString(),
		} as LinkedControlAction);
	}
	// Newest first; date strings (YYYY-MM-DD or ISO) sort lexicographically.
	list.sort((first, second) => second.date.localeCompare(first.date));
	return list;
}
