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
export function OutletShell({ children }: { readonly children: React.ReactNode }) {
	return (
		<TooltipProvider delayDuration={300}>
			<div className="flex h-svh w-full overflow-hidden bg-background text-foreground">
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
				<PrimarySidebar />
				<SecondarySidebar />
				<div className="flex min-w-0 flex-1 flex-col">
					<AppHeader />
					<main
						className="min-h-0 flex-1 overflow-y-auto bg-(--app-stage)"
						id="main-content"
						tabIndex={-1}
					>
						{children}
					</main>
				</div>
			</div>
		</TooltipProvider>
	);
}
