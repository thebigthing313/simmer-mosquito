import { pageContainer } from '@simmer-mosquito/ui-web/components/page-container';
import { SkeletonRows } from '@simmer-mosquito/ui-web/components/skeleton-rows';
import { Skeleton } from '@simmer-mosquito/ui-web/components/ui/skeleton';

/**
 * The in-shell fallback for route content that is still resolving. The shell
 * chrome renders from the auth snapshot immediately, so only the main region
 * waits here: a suspending page never blanks the whole workspace.
 *
 * It draws the shape a route page actually has, in `OutletSimpleLayout`'s
 * column, so the fallback occupies roughly the space the resolved page will:
 * a heading with its supporting line, an action beside them, a filter row, and
 * the rows themselves. The sweep across the top is the only moving part, and it
 * says work is still in flight, which a stack of skeletons cannot.
 *
 * `relative` is what the sweep positions against. Without it the hairline
 * escapes to the nearest positioned ancestor, which is the shell's `main`.
 */
export function OutletContentFallback() {
	return (
		<div aria-busy="true" aria-label="Loading page" className="relative" role="status">
			<span aria-hidden="true" className="simmer-sweep" />
			<div className={pageContainer({ gap: 'snug', padding: 'page' })}>
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
const ROW_WIDTHS = ['w-full', 'w-full', 'w-full', 'w-full', 'w-full'] as const;
