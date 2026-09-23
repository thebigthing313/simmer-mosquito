import type { ReactNode } from 'react';
import type { ActivityFamilyGroup, ActivityLookups } from './activity-data';
import { ActivityFamilySection } from './activity-family-section';

export function ActivityLog({
	families,
	message,
	lookups,
	timeZone,
	selectedKey,
	onSelect,
}: {
	/** The day's entries, split into families. Empty families are already left out. */
	readonly families: readonly ActivityFamilyGroup[];
	/** A reason the frame's empty copy cannot carry: an outage. */
	readonly message: { readonly title: string; readonly body: string } | null;
	readonly lookups: ActivityLookups;
	readonly selectedKey: string | null;
	readonly timeZone: string | undefined;
	readonly onSelect: (key: string) => void;
}) {
	if (message !== null) {
		return <PanelMessage title={message.title}>{message.body}</PanelMessage>;
	}

	return (
		<>
			<ol className="grid gap-1 p-3">
				{families.map((group) => (
					<ActivityFamilySection
						group={group}
						key={group.family}
						lookups={lookups}
						onSelect={onSelect}
						selectedKey={selectedKey}
						timeZone={timeZone}
					/>
				))}
			</ol>
		</>
	);
}

function PanelMessage({
	title,
	children,
}: {
	readonly title: string;
	readonly children: ReactNode;
}) {
	return (
		<div className="grid flex-1 place-items-center p-6 text-center">
			<div className="grid gap-1">
				<p className="font-medium text-foreground text-sm">{title}</p>
				<p className="text-muted-foreground text-sm">{children}</p>
			</div>
		</div>
	);
}

// --- record dispatch ----------------------------------------------------------
//
// Nine self-fetching cards sharing the `{ id, inset, onClose }` signature, so
// the union carries ids alone.
