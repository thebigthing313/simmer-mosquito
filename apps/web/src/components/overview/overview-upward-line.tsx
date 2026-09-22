/**
 * The line under a period-in-review page's heading: the period's long name
 * in the foreground weight, then each coarser period as a link, separated by
 * a middle dot, `Monday, September 21, 2026 · September 2026 · 2026`. It is
 * the only way from a day to its month, because a bar opens its own period at
 * the page's grain and never a coarser one. Annual draws none, there being no
 * coarser grain. Every link writes its period explicitly.
 */

import type { OverviewGrain } from '@simmer-mosquito/domain';
import { Link } from '@tanstack/react-router';
import { periodDestination, periodLongName } from './overview-data';

/**
 * One line under the heading: the period's long name in the foreground
 * weight, then each coarser period as a link, separated by a middle dot. It
 * is the only way from a day to its month, because a bar opens its own
 * period at the page's grain and never a coarser one. Annual draws none.
 */
export function UpwardLine({
	grain,
	period,
}: {
	readonly grain: OverviewGrain;
	readonly period: string;
}) {
	if (grain === 'year') {
		return null;
	}
	const year = period.slice(0, 4);
	return (
		<p className="-mt-3 m-0 flex flex-wrap items-center gap-2 text-muted-foreground text-sm">
			<span className="font-medium text-foreground">{periodLongName(grain, period)}</span>
			{grain === 'day' ? (
				<>
					<span aria-hidden="true">·</span>
					<Link className={UPWARD_LINK} {...periodDestination('month', period.slice(0, 7))}>
						{periodLongName('month', period.slice(0, 7))}
					</Link>
				</>
			) : null}
			<span aria-hidden="true">·</span>
			<Link className={UPWARD_LINK} {...periodDestination('year', year)}>
				{year}
			</Link>
		</p>
	);
}

const UPWARD_LINK = 'text-primary underline-offset-4 hover:underline';
