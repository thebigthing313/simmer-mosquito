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
				<PrimarySidebar />
				<SecondarySidebar />
				<div className="flex min-w-0 flex-1 flex-col">
					<AppHeader />
					<main className="min-h-0 flex-1 overflow-y-auto bg-(--app-stage)">{children}</main>
				</div>
			</div>
		</TooltipProvider>
	);
}
