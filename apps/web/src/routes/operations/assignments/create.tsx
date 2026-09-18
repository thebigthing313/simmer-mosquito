import { PageHeader } from '@simmer-mosquito/ui-web/components/page';
import { pageContainer } from '@simmer-mosquito/ui-web/components/page-container';
import { stickyHeader } from '@simmer-mosquito/ui-web/components/sticky-header';
import { Alert, AlertDescription } from '@simmer-mosquito/ui-web/components/ui/alert';
import { Button } from '@simmer-mosquito/ui-web/components/ui/button';
import { Spinner } from '@simmer-mosquito/ui-web/components/ui/spinner';
import { ArrowLeftIcon } from '@simmer-mosquito/ui-web/icons/registry';
import { cn } from '@simmer-mosquito/ui-web/lib/utils';
import { createFileRoute, Link, redirect, useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { createLabel } from '../../../components/app-shell/navigation';
import type { RouteSummary } from '../../../components/route-planning/route-summary';
import { newRecordId } from '../../../hooks/mutations/shared';
import { useAssignmentMutations } from '../../../hooks/mutations/use-assignment-mutations';
import { useRouteCatalog, useRouteStopCounts } from '../../../hooks/queries/use-routes';
import { useOrganizationTimeZone } from '../../../hooks/use-organization-time-zone';
import { todayInTimeZone } from '../../../lib/local-date';
import { errorMessageForSave } from '../../../lib/save-error';
import { isBelowWriteFloor } from '../../../lib/write-surfaces';
import {
	useAssigneeOptions,
	useAssignment,
	useAssignmentItems,
	useRouteSnapshotItems,
} from './-assignment-data';
import {
	AssignmentDetailFields,
	type AssignmentDetailValues,
	applyGeneratedName,
	assigneeOrNull,
	assignmentNameOrNull,
	deadlineHalfEntered,
	defaultAssignmentDetails,
	RoutePicker,
	routeAssignmentName,
	toDueAt,
} from './-assignment-form';

export const Route = createFileRoute('/operations/assignments/create')({
	beforeLoad: async ({ context }) => {
		if (await isBelowWriteFloor(context, '/operations/assignments/create')) {
			throw redirect({ replace: true, to: '/operations/assignments' });
		}
	},
	component: AssignmentCreateRoute,
});

type Mode = 'blank' | 'route';

function AssignmentCreateRoute() {
	const navigate = useNavigate();
	const { create, createFromRoute, canWrite } = useAssignmentMutations();

	const timeZone = useOrganizationTimeZone();
	const today = todayInTimeZone(timeZone);
	// Minted up front so the streams below can be warmed against it before the
	// write lands (a write to a cold on-demand collection waits out its txid
	// confirmation, which reads as a frozen save).
	const [assignmentId] = useState(() => newRecordId());
	useAssignment(assignmentId);
	useAssignmentItems(assignmentId);

	const [mode, setMode] = useState<Mode>('blank');
	const [values, setValues] = useState<AssignmentDetailValues>(() =>
		defaultAssignmentDetails(today),
	);
	// The summary rather than its id, because the generated name is written
	// from the route's name at the moment the route is picked or the date
	// moves, and a lookup in the catalog by id would read a renamed route's new
	// name into a field the person may have already seen.
	const [route, setRoute] = useState<RouteSummary | null>(null);
	const routeId = route?.id ?? null;
	// What the form itself last wrote into the Name field, so the next
	// regeneration can tell an untouched field from a typed one by comparing
	// against it rather than by a flag (#1007). Empty when it has written
	// nothing, which is also what an empty field compares equal to.
	const [generatedName, setGeneratedName] = useState('');
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const { options: assigneeOptions } = useAssigneeOptions();
	const { routes: allRoutes } = useRouteCatalog();
	const { countByRouteId } = useRouteStopCounts();
	const { items: routeItems, isReady: routeItemsReady } = useRouteSnapshotItems(
		mode === 'route' ? routeId : null,
	);

	const routeStopCount = routeItems.length;
	// The server copies only route items present in the mapping, so submitting
	// before the subset resolves would quietly produce a short assignment.
	const routeReady =
		mode === 'blank' || (routeId !== null && routeItemsReady && routeStopCount > 0);
	// A deadline with one half missing is refused rather than guessed at: a time
	// on no day would save as no deadline, and the operator typed one.
	const canSubmit =
		canWrite &&
		values.assignmentDate !== '' &&
		!deadlineHalfEntered(values) &&
		routeReady &&
		!saving;

	// Every change that can move the generated name lands here: the route picked
	// or cleared, the mode switched, the date moved. The rule is applied once,
	// against the draft as it will be, and the field and the remembered string
	// are stored together so neither lags the other. Typing in the Name field
	// does not come through here, since that is the edit the rule protects.
	const settle = (nextMode: Mode, nextRoute: RouteSummary | null, next: AssignmentDetailValues) => {
		const generated =
			nextMode === 'route' && nextRoute !== null
				? routeAssignmentName(nextRoute.routeName, next.assignmentDate)
				: '';
		const applied = applyGeneratedName(next, generatedName, generated);
		setMode(nextMode);
		setRoute(nextRoute);
		setValues(applied.values);
		setGeneratedName(applied.generated);
	};

	const submit = async () => {
		if (!canSubmit) {
			return;
		}
		setSaving(true);
		setError(null);
		// Picked before the try rather than branched inside it: the React Compiler
		// bails on a whole component when a try block holds a branching expression
		// (#856), so the choice is made here and the try holds a plain test.
		const copiedRouteId = mode === 'route' ? routeId : null;
		try {
			const details = {
				assignmentDate: values.assignmentDate,
				assignmentName: assignmentNameOrNull(values),
				assignedToProfileId: assigneeOrNull(values),
				dueAt: toDueAt(values, timeZone),
			};
			if (copiedRouteId !== null) {
				await createFromRoute({
					assignmentId,
					routeId: copiedRouteId,
					details,
					// The stop's own target rides along so the new worklist can be drawn
					// before the server answers. Only the id pairing is sent — the server
					// reads each target out of the Route it is copying.
					stops: routeItems.map((item) => ({
						routeItemId: item.routeItemId,
						assignmentItemId: newRecordId(),
						entityType: item.entityType,
						entityId: item.entityId,
						directionsToNextItem: item.directionsToNextItem,
					})),
				});
			} else {
				await create(assignmentId, details);
			}
			// Straight to the planning surface: a new assignment with no stops is not
			// yet usable, and the list would just show an empty shell.
			await navigate({ to: '/operations/assignments/$id/edit', params: { id: assignmentId } });
		} catch (cause) {
			setError(errorMessageForSave(cause, 'Unable to create the assignment.'));
			setSaving(false);
		}
	};

	/*
	 * `record` is the measure the route-loading skeleton reserves, so the page
	 * arrives at the width it stood in for (#1043, #1046). The form carries
	 * its own 46rem below, so the frame is what widened. No scroller of its
	 * own: the shell's `main` scrolls the page and reserves the gutter the
	 * skeleton stands in (#1053), and the sticky header pins to `main`.
	 */
	return (
		<div className={pageContainer({ gap: 'detail', measure: 'record', padding: 'detail' })}>
			<div className={stickyHeader({ gap: 'tight', padding: 'none' })}>
				<Link
					className="inline-flex items-center gap-1.5 text-muted-foreground text-sm hover:text-foreground"
					to="/operations/assignments"
				>
					<ArrowLeftIcon aria-hidden="true" className="size-3.5" />
					Back to assignments
				</Link>
				<PageHeader
					description="Start empty and add stops, or snapshot the stops of an existing route."
					title={createLabel('assignment')}
				/>
			</div>

			<form
				className="grid max-w-[46rem] gap-6"
				onSubmit={(event) => {
					event.preventDefault();
					void submit();
				}}
			>
				<div className="flex gap-2">
					<ModeButton
						active={mode === 'blank'}
						label="Blank"
						onClick={() => settle('blank', route, values)}
					/>
					<ModeButton
						active={mode === 'route'}
						label="From a route"
						onClick={() => settle('route', route, values)}
					/>
				</div>

				{mode === 'route' ? (
					<div className="grid gap-2">
						<RoutePicker
							onSelect={(picked) => settle(mode, picked, values)}
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
					onChange={(next) =>
						// Only a moved date regenerates. Running the rule on every
						// keystroke would refill a field the person had just cleared.
						next.assignmentDate === values.assignmentDate
							? setValues(next)
							: settle(mode, route, next)
					}
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
						Save
					</Button>
				</div>
			</form>
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
