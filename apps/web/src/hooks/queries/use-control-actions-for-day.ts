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
import { application_methods } from '../../lib/collections/application_methods';
import { applications } from '../../lib/collections/applications';
import { biocontrol_actions } from '../../lib/collections/biocontrol_actions';
import { biocontrol_methods } from '../../lib/collections/biocontrol_methods';
import { insecticides } from '../../lib/collections/insecticides';
import { profiles } from '../../lib/collections/profiles';
import { source_reduction_methods } from '../../lib/collections/source_reduction_methods';
import { source_reductions } from '../../lib/collections/source_reductions';
import { units } from '../../lib/collections/units';
import { PERFORMED_ACTIONS } from './performed-action-reads';
import { activityGcTimeMs } from './shared';

const {
	applications: applicationReads,
	sourceReductions: reductionReads,
	releases: releaseReads,
} = PERFORMED_ACTIONS;

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
	const applicationResult = useLiveQuery({
		gcTime: activityGcTimeMs,
		query: (query) =>
			query
				.from({ application: applications() })
				.where(({ application }) => eq(applicationReads.date(application), date))
				.join(
					{ product: insecticides() },
					({ application, product }) => applicationReads.joinProduct(application, product),
					'left',
				)
				.join(
					{ method: application_methods() },
					({ application, method }) => applicationReads.joinMethod(application, method),
					'left',
				)
				.join(
					{ unit: units() },
					({ application, unit }) => applicationReads.joinUnit(application, unit),
					'left',
				)
				.join(
					{ performer: profiles() },
					({ application, performer }) => applicationReads.joinPerformer(application, performer),
					'left',
				)
				.orderBy(({ application }) => application.created_at, 'asc')
				.select(({ application, product, method, unit, performer }) => {
					const measured = applicationReads.measured(application);
					return {
						id: application.id,
						actionDate: applicationReads.date(application),
						performedByProfileId: measured.performerProfileId,
						performedByName: caseWhen(
							isNull(measured.performerProfileId),
							null,
							performer.display_name,
						),
						subjectName: coalesce(product.trade_name, 'Unknown insecticide'),
						methodName: caseWhen(
							isNull(measured.methodId),
							'No method',
							coalesce(method.name, 'Unknown method'),
						),
						amount: measured.amount,
						unitAbbreviation: coalesce(unit.abbreviation, null),
						createdAt: application.created_at,
					};
				}),
	});

	const sourceReductionResult = useLiveQuery({
		gcTime: activityGcTimeMs,
		query: (query) =>
			query
				.from({ action: source_reductions() })
				.where(({ action }) => eq(reductionReads.date(action), date))
				.join(
					{ method: source_reduction_methods() },
					({ action, method }) => reductionReads.joinMethod(action, method),
					'left',
				)
				.join(
					{ unit: units() },
					({ action, unit }) => reductionReads.joinUnit(action, unit),
					'left',
				)
				.join(
					{ performer: profiles() },
					({ action, performer }) => reductionReads.joinPerformer(action, performer),
					'left',
				)
				.orderBy(({ action }) => action.created_at, 'asc')
				.select(({ action, method, unit, performer }) => {
					const measured = reductionReads.measured(action);
					return {
						id: action.id,
						actionDate: reductionReads.date(action),
						performedByProfileId: measured.performerProfileId,
						performedByName: caseWhen(
							isNull(measured.performerProfileId),
							null,
							performer.display_name,
						),
						subjectName: coalesce(method.name, 'Unknown method'),
						amount: measured.amount,
						unitAbbreviation: coalesce(unit.abbreviation, null),
						createdAt: action.created_at,
					};
				}),
	});

	const biocontrolResult = useLiveQuery({
		gcTime: activityGcTimeMs,
		query: (query) =>
			query
				.from({ action: biocontrol_actions() })
				.where(({ action }) => eq(releaseReads.date(action), date))
				.join(
					{ method: biocontrol_methods() },
					({ action, method }) => releaseReads.joinMethod(action, method),
					'left',
				)
				.join({ unit: units() }, ({ action, unit }) => releaseReads.joinUnit(action, unit), 'left')
				.join(
					{ performer: profiles() },
					({ action, performer }) => releaseReads.joinPerformer(action, performer),
					'left',
				)
				.orderBy(({ action }) => action.created_at, 'asc')
				.select(({ action, method, unit, performer }) => {
					const measured = releaseReads.measured(action);
					return {
						id: action.id,
						actionDate: releaseReads.date(action),
						performedByProfileId: measured.performerProfileId,
						performedByName: caseWhen(
							isNull(measured.performerProfileId),
							null,
							performer.display_name,
						),
						subjectName: coalesce(method.name, 'Unknown method'),
						amount: measured.amount,
						unitAbbreviation: coalesce(unit.abbreviation, null),
						createdAt: action.created_at,
					};
				}),
	});

	const applicationRows = applicationResult.data;
	const sourceReductionRows = sourceReductionResult.data;
	const biocontrolRows = biocontrolResult.data;

	const actions: readonly DailyControlAction[] = [
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
	].sort((first, second) => first.createdAt.getTime() - second.createdAt.getTime());

	return {
		actions,
		// One panel over three shapes: it is only trustworthy once all three have
		// landed, and any one failing means the day shown would be short some work.
		isReady: applicationResult.isReady && sourceReductionResult.isReady && biocontrolResult.isReady,
		isError: applicationResult.isError || sourceReductionResult.isError || biocontrolResult.isError,
	};
}
