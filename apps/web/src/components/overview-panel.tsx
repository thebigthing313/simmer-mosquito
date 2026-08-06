import { Card } from '@simmer-mosquito/ui-web/components/ui/card';
import { Skeleton } from '@simmer-mosquito/ui-web/components/ui/skeleton';
import type { ReactNode } from 'react';

/**
 * The card an overview page is built from.
 *
 * Every domain overview — larval, adult, control, public engagement — is a grid
 * of these, and each page had grown its own copy. The copies drifted: a header
 * whose `leading-none` clipped the descenders on g/p/y was found and fixed in
 * one of them, and stayed broken in the rest. One definition now, so the next
 * fix lands everywhere.
 */
export function Panel({
	icon,
	title,
	count,
	actions,
	footer,
	children,
}: {
	readonly icon: ReactNode;
	/** Title case — these read as headings, not sentences. */
	readonly title: string;
	readonly count?: number | undefined;
	readonly actions?: ReactNode;
	readonly footer?: ReactNode;
	readonly children: ReactNode;
}) {
	return (
		<Card className="overflow-hidden" variant="panel">
			<div className="flex items-center justify-between gap-3 border-border/60 border-b px-4 py-3">
				<div className="flex min-w-0 items-center gap-2">
					<span className="text-muted-foreground">{icon}</span>
					{/*
					 * `leading-tight`, not `leading-none`: a line box the exact height of
					 * the em cuts everything below the baseline, and these titles carry
					 * descenders ("Flagged", "Species Composition"). Two pixels of header
					 * height buys whole letters.
					 */}
					<h2 className="m-0 truncate font-semibold text-foreground text-sm leading-tight">
						{title}
					</h2>
					{typeof count === 'number' ? (
						<span className="rounded-full bg-muted px-1.5 py-0.5 text-muted-foreground text-xs tabular-nums">
							{count}
						</span>
					) : null}
				</div>
				{actions ? <div className="shrink-0">{actions}</div> : null}
			</div>
			<div className="min-w-0">{children}</div>
			{footer ? (
				<div className="border-border/60 border-t px-4 py-2.5 text-sm">{footer}</div>
			) : null}
		</Card>
	);
}

/** A panel with nothing to show — empty, or unreachable right now. */
export function PanelMessage({ children }: { readonly children: ReactNode }) {
	return <p className="m-0 px-4 py-8 text-center text-muted-foreground text-sm">{children}</p>;
}

const SKELETON_KEYS = ['sk-1', 'sk-2', 'sk-3', 'sk-4', 'sk-5', 'sk-6'] as const;

/** Placeholder rows held in a panel's body while its query settles. */
export function RowSkeleton({ count = 4 }: { readonly count?: number }) {
	return (
		<div aria-hidden="true" className="grid gap-2 p-4">
			{SKELETON_KEYS.slice(0, count).map((key) => (
				<Skeleton className="h-11 w-full rounded-md" key={key} />
			))}
		</div>
	);
}
