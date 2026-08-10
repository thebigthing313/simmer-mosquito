import { stickyHeader } from '@simmer-mosquito/ui-web/components/sticky-header';
import { Button } from '@simmer-mosquito/ui-web/components/ui/button';
import { type iconRegistry, PlusIcon } from '@simmer-mosquito/ui-web/icons/registry';
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
	children,
}: {
	readonly title: string;
	readonly icon?: RegistryIcon | undefined;
	readonly total: number;
	readonly isLoading: boolean;
	readonly noun?: { readonly one: string; readonly many: string } | undefined;
	readonly create?: ExplorerCreateAction | undefined;
	/** The filter controls, stacked under the title row. */
	readonly children: ReactNode;
}) {
	return (
		<div className={stickyHeader({ gap: 'default', padding: 'default' })}>
			<div className="flex items-center justify-between gap-3">
				{Icon === undefined ? (
					<h1 className="font-semibold text-foreground text-lg leading-none">{title}</h1>
				) : (
					<div className="flex items-center gap-2">
						<Icon aria-hidden="true" className="size-5 text-muted-foreground" />
						<h1 className="font-semibold text-foreground text-lg leading-none">{title}</h1>
					</div>
				)}
				<div className="flex items-center gap-2.5">
					<ResultMeta isLoading={isLoading} noun={noun} total={total} />
					{create === undefined ? null : (
						<WriteOnly minimum={create.minimum ?? 'collector'}>
							<Button asChild size="sm">
								<Link to={create.to}>
									<PlusIcon aria-hidden="true" data-icon="inline-start" />
									{create.label}
								</Link>
							</Button>
						</WriteOnly>
					)}
				</div>
			</div>
			{children}
		</div>
	);
}
