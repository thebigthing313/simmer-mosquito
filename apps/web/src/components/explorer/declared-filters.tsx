/**
 * A record set's filter controls and chips, drawn from its declarations in
 * `filter-declarations.ts`. `filterFields` hands back one control per filter
 * for the surface to lay out, and `DeclaredFilterChips` draws one chip per
 * filter that is set, each one clearing its own, under "Clear all". Both take
 * the binding from `useRecordSetFilters`.
 */

import { SearchInput } from '@simmer-mosquito/ui-web/components/search-input';
import type { ReactElement, ReactNode } from 'react';
import { useCatalogOptions } from '../../hooks/explorer/use-catalog-options';
import { useDateRangeFilters } from '../../hooks/explorer/use-date-range-filters';
import { useInsecticideOptions } from '../../hooks/explorer/use-insecticide-options';
import type { RecordSetFilterBinding } from '../../hooks/explorer/use-record-set-filters';
import { useRegionOptions } from '../../hooks/explorer/use-region-options';
import { useSpeciesOptions } from '../../hooks/explorer/use-species-options';
import { useTagOptions } from '../../hooks/explorer/use-tag-options';
import type { CatalogDescriptor } from '../../hooks/queries/catalog-register';
import { DateRangeFilter } from '../date-range-filter';
import { ActiveFilterBar, type DateRange, DateRangeChip, FilterChip } from './filter-chips';
import {
	type ChoiceDeclaration,
	type ChoiceSetDeclaration,
	type FilterDeclarations,
	type FilterName,
	type FlagDeclaration,
	filterName,
	type IdSetDeclaration,
	isAvailable,
	type LooseDeclaration,
	loosenDeclaration,
	type OptionSource,
	type TextDeclaration,
} from './filter-declarations';
import { type FilterOption, MultiSelectFilter, toggle } from './multi-select-filter';
import { SegmentedFilter } from './segmented-filter';
import { ToggleFilter } from './toggle-filter';

/** One control per declared filter, by name, or null where the filter is not available. */
export type FilterFields<TFilters> = Readonly<Record<FilterName<TFilters>, ReactElement | null>>;

/**
 * Each declared filter's control, keyed by its name so the surface can lay
 * them out in its own frame. A filter that is not available in the
 * Organization is null, which a `FilterGrid` leaves out.
 */
export function filterFields<TFilters>(
	declarations: FilterDeclarations<TFilters>,
	binding: RecordSetFilterBinding<TFilters>,
): FilterFields<TFilters> {
	const fields: Partial<Record<FilterName<TFilters>, ReactElement | null>> = {};
	for (const declaration of declarations.list) {
		const name = filterName(declaration);
		fields[name] = isAvailable(declaration, binding.context) ? (
			<DeclaredField
				binding={loosen(binding)}
				declaration={loosenDeclaration(declaration)}
				key={name}
			/>
		) : null;
	}
	return fields as FilterFields<TFilters>;
}

/**
 * One chip per declared filter that is set, in the order the filters are
 * declared, each one clearing its own, and "Clear all". Nothing at all while
 * no filter is set.
 */
export function DeclaredFilterChips<TFilters>({
	binding,
	declarations,
}: {
	readonly binding: RecordSetFilterBinding<TFilters>;
	readonly declarations: FilterDeclarations<TFilters>;
}) {
	if (binding.activeCount === 0) {
		return null;
	}
	return (
		<ActiveFilterBar onClearAll={binding.clearAll}>
			{declarations.list.map((declaration) =>
				isAvailable(declaration, binding.context) ? (
					<DeclaredChips
						binding={loosen(binding)}
						declaration={loosenDeclaration(declaration)}
						key={filterName(declaration)}
					/>
				) : null,
			)}
		</ActiveFilterBar>
	);
}

/** A binding as the per-kind parts read it, with its keys loosened to strings. */
type LooseBinding = RecordSetFilterBinding<Readonly<Record<string, unknown>>>;

function loosen<TFilters>(binding: RecordSetFilterBinding<TFilters>): LooseBinding {
	return binding as unknown as LooseBinding;
}

function DeclaredField({
	binding: loose,
	declaration,
}: {
	readonly binding: LooseBinding;
	readonly declaration: LooseDeclaration;
}) {
	switch (declaration.kind) {
		case 'dateRange':
			return <DateRangeField binding={loose} />;
		case 'text':
			return <TextField binding={loose} declaration={declaration} />;
		case 'flag':
			return <FlagField binding={loose} declaration={declaration} />;
		case 'choice':
			return <ChoiceField binding={loose} declaration={declaration} />;
		case 'choiceSet':
			return <ChoiceSetField binding={loose} declaration={declaration} />;
		case 'idSet':
			return <IdSetField binding={loose} declaration={declaration} />;
	}
}

