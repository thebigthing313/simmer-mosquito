import type React from 'react';

/**
 * One group of rows inside a `LookupListFrame`, such as a list's active or its
 * inactive records: a heading with the row count, then the table, or the empty
 * line when the group holds no rows.
 *
 * Takes the heading, the count, the line for an empty group, and the table as
 * children, which it draws only while `count` is above zero.
 */
export function LookupListGroup({
	children,
	count,
	emptyLabel,
	title,
}: {
	readonly children: React.ReactNode;
	readonly count: number;
	readonly emptyLabel: string;
	readonly title: string;
}) {
	return (
		<div className="grid gap-2" data-slot="lookup-list-group">
			<div className="flex items-center justify-between gap-2 border-t border-border/40 pt-2">
				<span className="text-xs font-medium text-muted-foreground">{title}</span>
				<span className="text-xs font-medium text-muted-foreground">{count}</span>
			</div>
			{count === 0 ? (
				<p className="m-0 rounded-md bg-background/60 px-2.5 py-2 text-sm text-muted-foreground">
					{emptyLabel}
				</p>
			) : (
				children
			)}
		</div>
	);
}
