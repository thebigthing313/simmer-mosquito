import { TooltipProvider } from '@simmer-mosquito/ui-web/components/ui/tooltip';
import type React from 'react';
import { AppHeader } from '../header/app-header';
import { PrimarySidebar } from '../primary-sidebar/primary-sidebar';
import { SecondarySidebar } from '../secondary-sidebar/secondary-sidebar';

/**
 * The definitive authenticated shell. Composes the primary rail, the secondary
 * navigation panel, the header, and the scrolling region the router renders
 * into. Must be mounted inside a `ShellProvider`, which supplies organization,
 * user, navigation, and active-path state.
 */
export function OutletShell({
	banner,
	children,
}: {
	/**
	 * Rendered above both rails, inside the viewport-height column, so it takes
	 * its space from the shell instead of overlaying it. `apps/web` and
	 * `apps/admin` pass the environment banner here; production passes nothing
	 * and the row below keeps the whole viewport.
	 */
	readonly banner?: React.ReactNode;
	readonly children: React.ReactNode;
}) {
	return (
		<TooltipProvider delayDuration={300}>
			<div className="flex h-svh w-full flex-col overflow-hidden bg-background text-foreground">
				{/*
				 * Both rails render before `main` in the DOM, so without this a
				 * keyboard operator tabs the whole domain rail plus the active
				 * domain's sub-navigation before reaching page content — on every
				 * navigation. Landmarks cover screen-reader users; this covers
				 * sighted keyboard users, who have no landmark jump.
				 *
				 * Off-screen until focused rather than `hidden`, so it stays in the
				 * tab order.
				 */}
				<a
					className="-translate-y-full focus:-translate-y-0 fixed top-0 left-0 z-50 rounded-br-md bg-primary px-4 py-2 font-medium text-primary-foreground text-sm transition-transform focus:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
					href="#main-content"
				>
					Skip to content
				</a>
				{banner}
				<div className="flex min-h-0 w-full flex-1 overflow-hidden">
					<PrimarySidebar />
					<SecondarySidebar />
					<div className="flex min-w-0 flex-1 flex-col">
						<AppHeader />
						{/*
						 * `relative` is load-bearing, not decorative. An `overflow` ancestor
						 * only clips an absolutely-positioned descendant when it is also in
						 * that descendant's containing-block chain — and with every wrapper
						 * from here down statically positioned, the chain ran all the way out
						 * to the initial containing block. The hidden native `<select>` a
						 * Select renders for form submission is `position: absolute` with
						 * `top: auto`, so it resolved to its static position in *document*
						 * coordinates, escaped every scroll container on the way up, and
						 * stretched the page: a form long enough put a scrollbar on the
						 * browser window itself. Positioning `main` closes the chain here, so
						 * an outlet's overflow can never reach the document again.
						 */}
						<main
							className="relative min-h-0 flex-1 overflow-y-auto bg-(--app-stage)"
							id="main-content"
							tabIndex={-1}
						>
							{children}
						</main>
					</div>
				</div>
			</div>
		</TooltipProvider>
	);
}
