/**
 * One declaration per filter on a record set: what kind of value it holds, what
 * it is called, where its options come from, and how the in-view summary groups
 * by it. `declared-filters.tsx` draws the controls and the chips from these,
 * and `declared-summary.tsx` draws the summary's toggle groups, which
 * {@link declaredSummaryGroupings} builds.
 */

import type { ComponentType } from 'react';
import type { MapSummary } from '../../hooks/explorer/use-explorer-summary';
import { type CatalogDescriptor, catalogs } from '../../hooks/queries/catalog-register';
import type { DateDirection } from '../../lib/date-presets';
import type { SummaryGroup, SummaryGrouping } from './explorer-summary';
import { type FilterOption, toggle } from './multi-select-filter';
import type { RecordSetLinks } from './record-set';

/** Where an id set's options and names come from. */
export type OptionSource =
	| { readonly kind: 'catalog'; readonly catalog: CatalogDescriptor }
	| { readonly kind: 'regions' }
	| { readonly kind: 'tags' }
	| { readonly kind: 'species' }
	| { readonly kind: 'insecticides' }
	/** Options the page builds itself, such as the assignees over the rows it loaded. */
	| { readonly kind: 'supplied'; readonly options: readonly FilterOption[] };

/** An Organization Lookup catalog as an option source. */
export function catalogSource(catalog: CatalogDescriptor): OptionSource {
	return { kind: 'catalog', catalog };
}

export const REGION_SOURCE: OptionSource = { kind: 'regions' };
export const TAG_SOURCE: OptionSource = { kind: 'tags' };
export const SPECIES_SOURCE: OptionSource = { kind: 'species' };
export const INSECTICIDE_SOURCE: OptionSource = { kind: 'insecticides' };

/** Options the page supplies, named by their own labels. */
export function suppliedSource(options: readonly FilterOption[]): OptionSource {
	return { kind: 'supplied', options };
}

/**
 * The Region filter, which every record set declares under `regions` the same
 * way. The summary does not group by it.
 */
export const REGION_FILTER: IdSetDeclaration<'regions'> = {
	kind: 'idSet',
	key: 'regions',
	label: 'Region',
	empty: 'No regions',
	options: REGION_SOURCE,
	unknown: 'Unknown region',
};

/**
 * The Technician filter over `people`, which the summary groups under the
 * server's `technicianProfileId`.
 */
export const TECHNICIAN_FILTER: IdSetDeclaration<'people'> = {
	kind: 'idSet',
	key: 'people',
	label: 'Technician',
	empty: 'No people',
	options: { kind: 'catalog', catalog: catalogs.profiles },
	unknown: 'Unknown person',
	summary: { grouping: 'technicianProfileId', title: 'Technician' },
};

/** One value of a fixed choice, as the control, the chip and the summary name it. */
export interface ChoiceOption<TValue extends string> {
	readonly value: TValue;
	readonly label: string;
	/** The colour the value draws in on the map, which its chip carries. */
	readonly color?: string;
}

/** A selection of ids from a catalog, written by `idSetParam`. */
export interface IdSetDeclaration<TKey extends string> {
	readonly kind: 'idSet';
	readonly key: TKey;
	/** The control's name. */
	readonly label: string;
	/** What the control says when its search matches nothing. */
	readonly empty: string;
	readonly options: OptionSource;
	/** The name for an id the source does not hold, such as `Unknown method`. */
	readonly unknown: string;
	/** The names are binomials, which are italic wherever they appear. */
	readonly italic?: boolean;
	/** A picker of its own in place of `MultiSelectFilter`. */
	readonly field?: ComponentType<{
		readonly selected: ReadonlySet<string>;
		readonly onChange: (next: ReadonlySet<string>) => void;
	}>;
	/** A chip of its own in place of `FilterChip`, one per id. */
	readonly chip?: ComponentType<{ readonly id: string; readonly onRemove: () => void }>;
	readonly summary?: {
		/** The server's grouping key, whose values are ids. */
		readonly grouping: string;
		readonly title: string;
		/**
		 * The name for the records with no id, drawn as text since no filter
		 * selects them. Left out, those records are not drawn.
		 */
		readonly none?: string;
	};
}

/** A flag that narrows when on, written by `flagParam`. */
export interface FlagDeclaration<TKey extends string> {
	readonly kind: 'flag';
	readonly key: TKey;
	/** The control's name, which the chip reads too unless `chip` says otherwise. */
	readonly label: string;
	readonly chip?: string;
	/** The on side alone is drawn, since no filter selects its opposite. */
	readonly summary?: {
		/** The server's grouping key, whose values are `true` and `false`. */
		readonly grouping: string;
		readonly title: string;
		readonly label: string;
	};
}

