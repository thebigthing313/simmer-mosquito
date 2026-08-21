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
import { Button } from '@simmer-mosquito/ui-web/components/ui/button';
import { useState } from 'react';
import { toast } from 'sonner';
import type { AuthMe } from '../../../auth';
import { useMembershipMutations } from '../../../hooks/mutations/use-membership-mutations';
import type { PersonListing } from '../../../hooks/queries/use-people-directory';
import { canRemoveMember } from '../../../lib/write-access';
import { DeleteIcon } from './constants';
import { SaveErrorNote, saveFailureMessage } from './helpers';

/**
 * Ending somebody's access (ADR 0011).
 *
 * Below the form rather than in it: saving a display name and revoking a login
 * are not the same act, and one submit button for both would make the second
 * one an accident waiting to happen.
 *
 * The profile is deliberately left alone. It is what every record this person
 * created still points at, and it goes on being assignable field history — what
 * ends is the login's reach into this agency, not the person.
 */
export function RemoveMemberControl({
	auth,
	person,
	onRemoved,
}: {
	readonly auth: AuthMe | null;
	readonly person: PersonListing;
	readonly onRemoved: () => void;
}) {
	// Both halves have to be present for the ladder question to mean anything: a
	// historical Profile has no access to end, and `canRemoveMember` compares
	// against a role there is none of.
	if (person.membershipId == null || person.role == null) {
		return null;
	}
	if (!canRemoveMember(auth, { id: person.membershipId, role: person.role })) {
		return null;
	}

	return (
		<RemoveMemberAction
			membershipId={person.membershipId}
			name={person.displayName}
			onRemoved={onRemoved}
		/>
	);
}

function RemoveMemberAction({
	membershipId,
	name,
	onRemoved,
}: {
	readonly membershipId: string;
	readonly name: string;
	readonly onRemoved: () => void;
}) {
	const { endMembership } = useMembershipMutations();
	const [confirmOpen, setConfirmOpen] = useState(false);
	const [isRemoving, setIsRemoving] = useState(false);
	const [failure, setFailure] = useState<string | null>(null);

	async function confirm() {
		setConfirmOpen(false);
		setIsRemoving(true);
		setFailure(null);
		try {
			await endMembership(membershipId);
			toast.success(`${name} no longer has access.`);
			onRemoved();
		} catch (removeError) {
			// The sheet stays open on a refusal, so the reason belongs on it. A toast
			// alone leaves a sheet that reads exactly as it did before the click.
			const message = saveFailureMessage(removeError, `${name} still has access.`);
			setFailure(message);
			toast.error(message);
		} finally {
			setIsRemoving(false);
		}
	}

	return (
		<div className="grid gap-1.5 border-border/50 border-t px-4 pt-3">
			<span className="text-muted-foreground text-xs">
				Removing {name} ends their access to this organization. Their profile and everything
				recorded under it stay.
			</span>
			<div>
				<Button
					disabled={isRemoving}
					onClick={() => setConfirmOpen(true)}
					size="xs"
					type="button"
					variant="destructive"
				>
					<DeleteIcon aria-hidden="true" />
					Remove Access
				</Button>
			</div>
			<SaveErrorNote message={failure} />
			<AlertDialog onOpenChange={setConfirmOpen} open={confirmOpen}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Remove {name}'s access?</AlertDialogTitle>
						<AlertDialogDescription>
							They will not be able to sign in to this organization. Their profile, and every record
							attributed to it, stay as they are. Reinstating them means a new invitation.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>Cancel</AlertDialogCancel>
						<AlertDialogAction onClick={confirm}>Remove Access</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</div>
	);
}
