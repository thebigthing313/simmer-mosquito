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
 * All five collections are on-demand, so this uses the status-gated
 * `useLiveQuery` rather than the suspense variant.
 */

import type { ControlType } from '@simmer-mosquito/domain';
import { eq, useLiveQuery } from '@tanstack/react-db';
import { useMemo } from 'react';
import { applications } from '../../lib/collections/applications';
import { biocontrol_actions } from '../../lib/collections/biocontrol_actions';
import { outreach_actions } from '../../lib/collections/outreach_actions';
import { requested_control_actions } from '../../lib/collections/requested_control_actions';
import { source_reductions } from '../../lib/collections/source_reductions';

/** How long the linked-action subsets stay warm after the page leaves them. */
const linkedActionsGcTimeMs = 30_000;

interface LinkedActionBase {
	readonly id: string;
	/** `YYYY-MM-DD` for a performed action, a full ISO stamp for a requested one. */
	readonly date: string;
	readonly actorProfileId: string | null;
}

export type LinkedControlAction =
	| (LinkedActionBase & {
			readonly kind: 'application';
			readonly insecticideId: string;
			readonly amount: number;
			readonly unitId: string;
	  })
	| (LinkedActionBase & {
			readonly kind: 'sourceReduction';
			readonly methodId: string;
			readonly amount: number;
			readonly unitId: string;
	  })
	| (LinkedActionBase & {
			readonly kind: 'outreachAction';
			readonly methodId: string;
			readonly reach: number;
	  })
	| (LinkedActionBase & {
			readonly kind: 'biocontrolAction';
			readonly methodId: string;
			readonly amount: number;
			readonly unitId: string;
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
	const applicationResult = useLiveQuery(
		{
			gcTime: linkedActionsGcTimeMs,
			query: (query) =>
				query
					.from({ application: applications })
					.where(({ application }) => eq(application.inspection_id, inspectionId))
					.select(({ application }) => ({
						id: application.id,
						date: application.application_date,
						actorProfileId: application.applicator_profile_id,
						insecticideId: application.insecticide_id,
						amount: application.amount_applied,
						unitId: application.application_unit_id,
					})),
		},
		[inspectionId],
	);

	const sourceReductionResult = useLiveQuery(
		{
			gcTime: linkedActionsGcTimeMs,
			query: (query) =>
				query
					.from({ sourceReduction: source_reductions })
					.where(({ sourceReduction }) => eq(sourceReduction.inspection_id, inspectionId))
					.select(({ sourceReduction }) => ({
						id: sourceReduction.id,
						date: sourceReduction.source_reduction_date,
						actorProfileId: sourceReduction.technician_profile_id,
						methodId: sourceReduction.source_reduction_method_id,
						amount: sourceReduction.sources_eliminated_amount,
						unitId: sourceReduction.sources_eliminated_unit_id,
					})),
		},
		[inspectionId],
	);

	const outreachResult = useLiveQuery(
		{
			gcTime: linkedActionsGcTimeMs,
			query: (query) =>
				query
					.from({ outreachAction: outreach_actions })
					.where(({ outreachAction }) => eq(outreachAction.inspection_id, inspectionId))
					.select(({ outreachAction }) => ({
						id: outreachAction.id,
						date: outreachAction.outreach_date,
						actorProfileId: outreachAction.technician_profile_id,
						methodId: outreachAction.outreach_method_id,
						reach: outreachAction.reach,
					})),
		},
		[inspectionId],
	);

	const biocontrolResult = useLiveQuery(
		{
			gcTime: linkedActionsGcTimeMs,
			query: (query) =>
				query
					.from({ biocontrolAction: biocontrol_actions })
					.where(({ biocontrolAction }) => eq(biocontrolAction.inspection_id, inspectionId))
					.select(({ biocontrolAction }) => ({
						id: biocontrolAction.id,
						date: biocontrolAction.biocontrol_date,
						actorProfileId: biocontrolAction.technician_profile_id,
						methodId: biocontrolAction.biocontrol_method_id,
						amount: biocontrolAction.amount_released,
						unitId: biocontrolAction.release_unit_id,
					})),
		},
		[inspectionId],
	);

	const requestedResult = useLiveQuery(
		{
			gcTime: linkedActionsGcTimeMs,
			query: (query) =>
				query
					.from({ requestedControlAction: requested_control_actions })
					.where(({ requestedControlAction }) =>
						eq(requestedControlAction.inspection_id, inspectionId),
					)
					.select(({ requestedControlAction }) => ({
						id: requestedControlAction.id,
						date: requestedControlAction.requested_at,
						actorProfileId: requestedControlAction.requested_by_profile_id,
						controlType: requestedControlAction.control_type,
						summary: requestedControlAction.summary,
						resolvedAt: requestedControlAction.resolved_at,
					})),
		},
		[inspectionId],
	);

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

	// The `useMemo` exception `shared.ts` allows: five queries cannot return one
	// interleaved list, so the union is assembled after them rather than inside.
	const actions = useMemo<readonly LinkedControlAction[]>(() => {
		const list: LinkedControlAction[] = [];
		for (const row of applicationRows ?? []) {
			list.push({ kind: 'application', ...row } as LinkedControlAction);
		}
		for (const row of sourceReductionRows ?? []) {
			list.push({ kind: 'sourceReduction', ...row } as LinkedControlAction);
		}
		for (const row of outreachRows ?? []) {
			list.push({ kind: 'outreachAction', ...row } as LinkedControlAction);
		}
		for (const row of biocontrolRows ?? []) {
			list.push({ kind: 'biocontrolAction', ...row } as LinkedControlAction);
		}
		for (const row of requestedRows ?? []) {
			list.push({
				kind: 'requestedControlAction',
				...row,
				date: row.date.toISOString(),
			} as LinkedControlAction);
		}
		// Newest first; date strings (YYYY-MM-DD or ISO) sort lexicographically.
		list.sort((first, second) => second.date.localeCompare(first.date));
		return list;
	}, [applicationRows, sourceReductionRows, outreachRows, biocontrolRows, requestedRows]);

	return {
		actions,
		isReady: results.every((result) => result.isReady),
		isError: results.some((result) => result.isError),
	};
}
