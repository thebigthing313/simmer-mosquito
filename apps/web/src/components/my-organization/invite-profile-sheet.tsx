import { Button } from '@simmer-mosquito/ui-web/components/ui/button';
import { Field, FieldLabel } from '@simmer-mosquito/ui-web/components/ui/field';
import { Input } from '@simmer-mosquito/ui-web/components/ui/input';
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '@simmer-mosquito/ui-web/components/ui/select';
import {
	Sheet,
	SheetClose,
	SheetContent,
	SheetDescription,
	SheetFooter,
	SheetHeader,
	SheetTitle,
} from '@simmer-mosquito/ui-web/components/ui/sheet';
import { useState } from 'react';
import { toast } from 'sonner';
import type { AuthMe } from '../../auth';
import { useMembershipMutations } from '../../hooks/mutations/use-membership-mutations';
import type { PersonListing } from '../../hooks/queries/use-people-directory';
import { grantableRoles } from '../../lib/write-access';
import { CloseIcon, SaveIcon } from './constants';
import { formatRole, SaveErrorNote, saveFailureMessage } from './helpers';
import type { SimmerRole } from './types';

export function InviteProfileSheet({
	auth,
	onOpenChange,
	open,
	people,
}: {
	readonly auth: AuthMe | null;
	readonly onOpenChange: (open: boolean) => void;
	readonly open: boolean;
	/** The historical Profiles an invitation may attach a login to. */
	readonly people: readonly PersonListing[];
}) {
	const roleOptions = grantableRoles(auth);
	const { invite } = useMembershipMutations();
	const [displayName, setDisplayName] = useState('');
	const [email, setEmail] = useState('');
	const [role, setRole] = useState<SimmerRole>('viewer');
	const [profileId, setProfileId] = useState('new');
	const [error, setError] = useState<string | null>(null);
	const [isSaving, setIsSaving] = useState(false);

	function updateOpen(nextOpen: boolean) {
		if (nextOpen) {
			setDisplayName('');
			setEmail('');
			setRole('viewer');
			setProfileId('new');
			setError(null);
		}
		onOpenChange(nextOpen);
	}

	async function submit(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setError(null);
		setIsSaving(true);
		const linkedProfileId = profileId === 'new' ? null : profileId;
		try {
			await invite({ displayName, email, role, profileId: linkedProfileId });
			toast.success('Invitation sent.');
			updateOpen(false);
		} catch (saveError) {
			setError(saveFailureMessage(saveError, 'The invitation was not sent.'));
		}
		setIsSaving(false);
	}

	return (
		<Sheet open={open} onOpenChange={updateOpen}>
			<SheetContent className="w-[min(440px,100%)]">
				<SheetHeader>
					<SheetTitle>Invite Linked Profile</SheetTitle>
					<SheetDescription>
						Send an invitation and create or attach the access profile for this organization.
					</SheetDescription>
				</SheetHeader>
				<form className="grid gap-3.5" onSubmit={submit}>
					<div className="grid gap-3 px-4">
						<Field className="gap-1">
							<FieldLabel>Historical profile</FieldLabel>
							<Select value={profileId} onValueChange={setProfileId}>
								<SelectTrigger size="sm" className="w-full">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="new">Create a new linked profile</SelectItem>
									{people.map((person) => (
										<SelectItem key={person.profileId} value={person.profileId}>
											{person.displayName}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</Field>
						<Field className="gap-1">
							<FieldLabel>Email</FieldLabel>
							<Input
								type="email"
								value={email}
								onChange={(event) => setEmail(event.target.value)}
								placeholder="person@example.gov"
							/>
						</Field>
						<Field className="gap-1">
							<FieldLabel>Display name</FieldLabel>
							<Input
								value={displayName}
								onChange={(event) => setDisplayName(event.target.value)}
								placeholder="Optional, defaults to email"
							/>
						</Field>
						<Field className="gap-1">
							<FieldLabel>Role</FieldLabel>
							<Select value={role} onValueChange={(value) => setRole(value as SimmerRole)}>
								<SelectTrigger size="sm" className="w-full">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									{roleOptions.map((option) => (
										<SelectItem key={option} value={option}>
											{formatRole(option)}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</Field>
						<SaveErrorNote message={error} />
					</div>
					<SheetFooter>
						<Button type="submit" disabled={isSaving}>
							<SaveIcon aria-hidden="true" />
							Send Invite
						</Button>
						<SheetClose asChild>
							<Button type="button" variant="outline">
								<CloseIcon data-icon="inline-start" aria-hidden="true" />
								Cancel
							</Button>
						</SheetClose>
					</SheetFooter>
				</form>
			</SheetContent>
		</Sheet>
	);
}
