import type { AssignmentRow, RouteRow } from '@simmer-mosquito/sync';
import { pageContainer } from '@simmer-mosquito/ui-web/components/page-container';
import { stickyHeader } from '@simmer-mosquito/ui-web/components/sticky-header';
import { Alert, AlertDescription } from '@simmer-mosquito/ui-web/components/ui/alert';
import { Button } from '@simmer-mosquito/ui-web/components/ui/button';
import { Spinner } from '@simmer-mosquito/ui-web/components/ui/spinner';
import { ArrowLeftIcon } from '@simmer-mosquito/ui-web/icons/registry';
import { cn } from '@simmer-mosquito/ui-web/lib/utils';
import { createFileRoute, Link, redirect, useNavigate } from '@tanstack/react-router';
import { useCallback, useMemo, useState } from 'react';
import { useAuthSnapshot } from '../../../hooks/use-auth-snapshot';
import { useCollectionRows } from '../../../hooks/use-collection-rows';
import { isWriteBlocked } from '../../../lib/write-access';
import { settleWrite } from '../../../sync/settle-write';
import { webCollections } from '../../../sync/webCollections';
import { todayDateValue } from '../../control-operations/-control-display';
import { useRouteStopCounts } from '../../larval-surveillance/habitats/-route-data';
import {
	createAssignmentFromRoute,
	useAssigneeOptions,
	useAssignment,
	useAssignmentItems,
	useRouteSnapshotItems,
} from './-assignment-data';
import {
	AssignmentDetailFields,
	type AssignmentDetailValues,
	assigneeOrNull,
	assignmentNameOrNull,
	defaultAssignmentDetails,
	RoutePicker,
	toDueAt,
} from './-assignment-form';

export const Route = createFileRoute('/operations/assignments/create')({
	beforeLoad: async ({ context }) => {
		if (await isWriteBlocked(context)) {
			throw redirect({ replace: true, to: '/operations/assignments' });
		}
	},
	component: AssignmentCreateRoute,
});

type Mode = 'blank' | 'route';

