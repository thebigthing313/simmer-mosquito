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
 * The failure the card draws for all five tabs.
 *
 * `useHabitatHistory` calls the inspections half the whole card, because the
 * samples tab is built from it too and the tab counts on the strip would read
 * zero rather than unknown. The three side subsets each fail into their own tab.
 *
 * So this is drawn around the tabs rather than inside one, and the inspections
 * and samples tabs name it as the failure of rows they never get to report.
 */
export const HISTORY_UNAVAILABLE = {
	description: 'Inspection and sample history could not be loaded.',
	title: 'History Unavailable',
};

/**
 * One tab of the history card: the ladder, the scrolling table and the pager.
 *
 * The five tabs differ in their columns and their rows and in nothing else, and
 * before #865 each wrote the chrome around those out again. What is left per tab
 * is the head cells, the row, and the words for a tab with nothing in it.
 *
 * `isReady` is true by construction: the card above draws the tabs only once
 * `useHabitatHistory` has answered, so a tab is never rendered mid-read. What a
 * tab can still carry is its own failure, which the three side subsets have.
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
