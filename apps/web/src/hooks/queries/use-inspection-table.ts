/**
 * A window of Habitat Inspections, in the order the reader asked for and
 * narrowed to what the reader asked about.
 *
 * The inspections table's read. It has no page count: the table opens on the
 * newest work and the reader extends the window by asking for more, which is one
 * number rather than a range to set before anything appears.
 *
 * ## Why the order is not decoration
 *
 * `inspections` is on-demand, and an `orderBy` with a `limit` over an on-demand
 * collection is what makes the window a server-side one. The compiler turns the
 * pair into a cursor, `compileSQL` sends `order_by` and `limit` to the shape
 * proxy, and `sync-shapes.ts` forwards both inside the forced org-scoped shape.
 * So Postgres does the sorting and the browser holds one window of rows. Raising
 * the limit asks for the next window rather than sorting a bigger pile locally.
 *
 * Which columns that leaves sortable is {@link INSPECTION_SORT_KEYS}.
 *
 * ## Why every filter names a column of `inspections`
 *
 * The same mechanism decides the filters. A `where` over the primary collection
 * is handed to the sync layer with the `order_by` and the `limit`, compiled into
 * the shape request, and answered by Postgres, so a narrowed table is a narrower
 * window rather than a full one with rows hidden. That only holds while the
 * predicate names a column of `inspections`: a filter on a joined name would be
 * a predicate on the joined collection, and the window would already have been
 * cut before it ran. It is why {@link InspectionTableFilters} filters by
 * `habitat_type_id` and `inspected_by_profile_id` rather than by the names the
 * table draws under Habitat type and Inspector.
 *
 * The four joins are labels only. Two of them are eager tables the app already
 * holds; `habitats` and `addresses` are on-demand, and the compiler asks each for
 * the join keys this window produced rather than for the table.
 *
 * `useLiveQuery` rather than the suspense variant: the suspense hook hangs after
 * a navigation unmount over an on-demand collection.
 */

import type { LarvalDensity } from '@simmer-mosquito/domain';
import {
	and,
	caseWhen,
	coalesce,
	concat,
	eq,
	gte,
	inArray,
	isNull,
	lte,
	not,
	or,
	useLiveQuery,
} from '@tanstack/react-db';
import { addresses } from '../../lib/collections/addresses';
import { habitat_types } from '../../lib/collections/habitat_types';
import { habitats } from '../../lib/collections/habitats';
import { inspections } from '../../lib/collections/inspections';
import { profiles } from '../../lib/collections/profiles';
import type { InspectionTableRow } from './larval-activity-view';

/**
 * What the table sorts by, and the whole of it.
 *
 * Every key names an indexed column of `inspections` itself, which is a
 * constraint rather than a preference. The cursor that windows an on-demand
 * collection follows the *first* `orderBy` clause to whichever collection it
 * names, so ordering by a joined column windows that collection and leaves the
 * inspections side with no limit at all. It returns the right rows in the right
 * order and pulls the organization's whole history into the browser to do it.
 * Site, Habitat type and Inspector are joined names, so they render and they do
 * not sort.
 *
 * Density is a column of `inspections` and still not here, for a different
 * reason. Postgres orders `larval_density` by the type's own order, `none`
 * through `very_heavy`, which is the order `COLUMN_VOCABULARIES` declares and
 * the legend and the map ramp read. The browser compares the same five values as
 * strings and gets `heavy, light, medium, none, very_heavy`. Both halves have to
 * agree. The browser re-sorts the window it was sent, and the cursor for the
 * next window is built from the browser's order and read back by Postgres, so a
 * density sort would show a window in the wrong order and then page past rows it
 * never asked for. Neither half takes a comparator of its own, so the only fix
 * is a rank on the row, and that was declined. A derived column a client reads
 * has to be trigger-maintained, because logical replication does not publish
 * `GENERATED` columns, and the rank would be a second declaration of the band
 * order living in SQL. `.out-of-scope/sorting-by-a-vocabulary-column.md` is the
 * whole of it. Density is a filter instead, and that pushes down as a `where`
 * on the same column and narrows the same window.
 *
 * The keys are the URL's vocabulary, so they are the reader's words rather than
 * the column names: `?sort=dips`, not `?sort=dip_count`.
 */
export const INSPECTION_SORT_KEYS = ['date', 'water', 'dips', 'larvae'] as const;

export type InspectionSortKey = (typeof INSPECTION_SORT_KEYS)[number];

export const SORT_DIRECTIONS = ['asc', 'desc'] as const;

export type SortDirection = (typeof SORT_DIRECTIONS)[number];

export interface InspectionSort {
	readonly key: InspectionSortKey;
	readonly direction: SortDirection;
}