function DeclaredChips({
	binding: loose,
	declaration,
}: {
	readonly binding: LooseBinding;
	readonly declaration: LooseDeclaration;
}) {
	switch (declaration.kind) {
		case 'dateRange':
			return (
				<DateRangeChip
					defaults={loose.defaults as unknown as DateRange}
					range={loose.filters as unknown as DateRange}
					setRange={(range) => loose.setFilters({ ...range })}
				/>
			);
		case 'text':
			return <TextChip binding={loose} declaration={declaration} />;
		case 'flag':
			return <FlagChip binding={loose} declaration={declaration} />;
		case 'choice':
			return <ChoiceChip binding={loose} declaration={declaration} />;
		case 'choiceSet':
			return <ChoiceSetChips binding={loose} declaration={declaration} />;
		case 'idSet':
			return <IdSetChips binding={loose} declaration={declaration} />;
	}
}

// --- date range and search ----------------------------------------------------

function DateRangeField({ binding }: { readonly binding: LooseBinding }) {
	const { filters, today, setFilters } = binding;
	const dateRange = useDateRangeFilters({
		from: filters.from as string,
		to: filters.to as string,
		today,
		setFilters: (patch) => setFilters({ ...patch }),
	});
	return <DateRangeFilter {...dateRange} />;
}

function TextField({
	binding,
	declaration,
}: {
	readonly binding: LooseBinding;
	readonly declaration: TextDeclaration<string>;
}) {
	return (
		<SearchInput
			label={declaration.label}
			onChange={(event) => binding.setSearchInput(event.target.value)}
			onClear={binding.clearSearch}
			placeholder={declaration.placeholder}
			value={binding.searchInput}
		/>
	);
}

/** The committed term, not what the box shows while it types ahead. */
function TextChip({
	binding,
	declaration,
}: {
	readonly binding: LooseBinding;
	readonly declaration: TextDeclaration<string>;
}) {
	const term = binding.filters[declaration.key] as string;
	return term.trim().length === 0 ? null : (
		<FilterChip label={`Search: ${term}`} onRemove={binding.clearSearch} />
	);
}

// --- flag ---------------------------------------------------------------------

function FlagField({
	binding,
	declaration,
}: {
	readonly binding: LooseBinding;
	readonly declaration: FlagDeclaration<string>;
}) {
	const { key, label } = declaration;
	return (
		<ToggleFilter
			label={label}
			onChange={(next) => binding.setFilters({ [key]: next })}
			value={binding.filters[key] as boolean}
		/>
	);
}

function FlagChip({
	binding,
	declaration,
}: {
	readonly binding: LooseBinding;
	readonly declaration: FlagDeclaration<string>;
}) {
	const { key, label, chip } = declaration;
	return binding.filters[key] === true ? (
		<FilterChip label={chip ?? label} onRemove={() => binding.setFilters({ [key]: false })} />
	) : null;
}

// --- choice -------------------------------------------------------------------

function ChoiceField({
	binding,
	declaration,
}: {
	readonly binding: LooseBinding;
	readonly declaration: ChoiceDeclaration<string, string>;
}) {
	const { key, label, options, field: Field } = declaration;
	const value = binding.filters[key] as string;
	const onChange = (next: string) => binding.setFilters({ [key]: next });
	return Field === undefined ? (
		<SegmentedFilter label={label} onChange={onChange} options={options} value={value} />
	) : (
		<Field onChange={onChange} value={value} />
	);
}

/** Drawn while the choice is off its default, and removing it writes the default back. */
function ChoiceChip({
	binding,
	declaration,
}: {
	readonly binding: LooseBinding;
	readonly declaration: ChoiceDeclaration<string, string>;
}) {
	const { key, label, options, bareChip = false } = declaration;
	const value = binding.filters[key] as string;
	const fallback = binding.defaults[key] as string;
	if (value === fallback) {
		return null;
	}
	const option = options.find((candidate) => candidate.value === value);
	const name = option?.label ?? value;
	return (
		<FilterChip
			color={option?.color}
			label={bareChip ? name : `${label}: ${name}`}
			onRemove={() => binding.setFilters({ [key]: fallback })}
		/>
	);
}

// --- choice set ---------------------------------------------------------------

function ChoiceSetField({
	binding,
	declaration,
}: {
	readonly binding: LooseBinding;
	readonly declaration: ChoiceSetDeclaration<string, string>;
}) {
	const { key, field: Field } = declaration;
	return (
		<Field
			onChange={(next) => binding.setFilters({ [key]: next })}
			selected={binding.filters[key] as ReadonlySet<string>}
		/>
	);
}

