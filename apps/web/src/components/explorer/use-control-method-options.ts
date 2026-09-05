import type { Collection } from '@tanstack/db';
import { useLiveSuspenseQuery } from '@tanstack/react-db';
import { useMemo } from 'react';
import { application_methods } from '../../lib/collections/application_methods';
import { biocontrol_methods } from '../../lib/collections/biocontrol_methods';
import { insecticides } from '../../lib/collections/insecticides';
import { outreach_methods } from '../../lib/collections/outreach_methods';
import { source_reduction_methods } from '../../lib/collections/source_reduction_methods';
import type { FilterOption } from './multi-select-filter';

/**
 * The control catalogs, as filter options and as id→name lookups.
 *
 * Four hooks in one file rather than four files, because they are one question
 * asked of four tables: how was this done, and with what. Each of the three
 * control explorers reaches for the pair — the multi-select above the list, and
 * the name on every row — and the rows themselves come from `/map/*`, which sends
 * ids rather than names.
 *
 * Retired methods stay in the lists, for the reason they do in
 * `useHabitatTypeOptions`: an explorer looks backwards, and a season's work
 * done with a method the organization has since dropped is exactly what an
 * operator filtering by it is asking for. The pickers on the forms are the
 * surfaces that should offer only what is current.
 *
 * The catalogs are eager and small, so these suspend rather than drawing a
 * pending state: they are loaded before an explorer can be reached.
 */
interface CatalogOptions {
	readonly options: readonly FilterOption[];
	readonly nameById: ReadonlyMap<string, string>;
}

/** Application methods — how an insecticide was put out. */
export function useApplicationMethodOptions(): CatalogOptions {
	return useNamedCatalog(application_methods());
}

/** Source reduction methods — what was done to remove the source. */
export function useSourceReductionMethodOptions(): CatalogOptions {
	return useNamedCatalog(source_reduction_methods());
}

/** Biocontrol methods — which organism was released. */
export function useBiocontrolMethodOptions(): CatalogOptions {
	return useNamedCatalog(biocontrol_methods());
}

/** Outreach methods — how the public was reached. */
export function useOutreachMethodOptions(): CatalogOptions {
	return useNamedCatalog(outreach_methods());
}

/**
 * Every control method by id, across all four catalogs.
 *
 * For the surfaces that hold a method id without knowing which catalog it came
 * from: `recommended_method_id` on a request and `planned_method_id` on a mission
 * are both polymorphic by control type — the id points at a different table for
 * each — so a queue mixing all four control types cannot pick one catalog to look
 * in. Ids are uuids and so globally unique, which is what lets one map serve all
 * four.
 *
 * Built from the four hooks above rather than from four more queries, so a page
 * that shows both a filter and a name pays for one read of each catalog.
 */
export function useControlMethodNames(): ReadonlyMap<string, string> {
	const application = useApplicationMethodOptions();
	const sourceReduction = useSourceReductionMethodOptions();
	const biocontrol = useBiocontrolMethodOptions();
	const outreach = useOutreachMethodOptions();

	return useMemo(
		() =>
			new Map([
				...application.nameById,
				...sourceReduction.nameById,
				...biocontrol.nameById,
				...outreach.nameById,
			]),
		[application, sourceReduction, biocontrol, outreach],
	);
}

/**
 * Insecticides, by trade name.
 *
 * Its own hook rather than a fourth call to {@link useNamedCatalog}, because
 * the column is `trade_name` rather than `name` — `shorthand` is an
 * organization's internal abbreviation for data entry, not a name an operator
 * should have to read.
 */
export function useInsecticideOptions(): CatalogOptions {
	const result = useLiveSuspenseQuery(
		(query) =>
			query
				.from({ product: insecticides() })
				.orderBy(({ product }) => product.trade_name, 'asc')
				.select(({ product }) => ({ id: product.id, label: product.trade_name })),
		[],
	);

	return useIndexed(result.data);
}

function useNamedCatalog<TRow extends { readonly id: string; readonly name: string }>(
	collection: Collection<TRow, string | number>,
): CatalogOptions {
	const result = useLiveSuspenseQuery(
		(query) =>
			query
				.from({ row: collection })
				.orderBy(({ row }) => row.name, 'asc')
				.select(({ row }) => ({ id: row.id, label: row.name })),
		[collection],
	);

	return useIndexed(result.data);
}

/** The index a query cannot return, over the rows it did. */
function useIndexed(options: readonly FilterOption[]): CatalogOptions {
	return useMemo(
		() => ({ options, nameById: new Map(options.map((row) => [row.id, row.label] as const)) }),
		[options],
	);
}