/** One of a fixed set with an `all`, written by `choiceParam`. */
export interface ChoiceDeclaration<TKey extends string, TValue extends string> {
	readonly kind: 'choice';
	readonly key: TKey;
	readonly label: string;
	/** Every value, `all` included, in the order the control lists them. */
	readonly options: readonly ChoiceOption<TValue>[];
	/** The chip reads the value alone, without the control's name in front. */
	readonly bareChip?: boolean;
	/** A control of its own in place of `SegmentedFilter`. */
	readonly field?: ComponentType<{
		readonly value: TValue;
		readonly onChange: (next: TValue) => void;
	}>;
	readonly summary?: {
		readonly grouping: string;
		readonly title: string;
		/**
		 * The sides the summary draws, in a fixed order rather than by count, and
		 * the server's value for each. Clicking the side already set widens to `all`.
		 */
		readonly sides: readonly {
			readonly value: Exclude<TValue, 'all'>;
			readonly match: string | boolean;
		}[];
	};
}

/**
 * A selection from a fixed set, written by `choiceSetParam`. It draws a
 * `MultiSelectFilter` that writes the values in option order, or a control of
 * its own in `field`.
 */
export type ChoiceSetDeclaration<TKey extends string, TValue extends string> = {
	readonly kind: 'choiceSet';
	readonly key: TKey;
	readonly label: string;
	/** Every value, in the order the control, the chips and the summary list them. */
	readonly options: readonly ChoiceOption<TValue>[];
	readonly summary?: {
		readonly grouping: string;
		readonly title: string;
		/** The name for the records with no value, drawn as text after the rest. */
		readonly none?: string;
	};
} & (
	| {
			readonly field: ComponentType<{
				readonly selected: ReadonlySet<TValue>;
				readonly onChange: (next: ReadonlySet<TValue>) => void;
			}>;
			readonly empty?: never;
	  }
	| {
			readonly field?: never;
			/** What the `MultiSelectFilter` says when its search matches nothing. */
			readonly empty: string;
	  }
);

/** The date window, `from` and `to`, a `dateParam` pair. */
export interface DateRangeDeclaration {
	readonly kind: 'dateRange';
	/** The presets the control offers. Left out, `history`. */
	readonly direction?: DateDirection;
}

/** The search box's committed term, written by `textParam`. */
export interface TextDeclaration<TKey extends string> {
	readonly kind: 'text';
	readonly key: TKey;
	/** The box's accessible name. */
	readonly label: string;
	readonly placeholder: string;
}

type Key<TFilters> = keyof TFilters & string;

type IdSetFor<TFilters> = {
	[K in Key<TFilters>]: TFilters[K] extends ReadonlySet<string> ? IdSetDeclaration<K> : never;
}[Key<TFilters>];

type FlagFor<TFilters> = {
	[K in Key<TFilters>]: TFilters[K] extends boolean ? FlagDeclaration<K> : never;
}[Key<TFilters>];

type ChoiceFor<TFilters> = {
	[K in Key<TFilters>]: TFilters[K] extends string
		? string extends TFilters[K]
			? never
			: 'all' extends TFilters[K]
				? ChoiceDeclaration<K, TFilters[K]>
				: never
		: never;
}[Key<TFilters>];

type ChoiceSetFor<TFilters> = {
	[K in Key<TFilters>]: TFilters[K] extends ReadonlySet<infer TValue extends string>
		? string extends TValue
			? never
			: ChoiceSetDeclaration<K, TValue>
		: never;
}[Key<TFilters>];

type TextFor<TFilters> = {
	[K in Key<TFilters>]: string extends TFilters[K] ? TextDeclaration<K> : never;
}[Key<TFilters>];

type DateRangeFor<TFilters> = TFilters extends { readonly from: string; readonly to: string }
	? DateRangeDeclaration
	: never;

/** One filter of a set whose state is `TFilters`, checked against the key it names. */
export type FilterDeclaration<TFilters> =
	| IdSetFor<TFilters>
	| FlagFor<TFilters>
	| ChoiceFor<TFilters>
	| ChoiceSetFor<TFilters>
	| TextFor<TFilters>
	| DateRangeFor<TFilters>;

/**
 * A declaration with its key and values loosened to strings, which is how the
 * code reading every set's declarations takes one. A set's own declarations
 * were checked against its keys where they were written.
 */
export type LooseDeclaration =
	| IdSetDeclaration<string>
	| FlagDeclaration<string>
	| ChoiceDeclaration<string, string>
	| ChoiceSetDeclaration<string, string>
	| TextDeclaration<string>
	| DateRangeDeclaration;

