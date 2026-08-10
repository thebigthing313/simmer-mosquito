import { Badge } from '@simmer-mosquito/ui-web/components/ui/badge';
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
} from '@simmer-mosquito/ui-web/components/ui/table';
import type { ReactNode } from 'react';
import { CATALOG_GROUP_HEADING } from './catalog-page';

/**
 * One side of a catalog's lifecycle split: the uppercase heading, the count on
 * the right, and either the rows in a bordered table or the line that says why
 * there are none.
 *
 * `emptyLabel` differs by more than the noun — an unfiltered Active section asks
 * for a first record, while every other case says nothing matched — so the page
 * writes it rather than this deriving it.
 */
export function CatalogSection({
	title,
	count,
	emptyLabel,
	columns,
	children,
}: {
	readonly title: string;
	readonly count: number;
	readonly emptyLabel: string;
	/** The `TableRow` of `TableHead`s this section's rows fill. */
	readonly columns: ReactNode;
	readonly children: ReactNode;
}) {
	return (
		<section className="grid gap-2">
			<div className="flex items-baseline justify-between gap-2">
				<h2 className={CATALOG_GROUP_HEADING}>{title}</h2>
				<span className="text-muted-foreground text-xs tabular-nums">{count}</span>
			</div>
			{count === 0 ? (
				<p className="rounded-md bg-muted/40 px-3 py-2.5 text-muted-foreground text-sm">
					{emptyLabel}
				</p>
			) : (
				<div className="overflow-x-auto rounded-md border border-border/50">
					<Table className="table-fixed">
						<TableHeader>{columns}</TableHeader>
						<TableBody>{children}</TableBody>
					</Table>
				</div>
			)}
		</section>
	);
}

/**
 * A record's name, with the badge that marks it retired.
 *
 * The badge is on the name rather than in a status column because these tables
 * are already split by lifecycle — it is a reminder inside the Inactive section,
 * not the section's only signal.
 */
export function CatalogNameCell({
	name,
	isInactive,
}: {
	readonly name: string;
	readonly isInactive: boolean;
}) {
	return (
		<TableCell className="align-top font-medium">
			<div className="flex items-start gap-2">
				<span className="wrap-anywhere">{name}</span>
				{isInactive ? (
					<Badge className="mt-0.5 shrink-0" tone="neutral" variant="outline">
						Inactive
					</Badge>
				) : null}
			</div>
		</TableCell>
	);
}

/** The unlabelled column the row menu sits in. */
export function CatalogActionsHead() {
	return (
		<TableHead className="w-[60px] text-right">
			<span className="sr-only">Actions</span>
		</TableHead>
	);
}
