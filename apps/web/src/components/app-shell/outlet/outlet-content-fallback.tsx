import { Skeleton } from '@simmer-mosquito/ui-web/components/ui/skeleton';

/**
 * The in-shell fallback for route content that is still resolving. The shell
 * chrome renders from the auth snapshot immediately, so only the main region
 * waits here — a suspending page never blanks the whole workspace.
 *
 * Mirrors `OutletSimpleLayout`'s column so the fallback occupies roughly the
 * space the resolved page will.
 */
export function OutletContentFallback() {
	return (
		<div
			role="status"
			aria-label="Loading page"
			className="mx-auto grid w-full max-w-[1200px] gap-4 px-4 py-6 md:px-8 md:py-8"
		>
			<Skeleton className="h-8 w-[min(280px,60%)]" />
			<Skeleton className="h-4 w-[min(420px,80%)]" />
			<div className="mt-2 grid gap-3">
				{[0, 1, 2, 3, 4].map((index) => (
					<Skeleton className="h-14 w-full" key={index} />
				))}
			</div>
		</div>
	);
}
