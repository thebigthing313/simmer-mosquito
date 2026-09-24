import { Sheet, SheetContent, SheetTitle } from '@simmer-mosquito/ui-web/components/ui/sheet';
import { useMediaQuery } from '@simmer-mosquito/ui-web/hooks/use-media-query';
import { PrimarySidebar } from '../primary-sidebar/primary-sidebar';
import { SecondarySidebar } from '../secondary-sidebar/secondary-sidebar';

/**
 * Both rails in a sheet from the left, for a window too narrow to draw them
 * beside the page. Under `sm` the domain rail draws icon-only, so the two fit
 * in 304px on a phone. It closes itself once the window is wide enough for the
 * inline rails, so a resize never leaves an overlay over a page that has its
 * rails back.
 */
export function NavigationDrawer({
	open,
	onOpenChange,
}: {
	readonly open: boolean;
	readonly onOpenChange: (open: boolean) => void;
}) {
	const wide = useMediaQuery('(min-width: 64rem)');
	const phone = useMediaQuery('(max-width: 39.999rem)');

	return (
		<Sheet onOpenChange={onOpenChange} open={open && !wide}>
			<SheetContent
				aria-describedby={undefined}
				className="w-auto max-w-[calc(100vw-3rem)] flex-row gap-0 overflow-hidden border-r-0 p-0 sm:max-w-none"
				showCloseButton={false}
				side="left"
			>
				<SheetTitle className="sr-only">Navigation</SheetTitle>
				<PrimarySidebar collapsed={phone} />
				<SecondarySidebar />
			</SheetContent>
		</Sheet>
	);
}
