/**
 * One declaration per filter on a record set: what kind of value it holds, what
 * it is called, where its options come from, and how the in-view summary groups
 * by it. `declared-filters.tsx` draws the controls and the chips from these, and
 * {@link declaredSummaryGroupings} builds the summary's toggle groups.
 */

import type { ComponentType } from 'react';
import type { MapSummary } from '../../hooks/explorer/use-explorer-summary';
import { type CatalogDescriptor, catalogs } from '../../hooks/queries/catalog-register';
import type { DateDirection } from '../../lib/date-presets';
import type { SummaryGroup, SummaryGrouping } from './explorer-summary';
import { type FilterOption, toggle } from './multi-select-filter';
import type { RecordSetContext, RecordSetLinks } from './record-set';

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

interface DeclarationBase {
	/**
	 * Whether the filter narrows anything in this Organization. Left out, it
	 * always does. While it answers false the filter draws no control and no
	 * chip, and the set's counting has to leave it uncounted to match. Only a
	 * record set's binding carries the context this reads.
	 */
	readonly available?: (context: RecordSetContext) => boolean;
}

/** A selection of ids from a catalog, written by `idSetParam`. */
export interface IdSetDeclaration<TKey extends string> extends DeclarationBase {
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
export interface FlagDeclaration<TKey extends string> extends DeclarationBase {
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
export interface ChoiceDeclaration<TKey extends string, TValue extends string>
	extends DeclarationBase {
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
export type ChoiceSetDeclaration<TKey extends string, TValue extends string> = DeclarationBase & {
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
export interface DateRangeDeclaration extends DeclarationBase {
	readonly kind: 'dateRange';
	/** The presets the control offers. Left out, `history`. */
	readonly direction?: DateDirection;
}

/** The search box's committed term, written by `textParam`. */
export interface TextDeclaration<TKey extends string> extends DeclarationBase {
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
 * Whether a declaration draws anything in `context`. A declaration that asks
 * for the context on a binding with none is a mistake in the page, so it throws
 * rather than drawing or hiding the filter by guess.
 */
export function isAvailable<TFilters>(
	declaration: FilterDeclaration<TFilters>,
	context: RecordSetContext | undefined,
): boolean {
	if (declaration.available === undefined) {
		return true;
	}
	if (context === undefined) {
		throw new Error('A filter that reads the Organization needs a record set binding.');
	}
	return declaration.available(context);
}

/** What {@link declaredSummaryGroupings} reads: the summary, the URL's filters and their write. */
export interface SummaryInput<TFilters> {
	readonly summary: MapSummary;
	readonly filters: TFilters;
	readonly setFilters: (patch: Partial<TFilters>) => void;
	/** The id to name lookup for each id set the summary draws, from the catalogs the chips read. */
	readonly names?: Partial<Readonly<Record<Key<TFilters>, ReadonlyMap<string, string>>>>;
}

/**
 * The summary's toggle groupings for the filters named in `order`, in that
 * order, each value wired to the filter it names.
 *
 * A value the filter already holds is selected, and clicking it widens back
 * out: an id or a choice leaves its set, a flag goes off, a choice goes to
 * `all`. A value no record in view carries is not drawn, because clicking it
 * would empty the panel. The names come from the declaration, and an id set's
 * from `names`, since the server answers ids.
 */
export function declaredSummaryGroupings<TFilters>(
	declarations: FilterDeclarations<TFilters>,
	order: readonly Key<TFilters>[],
	input: SummaryInput<TFilters>,
): SummaryGrouping[] {
	return order.map((name) => {
		const declaration = declarations.list.find(
			(candidate) => candidate.kind !== 'dateRange' && candidate.key === name,
		);
		if (declaration === undefined || declaration.kind === 'dateRange') {
			throw new Error(`No filter is declared under ${name}.`);
		}
		const grouping = summaryGrouping(loosenDeclaration(declaration), input);
		if (grouping === null) {
			throw new Error(`The ${name} filter declares no summary grouping.`);
		}
		return { ...grouping, groups: grouping.groups.filter((group) => group.count > 0) };
	});
}

function summaryGrouping<TFilters>(
	declaration: LooseDeclaration,
	input: SummaryInput<TFilters>,
): SummaryGrouping | null {
	switch (declaration.kind) {
		case 'idSet':
			return idSetGrouping(declaration, input);
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
): SummaryGrouping | null {
	const { summary: spec, key, unknown } = declaration;
	if (spec === undefined) {
		return null;
	}
	const selected = read<ReadonlySet<string>>(input.filters, key);
	const nameById = (
		input.names as Readonly<Record<string, ReadonlyMap<string, string>>> | undefined
	)?.[key];
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