function AssignmentCreateRoute() {
	const navigate = useNavigate();
	const auth = useAuthSnapshot();
	const identity = auth?.authenticated === true ? auth.localIdentity : null;
	const organizationId = identity?.organizationId ?? null;

	const today = useMemo(() => todayDateValue(), []);
	// Minted up front so the streams below can be warmed against it before the
	// write lands (a write to a cold on-demand collection waits out its txid
	// confirmation, which reads as a frozen save).
	const [assignmentId] = useState(() => crypto.randomUUID());
	useAssignment(assignmentId);
	useAssignmentItems(assignmentId);

	const [mode, setMode] = useState<Mode>('blank');
	const [values, setValues] = useState<AssignmentDetailValues>(() =>
		defaultAssignmentDetails(today),
	);
	const [routeId, setRouteId] = useState<string | null>(null);
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const { options: assigneeOptions } = useAssigneeOptions();
	const { rows: allRoutes } = useCollectionRows<RouteRow>(webCollections.routes);
	const { countByRouteId } = useRouteStopCounts();
	const { items: routeItems, isReady: routeItemsReady } = useRouteSnapshotItems(
		mode === 'route' ? routeId : null,
	);

	const routeStopCount = routeItems.length;
	// The server copies only route items present in the mapping, so submitting
	// before the subset resolves would quietly produce a short assignment.
	const routeReady =
		mode === 'blank' || (routeId !== null && routeItemsReady && routeStopCount > 0);
	const canSubmit =
		organizationId !== null && values.assignmentDate !== '' && routeReady && !saving;

	const submit = useCallback(async () => {
		if (organizationId === null || !canSubmit) {
			return;
		}
		setSaving(true);
		setError(null);
		try {
			if (mode === 'route' && routeId !== null) {
				await createAssignmentFromRoute({
					assignmentId,
					routeId,
					assignmentDate: values.assignmentDate,
					assignmentName: assignmentNameOrNull(values),
					assignedToProfileId: assigneeOrNull(values),
					dueAt: toDueAt(values),
					assignmentItemIds: routeItems.map((item) => ({
						routeItemId: item.id,
						assignmentItemId: crypto.randomUUID(),
					})),
				});
			} else {
				const now = new Date().toISOString();
				const row: AssignmentRow = {
					id: assignmentId,
					organizationId,
					assignmentName: assignmentNameOrNull(values),
					assignedToProfileId: assigneeOrNull(values),
					// Mirrors what the server records, so the row does not flicker.
					assignedByProfileId: identity?.profileId ?? null,
					assignmentDate: values.assignmentDate,
					dueAt: toDueAt(values),
					startedAt: null,
					completedAt: null,
					cancelledAt: null,
					cancellationReason: null,
					createdByProfileId: identity?.profileId ?? null,
					updatedByProfileId: identity?.profileId ?? null,
					createdAt: now,
					updatedAt: now,
				};
				await settleWrite(webCollections.assignments.insert(row));
			}
			// Straight to the planning surface: a new assignment with no stops is not
			// yet usable, and the list would just show an empty shell.
			await navigate({ to: '/operations/assignments/$id/edit', params: { id: assignmentId } });
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : 'Unable to create the assignment.');
			setSaving(false);
		}
	}, [
		organizationId,
		canSubmit,
		mode,
		routeId,
		routeItems,
		values,
		assignmentId,
		identity,
		navigate,
	]);

	return (
		<div className="h-full min-h-0 overflow-y-auto">
			<div className={pageContainer({ gap: 'detail', padding: 'detail' })}>
				<div className={stickyHeader({ gap: 'tight', padding: 'none' })}>
					<Link
						className="inline-flex items-center gap-1.5 text-muted-foreground text-sm hover:text-foreground"
						to="/operations/assignments"
					>
						<ArrowLeftIcon aria-hidden="true" className="size-3.5" />
						Back to assignments
					</Link>
					<h1 className="m-0 font-semibold text-2xl text-foreground leading-tight tracking-tight">
						New Assignment
					</h1>
					<p className="m-0 max-w-[68ch] text-muted-foreground text-sm">
						Start empty and add stops, or snapshot the stops of an existing route.
					</p>
				</div>

				<form
					className="grid max-w-[46rem] gap-6"
					onSubmit={(event) => {
						event.preventDefault();
						void submit();
					}}
				>
					<div className="flex gap-2">
						<ModeButton active={mode === 'blank'} label="Blank" onClick={() => setMode('blank')} />
						<ModeButton
							active={mode === 'route'}
							label="From a route"
							onClick={() => setMode('route')}
						/>
					</div>

					{mode === 'route' ? (
						<div className="grid gap-2">
							<RoutePicker
								onSelect={(route) => setRouteId(route?.id ?? null)}
								routes={allRoutes}
								stopCountById={countByRouteId}
								value={routeId}
							/>
							{routeId === null ? null : (
								<p className="m-0 text-muted-foreground text-xs">
									{routeItemsReady
										? `${routeStopCount === 1 ? '1 stop' : `${routeStopCount} stops`} will be copied in order.`
										: 'Loading this route’s stops…'}
								</p>
							)}
						</div>
					) : null}

					<AssignmentDetailFields
						assigneeOptions={assigneeOptions}
						disabled={saving}
						onChange={setValues}
						values={values}
					/>

					{error === null ? null : (
						<Alert variant="destructive">
							<AlertDescription>{error}</AlertDescription>
						</Alert>
					)}

					<div className="flex justify-end gap-2 border-border/50 border-t pt-5">
						<Button asChild size="sm" variant="ghost">
							<Link to="/operations/assignments">Cancel</Link>
						</Button>
						<Button disabled={!canSubmit} size="sm" type="submit">
							{saving ? <Spinner /> : null}
							Create Assignment
						</Button>
					</div>
				</form>
			</div>
		</div>
	);
}

function ModeButton({
	active,
	label,
	onClick,
}: {
	readonly active: boolean;
	readonly label: string;
	readonly onClick: () => void;
}) {
	return (
		<button
			aria-pressed={active}
			className={cn(
				'rounded-md border px-3 py-1.5 font-medium text-sm transition-colors',
				active
					? 'border-primary bg-primary/10 text-foreground'
					: 'border-border text-muted-foreground hover:text-foreground',
			)}
			onClick={onClick}
			type="button"
		>
			{label}
		</button>
	);
}
