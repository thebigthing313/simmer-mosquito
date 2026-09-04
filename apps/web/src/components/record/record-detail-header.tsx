import type { iconRegistry } from '@simmer-mosquito/ui-web/icons/registry';
import type { ReactNode } from 'react';

type RegistryIcon = typeof iconRegistry.entities.sample.icon;

/**
 * What the record is, what it is called, and what can be done to it.
 *
 * The eyebrow names the record type because a detail page is arrived at from a
 * map pin, a search result, or another record's card as often as from its own
 * list, and the title alone does not say which kind of thing opened.
 */
export function RecordDetailHeader({
	icon: Icon,
	eyebrow,
	title,
	subtitle,
	actions,
}: {
	readonly icon: RegistryIcon;
	/** The record type, sentence case: `Collection`, `Weather station`. */
	readonly eyebrow: string;
	readonly title: string;
	/**
	 * Under the title. A string gets the standard supporting line; a node is
	 * drawn as given, for the address, whose postal lines are several of them.
	 */
	readonly subtitle?: ReactNode;
	/** Badges and the controls that write, in reading order. */
	readonly actions?: ReactNode;
}) {
	return (
		<div className="flex flex-wrap items-start justify-between gap-3">
			<div className="grid gap-1.5">
				<span className="inline-flex items-center gap-1.5 font-medium text-muted-foreground text-xs uppercase tracking-wide">
					<Icon aria-hidden="true" className="size-3.5" />
					{eyebrow}
				</span>
				<h1 className="m-0 font-semibold text-[1.5rem] text-foreground leading-tight">{title}</h1>
				{subtitle === undefined ? null : typeof subtitle === 'string' ? (
					<p className="m-0 text-[0.95rem] text-muted-foreground">{subtitle}</p>
				) : (
					subtitle
				)}
			</div>
			{actions === undefined ? null : (
				<div className="flex flex-wrap items-center gap-2">{actions}</div>
			)}
		</div>
	);
}
