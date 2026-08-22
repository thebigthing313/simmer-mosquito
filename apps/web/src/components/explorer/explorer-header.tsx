import { stickyHeader } from '@simmer-mosquito/ui-web/components/sticky-header';
import { Button } from '@simmer-mosquito/ui-web/components/ui/button';
import { type iconRegistry, PlusIcon } from '@simmer-mosquito/ui-web/icons/registry';
import { cn } from '@simmer-mosquito/ui-web/lib/utils';
import { Link, type LinkProps } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import type { MinimumRole } from '../../lib/write-access';
import { WriteOnly } from '../write-only';
import { ResultMeta } from './result-meta';

type RegistryIcon = typeof iconRegistry.entities.sample.icon;

/** The create control an explorer offers, hidden below its command's role floor. */
export interface ExplorerCreateAction {
	readonly to: NonNullable<LinkProps['to']>;
	readonly label: string;
	/** Matches the floor of the command the form sends. Defaults to `collector`. */
	readonly minimum?: MinimumRole;
}

/**
 * The sticky block above an explorer's list: its title, its count, its create
 * button, and the filter controls underneath.
 *
 * The filters themselves stay with the page as `children` — every explorer
 * filters by something different, and a header that built the chip rows would
 * have to know about four families on chemical and three everywhere else. What
 * it does own is the row those controls sit under, which the nine explorers had
 * each laid out for themselves.
 */
export function ExplorerHeader({
	title,
	icon: Icon,
	total,
	isLoading,
	noun,
	create,
	collapse,
	children,
	surface = 'page',
	showTotal = false,
}: {
	readonly title: string;
	readonly icon?: RegistryIcon | undefined;
	readonly total: number;
	readonly isLoading: boolean;
	readonly noun?: { readonly one: string; readonly many: string } | undefined;
	readonly create?: ExplorerCreateAction | undefined;
	/**
	 * Put the whole panel away. Only the map frame passes one — a header above a
	 * column has nothing to collapse into.
	 */
	readonly collapse?:
		| {
				readonly onCollapse: () => void;
				readonly label: string;
				/** Points where the panel goes: aside on a side column, down on a sheet. */
				readonly icon: RegistryIcon;
		  }
		| undefined;
	/**
	 * The filter controls, stacked under the title row. Omitted where the surface
	 * gives its filters a panel of their own.
	 */
	readonly children?: ReactNode;
	/**
	 * What the header sits on. `page` is the opaque bar a scrolling page needs.
	 * `chrome` paints nothing, for the map frame's panel, which already carries
	 * the translucent surface the map's own controls wear. It also drops the
	 * count from this row: that panel ends in a footer stating the same number
	 * beside the page, and the pill it collapses into carries it too. A panel with
	 * no footer passes `showTotal` and gets it back.
	 */
	readonly surface?: 'page' | 'chrome';
	/**
	 * Draw the count in this row even on `chrome`. The map frame passes it for a
	 * panel with no pager under it, which is otherwise a panel that never says how
	 * many records it is holding.
	 */
	readonly showTotal?: boolean;
}) {
	const isChrome = surface === 'chrome';
	// In the map frame this header is one of two panels stacked in a 380px column,
	// and the other one spends 8px on its own header. At the page padding it was
	// spending 73px of the rail on a title the breadcrumb already carries.
	// Truncates rather than wraps: in a rail the create button is fixed-width, so
	// a long title is the thing that has to give.
	const heading = cn(
		'truncate font-semibold text-foreground leading-none',
		isChrome ? 'text-base' : 'text-lg',
	);

	return (
		<div
			className={stickyHeader({
				surface,
				gap: isChrome ? 'snug' : 'default',
				padding: isChrome ? 'compact' : 'default',
			})}
		>
			{/*
			 * `min-w-0` on the row and on the title. The header is a grid item and the
			 * title group is a flex item, and both default to `min-width: auto`, which
			 * is their content's width. So a long title plus a wide create button made
			 * the row wider than the panel instead of truncating, and the panel's
			 * `overflow-hidden` cut the collapse control off the right edge. It went
			 * unseen because the surfaces that named it are the long ones: Requests
			 * for Control, Service Requests, Weather Stations, Address Book.
			 */}
			<div className="flex min-w-0 items-center justify-between gap-3">
				{Icon === undefined ? (
					<h1 className={cn(heading, 'min-w-0')}>{title}</h1>
				) : (
					<div className="flex min-w-0 items-center gap-2">
						<Icon aria-hidden="true" className="size-5 shrink-0 text-muted-foreground" />
						<h1 className={cn(heading, 'min-w-0')}>{title}</h1>
					</div>
				)}
				<div className={cn('flex shrink-0 items-center', isChrome ? 'gap-1' : 'gap-2.5')}>
					{isChrome && !showTotal ? null : (
						<ResultMeta isLoading={isLoading} noun={noun} total={total} />
					)}
					{create === undefined ? null : (
						<WriteOnly minimum={create.minimum ?? 'collector'}>
							{/*
							 * In the map frame the label goes and the plus stays, in the same
							 * ghost icon button the collapse control wears. "Add Trap" spent
							 * 175px of a 380px panel, more than the title beside it, to repeat
							 * a word the title had already said, and a filled button that wide
							 * pulled the eye off the map the panel is floating over.
							 *
							 * A page-width header keeps the words and the fill: it has the
							 * room, and there the button is the only thing telling a reader
							 * they can add one.
							 */}
							<Button
								aria-label={isChrome ? create.label : undefined}
								asChild
								size={isChrome ? 'icon-sm' : 'sm'}
								title={isChrome ? create.label : undefined}
								variant={isChrome ? 'ghost' : 'default'}
							>
								<Link to={create.to}>
									<PlusIcon
										aria-hidden="true"
										{...(isChrome ? {} : { 'data-icon': 'inline-start' })}
									/>
									{isChrome ? null : create.label}
								</Link>
							</Button>
						</WriteOnly>
					)}
					{collapse === undefined ? null : <CollapseButton collapse={collapse} />}
				</div>
			</div>
			{children}
		</div>
	);
}

function CollapseButton({
	collapse,
}: {
	readonly collapse: {
		readonly onCollapse: () => void;
		readonly label: string;
		readonly icon: RegistryIcon;
	};
}) {
	const Icon = collapse.icon;
	return (
		<Button
			aria-label={collapse.label}
			onClick={collapse.onCollapse}
			size="icon-sm"
			variant="ghost"
		>
			<Icon aria-hidden="true" />
		</Button>
	);
}
