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
 * Each carries its own names, joined: the method that titles or qualifies the
 * row, the unit its amount is measured in, and whoever performed it. The
 * overview used to build six lookup maps over six whole tables to answer the
 * same questions.
 *
 * ## One row per Treatment
 *
 * The chemical kind reads the day's Treatments and each one's lines through
 * the include in `treatment-lines.ts`, so a visit that put out two products is
 * one action with two lines, and a person's count and kind breakdown count the
 * visit once (ADR 0020). A Treatment has no one subject or amount, so those are
 * `null` on it and its products are in `lines`.
 */

import { eq, useLiveQuery } from '@tanstack/react-db';
import { application_methods } from '../../lib/collections/application_methods';
import { biocontrol_actions } from '../../lib/collections/biocontrol_actions';
import { biocontrol_methods } from '../../lib/collections/biocontrol_methods';
import { profiles } from '../../lib/collections/profiles';
import { source_reduction_methods } from '../../lib/collections/source_reduction_methods';
import { source_reductions } from '../../lib/collections/source_reductions';
import { treatments } from '../../lib/collections/treatments';
import { units } from '../../lib/collections/units';
import { PERFORMED_ACTIONS } from './performed-action-reads';
import { joinedOrNull, liveQueryGcTimeMs } from './shared';
import { linesOf, type TreatmentLine, treatmentLines } from './treatment-lines';

const {
	treatments: treatmentReads,
	sourceReductions: reductionReads,
	releases: releaseReads,
} = PERFORMED_ACTIONS;

/**
 * What kind of control action a row is — the icon and detail link follow from
 * it. `application` is a Treatment.
 */
export type ControlActionKind = 'application' | 'sourceReduction' | 'biocontrol';

export interface DailyControlAction {
	readonly kind: ControlActionKind;
	readonly id: string;
	readonly actionDate: string;
	/** Applicator or technician: whoever performed the work. */
	readonly performedByProfileId: string | null;
	readonly performedByName: string | null;
	/**
	 * The control method of a source reduction or a biocontrol release. `null`
	 * while that record is not in the client; the surface draws its own stand-in.
	 * Always `null` on a Treatment, whose products are in `lines`.
	 */
	readonly subjectName: string | null;
	/**
	 * How it was done, where that is a separate fact from the subject. Only a
	 * Treatment has one; for the other two the method *is* the subject, so
	 * repeating it in the secondary line would say the same thing twice, and both
	 * fields are `null` there. On a Treatment, a `null` id is no method recorded
	 * and a `null` name beside a set id is a method not in the client.
	 */
	readonly methodId: string | null;
	readonly methodName: string | null;
	/** `null` on a Treatment, whose amounts are per product, in `lines`. */
	readonly amount: number | null;
	readonly unitAbbreviation: string | null;
	/** A Treatment's products, oldest first. Empty on the other two kinds. */
	readonly lines: readonly TreatmentLine[];
	readonly createdAt: Date;
}

export function useControlActionsForDay(date: string): {
	readonly actions: readonly DailyControlAction[];
	readonly isReady: boolean;
	readonly isError: boolean;
} {
	const treatmentResult = useLiveQuery({
		gcTime: liveQueryGcTimeMs,
		query: (query) =>
			query
				.from({ treatment: treatments() })
				.where(({ treatment }) => eq(treatmentReads.date(treatment), date))
				.join(
					{ method: application_methods() },
					({ treatment, method }) => treatmentReads.joinMethod(treatment, method),
					'left',
				)
				.join(
					{ performer: profiles() },
					({ treatment, performer }) => treatmentReads.joinPerformer(treatment, performer),
					'left',
				)
				.orderBy(({ treatment }) => treatment.created_at, 'asc')
				.select(({ treatment, method, performer }) => {
					const measured = treatmentReads.measured(treatment);
					return {
						id: treatment.id,
						actionDate: treatmentReads.date(treatment),
						performedByProfileId: measured.performerProfileId,
						performedByName: joinedOrNull(performer.display_name),
						methodId: measured.methodId,
						methodName: joinedOrNull(method.name),
						createdAt: treatment.created_at,
						lines: treatmentLines(query, treatment),
					};
				}),
	});

	const sourceReductionResult = useLiveQuery({
		gcTime: liveQueryGcTimeMs,
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
						performedByName: joinedOrNull(performer.display_name),
						subjectName: joinedOrNull(method.name),
						amount: measured.amount,
						unitAbbreviation: joinedOrNull(unit.abbreviation),
						createdAt: action.created_at,
					};
				}),
	});

	const biocontrolResult = useLiveQuery({
		gcTime: liveQueryGcTimeMs,
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
						performedByName: joinedOrNull(performer.display_name),
						subjectName: joinedOrNull(method.name),
						amount: measured.amount,
						unitAbbreviation: joinedOrNull(unit.abbreviation),
						createdAt: action.created_at,
					};
				}),
	});

	const treatmentRows = treatmentResult.data;
	const sourceReductionRows = sourceReductionResult.data;
	const biocontrolRows = biocontrolResult.data;

	const actions: readonly DailyControlAction[] = [
		...treatmentRows.map(
			(row): DailyControlAction => ({
				kind: 'application',
				id: row.id,
				actionDate: row.actionDate,
				performedByProfileId: row.performedByProfileId,
				performedByName: row.performedByName,
				subjectName: null,
				methodId: row.methodId,
				methodName: row.methodName,
				amount: null,
				unitAbbreviation: null,
				lines: linesOf(row.lines),
				createdAt: row.createdAt,
			}),
		),
		...sourceReductionRows.map((row) => ({
			...row,
			kind: 'sourceReduction' as const,
			methodId: null,
			methodName: null,
			lines: NO_LINES,
		})),
		...biocontrolRows.map((row) => ({
			...row,
			kind: 'biocontrol' as const,
			methodId: null,
			methodName: null,
			lines: NO_LINES,
		})),
		// Recording order, which is the order the crew worked in — the three
		// subsets each arrive sorted, and this is what interleaves them.
	].sort((first, second) => first.createdAt.getTime() - second.createdAt.getTime());

	return {
		actions,
		// One panel over three shapes: it is only trustworthy once all three have
		// landed, and any one failing means the day shown would be short some work.
		isReady: treatmentResult.isReady && sourceReductionResult.isReady && biocontrolResult.isReady,
		isError: treatmentResult.isError || sourceReductionResult.isError || biocontrolResult.isError,
	};
}

/** The lines a source reduction or a biocontrol release carries: none. */
const NO_LINES: readonly TreatmentLine[] = [];
