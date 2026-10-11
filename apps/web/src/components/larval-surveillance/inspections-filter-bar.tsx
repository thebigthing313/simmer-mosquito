import type { RecordSetFilterBinding } from '../../hooks/explorer/use-record-set-filters';
import { DeclaredFilterChips, filterFields } from '../explorer/declared-filters';
import { inspectionFilterDeclarations } from './inspection-filters';
import type { InspectionFilters } from './inspections-search';

/**
 * The filters, above the rows they narrow. Each one is a param the list endpoint
 * takes, so Postgres answers the narrowed set and its count. Takes the Table's
 * binding from `useRecordSetFilters`.
 *
 * The bar renders whether or not any rows came back, because a filter that
 * matched nothing is exactly when the reader needs the control that loosens it.
 */
export function InspectionsFilterBar({
	binding,
}: {
	readonly binding: RecordSetFilterBinding<InspectionFilters>;
}) {
	const fields = filterFields(inspectionFilterDeclarations, binding);
	return (
		<>
			<div className="grid gap-4 lg:grid-cols-2">
				{fields.dates}
				<div className="grid content-start gap-3">
					{fields.water}
					{fields.density}
				</div>
			</div>
			<div className="flex flex-wrap items-center gap-2">
				{fields.positive}
				{fields.types}
				{fields.inspectors}
			</div>
			<DeclaredFilterChips binding={binding} declarations={inspectionFilterDeclarations} />
		</>
	);
}
