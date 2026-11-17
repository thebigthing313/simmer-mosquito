import type { ControlType } from '@simmer-mosquito/domain';
import { PanelRows } from '@simmer-mosquito/ui-web/components/panel-rows';
import { recordLink } from '@simmer-mosquito/ui-web/components/record-link';
import { Badge } from '@simmer-mosquito/ui-web/components/ui/badge';
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from '@simmer-mosquito/ui-web/components/ui/card';
import { iconRegistry } from '@simmer-mosquito/ui-web/icons/registry';
import { cn } from '@simmer-mosquito/ui-web/lib/utils';
import { Link } from '@tanstack/react-router';
import {
	type LinkedControlAction,
	useLinkedControlActions,
} from '../../../hooks/queries/use-linked-control-actions';
import { formatAmount } from '../../../lib/format-count';
import { formatMonthDayYear } from '../../../lib/record-dates';
import { recordNoun } from '../../../lib/record-nouns';

const ControlIcon = iconRegistry.domains.controlOperations.icon;

type ActionTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger';

const actionKindMeta: Record<
	LinkedControlAction['kind'],
	{ readonly label: string; readonly tone: ActionTone }
> = {
	application: { label: recordNoun('treatment').title, tone: 'info' },
	sourceReduction: { label: 'Source reduction', tone: 'success' },
	outreachAction: { label: 'Outreach', tone: 'neutral' },
	biocontrolAction: { label: 'Biocontrol', tone: 'info' },
	requestedControlAction: { label: 'Control request', tone: 'warning' },
};

/** Where each linked action's own page is. A Treatment's is the chemical detail page. */
const LINKED_ACTION_ROUTE = {
	application: '/control-operations/chemical/$id',
	sourceReduction: '/control-operations/source-reduction/$id',
	outreachAction: '/public-engagement/outreach/$id',
	biocontrolAction: '/control-operations/biocontrol/$id',
	requestedControlAction: '/operations/requests-for-control/$id',
} as const satisfies Record<LinkedControlAction['kind'], string>;

/**
 * The control actions that cite one inspection, one entry per record: a
 * Treatment is one entry however many products it put out, each product named
 * with its amount (ADR 0020). Each entry's date opens the record. Takes the
 * inspection id.
 */
export function LinkedControlActionsCard({ inspectionId }: { readonly inspectionId: string }) {
	const { actions, isReady, isError } = useLinkedControlActions(inspectionId);

	return (
		<Card variant="surface">
			<CardHeader padding="compact">
				<div className="flex items-start justify-between gap-3">
					<div className="grid gap-1">
						<CardTitle className="flex items-center gap-2">
							<ControlIcon aria-hidden="true" className="size-4 text-muted-foreground" />
							Control Actions
						</CardTitle>
					</div>
					{isReady && actions.length > 0 ? (
						<Badge tone="neutral" variant="outline">
							{actions.length}
						</Badge>
					) : null}
				</div>
			</CardHeader>
			<CardContent padding="compact">
				<PanelRows
					empty={{
						description:
							'No treatments, source reductions, or other control actions reference this inspection yet.',
						title: 'No Control Actions',
					}}
					icon={<ControlIcon aria-hidden="true" />}
					reading={{ isError, isReady, rows: actions }}
					unavailable={{
						description: 'Linked control actions could not be loaded. Try again shortly.',
						title: 'Control Actions Unavailable',
					}}
				>
					{(rows) =>
						rows.map((action) => (
							<LinkedActionRow action={action} key={`${action.kind}-${action.id}`} />
						))
					}
				</PanelRows>
			</CardContent>
		</Card>
	);
}

function LinkedActionRow({ action }: { readonly action: LinkedControlAction }) {
	const meta = actionKindMeta[action.kind];
	return (
		<li className="grid gap-1.5 rounded-md border border-border/40 bg-background/60 px-3 py-2.5">
			<div className="flex flex-wrap items-center gap-2">
				<Badge tone={meta.tone} variant="outline">
					{meta.label}
				</Badge>
				<Link
					className={cn(
						recordLink({ tone: 'inherit', underline: 'hover' }),
						'text-muted-foreground text-xs tabular-nums',
					)}
					params={{ id: action.id }}
					to={LINKED_ACTION_ROUTE[action.kind]}
				>
					{formatMonthDayYear(action.date)}
				</Link>
			</div>
			<p className="m-0 text-foreground text-sm">
				<LinkedActionSummary action={action} />
			</p>
			<p className="m-0 text-muted-foreground text-xs">
				<LinkedActionActor action={action} />
			</p>
		</li>
	);
}

function LinkedActionSummary({ action }: { readonly action: LinkedControlAction }) {
	switch (action.kind) {
		case 'application':
			return (
				<>
					Treated with{' '}
					{action.lines.map((line, index) => (
						<span key={line.id}>
							{index > 0 ? ', ' : ''}
							{line.insecticideName ?? 'Unknown insecticide'} ·{' '}
							<UnitAmount amount={line.amount} abbreviation={line.unitAbbreviation} />
						</span>
					))}
				</>
			);
		case 'sourceReduction':
			return (
				<>
					{action.methodName ?? unknownMethod} ·{' '}
					<UnitAmount amount={action.amount} abbreviation={action.unitAbbreviation} /> eliminated
				</>
			);
		case 'outreachAction':
			return (
				<>
					{action.methodName ?? unknownMethod} · {action.reach.toLocaleString('en-US')} reached
				</>
			);
		case 'biocontrolAction':
			return (
				<>
					{action.methodName ?? unknownMethod} ·{' '}
					<UnitAmount amount={action.amount} abbreviation={action.unitAbbreviation} /> released
				</>
			);
		default:
			return <RequestedActionSummary action={action} />;
	}
}

function RequestedActionSummary({
	action,
}: {
	readonly action: Extract<LinkedControlAction, { readonly kind: 'requestedControlAction' }>;
}) {
	return (
		<>
			{controlTypeLabel(action.controlType)} requested
			{action.summary === null || action.summary.trim().length === 0 ? '' : ` · ${action.summary}`}
			{' · '}
			<span
				className={
					action.resolvedAt === null ? 'font-medium text-foreground' : 'text-muted-foreground'
				}
			>
				{action.resolvedAt === null ? 'Open' : 'Resolved'}
			</span>
		</>
	);
}

const unknownMethod = 'Unknown method';

function LinkedActionActor({ action }: { readonly action: LinkedControlAction }) {
	const label =
		action.kind === 'requestedControlAction'
			? 'Requested by'
			: action.kind === 'application'
				? 'Applicator'
				: 'Technician';
	if (action.actorProfileId === null) {
		return (
			<>
				{label}: <span className="text-muted-foreground">Unassigned</span>
			</>
		);
	}
	return (
		<>
			{label}: {action.actorName ?? 'Unknown'}
		</>
	);
}

/** An amount and the unit's abbreviation, or the bare amount when the unit is not in the client. */
function UnitAmount({
	amount,
	abbreviation,
}: {
	readonly amount: number;
	readonly abbreviation: string | null;
}) {
	return (
		<span className="tabular-nums">
			{formatAmount(amount)}
			{abbreviation === null || abbreviation === '' ? null : ` ${abbreviation}`}
		</span>
	);
}

function controlTypeLabel(controlType: ControlType): string {
	switch (controlType) {
		case 'application':
			return 'Application';
		case 'source_reduction':
			return 'Source reduction';
		case 'biocontrol':
			return 'Biocontrol';
		default:
			return 'Outreach';
	}
}
