import { pageContainer } from '@simmer-mosquito/ui-web/components/page-container';
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from '@simmer-mosquito/ui-web/components/ui/alert-dialog';
import { Badge } from '@simmer-mosquito/ui-web/components/ui/badge';
import { Button } from '@simmer-mosquito/ui-web/components/ui/button';
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from '@simmer-mosquito/ui-web/components/ui/card';
import { iconRegistry } from '@simmer-mosquito/ui-web/icons/registry';
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { useCallback, useState } from 'react';
import { toast } from 'sonner';
import { EmptyValue } from '../../../components/empty-value';
import { RecordUnavailable } from '../../../components/record';
import { WriteOnly } from '../../../components/write-only';
import { useNotificationRegistrationMutations } from '../../../hooks/mutations/use-notification-registration-mutations';
import { useNotificationTypeRoster } from '../../../hooks/queries/use-catalog-rosters';
import { useContact } from '../../../hooks/queries/use-contact-record';
import {
	type RegistrationRecord,
	useRegistration,
	useRegistrationSubscriptions,
} from '../../../hooks/queries/use-registration-record';
import { useUnitLabels } from '../../../hooks/queries/use-unit-labels';

const EditIcon = iconRegistry.actions.edit.icon;

export const Route = createFileRoute('/public-engagement/registrations/$id')({
	component: RegistrationDetailRoute,
});

function RegistrationDetailRoute() {
	const { id } = Route.useParams();
	const { registration, isReady, isError } = useRegistration(id);

	if (isError) {
		return <RecordUnavailable layout="centered" noun="registration" reason="error" />;
	}
	if (!isReady) {
		return null;
	}
	if (registration === undefined) {
		return <RecordUnavailable layout="centered" noun="registration" reason="not-found" />;
	}

	return <RegistrationDetail registration={registration} />;
}

/**
 * One registration: who it warns, where it covers, and what it is for.
 *
 * The three facts are separated because they are three different commands, and
 * because they answer three different questions a dispatcher asks. What is
 * missing from every other record page is the buffer, which is the field that
 * decides whether a mission reaches this person at all.
 */
function RegistrationDetail({ registration }: { readonly registration: RegistrationRecord }) {
	const { contact } = useContact(registration.contactId);

	return (
		<div className={pageContainer({ gap: 'detail', padding: 'detail' })}>
			<RegistrationHeader contactName={contact?.contactName ?? null} registration={registration} />
			<ContactCard contactId={registration.contactId} />
			<CoverageCard registration={registration} />
			<PurposeCard registration={registration} />
			<DeleteRegistrationCard registrationId={registration.id} />
		</div>
	);
}

/** The name, the state it is in, and the two controls that change that state. */
function RegistrationHeader({
	contactName,
	registration,
}: {
	readonly contactName: string | null;
	readonly registration: RegistrationRecord;
}) {
	const mutations = useNotificationRegistrationMutations();

	const setActive = useCallback(
		async (next: boolean) => {
			try {
				await (next
					? mutations.reactivate(registration.id)
					: mutations.deactivate(registration.id));
				toast.success(next ? 'Registration reactivated.' : 'Registration deactivated.');
			} catch (error) {
				toast.error(error instanceof Error ? error.message : 'Unable to change this registration.');
			}
		},
		[mutations, registration.id],
	);

	return (
		<header className="flex flex-wrap items-start justify-between gap-3">
			<div className="grid gap-1">
				<h1 className="font-semibold text-2xl text-foreground">{contactName ?? 'Registration'}</h1>
				<div className="flex flex-wrap items-center gap-2">
					<Badge variant={registration.isActive ? 'secondary' : 'outline'}>
						{registration.isActive ? 'Active' : 'Inactive'}
					</Badge>
					{registration.isNoSpray ? <Badge variant="destructive">Do not spray</Badge> : null}
					{registration.hasBees ? <Badge variant="outline">Bees</Badge> : null}
				</div>
			</div>
			<WriteOnly minimum="manager">
				<div className="flex flex-wrap gap-2">
					<Button
						onClick={() => void setActive(!registration.isActive)}
						size="sm"
						variant="outline"
					>
						{registration.isActive ? 'Deactivate' : 'Reactivate'}
					</Button>
					<Button asChild size="sm">
						<Link params={{ id: registration.id }} to="/public-engagement/registrations/$id/edit">
							<EditIcon aria-hidden="true" />
							Edit
						</Link>
					</Button>
				</div>
			</WriteOnly>
		</header>
	);
}

function ContactCard({ contactId }: { readonly contactId: string }) {
	const { contact } = useContact(contactId);

	return (
		<Card variant="surface">
			<CardHeader className="px-4 py-4">
				<CardTitle>Contact</CardTitle>
			</CardHeader>
			<CardContent padding="compact">
				{contact === undefined ? (
					<EmptyValue />
				) : (
					<Link
						className="text-primary underline-offset-4 hover:underline"
						params={{ id: contact.id }}
						to="/public-engagement/contacts/$id"
					>
						{contact.contactName ?? 'Unnamed contact'}
					</Link>
				)}
			</CardContent>
		</Card>
	);
}

