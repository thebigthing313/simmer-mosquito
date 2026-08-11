import { iconRegistry } from '@simmer-mosquito/ui-web/icons/registry';
import { cn } from '@simmer-mosquito/ui-web/lib/utils';
import { useShell } from '../shell-context';

const BrandMark = iconRegistry.simmer.brandMark.icon;

/**
 * Brand anchor at the top of the rail: the full lockup when there is width for
 * it, the mark alone when there is not, and the running version beneath either.
 *
 * The mark sits directly on the rail rather than inside a lighter green chip —
 * a green tile on a green rail read as a seam in the surface rather than as a
 * frame around the logo.
 *
 * The version is a link rather than a label because a number on its own tells a
 * user nothing they can act on. Sending it to the changelog turns "0.2.0" into
 * the answer to "what changed since I last looked", which is the only question
 * anyone asks a version number.
 */
export function PrimarySidebarHeader({ collapsed }: { readonly collapsed: boolean }) {
	const { version, changelogPath, onNavigate } = useShell();

	return (
		<div
			className={cn(
				'flex shrink-0 flex-col items-center justify-center gap-1 py-3',
				collapsed ? null : 'px-4',
			)}
		>
			{collapsed ? (
				<span className="grid size-9 place-items-center [&_svg]:size-9">
					<BrandMark aria-label="SIMMER" role="img" />
				</span>
			) : (
				<img alt="SIMMER" className="h-10 w-auto" src="/logo.svg" />
			)}
			{version === undefined ? null : (
				<button
					className={cn(
						'rounded-sm text-white/60 text-xs leading-none transition-colors',
						'hover:text-white focus-visible:text-white focus-visible:outline-2',
						'focus-visible:outline-white/70 focus-visible:outline-offset-2',
					)}
					onClick={() => onNavigate(changelogPath ?? '/changelog')}
					title={`SIMMER ${version} — see what's changed`}
					type="button"
				>
					{collapsed ? version : `v${version}`}
				</button>
			)}
		</div>
	);
}
