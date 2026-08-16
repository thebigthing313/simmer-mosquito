import { type CommentTargetType, toDbEntityType } from '@simmer-mosquito/domain';
import type { CommentRow } from '@simmer-mosquito/sync';
import { settleWrite } from '@simmer-mosquito/sync';
import { Alert, AlertDescription } from '@simmer-mosquito/ui-web/components/ui/alert';
import { Avatar, AvatarFallback } from '@simmer-mosquito/ui-web/components/ui/avatar';
import { Badge } from '@simmer-mosquito/ui-web/components/ui/badge';
import { Button } from '@simmer-mosquito/ui-web/components/ui/button';
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from '@simmer-mosquito/ui-web/components/ui/card';
import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from '@simmer-mosquito/ui-web/components/ui/empty';
import { Separator } from '@simmer-mosquito/ui-web/components/ui/separator';
import { Skeleton } from '@simmer-mosquito/ui-web/components/ui/skeleton';
import { Textarea } from '@simmer-mosquito/ui-web/components/ui/textarea';
import { iconRegistry } from '@simmer-mosquito/ui-web/icons/registry';
import { cn } from '@simmer-mosquito/ui-web/lib/utils';
import { and, eq, or, useLiveQuery } from '@tanstack/react-db';
import { type KeyboardEvent, useCallback, useMemo, useState } from 'react';
import { useProfileNames } from '../hooks/queries/use-profile-names';
import { useAuthSnapshot } from '../hooks/use-auth-snapshot';
import { useOrganizationTimeZone } from '../hooks/use-organization-time-zone';
import { webCollections } from '../sync/webCollections';

const CommentIcon = iconRegistry.actions.comment.icon;
const PinIcon = iconRegistry.actions.pin.icon;
const UnpinIcon = iconRegistry.actions.unpin.icon;
const EditIcon = iconRegistry.actions.edit.icon;
const DeleteIcon = iconRegistry.actions.delete.icon;
const CheckIcon = iconRegistry.actions.check.icon;
const SendIcon = iconRegistry.actions.send.icon;
const SpinnerIcon = iconRegistry.actions.loading.icon;

// The comments shape is on-demand (ADR 0009 / docs/sync.md); keep the entity's
// subset warm briefly after unmount so revisiting a record reuses it.
const commentsGcTimeMs = 30_000;
// Roles that may not author or curate comments — they get a read-only thread.
const readOnlyRoles = new Set(['viewer']);

type MutableCommentRow = { -readonly [Key in keyof CommentRow]: CommentRow[Key] };

export interface CommentsSectionProps {
	/** The record this thread is attached to (drives sync scope + new comments). */
	readonly target: { readonly type: CommentTargetType; readonly id: string };
	/** Card heading. Defaults to "Comments". */
	readonly title?: string;
	/** Supporting line under the heading. */
	readonly description?: string;
	/** Composer placeholder. */
	readonly placeholder?: string;
	/** Layout-only classes for the wrapping card (e.g. sticky-rail behavior). */
	readonly className?: string;
}

/**
 * Self-contained, reusable comment thread for any commentable record.
 *
 * Loads the entity's comments from the on-demand `comments` collection,
 * resolves authors from the eager `profiles` collection, and dispatches
 * add / edit / pin / delete through the optimistic comment mutation handlers.
 * The only required prop is {@link CommentsSectionProps.target}; drop it beside
 * any record detail surface.
 */
