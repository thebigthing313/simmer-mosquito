import { Alert, AlertDescription, AlertTitle } from '@simmer-mosquito/ui-web/components/ui/alert';
import type { ReactNode } from 'react';
import type { ActivityCopy, ActivityFamilyGroup, ActivityLookups } from './activity-data';
import { ActivityFamilySection } from './activity-family-section';

export function ActivityLog({
	families,
	message,
	truncated,
	total,
	copy,
	lookups,
	timeZone,
	selectedKey,
	onSelect,
}: {
	/** The day's entries, split into families. Empty families are already left out. */
	readonly families: readonly ActivityFamilyGroup[];
	/**
	 * A reason the frame's empty copy cannot carry: a refusal naming the day the
	 * server declined, or an outage.
	 */
	readonly message: { readonly title: string; readonly body: string } | null;
	readonly truncated: boolean;
	/** What the response reports for the whole question, cap ignored. */
	readonly total: number;
	/** What the page says around the log: the refusal title and the truncation advice. */
	readonly copy: ActivityCopy;
	readonly lookups: ActivityLookups;
	readonly selectedKey: string | null;
	readonly timeZone: string | undefined;
	readonly onSelect: (key: string) => void;
}) {
	const shownCount = families.reduce((running, group) => running + group.entries.length, 0);
	if (message !== null) {
		return <PanelMessage title={message.title}>{message.body}</PanelMessage>;
	}

	return (
		<>
			{truncated ? (
				<TruncationNotice advice={copy.truncationAdvice} shown={shownCount} total={total} />
			) : null}
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

/** The row cap bit, said out loud: a partial log must never read as a whole one. */
function TruncationNotice({
	shown,
	total,
	advice,
}: {
	readonly shown: number;
	readonly total: number;
	readonly advice: string | null;
}) {
	return (
		<Alert className="m-3" variant="destructive">
			<AlertTitle>This log is incomplete</AlertTitle>
			<AlertDescription>
				Showing the first {shown.toLocaleString('en-US')} of {total.toLocaleString('en-US')}{' '}
				entries.
				{advice === null ? null : ` ${advice}`}
			</AlertDescription>
		</Alert>
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