/** What the table opens on, and what a reset returns it to. */
export const DEFAULT_INSPECTION_SORT: InspectionSort = { key: 'date', direction: 'desc' };

/**
 * Where a click on a column header leaves the sort.
 *
 * A column that is already sorted turns around. Any other column opens
 * descending, which is the end each of these is read from: the newest work, the
 * wet sites, the most dips, the most larvae.
 */
export function nextSort(current: InspectionSort, key: InspectionSortKey): InspectionSort {
	if (current.key !== key) {
		return { key, direction: 'desc' };
	}
	return { key, direction: current.direction === 'asc' ? 'desc' : 'asc' };
}

/**
 * What the reader has narrowed the table to.
 *
 * Every field names a column of `inspections`, for the reason in the module
 * comment. The names are the columns rather than the words the URL uses, so the
 * hook reads the way the predicate does.
 *
 * Region is the filter this does not have. `inspections` carries no region
 * column, and region membership is a spatial predicate the server resolves in
 * `packages/db/src/domains/map-region-filter.ts` under ADR 0015: an area matches
 * when interiors meet, not when geometries touch. A collection `where` compiles
 * to a column predicate and cannot say that, so the map explorer's Region filter
 * has no counterpart on the table. A region-narrowed table needs a server read.
 */
export interface InspectionTableFilters {
	/** Inclusive bound on `inspection_date`. `''` is no bound at that end. */
	readonly dateFrom: string;
	readonly dateTo: string;
	/** `null` takes wet and dry alike. */
	readonly isWet: boolean | null;
	readonly densities: ReadonlySet<LarvalDensity>;
	/** Only visits where at least one of the six life stages was found. */
	readonly larvaeFound: boolean;
	readonly habitatTypeIds: ReadonlySet<string>;
	readonly inspectedByProfileIds: ReadonlySet<string>;
}

/**
 * The identity of the window on screen: the sort it was read under, and the
 * filters it was read through.
 *
 * A window belongs to the query that produced it. The fiftieth row of one order
 * is nobody's row in another, and the fiftieth row of the whole set is usually
 * not in a filtered one at all, so the loaded limit and the rows held across a
 * re-read are both kept against this string. Sets are sorted into it, so two
 * URLs that select the same ids in a different order are one window rather than
 * two.
 *
 * It is also the hook's dependency list. The filters object is rebuilt on every
 * render, so depending on it directly would rebuild the query on every render;
 * depending on this rebuilds it exactly when the window resets.
 */
export function inspectionWindowKey(sort: InspectionSort, filters: InspectionTableFilters): string {
	return [
		sort.key,
		sort.direction,
		filters.dateFrom,
		filters.dateTo,
		filters.isWet === null ? 'any' : String(filters.isWet),
		sortedMembers(filters.densities),
		filters.larvaeFound ? 'found' : 'any',
		sortedMembers(filters.habitatTypeIds),
		sortedMembers(filters.inspectedByProfileIds),
		// A separator no id, date or enum member can contain. It stays written as
		// an escape: a literal NUL byte in the source reads as binary to git, and
		// the file loses blame and line-level merge with it.
	].join('\u0000');
}

function sortedMembers(values: ReadonlySet<string>): string {
	return [...values].sort().join(',');
}

/** One clause of the narrowing. Every comparison helper returns this type. */
type InspectionClause = ReturnType<typeof eq>;

/**
 * The clauses that are set, as one predicate, or `everyRow` when none is.
 *
 * Every filter is optional, so All time with nothing else set leaves no clause
 * at all and the query still owes a predicate. The caller passes the one that
 * means "every row", because building it needs the row reference this does not
 * have.
 */
function allOf(
	clauses: readonly (InspectionClause | null)[],
	everyRow: InspectionClause,
): InspectionClause {
	const [first, second, ...rest] = clauses.filter((clause) => clause !== null);
	if (first === undefined) {
		return everyRow;
	}
	return second === undefined ? first : and(first, second, ...rest);
}

