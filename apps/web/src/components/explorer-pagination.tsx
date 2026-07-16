import {
	Pagination,
	PaginationContent,
	PaginationEllipsis,
	PaginationItem,
	PaginationLink,
	PaginationNext,
	PaginationPrevious,
} from '@simmer-mosquito/ui-web/components/ui/pagination';

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
				{total} {noun}
			</p>
		);
	}

	const atStart = page === 0;
	const atEnd = page >= pageCount - 1;

	return (
		<div className="flex flex-col items-center gap-2 sm:flex-row sm:justify-between">
			<p className="m-0 text-muted-foreground text-xs">
				Page {page + 1} of {pageCount} · {total} {noun}
			</p>
			<Pagination className="mx-0 w-auto justify-end">
				<PaginationContent>
					<PaginationItem>
						<PaginationPrevious
							aria-disabled={atStart}
							className={atStart ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
							onClick={() => {
								if (!atStart) {
									onPageChange(page - 1);
								}
							}}
						/>
					</PaginationItem>
					{explorerPageEntries(page, pageCount).map((entry) =>
						entry.page === null ? (
							<PaginationItem key={entry.key}>
								<PaginationEllipsis />
							</PaginationItem>
						) : (
							<PaginationItem key={entry.key}>
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
						<PaginationNext
							aria-disabled={atEnd}
							className={atEnd ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
							onClick={() => {
								if (!atEnd) {
									onPageChange(page + 1);
								}
							}}
						/>
					</PaginationItem>
				</PaginationContent>
			</Pagination>
		</div>
	);
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
