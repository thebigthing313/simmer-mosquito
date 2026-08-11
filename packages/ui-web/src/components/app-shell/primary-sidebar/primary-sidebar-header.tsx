import { iconRegistry } from '@simmer-mosquito/ui-web/icons/registry';
import { cn } from '@simmer-mosquito/ui-web/lib/utils';
import { Link } from '@tanstack/react-router';
import { useShell } from '../shell-context';

const BrandMark = iconRegistry.simmer.brandMark.icon;

/**
 * Both apps publish the release history at the same path, so it is written here
 * rather than threaded through the shell as configuration nothing varies.
 */
const CHANGELOG_PATH = '/changelog';

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
 *
 * It is a real `Link` and not a button calling `onNavigate`: this is the one
 * destination in the chrome a user is likely to want in a second tab, to read
 * while leaving their work where it was, and a button gives them no middle
 * click and no open-in-new-tab.
 */
export function PrimarySidebarHeader({ collapsed }: { readonly collapsed: boolean }) {
	const { version } = useShell();

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
				<Link
					className={cn(
						'rounded-sm text-white/70 text-xs leading-none transition-colors',
						'hover:text-white focus-visible:text-white focus-visible:outline-none',
						// The rail's ring, spelled exactly as its three siblings spell it:
						// solid and inverted, per DESIGN.md's Solid Indicator Rule.
						'focus-visible:ring-2 focus-visible:ring-ring-inverse',
						'focus-visible:ring-offset-2 focus-visible:ring-offset-simmer-green-900',
					)}
					title={`SIMMER ${version} — see what's changed`}
					to={CHANGELOG_PATH}
				>
					{collapsed ? version : `v${version}`}
				</Link>
			)}
		</div>
	);
}
