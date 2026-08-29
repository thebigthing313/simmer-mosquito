import { PageHeader } from '@simmer-mosquito/ui-web/components/page';
import { ListEmpty, ListLoading } from '@simmer-mosquito/ui-web/components/page/list-states';
import { pageContainer } from '@simmer-mosquito/ui-web/components/page-container';
import { Alert, AlertDescription, AlertTitle } from '@simmer-mosquito/ui-web/components/ui/alert';
import { Button } from '@simmer-mosquito/ui-web/components/ui/button';
import { iconRegistry } from '@simmer-mosquito/ui-web/icons/registry';
import { useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { useCallback, useState } from 'react';
import { toast } from 'sonner';
import { useRecordMerge } from '../../hooks/mutations/use-record-merge';
import {
	type DuplicateGroup,
	type DuplicateRecord,
	duplicateCandidatesQueryKey,
	type MergeableRecordType,
	useDuplicateCandidates,
} from '../../hooks/use-merge-candidates';
import { DuplicateGroupPanel } from './duplicate-group-panel';
import { MergeConfirmDialog } from './merge-confirm-dialog';
import { RECORD_CLEANUP_CONFIGS, recordCountLabel } from './record-cleanup-config';

const MergeIcon = iconRegistry.actions.merge.icon;

/** The group a confirmation is open for, with the choice the user made in it. */
interface PendingMerge {
	readonly target: DuplicateRecord;
	readonly sources: readonly DuplicateRecord[];
}

/**
 * Resolving the duplicates a record set accumulates.
 *
 * One component behind three routes, because an address, a habitat and a contact
 * merge the same way: pick which record stays, agree to something with no undo,
 * and every row that named the others names it instead. Three pages of this
 * would be three chances for one of them to get the survivor backwards.
 *
 * The proposals are the server's, from `GET /records/{type}/duplicates`, and
 * every choice on top of them is this page's: which record survives, which rows
 * do not belong in a group at all, and whether the user has agreed. Nothing is
 * merged without all three.
 *
 * Removing records that nothing refers to any more is the other half of cleanup
 * and is not here yet; the page says so rather than leaving the nav entry
 * promising it.
 */
export function RecordCleanup({ recordType }: { readonly recordType: MergeableRecordType }) {
	const config = RECORD_CLEANUP_CONFIGS[recordType];
	const candidates = useDuplicateCandidates(recordType);
	const merge = useRecordMerge(recordType);
	const queryClient = useQueryClient();

	const [survivors, setSurvivors] = useState<Record<string, string>>({});
	const [excluded, setExcluded] = useState<ReadonlySet<string>>(() => new Set());
	const [pending, setPending] = useState<PendingMerge | null>(null);

	/*
	 * Keyed by group, not by record. A contact is compared three ways, so the same
	 * person routinely appears in a name group and a phone group on different
	 * evidence. Refusing one proposal is not refusing the other, and a flat set
	 * would silently withdraw both.
	 */
	const exclude = useCallback((groupKey: string, recordId: string) => {
		setExcluded((current) => new Set(current).add(exclusionKey(groupKey, recordId)));
	}, []);

	const runMerge = useCallback(
		async (acknowledged: boolean): Promise<void> => {
			if (pending === null) {
				return;
			}
			await merge({
				targetId: pending.target.id,
				sourceIds: pending.sources.map((record) => record.id),
				acknowledged,
			});
			toast.success(
				`Merged ${recordCountLabel(pending.sources.length, config)} into ${
					pending.target.label.trim() === '' ? config.unnamed : pending.target.label
				}.`,
			);
			await queryClient.invalidateQueries({
				queryKey: duplicateCandidatesQueryKey(recordType),
			});
		},
		[config, merge, pending, queryClient, recordType],
	);

	return (
		<div className={pageContainer({ gap: 'detail' })}>
			<PageHeader
				description={`Two records for one ${config.noun.one} split its history in half. This proposes the sets that look like duplicates and folds them into whichever one you keep.`}
				icon={MergeIcon}
				title="Cleanup Tools"
			/>

			<CleanupBody
				candidates={candidates}
				config={config}
				excluded={excluded}
				onExclude={exclude}
				onMerge={setPending}
				onSurvivorChange={(groupKey, recordId) =>
					setSurvivors((current) => ({ ...current, [groupKey]: recordId }))
				}
				survivors={survivors}
			/>

			{pending === null ? null : (
				<MergeConfirmDialog
					config={config}
					onConfirm={runMerge}
					onOpenChange={(open) => {
						if (!open) {
							setPending(null);
						}
					}}
					open={true}
					recordType={recordType}
					sources={pending.sources}
					target={pending.target}
				/>
			)}
		</div>
	);
}

function CleanupBody({
	candidates,
	config,
	excluded,
	onExclude,
	onMerge,
	onSurvivorChange,
	survivors,
}: {
	readonly candidates: ReturnType<typeof useDuplicateCandidates>;
	readonly config: (typeof RECORD_CLEANUP_CONFIGS)[MergeableRecordType];
	readonly excluded: ReadonlySet<string>;
	readonly onExclude: (groupKey: string, recordId: string) => void;
	readonly onMerge: (pending: PendingMerge) => void;
	readonly onSurvivorChange: (groupKey: string, recordId: string) => void;
	readonly survivors: Record<string, string>;
}) {
	if (candidates.isPending) {
		return <ListLoading rows={3} />;
	}

	if (candidates.isError) {
		return (
			<Alert variant="destructive">
				<AlertTitle>Could not look for duplicates</AlertTitle>
				<AlertDescription className="grid gap-3">
					<span>{candidates.error.message}</span>
					<Button
						className="justify-self-start"
						onClick={() => void candidates.refetch()}
						size="sm"
						variant="outline"
					>
						Try again
					</Button>
				</AlertDescription>
			</Alert>
		);
	}

	const groups = (candidates.data ?? []).filter((group) => liveRecords(group, excluded).length > 1);

	if (groups.length === 0) {
		return (
			<ListEmpty
				action={
					<Button asChild size="sm" variant="outline">
						<Link to={config.listTo}>Open the list</Link>
					</Button>
				}
				description={config.groupingRule}
				icon={config.icon}
				title={`No duplicate ${config.noun.many} found`}
			/>
		);
	}

	return (
		<div className="grid gap-4">
			{groups.map((group) => {
				const kept = liveRecords(group, excluded);
				const survivor = kept.find((record) => record.id === survivors[group.key]) ?? kept[0];
				return survivor === undefined ? null : (
					<DuplicateGroupPanel
						config={config}
						group={group}
						key={group.key}
						onExclude={(recordId) => onExclude(group.key, recordId)}
						onMerge={() =>
							onMerge({
								target: survivor,
								sources: kept.filter((record) => record.id !== survivor.id),
							})
						}
						onSurvivorChange={(recordId) => onSurvivorChange(group.key, recordId)}
						records={kept}
						survivorId={survivor.id}
					/>
				);
			})}
		</div>
	);
}

function liveRecords(
	group: DuplicateGroup,
	excluded: ReadonlySet<string>,
): readonly DuplicateRecord[] {
	return group.records.filter((record) => !excluded.has(exclusionKey(group.key, record.id)));
}

/** One record's standing in one group. The id leads, because a uuid never holds a pipe. */
function exclusionKey(groupKey: string, recordId: string): string {
	return `${recordId}|${groupKey}`;
}
