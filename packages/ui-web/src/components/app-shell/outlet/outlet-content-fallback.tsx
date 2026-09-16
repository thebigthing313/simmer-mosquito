import {
	type PageContainerVariants,
	pageContainer,
} from '@simmer-mosquito/ui-web/components/page-container';
import { SkeletonRows } from '@simmer-mosquito/ui-web/components/skeleton-rows';
import { Skeleton } from '@simmer-mosquito/ui-web/components/ui/skeleton';

/**
 * The in-shell fallback for route content that is still resolving. The shell
 * chrome renders from the auth snapshot immediately, so only the main region
 * waits here: a suspending page never blanks the whole workspace.
 *
 * It draws the shape a route page has: a heading with its supporting line, an
 * action beside them, a filter row, and the rows themselves. The sweep across
 * the top is the only moving part, and it says work is still in flight, which
 * a stack of skeletons cannot.
 *
 * How wide it draws is the app's decision, so `measure` is read off
 * `pageContainer` and the app names the variant. The default is `page`, the
 * 1200px column, which is every page in the admin console. `apps/web` passes
 * `record`, the 112rem cap its detail pages fill the stage under, because the
 * column is the minority there: the explorers, the split forms and the
 * worklists fill the stage, and a 1200px skeleton ahead of one reserved a
 * column in the middle of the stage that the page then drew straight past
 * (#1040). The domain overviews and the catalog pages still sit in the column,
 * so a skeleton wider than them is the accepted mismatch; a skeleton shaped
 * per layout family is its own issue. It is `record` rather than a fourth,
 * uncapped variant because a skeleton wider than any page would be a third
 * width, and the widest page and the skeleton should share one number.
 *
 * `relative` is what the sweep positions against. Without it the hairline
 * escapes to the nearest positioned ancestor, which is the shell's `main`.
 */
export function OutletContentFallback({
	measure = 'page',
}: {
	/*
	 * `NonNullable` because cva reads `null` as "no variant, skip the default",
	 * which would draw the skeleton with no cap at all, the fourth width the
	 * docblock above rejects.
	 */
	readonly measure?: NonNullable<PageContainerVariants['measure']>;
}) {
	return (
		<div aria-busy="true" aria-label="Loading page" className="relative" role="status">
			<span aria-hidden="true" className="simmer-sweep" />
			<div className={pageContainer({ gap: 'snug', measure, padding: 'page' })}>
				<div className="flex items-start gap-4">
					<div className="grid min-w-0 flex-1 gap-2">
						<Skeleton className="h-7 w-[min(280px,60%)]" />
						<Skeleton className="h-4 w-[min(420px,80%)]" />
					</div>
					<Skeleton className="h-9 w-28 shrink-0" />
				</div>

				<div className="mt-2 flex flex-wrap gap-2">
					{FILTER_WIDTHS.map((width) => (
						<Skeleton className={`h-8 ${width}`} key={width} />
					))}
				</div>

				<SkeletonRows className="mt-1 gap-3" rowClassName="h-14" widths={ROW_WIDTHS} />
			</div>
		</div>
	);
}

const FILTER_WIDTHS = ['w-32', 'w-24', 'w-40'] as const;
/*
 * Eight rows rather than the five the 1200 column carried. At full width a
 * row is a wide bar and five of them stop 520px down a 950px stage, which
 * reads as a band across the top rather than as a page; eight run past
 * three quarters of it and a longer stage scrolls the same as a page would.
 */
const ROW_WIDTHS = Array.from({ length: 8 }, () => 'w-full' as const);