export function CommentsSection({
	target,
	title = 'Comments',
	description = 'Notes and field context for this record.',
	placeholder = 'Add a comment…',
	className,
}: CommentsSectionProps) {
	const auth = useAuthSnapshot();
	const identity = auth?.authenticated === true ? auth.localIdentity : null;
	const currentProfileId = identity?.profileId ?? null;
	const organizationId = identity?.organizationId ?? null;
	const role = identity?.role ?? null;
	const canComment =
		currentProfileId !== null &&
		organizationId !== null &&
		!(role !== null && readOnlyRoles.has(role));

	const commentsResult = useLiveQuery(
		{
			gcTime: commentsGcTimeMs,
			query: (query) =>
				query
					.from({ comment: webCollections.comments })
					// The DB stores entity_type in snake_case; match that (persisted rows) and
					// the camelCase target (the transient optimistic row) so a just-added
					// comment still shows instantly. See toDbEntityType.
					.where(({ comment }) =>
						and(
							or(
								eq(comment.entityType, target.type),
								eq(comment.entityType, toDbEntityType(target.type)),
							),
							eq(comment.entityId, target.id),
						),
					)
					.orderBy(({ comment }) => comment.commentedAt, 'desc'),
		},
		[target.type, target.id],
	);

	// profiles is an eager baseline collection, so this is cheap and does not
	// suspend the whole rail while names resolve.
	const profileNameById = useProfileNames();

	const comments = (commentsResult.data ?? []) as readonly CommentRow[];
	const { pinned, unpinned } = useMemo(() => partitionByPin(comments), [comments]);

	const [error, setError] = useState<string | null>(null);
	// The id of the just-added comment, so only it plays the entrance animation
	// instead of the whole list animating on every mount (the AI "reveal reflex").
	const [enteredId, setEnteredId] = useState<string | null>(null);

	const handleAdd = useCallback(
		async (text: string) => {
			if (currentProfileId === null || organizationId === null) {
				return;
			}
			setError(null);
			const now = new Date().toISOString();
			const row: CommentRow = {
				id: crypto.randomUUID(),
				organizationId,
				entityType: target.type,
				entityId: target.id,
				commentText: text,
				commentedByProfileId: currentProfileId,
				commentedAt: now,
				isPinned: false,
				createdByProfileId: currentProfileId,
				updatedByProfileId: currentProfileId,
				createdAt: now,
				updatedAt: now,
			};
			setEnteredId(row.id);
			await settleWrite(webCollections.comments.insert(row));
		},
		[currentProfileId, organizationId, target.type, target.id],
	);

	const handleEdit = useCallback(async (commentId: string, text: string) => {
		setError(null);
		await settleWrite(
			webCollections.comments.update(commentId, (draft) => {
				(draft as MutableCommentRow).commentText = text;
			}),
		);
	}, []);

	const handleTogglePin = useCallback(async (comment: CommentRow) => {
		setError(null);
		try {
			await settleWrite(
				webCollections.comments.update(comment.id, (draft) => {
					(draft as MutableCommentRow).isPinned = !comment.isPinned;
				}),
			);
		} catch (cause) {
			setError(
				messageOf(cause, comment.isPinned ? 'Unable to unpin comment.' : 'Unable to pin comment.'),
			);
		}
	}, []);

	const handleDelete = useCallback(async (commentId: string) => {
		setError(null);
		await settleWrite(webCollections.comments.delete(commentId));
	}, []);

	const renderComment = (comment: CommentRow) => (
		<CommentItem
			key={comment.id}
			authorName={authorName(profileNameById.get(comment.commentedByProfileId ?? ''))}
			canPin={canComment}
			comment={comment}
			isAuthor={canComment && comment.commentedByProfileId === currentProfileId}
			isEntering={comment.id === enteredId}
			onDelete={handleDelete}
			onEdit={handleEdit}
			onError={setError}
			onTogglePin={handleTogglePin}
		/>
	);

	const isLoading = !commentsResult.isReady && !commentsResult.isError;
	const hasComments = comments.length > 0;

	return (
		<Card className={cn('flex flex-col', className)} variant="surface">
			<CardHeader className="px-4 py-4">
				<div className="flex items-start justify-between gap-3">
					<div className="grid gap-1">
						<CardTitle className="flex items-center gap-2">
							<CommentIcon aria-hidden="true" className="size-4 text-muted-foreground" />
							{title}
						</CardTitle>
						<CardDescription>{description}</CardDescription>
					</div>
					{hasComments ? (
						<Badge tone="neutral" variant="outline">
							{comments.length}
						</Badge>
					) : null}
				</div>
			</CardHeader>
			<CardContent className="flex min-h-0 flex-1 flex-col gap-4" padding="compact">
				{canComment ? (
					<CommentComposer
						initials={initialsFor(auth?.authenticated === true ? auth.user.displayName : null)}
						onError={setError}
						onSubmit={handleAdd}
						placeholder={placeholder}
					/>
				) : null}

				{error !== null ? (
					<Alert variant="destructive">
						<AlertDescription>{error}</AlertDescription>
					</Alert>
				) : null}

				{commentsResult.isError ? (
					<CommentsEmpty
						description="Comments could not be loaded. Try again shortly."
						title="Comments Unavailable"
					/>
				) : isLoading ? (
					<CommentsLoading />
				) : hasComments ? (
					<div className="-mx-1 flex min-h-0 flex-1 flex-col overflow-y-auto px-1">
						{pinned.map(renderComment)}
						{pinned.length > 0 && unpinned.length > 0 ? <Separator className="my-1.5" /> : null}
						{unpinned.map(renderComment)}
					</div>
				) : (
					<CommentsEmpty
						description={
							canComment
								? 'Start the thread — leave access notes, field context, or a status update.'
								: 'No one has commented on this record yet.'
						}
						title="No Comments Yet"
					/>
				)}
			</CardContent>
		</Card>
	);
}

