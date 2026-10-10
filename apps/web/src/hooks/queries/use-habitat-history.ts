/**
 * What has happened at one Habitat: its inspections, their samples, the
 * applications and source reductions carried out on it, and the control work
 * somebody asked for there.
 *
 * Four queries rather than one, because they hang off the Habitat in different
 * ways. Inspections nest — a sample belongs to an inspection and a species count
 * belongs to a sample — so they load as correlated includes, and the `eq()`s in
 * those subqueries are what drive Electric's on-demand subsets. Applications,
 * source reductions and requested control actions name the Habitat directly, so
 * a nested include would be a lie about the shape of the data.
 *
 * Requests are here rather than on a card of their own because the question a
 * crew lead asks at a site is one question: what has been done here, and what is
 * outstanding. Both states are returned — a resolved request is the record that
 * says the ask was dealt with, and the card is called History. The mission
 * picker's `useOpenRequestedControlActions` filters resolved out because it is
 * asking a different question, which work is still unplanned.
 *
 * Source reductions have no second state to weigh. `deleted_at` is the only
 * lifecycle column the table carries, and the shape predicate filters those
 * rows upstream, so a source reduction that reaches this hook is work that was
 * done at the Habitat. Every one of them belongs on the card.
 *
 * ## Names are joined, not looked up
 *
 * Every row carries the names its tab draws: the Profile, the insecticide, the
 * method, the unit and, under a sample, the species. Each is a `left` join that
 * feeds a label and nothing else, so sorting and the where clause stay on the
 * history table's own columns and the subset Electric is asked for is unchanged.
 * A link nobody filled in keeps its `null` id beside a `null` name, and an entry
 * the client does not hold has an id and a `null` name, which is how a tab tells
 * unassigned from unknown (#874).
 *
 * ## Why `useLiveQuery` and not the suspense variant
 *
 * All six tables are on-demand, and the suspense hook gets permanently stuck
 * after a navigation unmount over one: it caches `collection.preload()` in a ref
 * and clears it only on a `ready` status it observes, which the recreated
 * collection never re-resolves. The status-gated hook reads live status and
 * recovers. The error flags are returned separately-but-combined for the same
 * reason the card wants them: an applications failure belongs in the
 * Applications tab, not across the whole card, and the same goes for the other
 * two side subsets.
 *
 * ## The sort that has to happen twice
 *
 * `orderBy` is applied before the correlated `toArray`, and the joined result is
 * emitted in key order rather than the requested one. So the query states the
 * order it wants and the hook re-establishes it. This is the `useMemo` exception
 * `shared.ts` allows — not a transform that should have been a `select`, but a
 * shape the query language cannot return.
 */

import type { ControlType, LarvalDensity } from '@simmer-mosquito/domain';
import { coalesce, eq, toArray, useLiveQuery } from '@tanstack/react-db';
import { application_methods } from '../../lib/collections/application_methods';
import { applications } from '../../lib/collections/applications';
import { insecticides } from '../../lib/collections/insecticides';
import { inspections } from '../../lib/collections/inspections';
import { profiles } from '../../lib/collections/profiles';
import { requested_control_actions } from '../../lib/collections/requested_control_actions';
import { sample_species } from '../../lib/collections/sample_species';
import { samples } from '../../lib/collections/samples';
import { source_reduction_methods } from '../../lib/collections/source_reduction_methods';
import { source_reductions } from '../../lib/collections/source_reductions';
import { species as speciesCatalog } from '../../lib/collections/species';
import { units } from '../../lib/collections/units';
import { activityGcTimeMs } from './shared';

/** One species count under a sample. */
export interface HabitatHistorySpecies {
	readonly id: string;
	readonly speciesId: string;
	/** `null` when the taxon is not in the client. */
	readonly speciesName: string | null;
	readonly larvaeCount: number;
}

/** One sample taken during an inspection. */
export interface HabitatHistorySample {
	readonly id: string;
	readonly inspectionId: string;
	readonly displayName: string | null;
	readonly isZeroLarvae: boolean;
	readonly hasNonMosquito: boolean;
	readonly unidentifiableReason: string | null;
	readonly species: readonly HabitatHistorySpecies[];
}

/** One inspection at this habitat, with what was collected during it. */
export interface HabitatHistoryInspection {
	readonly id: string;
	/** `YYYY-MM-DD` — the operational date, not a timestamp. */
	readonly inspectionDate: string;
	readonly inspectedByProfileId: string | null;
	/** `null` when nobody was recorded or the Profile is not in the client. */
	readonly inspectedByName: string | null;
	readonly isWet: boolean;
	readonly dipCount: number | null;
	readonly density: LarvalDensity | null;
	readonly larvaeCount: number | null;
	readonly hasEggs: boolean;
	readonly hasFirstInstar: boolean;
	readonly hasSecondInstar: boolean;
	readonly hasThirdInstar: boolean;
	readonly hasFourthInstar: boolean;
	readonly hasPupae: boolean;
	readonly samples: readonly HabitatHistorySample[];
}

/** A sample flattened out of its inspection, carrying the date it belongs to. */
export interface HabitatHistorySampleRow extends HabitatHistorySample {
	readonly inspectionDate: string;
}