export function loosenDeclaration<TFilters>(
	declaration: FilterDeclaration<TFilters>,
): LooseDeclaration {
	return declaration as unknown as LooseDeclaration;
}

/** What a declaration is called among its set's: its key, or `dates` for the window. */
export type FilterName<TFilters> = Key<TFilters> | 'dates';

/**
 * What declarations are written against: the codecs that hold the filters on
 * the URL. A record set is one, and so is a page with no record set that hands
 * its codecs over alone.
 */
export type FilterSet<TFilters> = Pick<RecordSetLinks<TFilters>, 'codecs'>;

/**
 * A set's filters, in the order their chips are drawn. Every key the set's
 * codecs declare is named by exactly one declaration, `from` and `to` together
 * by the date range.
 */
export interface FilterDeclarations<TFilters> {
	readonly set: FilterSet<TFilters>;
	readonly list: readonly FilterDeclaration<TFilters>[];
}

/** Declares a set's filters. An identity at runtime; the inference is the point. */
export function defineFilterDeclarations<TFilters>(
	set: FilterSet<TFilters>,
	list: readonly FilterDeclaration<NoInfer<TFilters>>[],
): FilterDeclarations<TFilters> {
	return { set, list: list as readonly FilterDeclaration<TFilters>[] };
}

export function filterName<TFilters>(
	declaration: FilterDeclaration<TFilters>,
): FilterName<TFilters> {
	return declaration.kind === 'dateRange' ? 'dates' : declaration.key;
}

/** The filter keys a declaration reads and writes. */
export function declaredKeys(declaration: LooseDeclaration): readonly string[] {
	return declaration.kind === 'dateRange' ? ['from', 'to'] : [declaration.key];
}

/**
 * Whether a declaration reads a key its record set calls inert, which is a
 * filter that narrows nothing in this Organization and so draws nothing.
 */
export function isInert(declaration: LooseDeclaration, inert: ReadonlySet<string>): boolean {
	return declaredKeys(declaration).some((key) => inert.has(key));
}

/** What {@link declaredSummaryGroupings} reads: the summary, the URL's filters and their write. */
export interface SummaryInput<TFilters> {
	readonly summary: MapSummary;
	readonly filters: TFilters;
	readonly setFilters: (patch: Partial<TFilters>) => void;
}

/**
 * Each option source's id to name lookup, keyed by the source a declaration
 * names. An id set is named through its own declaration's source, so nothing
 * pairs a lookup with a filter key by hand.
 */
export type SourceNames = ReadonlyMap<OptionSource, ReadonlyMap<string, string>>;

/** The declaration named `name`, which has to exist and not be the date window. */
function summaryDeclaration<TFilters>(
	declarations: FilterDeclarations<TFilters>,
	name: Key<TFilters>,
): Exclude<LooseDeclaration, DateRangeDeclaration> {
	const declaration = declarations.list.find(
		(candidate) => candidate.kind !== 'dateRange' && candidate.key === name,
	);
	if (declaration === undefined || declaration.kind === 'dateRange') {
		throw new Error(`No filter is declared under ${name}.`);
	}
	return loosenDeclaration(declaration) as Exclude<LooseDeclaration, DateRangeDeclaration>;
}

/**
 * The option sources whose names the groupings in `order` draw, each once
 * however many id sets read it.
 */
export function summarySources<TFilters>(
	declarations: FilterDeclarations<TFilters>,
	order: readonly Key<TFilters>[],
): readonly OptionSource[] {
	const sources = new Set<OptionSource>();
	for (const name of order) {
		const declaration = summaryDeclaration(declarations, name);
		if (declaration.kind === 'idSet' && declaration.summary !== undefined) {
			sources.add(declaration.options);
		}
	}
	return [...sources];
}

/**
 * The summary's toggle groupings for the filters named in `order`, in that
 * order, each value wired to the filter it names.
 *
 * A value the filter already holds is selected, and clicking it widens back
 * out: an id or a choice leaves its set, a flag goes off, a choice goes to
 * `all`. A value no record in view carries is not drawn, because clicking it
 * would empty the panel. The names come from the declaration, and an id set's
 * from its option source's lookup in `names`, since the server answers ids.
 * `DeclaredSummary` reads those sources the way the chips do and calls this.
 */
