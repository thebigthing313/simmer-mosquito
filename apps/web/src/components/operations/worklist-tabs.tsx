import { TabStrip, TabStripTab } from '@simmer-mosquito/ui-web/components/tab-strip';
import { Tabs, TabsContent } from '@simmer-mosquito/ui-web/components/ui/tabs';
import { iconRegistry, MapPinnedIcon } from '@simmer-mosquito/ui-web/icons/registry';
import type React from 'react';
import { CommentCount } from '../comment-count';
import { CommentsSection } from '../comments-section';
import { LabelCount } from '../label-count';

const CommentIcon = iconRegistry.actions.comment.icon;

/**
 * One more tab after Comments, for a worklist that carries something the other
 * kind does not. The mission page passes its notifications here.
 */
export interface WorklistExtraTab {
	readonly value: string;
	readonly label: string;
	/** Drawn before the label. The caller marks it `aria-hidden`. */
	readonly icon: React.ReactNode;
	/** Drawn after the label, and expected to draw nothing at zero. */
	readonly count?: React.ReactNode;
	/** What the tab holds. The tab pads it and scrolls it. */
	readonly content: React.ReactNode;
}

/**
 * The rail below a worklist's header: its stops, the thread about it, and one
 * more tab if the page passes it. They take turns in the one column beside the
 * map, Stops opens first, and whichever is showing owns its own scrolling.
 */
export function WorklistTabs({
	target,
	commentsDescription,
	stopCount,
	stopControls,
	extraTab,
	children,
}: {
	/** The worklist the thread hangs off. */
	readonly target: { readonly type: 'mission' | 'assignment'; readonly id: string };
	readonly commentsDescription?: string | undefined;
	/**
	 * Shown beside the Stops label, so the count survives a switch to Comments.
	 * The Comments label reads its own count off the thread's query.
	 */
	readonly stopCount: number;
	/** Planning controls pinned above the stop list, if the worklist has any. */
	readonly stopControls?: React.ReactNode;
	readonly extraTab?: WorklistExtraTab | undefined;
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
						<LabelCount count={stopCount} />
					</TabStripTab>
					<TabStripTab value="comments">
						<CommentIcon aria-hidden="true" />
						Comments
						<CommentCount target={target} />
					</TabStripTab>
					{extraTab === undefined ? null : (
						<TabStripTab value={extraTab.value}>
							{extraTab.icon}
							{extraTab.label}
							{extraTab.count}
						</TabStripTab>
					)}
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

			{extraTab === undefined ? null : (
				<TabsContent className="min-h-0 overflow-y-auto p-3" value={extraTab.value}>
					{extraTab.content}
				</TabsContent>
			)}
		</Tabs>
	);
}
