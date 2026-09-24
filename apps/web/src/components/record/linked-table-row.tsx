import { TableCell, TableRow } from '@simmer-mosquito/ui-web/components/ui/table';
import { cn } from '@simmer-mosquito/ui-web/lib/utils';
import { type MouseEvent, type ReactNode, useRef } from 'react';

/** What a click inside the row may land on and still mean that control, not the row. */
const INTERACTIVE = 'a, button, input, select, textarea, label, summary, [role="button"]';

/**
 * A table row that opens its record wherever it is clicked.
 *
 * Takes the row's cells and `action`, the link to the record, drawn in the
 * last cell. The link stays the one focusable element, so the keyboard path
 * is unchanged and nothing interactive is nested inside another; the row's
 * click is a pointer shortcut that clicks the link. A click on a control
 * inside the row, or one that ends a text selection, is left alone.
 */
export function LinkedTableRow({
	action,
	children,
	className,
}: {
	readonly action: ReactNode;
	readonly children: ReactNode;
	readonly className?: string;
}) {
	const actionCell = useRef<HTMLTableCellElement | null>(null);

	const onClick = (event: MouseEvent<HTMLTableRowElement>) => {
		const target = event.target as Element;
		if (target.closest(INTERACTIVE) !== null) {
			return;
		}
		if ((window.getSelection()?.toString() ?? '') !== '') {
			return;
		}
		const link = actionCell.current?.querySelector('a');
		if (link === null || link === undefined) {
			return;
		}
		if (event.metaKey || event.ctrlKey || event.shiftKey) {
			window.open(link.href, '_blank', 'noopener');
			return;
		}
		link.click();
	};

	return (
		<TableRow className={cn('cursor-pointer', className)} onClick={onClick}>
			{children}
			<TableCell className="text-right" ref={actionCell}>
				{action}
			</TableCell>
		</TableRow>
	);
}

/**
 * A free-text cell held to two lines of about 40 characters, with the whole
 * text in the tooltip. `max-w` on a table cell does nothing in an auto-layout
 * table, which is how a Description column ran 90 characters to a line, so
 * the measure goes on a block inside the cell.
 */
export function ClampedTextCell({
	text,
	className,
	empty,
}: {
	readonly text: string;
	readonly className?: string;
	/** Drawn when `text` is blank. */
	readonly empty: ReactNode;
}) {
	return (
		<TableCell className={cn('text-muted-foreground', className)}>
			{text === '' ? (
				empty
			) : (
				<div className="line-clamp-2 min-w-[16ch] max-w-[40ch] whitespace-normal" title={text}>
					{text}
				</div>
			)}
		</TableCell>
	);
}