/** One chemical application made at this habitat. */
export interface HabitatHistoryApplication {
	readonly id: string;
	/** `YYYY-MM-DD` — the operational date, not a timestamp. */
	readonly applicationDate: string;
	readonly applicatorProfileId: string | null;
	readonly applicatorName: string | null;
	readonly insecticideId: string;
	readonly insecticideName: string | null;
	readonly applicationMethodId: string | null;
	readonly applicationMethodName: string | null;
	readonly amountApplied: number;
	readonly applicationUnitId: string;
	readonly unitAbbreviation: string | null;
}

/**
 * One source reduction carried out at this habitat.
 *
 * `sourceReductionDate` is a `date` and arrives as `YYYY-MM-DD`, the same
 * operational date an application carries. Nothing here says open or done,
 * because the table has no column that would: a source reduction is a record
 * that the work happened.
 */
export interface HabitatHistorySourceReduction {
	readonly id: string;
	/** `YYYY-MM-DD` — the operational date, not a timestamp. */
	readonly sourceReductionDate: string;
	readonly technicianProfileId: string | null;
	readonly technicianName: string | null;
	readonly sourceReductionMethodId: string;
	readonly sourceReductionMethodName: string | null;
	readonly sourcesEliminatedAmount: number;
	readonly sourcesEliminatedUnitId: string;
	readonly unitAbbreviation: string | null;
}

/**
 * One request for control raised against this habitat.
 *
 * `requestedAt` is a `timestamptz` and arrives parsed as a `Date`, unlike the
 * `YYYY-MM-DD` operational dates the performed actions carry. `resolvedAt` is
 * the whole of the lifecycle: null is open, a stamp is resolved, and a deleted
 * request never reaches a collection at all because the shape predicate filters
 * it upstream.
 */
export interface HabitatHistoryRequest {
	readonly id: string;
	readonly requestedAt: Date;
	readonly requestedByProfileId: string | null;
	readonly requestedByName: string | null;
	readonly controlType: ControlType;
	readonly summary: string | null;
	readonly resolvedAt: Date | null;
}

export interface HabitatHistory {
	readonly inspections: readonly HabitatHistoryInspection[];
	/** Every sample across every inspection, most recent first. */
	readonly samples: readonly HabitatHistorySampleRow[];
	readonly applications: readonly HabitatHistoryApplication[];
	/** Every source reduction at this habitat, most recent first. */
	readonly sourceReductions: readonly HabitatHistorySourceReduction[];
	/** Open and resolved alike, most recently raised first. */
	readonly requests: readonly HabitatHistoryRequest[];
	/** True once every subset has settled — the tab counts are wrong before then. */
	readonly isReady: boolean;
	/** The inspections half failed, which is the whole card. */
	readonly isError: boolean;
	/** The applications half failed, which is one tab. */
	readonly isApplicationsError: boolean;
	/** The source reductions half failed, which is one tab. */
	readonly isSourceReductionsError: boolean;
	/** The requests half failed, which is one tab. */
	readonly isRequestsError: boolean;
}

