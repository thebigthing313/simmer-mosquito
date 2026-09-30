import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from '@simmer-mosquito/ui-web/components/ui/empty';
import { ScrollArea } from '@simmer-mosquito/ui-web/components/ui/scroll-area';
import { Skeleton } from '@simmer-mosquito/ui-web/components/ui/skeleton';
import { MapPinnedIcon } from '@simmer-mosquito/ui-web/icons/registry';
import type { ReactNode } from 'react';

const SKELETON_KEYS = ['sk-1', 'sk-2', 'sk-3', 'sk-4'] as const;

/**
 * The three states an ordered-stop list has before it has stops: waiting,
 * empty, and the `<ol>` itself.
 *
 * Three surfaces wrote this out identically and a fourth nearly so, and one of
 * them drifted to `h-[72px]` where the others use `h-[76px]` — a slip rather
 * than a decision, since the rows they stand in for are the same rows. `76px`
 * is the majority and the one kept.
 *
 * `empty` is the caller's copy, because what an empty route means differs by
 * surface: a habitat route with no stops is unfinished planning, a mission with
 * no stops cannot be started. Only the frame is shared.
 */
export function StopList({
	isLoading,
	isEmpty,
	empty,
	children,
}: {
	readonly isLoading: boolean;
	readonly isEmpty: boolean;
	readonly empty: { readonly title: string; readonly description: ReactNode };
	readonly children: ReactNode;
}) {
	if (isLoading && isEmpty) {
		return (
			<div className="grid gap-2 p-3">
				{SKELETON_KEYS.map((key) => (
					<Skeleton className="h-[76px] rounded-lg" key={key} />
				))}
			</div>
		);
	}

	if (isEmpty) {
		return (
			<div className="flex flex-1 items-center justify-center p-6">
				<Empty>
					<EmptyHeader>
						<EmptyMedia variant="icon">
							<MapPinnedIcon aria-hidden="true" />
						</EmptyMedia>
						<EmptyTitle>{empty.title}</EmptyTitle>
						<EmptyDescription>{empty.description}</EmptyDescription>
					</EmptyHeader>
				</Empty>
			</div>
		);
	}

	// Every caller hosts the list in a split pane's flex column, whose height is
	// definite, so `min-h-0 flex-1` on the root gives the viewport a height to
	// fill. The `p-3` already keeps the bar off the stop cards.
	return (
		<ScrollArea className="min-h-0 flex-1" type="auto">
			<ol className="m-0 list-none space-y-2 p-3">{children}</ol>
		</ScrollArea>
	);
}
