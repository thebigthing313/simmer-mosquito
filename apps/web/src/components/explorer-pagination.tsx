import {
	Pagination,
	PaginationContent,
	PaginationEllipsis,
	PaginationItem,
	PaginationLink,
} from '@simmer-mosquito/ui-web/components/ui/pagination';
import { ChevronLeftIcon, ChevronRightIcon } from '@simmer-mosquito/ui-web/icons/registry';

/**
 * Controlled page-through footer for the map-explorer result rails. Driven by
 * server paging state — `page` is 0-based, `pageCount`/`total` come from the
 * list endpoint. Collapses to a plain count line when there is only one page.
 */
export function ExplorerPagination({
	page,
	pageCount,
	total,
	noun,
	onPageChange,
}: {
	readonly page: number;
	readonly pageCount: number;
	readonly total: number;
	readonly noun: string;
	readonly onPageChange: (page: number) => void;
}) {
	if (pageCount <= 1) {
		return (
			<p className="m-0 text-muted-foreground text-xs">
				{count(total)} {noun}
			</p>
		);
	}

	const atStart = page === 0;
	const atEnd = page >= pageCount - 1;

	return (
		// A container query, not a viewport one. This footer sits in rails from
		// 380px to the width of a page, and the question "do the page numbers fit"
		// is about the rail, not the window. Read against the viewport, the numbers
		// and the word "Next" ran past the map panel's edge, which clips them.
		<div className="@container">
			<div className="flex items-center justify-between gap-2">
				<p className="m-0 truncate text-muted-foreground text-xs">
					Page {page + 1} of {pageCount} · {count(total)} {noun}
				</p>
				<Pagination className="mx-0 w-auto justify-end">
					<PaginationContent>
						<PaginationItem>
							<PaginationLink
								aria-disabled={atStart}
								aria-label="Go to previous page"
								className={atStart ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
								onClick={() => {
									if (!atStart) {
										onPageChange(page - 1);
									}
								}}
							>
								<ChevronLeftIcon aria-hidden="true" />
							</PaginationLink>
						</PaginationItem>
						{explorerPageEntries(page, pageCount).map((entry) =>
							entry.page === null ? (
								// Hidden rather than dropped: the same pager in a page-width
								// rail still shows every number it has room for.
								<PaginationItem className="hidden @xl:block" key={entry.key}>
									<PaginationEllipsis />
								</PaginationItem>
							) : (
								<PaginationItem className="hidden @xl:block" key={entry.key}>
									<PaginationLink
										className="cursor-pointer"
										isActive={entry.page === page}
										onClick={() => onPageChange(entry.page as number)}
									>
										{entry.page + 1}
									</PaginationLink>
								</PaginationItem>
							),
						)}
						<PaginationItem>
							<PaginationLink
								aria-disabled={atEnd}
								aria-label="Go to next page"
								className={atEnd ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
								onClick={() => {
									if (!atEnd) {
										onPageChange(page + 1);
									}
								}}
							>
								<ChevronRightIcon aria-hidden="true" />
							</PaginationLink>
						</PaginationItem>
					</PaginationContent>
				</Pagination>
			</div>
		</div>
	);
}

/** Thousands separated: a rail that says 14245 makes the reader count digits. */
function count(value: number): string {
	return value.toLocaleString('en-US');
}

interface ExplorerPageEntry {
	readonly key: string;
	readonly page: number | null;
}

// First page, last page, and a window around the current page, with `null`
// sentinels marking the gaps that render as ellipses.
function explorerPageEntries(page: number, pageCount: number): readonly ExplorerPageEntry[] {
	const pages = new Set<number>([0, pageCount - 1]);
	for (let offset = -1; offset <= 1; offset += 1) {
		const candidate = page + offset;
		if (candidate >= 0 && candidate <= pageCount - 1) {
			pages.add(candidate);
		}
	}

	const sorted = [...pages].sort((first, second) => first - second);
	const entries: ExplorerPageEntry[] = [];
	let previous = -1;
	for (const value of sorted) {
		if (previous !== -1 && value - previous > 1) {
			entries.push({ key: `gap-${previous}`, page: null });
		}
		entries.push({ key: `page-${value}`, page: value });
		previous = value;
	}
	return entries;
}