/** The shape and the buffer: together, the ground a mission has to reach. */
function CoverageCard({ registration }: { readonly registration: RegistrationRecord }) {
	const { byId: unitsById } = useUnitLabels();
	const bufferUnit =
		registration.bufferUnitId === null ? undefined : unitsById.get(registration.bufferUnitId);

	return (
		<Card variant="surface">
			<CardHeader className="px-4 py-4">
				<CardTitle>Coverage</CardTitle>
			</CardHeader>
			<CardContent className="grid gap-4 sm:grid-cols-2" padding="compact">
				<Fact label="Shape">{geometryLabel(registration.geomType)}</Fact>
				<Fact label="Buffer">
					{registration.bufferDistance === null || bufferUnit === undefined ? (
						<span className="text-muted-foreground">Exact shape, with nothing added around it</span>
					) : (
						`${registration.bufferDistance} ${bufferUnit.abbreviation}`
					)}
				</Fact>
			</CardContent>
		</Card>
	);
}

/**
 * What the registration is for.
 *
 * A registration with neither a flag nor a subscription is a row that will never
 * be notified. The domain refuses one on create, but a type retired afterwards
 * can leave an existing row in that state, so the page says so rather than
 * showing an empty list that reads as "nothing yet".
 */
function PurposeCard({ registration }: { readonly registration: RegistrationRecord }) {
	const { subscriptions } = useRegistrationSubscriptions(registration.id);
	const notificationTypes = useNotificationTypeRoster();

	const typeNames = subscriptions.map(
		(subscription) =>
			notificationTypes.find((type) => type.id === subscription.notificationTypeId)?.name ??
			'Unknown type',
	);

	return (
		<Card variant="surface">
			<CardHeader className="px-4 py-4">
				<CardTitle>What this warns about</CardTitle>
			</CardHeader>
			<CardContent padding="compact">
				{typeNames.length === 0 ? (
					<p className="text-muted-foreground text-sm">
						{registration.hasBees || registration.isNoSpray
							? 'No notification types. The warning flags above are what this registration is for.'
							: 'Nothing. This registration has no purpose and will never be notified.'}
					</p>
				) : (
					<ul className="grid gap-1 text-sm">
						{typeNames.map((name) => (
							<li key={name}>{name}</li>
						))}
					</ul>
				)}
			</CardContent>
		</Card>
	);
}

function Fact({ children, label }: { readonly children: React.ReactNode; readonly label: string }) {
	return (
		<div className="grid gap-1">
			<span className="font-semibold text-muted-foreground text-xs uppercase">{label}</span>
			<span className="text-foreground text-sm">{children}</span>
		</div>
	);
}

/** The `geom_type` column's own vocabulary, said the way a person would. */
function geometryLabel(geomType: string): string {
	switch (geomType) {
		case 'st_point':
			return 'A single place';
		case 'st_linestring':
			return 'A line';
		case 'st_polygon':
			return 'An area';
		default:
			return geomType;
	}
}

/**
 * Removing a registration, without the impact card every other record gets.
 *
 * `DangerZoneCard` reads `/records/{type}/{id}/delete-impact`, and
 * `notification_registration` is not a type that endpoint knows: the delete
 * registry in `packages/db` has no policy for it. So this asks plainly and shows
 * whatever the command refuses with.
 *
 * That gap is worth knowing about rather than working around.
 * `docs/public-engagement-domain.md` says deleting a registration is blocked
 * while non-deleted mission notifications reference it, and the writer is a
 * plain soft delete with no such check, so today the delete goes through and
 * leaves those rows pointing at a retired row. Deactivating is the safe way to
 * stop notifying somebody, which is why it sits at the top of this page.
 */
function DeleteRegistrationCard({ registrationId }: { readonly registrationId: string }) {
	const navigate = useNavigate();
	const mutations = useNotificationRegistrationMutations();
	const [isOpen, setIsOpen] = useState(false);
	const [isDeleting, setIsDeleting] = useState(false);

	const remove = useCallback(async () => {
		setIsDeleting(true);
		try {
			await mutations.remove(registrationId);
			await navigate({ to: '/public-engagement/registrations' });
		} catch (error) {
			toast.error(error instanceof Error ? error.message : 'Unable to delete this registration.');
			setIsDeleting(false);
		}
	}, [mutations, navigate, registrationId]);

	return (
		<WriteOnly minimum="manager">
			<Card variant="surface">
				<CardHeader className="px-4 py-4">
					<CardTitle>Delete</CardTitle>
				</CardHeader>
				<CardContent className="grid gap-3" padding="compact">
					<p className="text-muted-foreground text-sm">
						Deactivate instead to stop notifying somebody while keeping the record of what they
						asked for.
					</p>
					<Button
						className="justify-self-start"
						onClick={() => setIsOpen(true)}
						size="sm"
						variant="destructive"
					>
						Delete registration
					</Button>
				</CardContent>
			</Card>

			<AlertDialog onOpenChange={setIsOpen} open={isOpen}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Delete this registration?</AlertDialogTitle>
						<AlertDialogDescription>
							It stops covering this place immediately. Notifications already sent stay as they were
							sent.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
						<AlertDialogAction
							disabled={isDeleting}
							onClick={(event) => {
								event.preventDefault();
								void remove();
							}}
						>
							{isDeleting ? 'Deleting…' : 'Delete'}
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</WriteOnly>
	);
}