export function useInspectionTable(
	sort: InspectionSort,
	limit: number,
	filters: InspectionTableFilters,
): {
	readonly rows: readonly InspectionTableRow[];
	readonly isReady: boolean;
	readonly isError: boolean;
} {
	const result = useLiveQuery(
		{
			query: (query) =>
				query
					.from({ inspection: inspections() })
					.where(({ inspection }) => {
						const clauses = [
							filters.dateFrom === '' ? null : gte(inspection.inspection_date, filters.dateFrom),
							filters.dateTo === '' ? null : lte(inspection.inspection_date, filters.dateTo),
							filters.isWet === null ? null : eq(inspection.is_wet, filters.isWet),
							filters.densities.size === 0
								? null
								: inArray(inspection.density, [...filters.densities]),
							// Any of the six, which is what "larvae found" means on a
							// record that counts stages rather than a total.
							filters.larvaeFound
								? or(
										eq(inspection.has_eggs, true),
										eq(inspection.has_first_instar, true),
										eq(inspection.has_second_instar, true),
										eq(inspection.has_third_instar, true),
										eq(inspection.has_fourth_instar, true),
										eq(inspection.has_pupae, true),
									)
								: null,
							filters.habitatTypeIds.size === 0
								? null
								: inArray(inspection.habitat_type_id, [...filters.habitatTypeIds]),
							filters.inspectedByProfileIds.size === 0
								? null
								: inArray(inspection.inspected_by_profile_id, [...filters.inspectedByProfileIds]),
						];
						// `id` is the primary key, so `IS NOT NULL` over it is "every
						// row" without inventing a column to say it with.
						return allOf(clauses, not(isNull(inspection.id)));
					})
					// `left` throughout: an Ad Hoc Inspection has no Habitat, an inspection
					// need not name a type or an Address, and nobody may have been recorded
					// as inspector. An `inner` join would drop those rows off the table.
					.join(
						{ habitat: habitats() },
						({ inspection, habitat }) => eq(inspection.habitat_id, habitat.id),
						'left',
					)
					.join(
						{ type: habitat_types() },
						({ inspection, type }) => eq(inspection.habitat_type_id, type.id),
						'left',
					)
					.join(
						{ inspector: profiles() },
						({ inspection, inspector }) => eq(inspection.inspected_by_profile_id, inspector.id),
						'left',
					)
					.join(
						{ address: addresses() },
						({ inspection, address }) => eq(inspection.address_id, address.id),
						'left',
					)
					.orderBy(
						({ inspection }) => {
							const columns = {
								date: inspection.inspection_date,
								water: inspection.is_wet,
								dips: inspection.dip_count,
								larvae: inspection.larvae_count,
							} satisfies Record<InspectionSortKey, unknown>;
							return columns[sort.key];
						},
						// `nulls` is part of what the collection's index is built with, so
						// the two declarations agree or the cursor is silently dropped.
						// `compileOrderByClause` in `@tanstack/electric-db-collection`
						// writes it into the shape's `order_by` as well, so Postgres is
						// told `NULLS LAST` in both directions. That keeps an inspection
						// nobody counted out of the top of "most dips first", and out of
						// the top of the other end too, where it would read as a zero.
						{ direction: sort.direction, nulls: 'last' },
					)
					// `created_at` breaks the tie and gets no column of its own. A day's
					// work is entered in the order it was done, so without it the rows
					// within a date come back in whatever order the engine keyed them and
					// move under the reader as the next window arrives.
					.orderBy(({ inspection }) => inspection.created_at, 'desc')
					.limit(limit)
					.select(({ inspection, habitat, type, inspector, address }) => ({
						id: inspection.id,
						inspectionDate: inspection.inspection_date,
						inspectedByProfileId: inspection.inspected_by_profile_id,
						// Guarded on the inspection's own column rather than read off the
						// joined row: an unmatched `left` join yields `undefined` for every
						// `x.*`, and the guard is what turns that into the `null` this row
						// speaks in.
						inspectedByName: caseWhen(
							isNull(inspection.inspected_by_profile_id),
							null,
							inspector.display_name,
						),
						isWet: inspection.is_wet,
						dipCount: inspection.dip_count,
						density: inspection.density,
						larvaeCount: inspection.larvae_count,

						habitatId: inspection.habitat_id,
						habitatName: caseWhen(
							isNull(inspection.habitat_id),
							null,
							coalesce(habitat.habitat_name, concat(habitat.lat, ', ', habitat.lng)),
						),
						habitatTypeId: inspection.habitat_type_id,
						typeName: caseWhen(isNull(inspection.habitat_type_id), null, type.name),

						latitude: inspection.lat,
						longitude: inspection.lng,

						address: {
							id: address.id,
							displayName: address.display_name,
							addressLine1: address.address_line_1,
							addressLine2: address.address_line_2,
							locality: address.locality,
							region: address.region,
							postalCode: address.postal_code,
						},

						hasEggs: inspection.has_eggs,
						hasFirstInstar: inspection.has_first_instar,
						hasSecondInstar: inspection.has_second_instar,
						hasThirdInstar: inspection.has_third_instar,
						hasFourthInstar: inspection.has_fourth_instar,
						hasPupae: inspection.has_pupae,
					})),
		},
		[inspectionWindowKey(sort, filters), limit],
	);

	return { rows: result.data, isReady: result.isReady, isError: result.isError };
}
