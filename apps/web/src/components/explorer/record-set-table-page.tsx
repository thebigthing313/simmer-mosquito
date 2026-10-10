/**
 * A record set's Table: the header with the switch to the Map, the filter
 * controls, the load-failure strip, the empty state, and a page of rows with
 * the pager, over the set's list endpoint under a box around the whole world.
 * Takes the set, the Table's filter binding and validated search, the filter
 * controls and the rows as the kind draws them.
 */

import { PageHeader } from '@simmer-mosquito/ui-web/components/page';
import type { RegistryIcon } from '@simmer-mosquito/ui-web/icons/registry';
import type { ReactNode } from 'react';
import {
	type MapQueryValue,
	mapQueryParams,
	usePagedMapResource,
	WHOLE_WORLD_BBOX,
} from '../../hooks/explorer/use-paged-map-resource';
import type { RecordSetFilterBinding } from '../../hooks/explorer/use-record-set-filters';
import { recordNoun } from '../../lib/record-nouns';
import { OutletSimpleLayout } from '../app-shell';
import { ExplorerPagination } from '../explorer-pagination';
import { RecordTableEmpty, type RecordTableScope } from '../record/record-table-empty';
import { RecordTableUnavailable } from '../record/record-table-unavailable';
import { type RecordSet, recordSetListParams } from './record-set';
import { RecordSetSwitch } from './record-set-switch';

/** What the empty state says, with nothing set and with filters set. */
export interface RecordSetTableEmptyCopy {
	readonly emptyDescription: string;
	readonly filteredDescription: string;
	readonly scope: RecordTableScope;
}

export function RecordSetTablePage<TFilters, TTile, TRow>({
	binding,
	description,
	empty,
	filters,
	icon,
	normalizeRow,
	params,
	search,
	set,
	table,
	title,
}: {
	readonly set: RecordSet<TFilters, TTile>;
	/** The Table's binding, from `useRecordSetFilters(set, 'table')`. */
	readonly binding: RecordSetFilterBinding<TFilters>;
	/** The route's validated search, which the switch carries from. */
	readonly search: Record<string, unknown>;
	readonly icon: RegistryIcon;
	/** The heading, where the surface is named for more than its records. Left out, the register's plural. */
	readonly title?: string;
	readonly description?: string;
	/** The filter controls, drawn in the panel above the rows. */
	readonly filters: ReactNode;
	/** A page of rows, drawn by the kind's table. */
	readonly table: (rows: readonly TRow[]) => ReactNode;
	readonly empty: RecordSetTableEmptyCopy;
	/** Params the page request sends beside the filters, such as an order. */
	readonly params?: Readonly<Record<string, MapQueryValue>>;
	/** Defaults a row's newer fields, where a deployed server may not send them. */
	readonly normalizeRow?: (row: TRow) => TRow;
}) {
	const noun = recordNoun(set.recordType);
	const { rows, total, isLoading, isError, retry, page, pageCount, setPage } =
		usePagedMapResource<TRow>({
			path: set.endpoint.path,
			rowsKey: set.endpoint.rowsKey,
			recordType: set.recordType,
			params: mapQueryParams({
				bbox: WHOLE_WORLD_BBOX,
				...recordSetListParams(set, binding.filters, binding.context),
				...params,
			}),
			...(normalizeRow === undefined ? {} : { normalizeRow }),
		});

	// `record` is the measure the route-loading skeleton reserves, so the table
	// arrives at the width it stood in for (#1043, #1047).
	return (
		<OutletSimpleLayout className="grid content-start gap-5" measure="record">
			<PageHeader
				actions={<RecordSetSwitch current="table" search={search} set={set} />}
				description={description}
				icon={icon}
				title={title ?? noun.titleMany}
			/>
			<div className="grid gap-4 rounded-md border border-border/50 bg-muted/20 p-4">{filters}</div>
			{isError ? <RecordTableUnavailable onRetry={retry} recordType={set.recordType} /> : null}
			{rows.length === 0 ? (
				<RecordTableEmpty
					{...empty}
					icon={icon}
					isError={isError}
					isFiltered={binding.activeCount > 0}
					isLoading={isLoading}
					onClearFilters={binding.clearAll}
					recordType={set.recordType}
				/>
			) : (
				<div className="grid gap-3">
					{table(rows)}
					<ExplorerPagination
						noun={noun}
						onPageChange={setPage}
						page={page}
						pageCount={pageCount}
						total={total}
					/>
				</div>
			)}
		</OutletSimpleLayout>
	);
}
