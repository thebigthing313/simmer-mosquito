import { Button } from '@simmer-mosquito/ui-web/components/ui/button';
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from '@simmer-mosquito/ui-web/components/ui/collapsible';
import { iconRegistry } from '@simmer-mosquito/ui-web/icons/registry';
import { cn } from '@simmer-mosquito/ui-web/lib/utils';
import { type ReactNode, useState } from 'react';

const ChevronIcon = iconRegistry.arrows.chevronRight.icon;

/**
 * The second tier a catalog row expands into — the products in a mix, the
 * batches of a product.
 *
 * `summary` is the one line that says what is down here without expanding
 * further: a count, a "per batch" basis, or that the read is still in flight.
 */
export function CatalogDetailPanel({
	title,
	summary,
	action,
	children,
}: {
	readonly title: string;
	readonly summary: string;
	/** The control that adds a record to this tier. */
	readonly action: ReactNode;
	readonly children: ReactNode;
}) {
	return (
		<div className="grid gap-2 border-border/40 border-t bg-muted/20 px-4 py-3">
			<div className="flex flex-wrap items-center justify-between gap-2">
				<div className="flex flex-wrap items-baseline gap-2">
					<span className="font-semibold text-foreground text-sm">{title}</span>
					<span className="text-muted-foreground text-xs">{summary}</span>
				</div>
				{action}
			</div>
			{children}
		</div>
	);
}

/** The chevron that opens a row's second tier. */
export function CatalogExpandButton({
	expanded,
	label,
	onToggle,
}: {
	readonly expanded: boolean;
	/** Says what expanding reveals: "Show batches for VectoBac 12AS". */
	readonly label: string;
	readonly onToggle: () => void;
}) {
	return (
		<Button
			aria-expanded={expanded}
			aria-label={label}
			onClick={onToggle}
			size="icon"
			type="button"
			variant="ghost"
		>
			<ChevronIcon
				aria-hidden="true"
				className="transition-transform data-[open=true]:rotate-90"
				data-open={expanded}
			/>
		</Button>
	);
}

/**
 * Retired records, tucked behind a collapsed disclosure so the active list stays
 * the focus.
 */
export function CatalogInactiveDisclosure({
	count,
	children,
}: {
	readonly count: number;
	readonly children: ReactNode;
}) {
	const [open, setOpen] = useState(false);

	return (
		<Collapsible onOpenChange={setOpen} open={open}>
			<CollapsibleTrigger asChild>
				<Button className="w-fit" size="sm" type="button" variant="ghost">
					<ChevronIcon
						aria-hidden="true"
						className="transition-transform data-[open=true]:rotate-90"
						data-icon="inline-start"
						data-open={open}
					/>
					{open ? 'Hide' : 'Show'} {count} inactive
				</Button>
			</CollapsibleTrigger>
			<CollapsibleContent className="pt-2">{children}</CollapsibleContent>
		</Collapsible>
	);
}

/**
 * A line standing in for a table that has no rows — why the list is empty, or
 * what would have to be true for it not to be.
 *
 * `compact` is the second tier's size; the page's own sections use the default.
 */
export function CatalogNote({
	compact = false,
	children,
}: {
	readonly compact?: boolean;
	readonly children: ReactNode;
}) {
	return (
		<p
			className={cn(
				'm-0 rounded-md border border-border/50 border-dashed px-3 text-muted-foreground',
				compact ? 'py-2 text-xs' : 'py-3 text-sm',
			)}
		>
			{children}
		</p>
	);
}
