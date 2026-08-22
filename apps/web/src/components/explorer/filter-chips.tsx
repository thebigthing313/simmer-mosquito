import { XIcon } from '@simmer-mosquito/ui-web/icons/registry';
import type { ReactNode } from 'react';

/**
 * The active-filter row every explorer shows above its results.
 *
 * Each chip names one narrowing and removes exactly that one; "Clear all" resets
 * the lot. Explorers had grown seven near-identical copies of this pair, which is
 * how three of them ended up without the remove buttons at all.
 */
export function ActiveFilterBar({
	children,
	onClearAll,
}: {
	readonly children: ReactNode;
	readonly onClearAll: () => void;
}) {
	return (
		<div className="flex flex-wrap items-center gap-1.5">
			{children}
			<button
				className="ml-auto rounded-sm px-1.5 py-0.5 text-muted-foreground text-xs transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
				onClick={onClearAll}
				type="button"
			>
				Clear all
			</button>
		</div>
	);
}

/** One active filter, with the swatch it maps to on the map when it has one. */
export function FilterChip({
	label,
	color,
	italic = false,
	onRemove,
}: {
	readonly label: string;
	/** Map colour this value draws in, so the chip doubles as a legend entry. */
	readonly color?: string | null | undefined;
	/** For binomial species names, which are italic wherever they appear. */
	readonly italic?: boolean;
	readonly onRemove: () => void;
}) {
	return (
		<span className="inline-flex items-center gap-1 rounded-full border border-border bg-muted px-2 py-0.5 text-foreground text-xs">
			{color === undefined || color === null ? null : (
				<span
					aria-hidden="true"
					className="size-2 shrink-0 rounded-full ring-1 ring-foreground/15"
					style={{ backgroundColor: color }}
				/>
			)}
			<span className={italic ? 'italic' : undefined}>{label}</span>
			<button
				aria-label={`Remove ${label} filter`}
				className="rounded-full p-0.5 opacity-70 transition-opacity hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
				onClick={onRemove}
				type="button"
			>
				<XIcon aria-hidden="true" className="size-3" />
			</button>
		</span>
	);
}
