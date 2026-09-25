import { TabStrip, TabStripTab } from '@simmer-mosquito/ui-web/components/tab-strip';
import { Tabs, TabsContent } from '@simmer-mosquito/ui-web/components/ui/tabs';
import { iconRegistry, MapPinnedIcon } from '@simmer-mosquito/ui-web/icons/registry';
import type React from 'react';
import { CommentsSection } from '../comments-section';

const CommentIcon = iconRegistry.actions.comment.icon;

/**
 * The rail below a worklist's header: its stops, and the thread about it. The
 * two take turns in the one column beside the map, and whichever is showing
 * owns its own scrolling.
 */
export function WorklistTabs({
	target,
	commentsDescription,
	stopCount,
	stopControls,
	children,
}: {
	/** The worklist the thread hangs off. */
	readonly target: { readonly type: 'mission' | 'assignment'; readonly id: string };
	readonly commentsDescription?: string | undefined;
	/** Shown beside the Stops label, so the count survives a switch to Comments. */
	readonly stopCount: number;
	/** Planning controls pinned above the stop list, if the worklist has any. */
	readonly stopControls?: React.ReactNode;
	/** The stop list. It scrolls itself. */
	readonly children: React.ReactNode;
}) {
	return (
		<Tabs className="min-h-0 flex-1 gap-0" defaultValue="stops">
			<div className="shrink-0 border-border/40 border-b px-3 py-2">
				<TabStrip>
					<TabStripTab value="stops">
						<MapPinnedIcon aria-hidden="true" />
						Stops
						{stopCount === 0 ? null : (
							<span className="text-muted-foreground text-xs tabular-nums">{stopCount}</span>
						)}
					</TabStripTab>
					<TabStripTab value="comments">
						<CommentIcon aria-hidden="true" />
						Comments
					</TabStripTab>
				</TabStrip>
			</div>

			<TabsContent className="flex min-h-0 flex-col" value="stops">
				{stopControls}
				{children}
			</TabsContent>

			<TabsContent className="flex min-h-0 flex-col p-3" value="comments">
				<CommentsSection
					className="min-h-0 flex-1"
					description={commentsDescription}
					target={target}
				/>
			</TabsContent>
		</Tabs>
	);
}
