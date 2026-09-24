import type { RegistryIcon } from '@simmer-mosquito/ui-web/icons/registry';
import { cn } from '@simmer-mosquito/ui-web/lib/utils';
import type { ReactNode } from 'react';

/** The page's subject: its icon on a tinted tile beside the title. */
// The order the class list had under the old `cva`, so the markup it draws is
// byte for byte what the admin console's changelog pins.
const SUBJECT_TILE =
	'inline-flex shrink-0 items-center mt-0.5 size-9 justify-center rounded-md bg-primary/10 text-primary';

/**
 * The heading a page opens with: its subject, its title, a measured
 * description, and the page's actions on the right.
 *
 * One component for both consoles and both looks. The product had three heading
 * treatments at three declared sizes and none of them was the size `DESIGN.md`'s
 * Headline row asked for, with a duplicate no reader could see because
 * `text-[1.5rem]` and `text-2xl` compute the same (#647). It settled on 1.5rem,
 * reached through the registered `text-heading` role rather than an arbitrary
 * value, and the five sites that were at `text-xl` moved up. The argument this
 * docblock used to carry for `xl`, that these are work surfaces rather than
 * announcements, is what left five headings a size below the other seventeen,
 * and it is overruled.
 *
 * It draws no eyebrow. The small uppercase label above a heading belongs to a
 * record's detail page, where it names the record type, and `DetailPageHeader`
 * in `apps/web` draws that one. List, explorer, overview, period and settings
 * pages carried one too, naming a domain area (`Surveillance & mapping`) or
 * the word `Organization`, which said nothing the sidebar had not, so the prop
 * went in the second design pass.
 *
 * `icon` is optional for one site: the new-assignment page opens with a back
 * link where the others open with their subject.
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
	/**
	 * Under the title, capped at a readable measure. A string gets the standard
	 * supporting line; a node is drawn inside the measure as given, for the
	 * address, whose postal lines are several of them.
	 */
	readonly description?: ReactNode | undefined;
	/** The page's subject, tiled beside the title. */
	readonly icon?: RegistryIcon | undefined;
	/** Badges and the page's own controls, in reading order. */
	readonly actions?: ReactNode | undefined;
	readonly className?: string | undefined;
}) {
	return (
		<header className={cn('flex flex-wrap items-start justify-between gap-x-4 gap-y-3', className)}>
			<div className="flex min-w-0 items-start gap-3">
				{PageIcon === undefined ? null : (
					<span className={SUBJECT_TILE}>
						<PageIcon aria-hidden="true" className="size-5" />
					</span>
				)}
				<div className="grid min-w-0 gap-1.5">
					<h1 className="m-0 text-pretty font-semibold text-foreground text-heading leading-heading">
						{title}
					</h1>
					{description === undefined ? null : (
						<div className="max-w-[68ch] text-pretty text-muted-foreground text-sm leading-snug">
							{typeof description === 'string' ? <p className="m-0">{description}</p> : description}
						</div>
					)}
				</div>
			</div>
			{actions === undefined ? null : (
				<div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>
			)}
		</header>
	);
}