export function useHabitatHistory(habitatId: string): HabitatHistory {
	const inspectionResult = useLiveQuery({
		gcTime: activityGcTimeMs,
		query: (query) =>
			query
				.from({ inspection: inspections() })
				.where(({ inspection }) => eq(inspection.habitat_id, habitatId))
				.join(
					{ inspector: profiles() },
					({ inspection, inspector }) => eq(inspection.inspected_by_profile_id, inspector.id),
					'left',
				)
				.orderBy(({ inspection }) => inspection.inspection_date, 'desc')
				.select(({ inspection, inspector }) => ({
					id: inspection.id,
					inspectionDate: inspection.inspection_date,
					inspectedByProfileId: inspection.inspected_by_profile_id,
					inspectedByName: coalesce(inspector.display_name, null),
					isWet: inspection.is_wet,
					dipCount: inspection.dip_count,
					density: inspection.density,
					larvaeCount: inspection.larvae_count,
					hasEggs: inspection.has_eggs,
					hasFirstInstar: inspection.has_first_instar,
					hasSecondInstar: inspection.has_second_instar,
					hasThirdInstar: inspection.has_third_instar,
					hasFourthInstar: inspection.has_fourth_instar,
					hasPupae: inspection.has_pupae,
					samples: toArray(
						query
							.from({ sample: samples() })
							.where(({ sample }) => eq(sample.inspection_id, inspection.id))
							.select(({ sample }) => ({
								id: sample.id,
								inspectionId: sample.inspection_id,
								displayName: sample.display_name,
								isZeroLarvae: sample.is_zero_larvae,
								hasNonMosquito: sample.has_non_mosquito,
								unidentifiableReason: sample.unidentifiable_reason,
								species: toArray(
									query
										.from({ species: sample_species() })
										.where(({ species }) => eq(species.sample_id, sample.id))
										.join(
											{ taxon: speciesCatalog() },
											({ species, taxon }) => eq(species.species_id, taxon.id),
											'left',
										)
										.select(({ species, taxon }) => ({
											id: species.id,
											speciesId: species.species_id,
											speciesName: coalesce(taxon.display_name, null),
											larvaeCount: species.larvae_count,
										})),
								),
							})),
					),
				})),
	});

	const applicationResult = useLiveQuery({
		gcTime: activityGcTimeMs,
		query: (query) =>
			query
				.from({ application: applications() })
				.where(({ application }) => eq(application.habitat_id, habitatId))
				.join(
					{ applicator: profiles() },
					({ application, applicator }) => eq(application.applicator_profile_id, applicator.id),
					'left',
				)
				.join(
					{ insecticide: insecticides() },
					({ application, insecticide }) => eq(application.insecticide_id, insecticide.id),
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
				.orderBy(({ application }) => application.application_date, 'desc')
				.select(({ application, applicator, insecticide, method, unit }) => ({
					id: application.id,
					applicationDate: application.application_date,
					applicatorProfileId: application.applicator_profile_id,
					applicatorName: coalesce(applicator.display_name, null),
					insecticideId: application.insecticide_id,
					insecticideName: coalesce(insecticide.trade_name, null),
					applicationMethodId: application.application_method_id,
					applicationMethodName: coalesce(method.name, null),
					amountApplied: application.amount_applied,
					applicationUnitId: application.application_unit_id,
					unitAbbreviation: coalesce(unit.abbreviation, null),
				})),
	});

	const sourceReductionResult = useLiveQuery({
		gcTime: activityGcTimeMs,
		query: (query) =>
			query
				.from({ reduction: source_reductions() })
				.where(({ reduction }) => eq(reduction.habitat_id, habitatId))
				.join(
					{ technician: profiles() },
					({ reduction, technician }) => eq(reduction.technician_profile_id, technician.id),
					'left',
				)
				.join(
					{ method: source_reduction_methods() },
					({ reduction, method }) => eq(reduction.source_reduction_method_id, method.id),
					'left',
				)
				.join(
					{ unit: units() },
					({ reduction, unit }) => eq(reduction.sources_eliminated_unit_id, unit.id),
					'left',
				)
				.orderBy(({ reduction }) => reduction.source_reduction_date, 'desc')
				.select(({ reduction, technician, method, unit }) => ({
					id: reduction.id,
					sourceReductionDate: reduction.source_reduction_date,
					technicianProfileId: reduction.technician_profile_id,
					technicianName: coalesce(technician.display_name, null),
					sourceReductionMethodId: reduction.source_reduction_method_id,
					sourceReductionMethodName: coalesce(method.name, null),
					sourcesEliminatedAmount: reduction.sources_eliminated_amount,
					sourcesEliminatedUnitId: reduction.sources_eliminated_unit_id,
					unitAbbreviation: coalesce(unit.abbreviation, null),
				})),
	});

	const requestResult = useLiveQuery({
		gcTime: activityGcTimeMs,
		query: (query) =>
			query
				.from({ request: requested_control_actions() })
				.where(({ request }) => eq(request.habitat_id, habitatId))
				.join(
					{ requester: profiles() },
					({ request, requester }) => eq(request.requested_by_profile_id, requester.id),
					'left',
				)
				.orderBy(({ request }) => request.requested_at, 'desc')
				.select(({ request, requester }) => ({
					id: request.id,
					requestedAt: request.requested_at,
					requestedByProfileId: request.requested_by_profile_id,
					requestedByName: coalesce(requester.display_name, null),
					controlType: request.control_type,
					summary: request.summary,
					resolvedAt: request.resolved_at,
				})),
	});

	const historyInspections = newestFirst(inspectionResult.data);

	const historySamples: readonly HabitatHistorySampleRow[] = historyInspections.flatMap(
		(inspection) =>
			inspection.samples.map((sample) => ({
				...sample,
				inspectionDate: inspection.inspectionDate,
			})),
	);

	return {
		inspections: historyInspections,
		samples: historySamples,
		applications: (applicationResult.data ?? []) as unknown as readonly HabitatHistoryApplication[],
		sourceReductions: (sourceReductionResult.data ??
			[]) as unknown as readonly HabitatHistorySourceReduction[],
		requests: (requestResult.data ?? []) as unknown as readonly HabitatHistoryRequest[],
		// All four, so no tab count is ever briefly wrong. A failure in any of the
		// three side subsets counts as settled — its own tab says so.
		isReady:
			inspectionResult.isReady &&
			(applicationResult.isReady || applicationResult.isError) &&
			(sourceReductionResult.isReady || sourceReductionResult.isError) &&
			(requestResult.isReady || requestResult.isError),
		isError: inspectionResult.isError,
		isApplicationsError: applicationResult.isError,
		isSourceReductionsError: sourceReductionResult.isError,
		isRequestsError: requestResult.isError,
	};
}

/** The habitat's inspections, newest first, over a copy of what the query returned. */
function newestFirst(inspectionRows: unknown): readonly HabitatHistoryInspection[] {
	const rows = (inspectionRows ?? []) as unknown as readonly HabitatHistoryInspection[];
	return [...rows].sort((a, b) => (a.inspectionDate < b.inspectionDate ? 1 : -1));
}