function CommentComposer({
	initials,
	placeholder,
	onSubmit,
	onError,
}: {
	readonly initials: string;
	readonly placeholder: string;
	readonly onSubmit: (text: string) => Promise<void>;
	readonly onError: (message: string) => void;
}) {
	const [value, setValue] = useState('');
	const [submitting, setSubmitting] = useState(false);
	const trimmed = value.trim();
	const canSubmit = trimmed.length > 0 && !submitting;

	const submit = async () => {
		if (trimmed.length === 0 || submitting) {
			return;
		}
		setSubmitting(true);
		setValue('');
		try {
			await onSubmit(trimmed);
		} catch (cause) {
			// Restore the draft so a transient failure never loses the user's text.
			setValue(trimmed);
			onError(messageOf(cause, 'Unable to add comment.'));
		} finally {
			setSubmitting(false);
		}
	};

	const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
		if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
			event.preventDefault();
			void submit();
		}
	};

	return (
		<form
			className="flex gap-3"
			onSubmit={(event) => {
				event.preventDefault();
				void submit();
			}}
		>
			<Avatar className="mt-0.5" size="sm">
				<AvatarFallback>{initials}</AvatarFallback>
			</Avatar>
			<div className="grid flex-1 gap-2">
				<Textarea
					aria-label="Add a comment"
					className="min-h-10 resize-none"
					disabled={submitting}
					onChange={(event) => setValue(event.target.value)}
					onKeyDown={handleKeyDown}
					placeholder={placeholder}
					rows={2}
					value={value}
				/>
				<div className="flex items-center justify-end gap-3">
					<span className="hidden text-xs text-muted-foreground sm:inline">
						<kbd className="font-sans">⌘</kbd>
						<kbd className="font-sans">↵</kbd> to send
					</span>
					<Button disabled={!canSubmit} size="sm" type="submit">
						{submitting ? (
							<SpinnerIcon aria-hidden="true" className="animate-spin" />
						) : (
							<SendIcon aria-hidden="true" />
						)}
						Comment
					</Button>
				</div>
			</div>
		</form>
	);
}

