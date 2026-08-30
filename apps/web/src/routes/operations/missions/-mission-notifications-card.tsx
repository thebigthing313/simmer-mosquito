import { Alert, AlertDescription, AlertTitle } from '@simmer-mosquito/ui-web/components/ui/alert';
import { Badge } from '@simmer-mosquito/ui-web/components/ui/badge';
import { Button } from '@simmer-mosquito/ui-web/components/ui/button';
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from '@simmer-mosquito/ui-web/components/ui/card';
import { Skeleton } from '@simmer-mosquito/ui-web/components/ui/skeleton';
import { Link } from '@tanstack/react-router';
import { useCallback, useState } from 'react';
import { toast } from 'sonner';
import { WriteOnly } from '../../../components/write-only';
import {
	type GenerationRefusal,
	useGenerateMissionNotifications,
} from '../../../hooks/mutations/use-mission-notification-generation';
import { useContactDirectory } from '../../../hooks/queries/use-contact-directory';
import {
	type MissionNotificationRecord,
	useMissionNotifications,
} from '../../../hooks/queries/use-mission-notifications';

/**
 * Who this mission has to warn, and the button that works it out.
 *
 * The list is here rather than a toast because the generation's most confusing
 * answer is an empty one, and it is only confusing without the list. Pressed a
 * second time it creates nothing, which is correct; beside a list of twelve
 * people it plainly reads as "already done", and on its own it reads as a button
 * that did not work.
 *
 * Every answer that is not a failure gets its own sentence, and the two that are
 * not failures but look like them get an inline alert rather than a toast: a
 * retired notification type and an unpriceable buffer unit are conditions
 * somebody has to go and fix, and a toast is gone before they have read it.
 */
export function MissionNotificationsCard({ missionId }: { readonly missionId: string }) {
	const { notifications, isReady, isError } = useMissionNotifications(missionId);
	const { contacts } = useContactDirectory();
	const generate = useGenerateMissionNotifications();

	const [isGenerating, setIsGenerating] = useState(false);
	const [standing, setStanding] = useState<StandingMessage | null>(null);

	const contactNameById = new Map(
		contacts.map((contact) => [contact.id, contact.contactName ?? 'Unnamed contact']),
	);

	const run = useCallback(async () => {
		setIsGenerating(true);
		setStanding(null);
		try {
			const outcome = await generate(missionId);
			switch (outcome.kind) {
				case 'created':
					toast.success(
						`Added ${outcome.count} ${outcome.count === 1 ? 'notification' : 'notifications'}.`,
					);
					break;
				case 'nothing_new':
					toast.success('Nothing new. Everyone in range is already on the list.');
					break;
				case 'type_retired':
					setStanding({ kind: 'type_retired' });
					break;
				case 'refused':
					setStanding({ kind: 'refused', refusal: outcome.refusal });
					break;
			}
		} catch (error) {
			toast.error(error instanceof Error ? error.message : 'Unable to work out who to notify.');
		} finally {
			setIsGenerating(false);
		}
	}, [generate, missionId]);

	return (
		<Card variant="surface">
			<CardHeader className="flex flex-row items-center justify-between gap-3 px-4 py-4">
				<CardTitle>Notifications</CardTitle>
				<WriteOnly minimum="manager">
					<Button disabled={isGenerating} onClick={() => void run()} size="sm">
						{isGenerating ? 'Working out who…' : 'Generate notifications'}
					</Button>
				</WriteOnly>
			</CardHeader>
			<CardContent className="grid gap-4" padding="compact">
				{standing === null ? null : <StandingAlert message={standing} />}

				{isError ? (
					<p className="text-destructive text-sm">Notifications could not be loaded.</p>
				) : !isReady ? (
					<Skeleton className="h-16 w-full" />
				) : notifications.length === 0 ? (
					<p className="text-muted-foreground text-sm">
						Nobody is on the list yet. Generating checks every registration whose catchment this
						mission’s stops fall inside.
					</p>
				) : (
					<ul className="grid gap-2">
						{notifications.map((notification) => (
							<NotificationRow
								contactName={contactNameById.get(notification.contactId) ?? 'Unnamed contact'}
								key={notification.id}
								notification={notification}
							/>
						))}
					</ul>
				)}
			</CardContent>
		</Card>
	);
}

