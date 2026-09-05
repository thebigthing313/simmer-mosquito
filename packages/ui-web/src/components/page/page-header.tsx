import type { RegistryIcon } from '@simmer-mosquito/ui-web/icons/registry';
import { cn } from '@simmer-mosquito/ui-web/lib/utils';
import type { ReactNode } from 'react';

/**
 * The heading a work surface opens with: a tinted icon tile, the title, a
 * measured description, and the page's actions on the right.
 *
 * `xl` rather than `2xl` is the product register's answer, because these are
 * work surfaces, not announcements; `max-w-[60ch]` keeps the description a
 * readable measure however wide the outlet gets.
 *
 * This owns the header and nothing around it. The organization workspace and
 * the operator console both mount it inside their own page frame, so the layout
 * that decides padding and section rhythm stays the caller's.
 */
export function PageHeader({
	title,
	description,
	icon: PageIcon,
	actions,
	className,
}: {
	readonly title: string;
	readonly description?: ReactNode | undefined;
	/** The page's subject, tiled beside the title. */
	readonly icon: RegistryIcon;
	/** Primary page action — usually the create control, plus any access badge. */
	readonly actions?: ReactNode | undefined;
	readonly className?: string | undefined;
}) {
	return (
		<header className={cn('flex flex-wrap items-start justify-between gap-x-4 gap-y-3', className)}>
			<div className="flex min-w-0 items-start gap-3">
				<span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
					<PageIcon aria-hidden="true" className="size-5" />
				</span>
				<div className="grid min-w-0 gap-1">
					<h1 className="text-pretty font-semibold text-foreground text-xl leading-tight">
						{title}
					</h1>
					{description === undefined ? null : (
						<p className="max-w-[60ch] text-pretty text-muted-foreground text-sm leading-snug">
							{description}
						</p>
					)}
				</div>
			</div>
			{actions === undefined ? null : (
				<div className="flex shrink-0 items-center gap-2">{actions}</div>
			)}
		</header>
	);
}
