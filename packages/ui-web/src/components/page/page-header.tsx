import type { RegistryIcon } from '@simmer-mosquito/ui-web/icons/registry';
import { cn } from '@simmer-mosquito/ui-web/lib/utils';
import { cva } from 'class-variance-authority';
import type { ReactNode } from 'react';

/**
 * How the page's subject is drawn: as an uppercase eyebrow with the icon inline
 * beside its label, or as a tinted tile beside the title.
 *
 * Both are in use and both look deliberate, so this is a variant rather than a
 * choice one of them loses. The eyebrow prop is what picks it, because the two
 * go together: a label naming the record type wants its icon on the same line,
 * and a page with no label has nothing to put an inline icon beside.
 */
const subject = cva('inline-flex shrink-0 items-center', {
	variants: {
		treatment: {
			tile: 'mt-0.5 size-9 justify-center rounded-md bg-primary/10 text-primary',
			eyebrow: 'gap-1.5 font-medium text-muted-foreground text-xs uppercase tracking-wide',
		},
	},
});

/** The glyph inside each treatment. A tile has room for more of it. */
const SUBJECT_GLYPH = { tile: 'size-5', eyebrow: 'size-3.5' } as const;

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
 * The eyebrow is the one axis those seventeen hand-built headings varied on, and
 * the reason they were hand-built: a short label naming the record type
 * (`Collection`, `Weather station`) or the domain area (`Surveillance &
 * mapping`). Sixteen of the seventeen carried one and this component could not
 * say it.
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
	eyebrow,
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
	/** The record type or domain area, sentence case: `Collection`, `Dispatch`. */
	readonly eyebrow?: string | undefined;
	/** The page's subject, drawn inline beside the eyebrow or tiled beside the title. */
	readonly icon?: RegistryIcon | undefined;
	/** Badges and the page's own controls, in reading order. */
	readonly actions?: ReactNode | undefined;
	readonly className?: string | undefined;
}) {
	const treatment = eyebrow === undefined ? 'tile' : 'eyebrow';
	const glyph =
		PageIcon === undefined ? null : (
			<PageIcon aria-hidden="true" className={SUBJECT_GLYPH[treatment]} />
		);

	return (
		<header className={cn('flex flex-wrap items-start justify-between gap-x-4 gap-y-3', className)}>
			<div className="flex min-w-0 items-start gap-3">
				{treatment === 'tile' && glyph !== null ? (
					<span className={subject({ treatment })}>{glyph}</span>
				) : null}
				<div className="grid min-w-0 gap-1.5">
					{eyebrow === undefined ? null : (
						<span className={subject({ treatment: 'eyebrow' })}>
							{glyph}
							{eyebrow}
						</span>
					)}
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
