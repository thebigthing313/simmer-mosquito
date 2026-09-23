import { PanelRows, type PanelRowsMessage } from '@simmer-mosquito/ui-web/components/panel-rows';
import { ScrollArea } from '@simmer-mosquito/ui-web/components/ui/scroll-area';
import {
	Table,
	TableBody,
	TableHeader,
	TableRow,
} from '@simmer-mosquito/ui-web/components/ui/table';
import type { ReactNode } from 'react';
import { usePagedRows } from '../../../hooks/use-paged-rows';
import type { CountNoun } from '../../../lib/format-count';
import { ExplorerPagination } from '../../explorer-pagination';

const historyPageSize = 25;

/**
 * The failure the card draws for all five tabs. `useHabitatHistory` calls the
 * inspections half the whole card, so it is drawn around the tabs; the three
 * side subsets each fail into their own tab.
 */
export const HISTORY_UNAVAILABLE = {
	description: 'Inspection and sample history could not be loaded.',
	title: 'History Unavailable',
};

/**
 * One tab of the history card: the ladder, the scrolling table and the pager.
 * `isReady` is true by construction, because the card draws the tabs only once
 * `useHabitatHistory` has answered; a tab can still carry its own failure.
 */
export function HistoryTab<Row extends { readonly id: string }>({
	rows,
	habitatId,
	isError = false,
	icon,
	empty,
	unavailable,
	noun,
	head,
	children,
}: {
	readonly rows: readonly Row[];
	readonly habitatId: string;
	readonly isError?: boolean;
	readonly icon: ReactNode;
	readonly empty: PanelRowsMessage;
	readonly unavailable: PanelRowsMessage;
	readonly noun: CountNoun;
	readonly head: ReactNode;
	readonly children: (row: Row) => ReactNode;
}) {
	const { page, pageCount, pageRows, setPage } = usePagedRows(rows, {
		pageSize: historyPageSize,
		resetKey: habitatId,
	});

	return (
		<PanelRows
			empty={empty}
			icon={icon}
			reading={{ isError, isReady: true, rows }}
			unavailable={unavailable}
			wrap="none"
		>
			{() => (
				<div className="grid gap-2">
					<ScrollArea className="max-h-[420px]">
						<Table>
							<TableHeader>
								<TableRow>{head}</TableRow>
							</TableHeader>
							<TableBody>{pageRows.map(children)}</TableBody>
						</Table>
					</ScrollArea>
					<ExplorerPagination
						noun={noun}
						onPageChange={setPage}
						page={page}
						pageCount={pageCount}
						total={rows.length}
					/>
				</div>
			)}
		</PanelRows>
	);
}