function CommentItem({
	comment,
	authorName,
	isAuthor,
	canPin,
	isEntering,
	onEdit,
	onTogglePin,
	onDelete,
	onError,
}: {
	readonly comment: CommentRow;
	readonly authorName: string;
	readonly isAuthor: boolean;
	readonly canPin: boolean;
	readonly isEntering: boolean;
	readonly onEdit: (commentId: string, text: string) => Promise<void>;
	readonly onTogglePin: (comment: CommentRow) => Promise<void>;
	readonly onDelete: (commentId: string) => Promise<void>;
	readonly onError: (message: string) => void;
}) {
	const [mode, setMode] = useState<'view' | 'edit' | 'confirm-delete'>('view');
	const [editValue, setEditValue] = useState(comment.commentText);
	const [busy, setBusy] = useState(false);
	const timeZone = useOrganizationTimeZone();

	const startEdit = () => {
		setEditValue(comment.commentText);
		setMode('edit');
	};

	const saveEdit = async () => {
		const next = editValue.trim();
		if (next.length === 0 || busy) {
			return;
		}
		if (next === comment.commentText) {
			setMode('view');
			return;
		}
		setBusy(true);
		try {
			await onEdit(comment.id, next);
			setMode('view');
		} catch (cause) {
			onError(messageOf(cause, 'Unable to save comment.'));
		} finally {
			setBusy(false);
		}
	};

	const confirmDelete = async () => {
		if (busy) {
			return;
		}
		setBusy(true);
		try {
			await onDelete(comment.id);
		} catch (cause) {
			setMode('view');
			onError(messageOf(cause, 'Unable to delete comment.'));
		} finally {
			setBusy(false);
		}
	};

	const handleEditKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
		if (event.key === 'Escape') {
			event.preventDefault();
			setMode('view');
		}
		if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
			event.preventDefault();
			void saveEdit();
		}
	};

	return (
		<div
			className={cn(
				'group/comment relative flex gap-3 rounded-md px-2 py-2.5',
				comment.isPinned && 'bg-accent/30',
				isEntering &&
					'duration-200 animate-in fade-in-0 slide-in-from-bottom-1 motion-reduce:animate-none',
			)}
		>
			<Avatar className="mt-0.5" size="sm">
				<AvatarFallback>{initialsFor(authorName)}</AvatarFallback>
			</Avatar>
			<div className="grid min-w-0 flex-1 gap-1.5">
				<div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 pr-14">
					<span className="truncate text-sm font-semibold text-foreground">{authorName}</span>
					{comment.isPinned ? (
						<PinIcon
							aria-label="Pinned"
							className="size-3 shrink-0 text-muted-foreground"
							role="img"
						/>
					) : null}
					<span
						className="text-xs text-muted-foreground"
						title={absoluteTime(comment.commentedAt, timeZone)}
					>
						{relativeTime(comment.commentedAt, timeZone)}
					</span>
				</div>

				{mode === 'edit' ? (
					<div className="grid gap-2">
						<Textarea
							aria-label="Edit comment"
							autoFocus
							className="min-h-10 resize-none"
							disabled={busy}
							onChange={(event) => setEditValue(event.target.value)}
							onKeyDown={handleEditKeyDown}
							value={editValue}
						/>
						<div className="flex items-center gap-2">
							<Button disabled={editValue.trim().length === 0 || busy} onClick={saveEdit} size="xs">
								<CheckIcon aria-hidden="true" />
								Save
							</Button>
							<Button onClick={() => setMode('view')} size="xs" type="button" variant="ghost">
								Cancel
							</Button>
						</div>
					</div>
				) : (
					<p className="m-0 text-sm break-words whitespace-pre-wrap text-foreground/90">
						{comment.commentText}
					</p>
				)}

				{mode === 'confirm-delete' ? (
					<div className="mt-0.5 flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-2.5 py-1.5 text-sm">
						<span className="text-muted-foreground">Delete this comment?</span>
						<div className="ml-auto flex gap-1.5">
							<Button disabled={busy} onClick={confirmDelete} size="xs" variant="destructive">
								Delete
							</Button>
							<Button
								disabled={busy}
								onClick={() => setMode('view')}
								size="xs"
								type="button"
								variant="ghost"
							>
								Cancel
							</Button>
						</div>
					</div>
				) : null}
			</div>

			{mode === 'view' && (canPin || isAuthor) ? (
				<div className="absolute top-1.5 right-1.5 flex items-center gap-0.5 rounded-md border border-border/60 bg-card opacity-0 transition-opacity duration-150 group-focus-within/comment:opacity-100 group-hover/comment:opacity-100 [@media(hover:none)]:opacity-100">
					{canPin ? (
						<Button
							aria-label={comment.isPinned ? 'Unpin comment' : 'Pin comment'}
							onClick={() => void onTogglePin(comment)}
							size="icon-xs"
							title={comment.isPinned ? 'Unpin comment' : 'Pin comment'}
							variant="ghost"
						>
							{comment.isPinned ? <UnpinIcon aria-hidden="true" /> : <PinIcon aria-hidden="true" />}
						</Button>
					) : null}
					{isAuthor ? (
						<>
							<Button
								aria-label="Edit comment"
								onClick={startEdit}
								size="icon-xs"
								title="Edit Comment"
								variant="ghost"
							>
								<EditIcon aria-hidden="true" />
							</Button>
							<Button
								aria-label="Delete comment"
								className="text-muted-foreground hover:text-destructive"
								onClick={() => setMode('confirm-delete')}
								size="icon-xs"
								title="Delete Comment"
								variant="ghost"
							>
								<DeleteIcon aria-hidden="true" />
							</Button>
						</>
					) : null}
				</div>
			) : null}
		</div>
	);
}

