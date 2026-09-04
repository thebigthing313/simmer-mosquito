/**
 * Every control action performed on one calendar day, in the order recorded.
 *
 * A crew's day is a mix of spraying, dipping out a source, and dropping fish, so
 * this covers all three kinds rather than applications alone — reading one kind
 * understates what each person actually got through.
 *
 * ## Why three queries and not one
 *
 * The three live in three tables with three different date columns, and a live
 * query has one `from`. So each kind gets a date-equality subset of its own and
 * they are merged here. Browsing to a historical day therefore loads that day's
 * rows rather than a rolling window — three small subsets instead of three large
 * ones.
 *
 * Each carries its own names, joined: the product or method that titles the row,
 * the method that qualifies it, the unit its amount is measured in, and whoever
 * performed it. The overview used to build six lookup maps over six whole tables
 * to answer the same questions.
 */

import { caseWhen, coalesce, eq, isNull, useLiveQuery } from '@tanstack/react-db';
import { useMemo } from 'react';
import { application_methods } from '../../lib/collections/application_methods';
import { applications } from '../../lib/collections/applications';
import { biocontrol_actions } from '../../lib/collections/biocontrol_actions';
import { biocontrol_methods } from '../../lib/collections/biocontrol_methods';
import { insecticides } from '../../lib/collections/insecticides';
import { profiles } from '../../lib/collections/profiles';
import { source_reduction_methods } from '../../lib/collections/source_reduction_methods';
import { source_reductions } from '../../lib/collections/source_reductions';
import { units } from '../../lib/collections/units';
import { activityGcTimeMs } from './shared';

/** What kind of control action a row is — the icon and detail link follow from it. */
export type ControlActionKind = 'application' | 'sourceReduction' | 'biocontrol';

export interface DailyControlAction {
	readonly kind: ControlActionKind;
	readonly id: string;
	readonly actionDate: string;
	/** Applicator or technician: whoever performed the work. */
	readonly performedByProfileId: string | null;
	readonly performedByName: string | null;
	/** The product (applications) or the control method (the other two). */
	readonly subjectName: string;
	/**
	 * How it was done, where that is a separate fact from the subject. Only
	 * applications have one — for the other two the method *is* the subject, so
	 * repeating it in the secondary line would say the same thing twice.
	 */
	readonly methodName: string | null;
	readonly amount: number;
	readonly unitAbbreviation: string | null;
	readonly createdAt: Date;
}

export function useControlActionsForDay(date: string): {
	readonly actions: readonly DailyControlAction[];
	readonly isReady: boolean;
	readonly isError: boolean;
} {
	const applicationResult = useLiveQuery(
		{
			gcTime: activityGcTimeMs,
			query: (query) =>
				query
					.from({ application: applications() })
					.where(({ application }) => eq(application.application_date, date))
					.join(
						{ product: insecticides() },
						({ application, product }) => eq(application.insecticide_id, product.id),
						'left',
					)
					.join(
						{ method: application_methods() },
						({ application, method }) => eq(application.application_method_id, method.id),
						'left',
					)
					.join(
						{ unit: units() },
						({ application, unit }) => eq(application.application_unit_id, unit.id),
						'left',
					)
					.join(
						{ performer: profiles() },
						({ application, performer }) => eq(application.applicator_profile_id, performer.id),
						'left',
					)
					.orderBy(({ application }) => application.created_at, 'asc')
					.select(({ application, product, method, unit, performer }) => ({
						id: application.id,
						actionDate: application.application_date,
						performedByProfileId: application.applicator_profile_id,
						performedByName: caseWhen(
							isNull(application.applicator_profile_id),
							null,
							performer.display_name,
						),
						subjectName: coalesce(product.trade_name, 'Unknown insecticide'),
						methodName: caseWhen(
							isNull(application.application_method_id),
							'No method',
							coalesce(method.name, 'Unknown method'),
						),
						amount: application.amount_applied,
						unitAbbreviation: coalesce(unit.abbreviation, null),
						createdAt: application.created_at,
					})),
		},
		[date],
	);

	const sourceReductionResult = useLiveQuery(
		{
			gcTime: activityGcTimeMs,
			query: (query) =>
				query
					.from({ action: source_reductions() })
					.where(({ action }) => eq(action.source_reduction_date, date))
					.join(
						{ method: source_reduction_methods() },
						({ action, method }) => eq(action.source_reduction_method_id, method.id),
						'left',
					)
					.join(
						{ unit: units() },
						({ action, unit }) => eq(action.sources_eliminated_unit_id, unit.id),
						'left',
					)
					.join(
						{ performer: profiles() },
						({ action, performer }) => eq(action.technician_profile_id, performer.id),
						'left',
					)
					.orderBy(({ action }) => action.created_at, 'asc')
					.select(({ action, method, unit, performer }) => ({
						id: action.id,
						actionDate: action.source_reduction_date,
						performedByProfileId: action.technician_profile_id,
						performedByName: caseWhen(
							isNull(action.technician_profile_id),
							null,
							performer.display_name,
						),
						subjectName: coalesce(method.name, 'Unknown method'),
						amount: action.sources_eliminated_amount,
						unitAbbreviation: coalesce(unit.abbreviation, null),
						createdAt: action.created_at,
					})),
		},
		[date],
	);

	const biocontrolResult = useLiveQuery(
		{
			gcTime: activityGcTimeMs,
			query: (query) =>
				query
					.from({ action: biocontrol_actions() })
					.where(({ action }) => eq(action.biocontrol_date, date))
					.join(
						{ method: biocontrol_methods() },
						({ action, method }) => eq(action.biocontrol_method_id, method.id),
						'left',
					)
					.join(
						{ unit: units() },
						({ action, unit }) => eq(action.release_unit_id, unit.id),
						'left',
					)
					.join(
						{ performer: profiles() },
						({ action, performer }) => eq(action.technician_profile_id, performer.id),
						'left',
					)
					.orderBy(({ action }) => action.created_at, 'asc')
					.select(({ action, method, unit, performer }) => ({
						id: action.id,
						actionDate: action.biocontrol_date,
						performedByProfileId: action.technician_profile_id,
						performedByName: caseWhen(
							isNull(action.technician_profile_id),
							null,
							performer.display_name,
						),
						subjectName: coalesce(method.name, 'Unknown method'),
						amount: action.amount_released,
						unitAbbreviation: coalesce(unit.abbreviation, null),
						createdAt: action.created_at,
					})),
		},
		[date],
	);

	const applicationRows = applicationResult.data;
	const sourceReductionRows = sourceReductionResult.data;
	const biocontrolRows = biocontrolResult.data;

	const actions = useMemo<readonly DailyControlAction[]>(
		() =>
			[
				...applicationRows.map((row) => ({ ...row, kind: 'application' as const })),
				...sourceReductionRows.map((row) => ({
					...row,
					kind: 'sourceReduction' as const,
					methodName: null,
				})),
				...biocontrolRows.map((row) => ({
					...row,
					kind: 'biocontrol' as const,
					methodName: null,
				})),
				// Recording order, which is the order the crew worked in — the three
				// subsets each arrive sorted, and this is what interleaves them.
			].sort((first, second) => first.createdAt.getTime() - second.createdAt.getTime()),
		[applicationRows, sourceReductionRows, biocontrolRows],
	);

	return {
		actions,
		// One panel over three shapes: it is only trustworthy once all three have
		// landed, and any one failing means the day shown would be short some work.
		isReady: applicationResult.isReady && sourceReductionResult.isReady && biocontrolResult.isReady,
		isError: applicationResult.isError || sourceReductionResult.isError || biocontrolResult.isError,
	};
}
