/**
 * What has happened at one Habitat: its inspections, their samples, and the
 * applications made on it.
 *
 * Two queries rather than one, because they hang off the Habitat in different
 * ways. Inspections nest — a sample belongs to an inspection and a species count
 * belongs to a sample — so they load as correlated includes, and the `eq()`s in
 * those subqueries are what drive Electric's on-demand subsets. Applications
 * name the Habitat directly, so a nested include would be a lie about the shape
 * of the data.
 *
 * ## Why `useLiveQuery` and not the suspense variant
 *
 * All four tables are on-demand, and the suspense hook gets permanently stuck
 * after a navigation unmount over one: it caches `collection.preload()` in a ref
 * and clears it only on a `ready` status it observes, which the recreated
 * collection never re-resolves. The status-gated hook reads live status and
 * recovers. The two `isReady` flags are returned separately-but-combined for the
 * same reason the card wants them: an applications failure belongs in the
 * Applications tab, not across the whole card.
 *
 * ## The sort that has to happen twice
 *
 * `orderBy` is applied before the correlated `toArray`, and the joined result is
 * emitted in key order rather than the requested one. So the query states the
 * order it wants and the hook re-establishes it. This is the `useMemo` exception
 * `shared.ts` allows — not a transform that should have been a `select`, but a
 * shape the query language cannot return.
 */

import type { LarvalDensity } from '@simmer-mosquito/sync';
import { eq, toArray, useLiveQuery } from '@tanstack/react-db';
import { useMemo } from 'react';
import { applications } from '../../lib/collections/applications';
import { inspections } from '../../lib/collections/inspections';
import { sample_species } from '../../lib/collections/sample_species';
import { samples } from '../../lib/collections/samples';

/** How long a habitat's history stays warm after the page leaves it. */
const historyGcTimeMs = 30_000;

/** One species count under a sample. */
export interface HabitatHistorySpecies {
	readonly id: string;
	readonly speciesId: string;
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
	readonly insecticideId: string;
	readonly applicationMethodId: string | null;
	readonly amountApplied: number;
	readonly applicationUnitId: string;
}

export interface HabitatHistory {
	readonly inspections: readonly HabitatHistoryInspection[];
	/** Every sample across every inspection, most recent first. */
	readonly samples: readonly HabitatHistorySampleRow[];
	readonly applications: readonly HabitatHistoryApplication[];
	/** True once both subsets have settled — the tab counts are wrong before then. */
	readonly isReady: boolean;
	/** The inspections half failed, which is the whole card. */
	readonly isError: boolean;
	/** The applications half failed, which is one tab. */
	readonly isApplicationsError: boolean;
}

export function useHabitatHistory(habitatId: string): HabitatHistory {
	const inspectionResult = useLiveQuery(
		{
			gcTime: historyGcTimeMs,
			query: (query) =>
				query
					.from({ inspection: inspections() })
					.where(({ inspection }) => eq(inspection.habitat_id, habitatId))
					.orderBy(({ inspection }) => inspection.inspection_date, 'desc')
					.select(({ inspection }) => ({
						id: inspection.id,
						inspectionDate: inspection.inspection_date,
						inspectedByProfileId: inspection.inspected_by_profile_id,
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
											.select(({ species }) => ({
												id: species.id,
												speciesId: species.species_id,
												larvaeCount: species.larvae_count,
											})),
									),
								})),
						),
					})),
		},
		[habitatId],
	);

	const applicationResult = useLiveQuery(
		{
			gcTime: historyGcTimeMs,
			query: (query) =>
				query
					.from({ application: applications() })
					.where(({ application }) => eq(application.habitat_id, habitatId))
					.orderBy(({ application }) => application.application_date, 'desc')
					.select(({ application }) => ({
						id: application.id,
						applicationDate: application.application_date,
						applicatorProfileId: application.applicator_profile_id,
						insecticideId: application.insecticide_id,
						applicationMethodId: application.application_method_id,
						amountApplied: application.amount_applied,
						applicationUnitId: application.application_unit_id,
					})),
		},
		[habitatId],
	);

	const inspectionRows = inspectionResult.data;
	const historyInspections = useMemo(() => {
		const rows = (inspectionRows ?? []) as unknown as readonly HabitatHistoryInspection[];
		return [...rows].sort((a, b) => (a.inspectionDate < b.inspectionDate ? 1 : -1));
	}, [inspectionRows]);

	const historySamples = useMemo<readonly HabitatHistorySampleRow[]>(
		() =>
			historyInspections.flatMap((inspection) =>
				inspection.samples.map((sample) => ({
					...sample,
					inspectionDate: inspection.inspectionDate,
				})),
			),
		[historyInspections],
	);

	return {
		inspections: historyInspections,
		samples: historySamples,
		applications: (applicationResult.data ?? []) as unknown as readonly HabitatHistoryApplication[],
		// Both, so the Applications tab count is never briefly wrong. An
		// applications-only failure counts as settled — its own tab says so.
		isReady: inspectionResult.isReady && (applicationResult.isReady || applicationResult.isError),
		isError: inspectionResult.isError,
		isApplicationsError: applicationResult.isError,
	};
}
