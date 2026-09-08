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
import { type MergeFieldUpdates, useRecordMerge } from '../../hooks/mutations/use-record-merge';
import {
	type DuplicateGroup,
	type DuplicateReason,
	type DuplicateRecord,
	type DuplicateRecordType,
	duplicateCandidatesQueryKey,
	useDuplicateCandidates,
} from '../../hooks/use-merge-candidates';
import { DuplicateGroupPanel } from './duplicate-group-panel';
import { MatchTypeFilter } from './match-type-filter';
import { MergeConfirmDialog } from './merge-confirm-dialog';
import {
	DUPLICATE_PAGE_CONFIGS,
	type DuplicatePageConfig,
	RECORD_CLEANUP_CONFIGS,
	type RecordCleanupConfig,
	recordCountLabel,
	recordLabel,
} from './record-cleanup-config';

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
export function RecordCleanup({ recordType }: { readonly recordType: DuplicateRecordType }) {
	const config = RECORD_CLEANUP_CONFIGS[recordType];
	const pageConfig = DUPLICATE_PAGE_CONFIGS[recordType];
	const candidates = useDuplicateCandidates(recordType);
	const merge = useRecordMerge(recordType);
	const queryClient = useQueryClient();

	const [survivors, setSurvivors] = useState<Record<string, string>>({});
	const [excluded, setExcluded] = useState<ReadonlySet<string>>(() => new Set());
	const [pending, setPending] = useState<PendingMerge | null>(null);
	/*
	 * Held here rather than in the URL, like every other choice on this page.
	 * Which records are refused and which one survives are local too, and a link
	 * that restored the filter but not those would come back as a different page
	 * from the one that was shared.
	 */
	const [matchTypes, setMatchTypes] = useState<ReadonlySet<DuplicateReason>>(() => new Set());
	const clearMatchTypes = useCallback(() => setMatchTypes(new Set()), []);

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
		async (acknowledged: boolean, fieldUpdates: MergeFieldUpdates): Promise<void> => {
			if (pending === null) {
				return;
			}
			await merge({
				targetId: pending.target.id,
				sourceIds: pending.sources.map((record) => record.id),
				acknowledged,
				fieldUpdates,
			});
			toast.success(
				`Merged ${recordCountLabel(pending.sources.length, config)} into ${recordLabel(
					pending.target,
					config,
				)}.`,
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

			{candidates.data === undefined || candidates.data.length === 0 ? null : (
				<div className="flex justify-end">
					<MatchTypeFilter
						config={pageConfig}
						groups={candidates.data}
						onChange={setMatchTypes}
						selected={matchTypes}
					/>
				</div>
			)}

			<CleanupBody
				candidates={candidates}
				config={config}
				excluded={excluded}
				pageConfig={pageConfig}
				matchTypes={matchTypes}
				onClearMatchTypes={clearMatchTypes}
				onExclude={exclude}
				onMerge={setPending}
				onSurvivorChange={(groupKey, recordId) =>
					setSurvivors((current) => ({ ...current, [groupKey]: recordId }))
				}
				recordType={recordType}
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
	matchTypes,
	pageConfig,
	onClearMatchTypes,
	onExclude,
	onMerge,
	onSurvivorChange,
	recordType,
	survivors,
}: {
	readonly candidates: ReturnType<typeof useDuplicateCandidates>;
	readonly config: RecordCleanupConfig;
	readonly pageConfig: DuplicatePageConfig;
	readonly excluded: ReadonlySet<string>;
	readonly matchTypes: ReadonlySet<DuplicateReason>;
	readonly onClearMatchTypes: () => void;
	readonly onExclude: (groupKey: string, recordId: string) => void;
	readonly onMerge: (pending: PendingMerge) => void;
	readonly onSurvivorChange: (groupKey: string, recordId: string) => void;
	readonly recordType: DuplicateRecordType;
	readonly survivors: Record<string, string>;
}) {
	if (candidates.isPending) {
		return <ListLoading rows={3} />;
	}

	if (candidates.isError) {
		return <CleanupFailure message={candidates.error.message} onRetry={candidates.refetch} />;
	}

	const proposed = (candidates.data ?? []).filter(
		(group) => liveRecords(group, excluded).length > 1,
	);
	const groups = proposed.filter((group) => matchTypes.size === 0 || matchTypes.has(group.reason));

	if (groups.length === 0) {
		return (
			<CleanupEmpty
				config={config}
				pageConfig={pageConfig}
				// Two different answers. "Nothing matched" is a fact about the records;
				// "nothing matched this way" is a fact about the filter, and offering
				// the address list to somebody who has only hidden the phone groups
				// sends them away from the page that was about to answer them.
				isFiltered={matchTypes.size > 0 && proposed.length > 0}
				onClearMatchTypes={onClearMatchTypes}
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
						recordType={recordType}
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

/** The read failed, which is not the same as finding no duplicates. */
function CleanupFailure({
	message,
	onRetry,
}: {
	readonly message: string;
	readonly onRetry: () => void;
}) {
	return (
		<Alert variant="destructive">
			<AlertTitle>Could not look for duplicates</AlertTitle>
			<AlertDescription className="grid gap-3">
				<span>{message}</span>
				<Button
					className="justify-self-start"
					onClick={() => void onRetry()}
					size="sm"
					variant="outline"
				>
					Try again
				</Button>
			</AlertDescription>
		</Alert>
	);
}

/**
 * Nothing to propose, said two ways.
 *
 * A page that found no duplicates has to say what it looked for, or "no
 * duplicates" reads as "this tool does nothing". A page emptied by its own
 * filter has to say that instead, and offer the way back rather than a link off
 * to the list.
 */
function CleanupEmpty({
	config,
	isFiltered,
	pageConfig,
	onClearMatchTypes,
}: {
	readonly config: RecordCleanupConfig;
	readonly pageConfig: DuplicatePageConfig;
	readonly isFiltered: boolean;
	readonly onClearMatchTypes: () => void;
}) {
	return (
		<ListEmpty
			action={
				<Button asChild size="sm" variant="outline">
					{isFiltered ? (
						<button onClick={onClearMatchTypes} type="button">
							Show all match types
						</button>
					) : (
						<Link to={config.listTo}>Open the list</Link>
					)}
				</Button>
			}
			description={isFiltered ? undefined : pageConfig.groupingRule}
			icon={config.icon}
			title={
				isFiltered
					? `No duplicate ${config.noun.many} of this kind`
					: `No duplicate ${config.noun.many} found`
			}
		/>
	);
}