/** The two answers that persist until somebody deals with them. */
export type StandingMessage =
	| { readonly kind: 'type_retired' }
	| { readonly kind: 'refused'; readonly refusal: GenerationRefusal };

/**
 * Exported for its test: the card around it reads three collections and a
 * router, and the thing worth pinning is which of the six refusals renders a
 * list and what it links to.
 */
export function StandingAlert({ message }: { readonly message: StandingMessage }) {
	if (message.kind === 'type_retired') {
		return (
			<Alert>
				<AlertTitle>Nobody was eligible</AlertTitle>
				<AlertDescription>
					This mission’s notification type is retired, so no registration subscribes to it.
					Reactivate the type, or give the mission one that is still in use.
				</AlertDescription>
			</Alert>
		);
	}

	const { refusal } = message;
	if (refusal.reason === 'buffer_unit_not_convertible') {
		return (
			<Alert variant="destructive">
				<AlertTitle>A buffer unit cannot be measured in metres</AlertTitle>
				<AlertDescription className="grid gap-3">
					{/*
					 * This refusal is agency-wide: one registration holding a unit the
					 * conversion table cannot price blocks generation for every mission.
					 * The codes say what is wrong, and the list says where, because
					 * nothing lists registrations across an agency and a code on its own
					 * leaves the operator hunting for the row.
					 */}
					<span>
						{refusal.unitCodes.length === 0
							? refusal.message
							: `Registrations are using ${refusal.unitCodes.join(', ')} as a buffer unit, which cannot be converted to metres. Generation is blocked for every mission until those buffers use a distance unit.`}
					</span>
					{refusal.registrations.length === 0 ? null : (
						<ul className="grid gap-1">
							{refusal.registrations.map((registration) => (
								<li key={registration.registrationId}>
									{/* The registration is changed from the contact that holds it. */}
									<Link
										className="underline underline-offset-4"
										params={{ id: registration.contactId }}
										to="/public-engagement/contacts/$id/registrations"
									>
										{registration.contactName ?? 'Unnamed contact'}
									</Link>{' '}
									· {registration.unitCode}
								</li>
							))}
						</ul>
					)}
					{refusal.registrationsNotShown === 0 ? null : (
						<span>
							{refusal.registrationsNotShown === 1
								? '1 more registration is not shown.'
								: `${refusal.registrationsNotShown} more registrations are not shown.`}
						</span>
					)}
				</AlertDescription>
			</Alert>
		);
	}

	return (
		<Alert variant="destructive">
			<AlertTitle>{refusalTitle(refusal.reason)}</AlertTitle>
			<AlertDescription>{refusal.message}</AlertDescription>
		</Alert>
	);
}

function refusalTitle(reason: GenerationRefusal['reason']): string {
	switch (reason) {
		case 'mission_completed':
			return 'This mission is already complete';
		case 'mission_cancelled':
			return 'This mission is cancelled';
		case 'mission_has_no_items':
			return 'This mission has no stops';
		case 'mission_has_no_notification_type':
			return 'This mission has no notification type';
		case 'mission_not_found':
			return 'This mission is no longer available';
		default:
			return 'Generation was refused';
	}
}

function NotificationRow({
	contactName,
	notification,
}: {
	readonly contactName: string;
	readonly notification: MissionNotificationRecord;
}) {
	return (
		<li className="flex flex-wrap items-center justify-between gap-2 text-sm">
			<span className="min-w-0 truncate">
				<Link
					className="text-primary underline-offset-4 hover:underline"
					params={{ id: notification.contactId }}
					to="/public-engagement/contacts/$id"
				>
					{contactName}
				</Link>
				<span className="text-muted-foreground">
					{' '}
					· {channelLabel(notification.channel)}
					{notification.destination === null ? '' : ` · ${notification.destination}`}
				</span>
			</span>
			<Badge variant={notification.status === 'failed' ? 'destructive' : 'outline'}>
				{statusLabel(notification.status)}
			</Badge>
		</li>
	);
}

function channelLabel(channel: MissionNotificationRecord['channel']): string {
	switch (channel) {
		case 'email':
			return 'Email';
		case 'sms':
			return 'Text';
		case 'phone':
			return 'Phone';
	}
}

function statusLabel(status: MissionNotificationRecord['status']): string {
	switch (status) {
		case 'pending':
			return 'To send';
		case 'completed':
			return 'Sent';
		case 'failed':
			return 'Failed';
		case 'skipped':
			return 'Skipped';
	}
}