/** One chip per value held, in the declared order, each in the colour it maps to. */
function ChoiceSetChips({
	binding,
	declaration,
}: {
	readonly binding: LooseBinding;
	readonly declaration: ChoiceSetDeclaration<string, string>;
}) {
	const { key, options } = declaration;
	const selected = binding.filters[key] as ReadonlySet<string>;
	return options
		.filter((option) => selected.has(option.value))
		.map((option) => (
			<FilterChip
				color={option.color}
				key={`${key}-${option.value}`}
				label={option.label}
				onRemove={() => binding.setFilters({ [key]: toggle(selected, option.value) })}
			/>
		));
}

// --- id set -------------------------------------------------------------------

function IdSetField({
	binding,
	declaration,
}: {
	readonly binding: LooseBinding;
	readonly declaration: IdSetDeclaration<string>;
}) {
	const { key, label, empty, field: Field } = declaration;
	const selected = binding.filters[key] as ReadonlySet<string>;
	const onChange = (next: ReadonlySet<string>) => binding.setFilters({ [key]: next });
	if (Field !== undefined) {
		return <Field onChange={onChange} selected={selected} />;
	}
	return (
		<WithOptions source={declaration.options}>
			{({ options }) => (
				<MultiSelectFilter
					empty={empty}
					label={label}
					onChange={onChange}
					options={options}
					selected={selected}
				/>
			)}
		</WithOptions>
	);
}

/** One chip per id held, named from the source, or the declaration's unknown name. */
function IdSetChips({
	binding,
	declaration,
}: {
	readonly binding: LooseBinding;
	readonly declaration: IdSetDeclaration<string>;
}) {
	const { key, unknown, italic = false, chip: Chip } = declaration;
	const selected = binding.filters[key] as ReadonlySet<string>;
	if (selected.size === 0) {
		return null;
	}
	const remove = (id: string) => () => binding.setFilters({ [key]: toggle(selected, id) });
	if (Chip !== undefined) {
		return [...selected].map((id) => <Chip id={id} key={`${key}-${id}`} onRemove={remove(id)} />);
	}
	return (
		<WithOptions source={declaration.options}>
			{({ nameById, colorById }) =>
				[...selected].map((id) => (
					<FilterChip
						color={colorById?.get(id)}
						italic={italic}
						key={`${key}-${id}`}
						label={nameById.get(id) ?? unknown}
						onRemove={remove(id)}
					/>
				))
			}
		</WithOptions>
	);
}

/** An option source as the controls and chips read it. */
interface OptionSet {
	readonly options: readonly FilterOption[];
	readonly nameById: ReadonlyMap<string, string>;
	/** The colour each id draws in, for a source that has one. */
	readonly colorById?: ReadonlyMap<string, string | null>;
}

type OptionsChildren = (options: OptionSet) => ReactNode;

/** Reads `source` through the one hook that serves it and hands the options to `children`. */
function WithOptions({
	source,
	children,
}: {
	readonly source: OptionSource;
	readonly children: OptionsChildren;
}) {
	switch (source.kind) {
		case 'catalog':
			return <CatalogOptions catalog={source.catalog}>{children}</CatalogOptions>;
		case 'regions':
			return <RegionOptions>{children}</RegionOptions>;
		case 'tags':
			return <TagOptions>{children}</TagOptions>;
		case 'species':
			return <SpeciesOptions>{children}</SpeciesOptions>;
		case 'insecticides':
			return <InsecticideOptions>{children}</InsecticideOptions>;
	}
}

function CatalogOptions({
	catalog,
	children,
}: {
	readonly catalog: CatalogDescriptor;
	readonly children: OptionsChildren;
}) {
	const options = useCatalogOptions(catalog);
	return children(options);
}

function RegionOptions({ children }: { readonly children: OptionsChildren }) {
	const options = useRegionOptions();
	return children(options);
}

function TagOptions({ children }: { readonly children: OptionsChildren }) {
	const { options, byId } = useTagOptions();
	const nameById = new Map([...byId].map(([id, tag]) => [id, tag.name] as const));
	const colorById = new Map([...byId].map(([id, tag]) => [id, tag.color] as const));
	return children({ options, nameById, colorById });
}

function SpeciesOptions({ children }: { readonly children: OptionsChildren }) {
	const options = useSpeciesOptions();
	return children(options);
}

function InsecticideOptions({ children }: { readonly children: OptionsChildren }) {
	const options = useInsecticideOptions();
	return children(options);
}
