/**
 * The in-view summary of a set whose filters are declared: `ExplorerSummary`
 * with the declared filters' toggle groupings, in the order given, and then
 * any figures the surface draws as text. Takes the declarations, the grouping
 * order, the binding's filters and write, the summary request's state, and the
 * chips to draw above.
 *
 * An id set's values are named through the option source its declaration
 * names, read by the same `WithOptions` the chips read, so the summary and the
 * chips name one id the same way.
 */

import type { ComponentProps, ReactNode } from 'react';
import type { MapSummary } from '../../hooks/explorer/use-explorer-summary';
import type { FilterBinding } from '../../lib/search-filters';
import { WithOptions } from './declared-filters';
import { ExplorerSummary, type SummaryGrouping } from './explorer-summary';
import {
	declaredSummaryGroupings,
	type FilterDeclarations,
	type OptionSource,
	type SourceNames,
	summarySources,
} from './filter-declarations';

type ExplorerSummaryProps = ComponentProps<typeof ExplorerSummary>;

export function DeclaredSummary<TFilters>({
	declarations,
	order,
	binding,
	figures,
	chips,
	recordType,
	state,
}: {
	readonly declarations: FilterDeclarations<TFilters>;
	/** The declared filters the summary groups by, in the order it draws them. */
	readonly order: readonly (keyof TFilters & string)[];
	readonly binding: Pick<FilterBinding<NoInfer<TFilters>>, 'filters' | 'setFilters'>;
	/** The groupings drawn as text after the declared ones, which no filter selects. */
	readonly figures?: (summary: MapSummary) => readonly SummaryGrouping[];
	readonly chips?: ReactNode;
	readonly recordType: ExplorerSummaryProps['recordType'];
	readonly state: ExplorerSummaryProps['state'];
}) {
	return (
		<WithSourceNames names={new Map()} sources={summarySources(declarations, order)}>
			{(names) => (
				<ExplorerSummary
					chips={chips}
					groupings={
						state.data === null
							? []
							: [
									...declaredSummaryGroupings(
										declarations,
										order,
										{
											summary: state.data,
											filters: binding.filters,
											setFilters: binding.setFilters,
										},
										names,
									),
									...(figures?.(state.data) ?? []),
								]
					}
					recordType={recordType}
					state={state}
				/>
			)}
		</WithSourceNames>
	);
}

/** Reads each source in turn and hands every source's names to `children`. */
function WithSourceNames({
	sources,
	names,
	children,
}: {
	readonly sources: readonly OptionSource[];
	readonly names: SourceNames;
	readonly children: (names: SourceNames) => ReactNode;
}) {
	const [source, ...rest] = sources;
	if (source === undefined) {
		return children(names);
	}
	return (
		<WithOptions source={source}>
			{({ nameById }) => (
				<WithSourceNames names={new Map([...names, [source, nameById]])} sources={rest}>
					{children}
				</WithSourceNames>
			)}
		</WithOptions>
	);
}