function CommentsEmpty({
	title,
	description,
}: {
	readonly title: string;
	readonly description: string;
}) {
	return (
		<Empty className="min-h-[160px] flex-1 border border-border/40 bg-muted/30">
			<EmptyHeader>
				<EmptyMedia variant="icon">
					<CommentIcon aria-hidden="true" />
				</EmptyMedia>
				<EmptyTitle>{title}</EmptyTitle>
				<EmptyDescription>{description}</EmptyDescription>
			</EmptyHeader>
		</Empty>
	);
}

function CommentsLoading() {
	return (
		<div className="grid gap-3" aria-hidden="true">
			{[0, 1, 2].map((index) => (
				<div className="flex gap-3" key={index}>
					<Skeleton className="size-6 shrink-0 rounded-full" />
					<div className="grid flex-1 gap-1.5">
						<Skeleton className="h-3.5 w-32" />
						<Skeleton className="h-3.5 w-full" />
						<Skeleton className="h-3.5 w-3/5" />
					</div>
				</div>
			))}
		</div>
	);
}

function partitionByPin(comments: readonly CommentRow[]): {
	readonly pinned: readonly CommentRow[];
	readonly unpinned: readonly CommentRow[];
} {
	const pinned: CommentRow[] = [];
	const unpinned: CommentRow[] = [];
	for (const comment of comments) {
		(comment.isPinned ? pinned : unpinned).push(comment);
	}
	return { pinned, unpinned };
}

function authorName(displayName: string | undefined): string {
	const name = displayName?.trim();
	return name && name.length > 0 ? name : 'Unknown';
}

function initialsFor(name: string | null): string {
	const parts = (name ?? '').trim().split(/\s+/).filter(Boolean);
	if (parts.length === 0) {
		return '?';
	}
	const first = parts[0]?.[0] ?? '';
	const last = parts.length > 1 ? (parts.at(-1)?.[0] ?? '') : '';
	return (first + last).toUpperCase() || '?';
}

/**
 * How long ago a comment was left.
 *
 * The durations — "3m ago", "2d ago" — are zone-free by construction: an
 * elapsed span is the same number wherever it is read. Past a week this falls
 * back to naming the day, and a named day does need a zone, so the agency's is
 * the one that names it.
 */
function relativeTime(value: string, timeZone: string | undefined): string {
	const then = new Date(value).getTime();
	if (Number.isNaN(then)) {
		return '';
	}
	const seconds = Math.round((Date.now() - then) / 1000);
	if (seconds < 45) {
		return 'just now';
	}
	const minutes = Math.round(seconds / 60);
	if (minutes < 60) {
		return `${minutes}m ago`;
	}
	const hours = Math.round(minutes / 60);
	if (hours < 24) {
		return `${hours}h ago`;
	}
	const days = Math.round(hours / 24);
	if (days < 7) {
		return `${days}d ago`;
	}
	// The year is dropped inside the current one. Which year each falls in is
	// itself a zone question, so both are read in the agency's — otherwise a
	// comment left on New Year's Eve is "in this year" to one reader and not the
	// other.
	const zone = timeZone === undefined ? {} : { timeZone };
	const yearOf = (at: number): string =>
		new Intl.DateTimeFormat('en-US', { ...zone, year: 'numeric' }).format(at);
	return new Intl.DateTimeFormat(undefined, {
		...zone,
		day: 'numeric',
		month: 'short',
		year: yearOf(then) === yearOf(Date.now()) ? undefined : 'numeric',
	}).format(then);
}

/** The full timestamp behind {@link relativeTime}, on the agency's clock. */
function absoluteTime(value: string, timeZone: string | undefined): string {
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) {
		return '';
	}
	return new Intl.DateTimeFormat(undefined, {
		day: 'numeric',
		month: 'short',
		year: 'numeric',
		hour: 'numeric',
		minute: '2-digit',
		...(timeZone === undefined ? {} : { timeZone }),
	}).format(date);
}

function messageOf(cause: unknown, fallback: string): string {
	return cause instanceof Error && cause.message.length > 0 ? cause.message : fallback;
}
