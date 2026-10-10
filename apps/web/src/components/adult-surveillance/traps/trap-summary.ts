import type { MapSummary } from '../../../hooks/explorer/use-explorer-summary';
import type { SummaryGrouping } from '../../explorer/explorer-summary';
import { declaredSummaryGroupings } from '../../explorer/filter-declarations';
import { trapFilterDeclarations } from './trap-filters';
import type { TrapFilters } from './traps-search';

/**
 * The two groupings the Traps summary draws, out of the counts
 * `/map/traps/summary` answers: the declared Method and Status filters'
 * toggle groups. Every trap carries a method, so no null value is answered.
 */
export function trapSummaryGroupings({
	summary,
	filters,
	setFilters,
	methodNameById,
}: {
	readonly summary: MapSummary;
	readonly filters: TrapFilters;
	readonly setFilters: (patch: Partial<TrapFilters>) => void;
	readonly methodNameById: ReadonlyMap<string, string>;
}): readonly SummaryGrouping[] {
	return declaredSummaryGroupings(trapFilterDeclarations, ['methods', 'status'], {
		summary,
		filters,
		setFilters,
		names: { methods: methodNameById },
	});
}
