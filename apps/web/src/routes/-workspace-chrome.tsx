import { PRIMARY_SIDEBAR_COLLAPSED_KEY } from '@simmer-mosquito/ui-web/components/app-shell';
import { ErrorReport } from '@simmer-mosquito/ui-web/components/error-report';
import { SkeletonRows } from '@simmer-mosquito/ui-web/components/skeleton-rows';
import { Card } from '@simmer-mosquito/ui-web/components/ui/card';
import { Skeleton } from '@simmer-mosquito/ui-web/components/ui/skeleton';
import { usePersistentFlag } from '@simmer-mosquito/ui-web/hooks/use-persistent-flag';
import { iconRegistry } from '@simmer-mosquito/ui-web/icons/registry';
import { cn } from '@simmer-mosquito/ui-web/lib/utils';

/**
 * The two whole-window states of the authenticated root route: the workspace is
 * still resolving, or it threw before the shell mounted. Both are pre-shell, so
 * neither can read the shell context. Once a page is inside the shell, the
 * in-region states are `OutletContentFallback` and the page's own boundaries.
 */

const BrandMark = iconRegistry.simmer.brandMark.icon;

/**
 * One width class per placeholder row. `SkeletonRows` explains why they are
 * uneven; the counts here are what the real rail and navigation column hold.
 */
const RAIL_ROW_WIDTHS = ['w-full', 'w-11/12', 'w-full', 'w-10/12', 'w-full', 'w-9/12'] as const;
const COLLAPSED_RAIL_ROW_WIDTHS = ['w-9', 'w-9', 'w-9', 'w-9', 'w-9', 'w-9'] as const;
const NAV_ROW_WIDTHS = ['w-full', 'w-5/6', 'w-full', 'w-2/3', 'w-11/12'] as const;
const CONTENT_ROW_WIDTHS = ['w-full', 'w-full', 'w-full', 'w-full', 'w-full'] as const;

/**
 * The whole-window state while the authenticated shell resolves.
 *
 * It draws the shell's own bands rather than a card in an empty field: green
 * rail, navigation column, header, content stage. The reader watches the
 * workspace arrive in place, and nothing shifts sideways when `AppShellRoot`
 * commits over the top of it.
 *
 * Widths restate `ui-web`'s chrome (`w-60` or `w-16` rail, `w-60` navigation,
 * `h-16` header) rather than import it, because the real chrome needs the shell
 * context, identity, and navigation model this surface is still waiting on. The
 * one value that is shared is the rail's collapse key, so an operator who works
 * with a collapsed rail is not shown an expanded one for a second.
 */
export function WorkspaceChromeFallback() {
	const [railCollapsed] = usePersistentFlag(PRIMARY_SIDEBAR_COLLAPSED_KEY, false);

	return (
		<div
			aria-busy="true"
			aria-label="Loading workspace"
			className="flex h-svh w-full overflow-hidden bg-background"
			role="status"
		>
			<FallbackRail collapsed={railCollapsed} />
			<FallbackNav />
			<FallbackStage />
		</div>
	);
}

/** The domain rail, at whatever width this browser last left it. */
function FallbackRail({ collapsed }: { readonly collapsed: boolean }) {
	return (
		<div
			className={cn(
				'flex shrink-0 flex-col gap-5 border-white/10 border-r bg-simmer-green-900 py-3',
				collapsed ? 'w-16 items-center' : 'w-60 px-4',
			)}
		>
			{collapsed ? (
				<BrandMark aria-hidden="true" className="size-9 shrink-0" role="presentation" />
			) : (
				<img alt="" className="h-10 w-auto self-center" src="/logo.svg" />
			)}
			<SkeletonRows
				className="w-full"
				rowClassName="h-8 bg-white/10"
				widths={collapsed ? COLLAPSED_RAIL_ROW_WIDTHS : RAIL_ROW_WIDTHS}
			/>
		</div>
	);
}

/** The active domain's navigation column. */
function FallbackNav() {
	return (
		<div className="flex w-60 shrink-0 flex-col gap-2.5 border-sidebar-border border-r bg-sidebar px-3 py-4">
			<Skeleton className="h-4 w-24 bg-sidebar-accent" />
			<SkeletonRows
				className="gap-2.5"
				rowClassName="h-7 bg-sidebar-accent"
				widths={NAV_ROW_WIDTHS}
			/>
		</div>
	);
}

/** Header band and the scrolling region the router will render into. */
function FallbackStage() {
	return (
		<div className="flex min-w-0 flex-1 flex-col">
			<div className="flex h-16 shrink-0 items-center gap-3 border-border border-b bg-card px-5">
				<Skeleton className="h-4 w-36" />
				<Skeleton className="ml-auto h-4 w-24" />
				<Skeleton className="size-8 rounded-full" />
			</div>
			<div className="relative min-h-0 flex-1 overflow-hidden bg-(--app-stage)">
				<span aria-hidden="true" className="simmer-sweep" />
				<div className="grid gap-3 p-6">
					<Skeleton className="h-8 w-[min(280px,45%)]" />
					<Skeleton className="h-4 w-[min(420px,65%)]" />
					<SkeletonRows className="mt-3 gap-3" rowClassName="h-14" widths={CONTENT_ROW_WIDTHS} />
				</div>
			</div>
		</div>
	);
}

/**
 * The workspace failed before the shell mounted.
 *
 * Same report as every other error surface, in the frame that fits this one: a
 * centred card on an empty stage, because with no shell there is nothing else on
 * screen to sit beside. A route that throws *inside* the shell gets
 * `RouteErrorPage` instead, which keeps the navigation the reader still needs.
 *
 * `error`, `info`, and `reset` arrive from TanStack Router's `errorComponent`.
 * All three are optional because `SuspenseQueryBoundary` renders this surface
 * too, and it only ever caught an error.
 */
export function WorkspaceChromeError({
	error,
	info,
	reset,
}: {
	readonly error?: unknown;
	readonly info?: { readonly componentStack: string } | undefined;
	readonly reset?: (() => void) | undefined;
}) {
	return (
		<div className="grid min-h-svh place-items-center bg-(--app-stage) p-6">
			<Card className="w-[min(680px,100%)] overflow-hidden" variant="panel">
				<ErrorReport
					error={error}
					info={info}
					reset={reset}
					title="The workspace did not finish loading"
					version={__APP_VERSION__}
				/>
			</Card>
		</div>
	);
}