export function declaredSummaryGroupings<TFilters>(
	declarations: FilterDeclarations<TFilters>,
	order: readonly Key<TFilters>[],
	input: SummaryInput<TFilters>,
	names: SourceNames,
): SummaryGrouping[] {
	return order.map((name) => {
		const grouping = summaryGrouping(summaryDeclaration(declarations, name), input, names);
		if (grouping === null) {
			throw new Error(`The ${name} filter declares no summary grouping.`);
		}
		return { ...grouping, groups: grouping.groups.filter((group) => group.count > 0) };
	});
}

function summaryGrouping<TFilters>(
	declaration: LooseDeclaration,
	input: SummaryInput<TFilters>,
	names: SourceNames,
): SummaryGrouping | null {
	switch (declaration.kind) {
		case 'idSet':
			return idSetGrouping(declaration, input, names.get(declaration.options));
		case 'flag':
			return flagGrouping(declaration, input);
		case 'choice':
			return choiceGrouping(declaration, input);
		case 'choiceSet':
			return choiceSetGrouping(declaration, input);
		default:
			return null;
	}
}

/** The server's values for one grouping and the count of each. */
function countsOf(summary: MapSummary, grouping: string) {
	return summary.groups[grouping] ?? [];
}

function countOf(summary: MapSummary, grouping: string, value: string | boolean | null): number {
	return countsOf(summary, grouping).find((group) => group.value === value)?.count ?? 0;
}

/** Writes one key, which the declaration has already checked against `TFilters`. */
function write<TFilters>(input: SummaryInput<TFilters>, key: string, value: unknown): void {
	input.setFilters({ [key]: value } as Partial<TFilters>);
}

function read<TValue>(filters: unknown, key: string): TValue {
	return (filters as Readonly<Record<string, TValue>>)[key] as TValue;
}

function idSetGrouping<TFilters>(
	declaration: IdSetDeclaration<string>,
	input: SummaryInput<TFilters>,
	nameById: ReadonlyMap<string, string> | undefined,
): SummaryGrouping | null {
	const { summary: spec, key, unknown } = declaration;
	if (spec === undefined) {
		return null;
	}
	const selected = read<ReadonlySet<string>>(input.filters, key);
	const groups = countsOf(input.summary, spec.grouping).flatMap(
		({ value, count }): SummaryGroup[] => {
			if (typeof value === 'string') {
				return [
					{
						key: value,
						label: nameById?.get(value) ?? unknown,
						count,
						isSelected: selected.has(value),
						onToggle: () => write(input, key, toggle(selected, value)),
					},
				];
			}
			return spec.none === undefined ? [] : [{ key: 'none', label: spec.none, count }];
		},
	);
	return { key, title: spec.title, groups };
}

function flagGrouping<TFilters>(
	declaration: FlagDeclaration<string>,
	input: SummaryInput<TFilters>,
): SummaryGrouping | null {
	const { summary: spec, key } = declaration;
	if (spec === undefined) {
		return null;
	}
	const isOn = read<boolean>(input.filters, key);
	const group: SummaryGroup = {
		key,
		label: spec.label,
		count: countOf(input.summary, spec.grouping, true),
		isSelected: isOn,
		onToggle: () => write(input, key, !isOn),
	};
	return { key, title: spec.title, groups: [group] };
}

function choiceGrouping<TFilters>(
	declaration: ChoiceDeclaration<string, string>,
	input: SummaryInput<TFilters>,
): SummaryGrouping | null {
	const { summary: spec, key, options } = declaration;
	if (spec === undefined) {
		return null;
	}
	const current = read<string>(input.filters, key);
	const groups = spec.sides.map(({ value, match }): SummaryGroup => {
		const isSelected = current === value;
		return {
			key: value,
			label: options.find((option) => option.value === value)?.label ?? value,
			count: countOf(input.summary, spec.grouping, match),
			isSelected,
			onToggle: () => write(input, key, isSelected ? 'all' : value),
		};
	});
	return { key, title: spec.title, groups };
}

function choiceSetGrouping<TFilters>(
	declaration: ChoiceSetDeclaration<string, string>,
	input: SummaryInput<TFilters>,
): SummaryGrouping | null {
	const { summary: spec, key, options } = declaration;
	if (spec === undefined) {
		return null;
	}
	const selected = read<ReadonlySet<string>>(input.filters, key);
	const groups: SummaryGroup[] = options.map(({ value, label }) => ({
		key: value,
		label,
		count: countOf(input.summary, spec.grouping, value),
		isSelected: selected.has(value),
		onToggle: () => write(input, key, toggle(selected, value)),
	}));
	if (spec.none !== undefined) {
		groups.push({
			key: 'none',
			label: spec.none,
			count: countOf(input.summary, spec.grouping, null),
		});
	}
	return { key, title: spec.title, groups };
}
