import { iconRegistry } from '@simmer-mosquito/ui-web/icons/registry';
import { cn } from '@simmer-mosquito/ui-web/lib/utils';

const BrandMark = iconRegistry.simmer.brandMark.icon;

/**
 * Brand anchor at the top of the rail: the full lockup when there is width for
 * it, the mark alone when there is not.
 *
 * The mark sits directly on the rail rather than inside a lighter green chip —
 * a green tile on a green rail read as a seam in the surface rather than as a
 * frame around the logo.
 */
export function PrimarySidebarHeader({ collapsed }: { readonly collapsed: boolean }) {
	return (
		<div className={cn('flex h-16 shrink-0 items-center', collapsed ? 'justify-center' : 'px-4')}>
			{collapsed ? (
				<span className="grid size-9 place-items-center [&_svg]:size-9">
					<BrandMark aria-label="SIMMER" role="img" />
				</span>
			) : (
				<img alt="SIMMER" className="h-10 w-auto" src="/logo.svg" />
			)}
		</div>
	);
}
