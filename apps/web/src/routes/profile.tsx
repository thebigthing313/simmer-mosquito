import { pageContainer } from '@simmer-mosquito/ui-web/components/page-container';
import { Avatar, AvatarFallback, AvatarImage } from '@simmer-mosquito/ui-web/components/ui/avatar';
import { Badge } from '@simmer-mosquito/ui-web/components/ui/badge';
import { Button } from '@simmer-mosquito/ui-web/components/ui/button';
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from '@simmer-mosquito/ui-web/components/ui/card';
import { iconRegistry } from '@simmer-mosquito/ui-web/icons/registry';
import { eq, useLiveQuery } from '@tanstack/react-db';
import { createFileRoute } from '@tanstack/react-router';
import { type ReactNode, useState } from 'react';
import { toast } from 'sonner';
import { type AuthenticatedMe, requestPasswordReset } from '../auth';
import { useProfileNames } from '../hooks/queries/use-profile-names';
import { memberships } from '../lib/collections/memberships';

export const Route = createFileRoute('/profile')({
	component: ProfileRoute,
});

const ProfileIcon = iconRegistry.actions.edit.icon;

function ProfileRoute() {
	const { auth } = Route.useRouteContext();
	const snapshot = auth.snapshot;

	// `beforeLoad` on the root route already rejects unauthenticated navigation,
	// so this only covers the window before the snapshot lands.
	if (snapshot === null || snapshot.authenticated !== true) {
		return null;
	}

	return (
		<div className="h-full min-h-0 overflow-y-auto">
			<div className={pageContainer({ gap: 'detail', padding: 'detail' })}>
				<ProfileContent me={snapshot} />
			</div>
		</div>
	);
}

function ProfileContent({ me }: { readonly me: AuthenticatedMe }) {
	const { localIdentity, user } = me;
	const profileId = localIdentity.profileId;
	const membershipId = localIdentity.membershipId;

	// Both shapes are eager, so these resolve without a fetch; the auth snapshot
	// covers whatever has not landed yet.
	const profileNameById = useProfileNames();
	const membershipResult = useLiveQuery(
		(query) =>
			query
				.from({ membership: memberships() })
				.where(({ membership }) => eq(membership.id, membershipId ?? ''))
				.findOne(),
		[membershipId],
	);
	const membership = membershipResult.data;

	const displayName =
		(profileId === null ? undefined : profileNameById.get(profileId)) ?? user.displayName;
	const fullName = [user.firstName, user.lastName].filter(Boolean).join(' ');

	return (
		<>
			<div className="flex flex-wrap items-center gap-4">
				<Avatar className="size-14 border border-border" size="default">
					{user.profilePictureUrl !== null ? (
						<AvatarImage alt="" src={user.profilePictureUrl} />
					) : null}
					<AvatarFallback className="bg-secondary font-semibold text-lg text-secondary-foreground">
						{initials(displayName)}
					</AvatarFallback>
				</Avatar>
				<div className="grid gap-1.5">
					<span className="inline-flex items-center gap-1.5 font-medium text-muted-foreground text-xs uppercase tracking-wide">
						<ProfileIcon aria-hidden="true" className="size-3.5" />
						Profile
					</span>
					<h1 className="m-0 font-semibold text-[1.5rem] text-foreground leading-tight">
						{displayName}
					</h1>
					<p className="m-0 text-[0.95rem] text-muted-foreground">{user.email}</p>
				</div>
			</div>

			<div className="grid items-start gap-5 xl:grid-cols-2">
				<Card variant="surface">
					<CardHeader className="px-4 py-4">
						<CardTitle>Account</CardTitle>
						<CardDescription>Your sign-in identity.</CardDescription>
					</CardHeader>
					<CardContent padding="compact">
						<dl className="grid gap-2.5">
							<DetailRow label="Name">{orNotSet(fullName)}</DetailRow>
							<DetailRow label="Email">{user.email}</DetailRow>
							<DetailRow label="Email verified">
								{user.emailVerified === true ? (
									<Badge tone="success" variant="outline">
										Verified
									</Badge>
								) : (
									<Badge tone="warning" variant="outline">
										Unverified
									</Badge>
								)}
							</DetailRow>
						</dl>
					</CardContent>
				</Card>

				<Card variant="surface">
					<CardHeader className="px-4 py-4">
						<CardTitle>Organization</CardTitle>
						<CardDescription>How your work is attributed.</CardDescription>
					</CardHeader>
					<CardContent padding="compact">
						<dl className="grid gap-2.5">
							<DetailRow label="Organization">
								{orNotSet(localIdentity.organizationName ?? null)}
							</DetailRow>
							<DetailRow label="Role">
								{formatRole(membership?.role ?? localIdentity.role)}
							</DetailRow>
							<DetailRow label="Status">
								{membership === undefined ? (
									'—'
								) : (
									<Badge
										tone={membership.status === 'active' ? 'success' : 'neutral'}
										variant="outline"
									>
										{formatRole(membership.status)}
									</Badge>
								)}
							</DetailRow>
							<DetailRow label="Attributed as">
								{orNotSet(
									(profileId === null ? undefined : profileNameById.get(profileId)) ?? null,
								)}
							</DetailRow>
						</dl>
					</CardContent>
				</Card>

				<Card variant="surface">
					<CardHeader className="px-4 py-4">
						<CardTitle>Password</CardTitle>
						<CardDescription>We email a reset link to {user.email}.</CardDescription>
					</CardHeader>
					<CardContent padding="compact">
						<PasswordResetButton email={user.email} />
					</CardContent>
				</Card>
			</div>

			<p className="m-0 text-muted-foreground text-sm">
				Your name and role are set by your organization. Ask an owner to change them.
			</p>
		</>
	);
}

function PasswordResetButton({ email }: { readonly email: string }) {
	const [pending, setPending] = useState(false);

	async function handleClick() {
		setPending(true);
		try {
			await requestPasswordReset({ email });
			toast.success('Reset link sent', { description: `Check ${email}.` });
		} catch {
			toast.error('Could not send the reset link. Try again.');
		} finally {
			setPending(false);
		}
	}

	return (
		<Button disabled={pending} onClick={handleClick} type="button" variant="outline">
			{pending ? 'Sending…' : 'Send reset link'}
		</Button>
	);
}

function DetailRow({ children, label }: { readonly children: ReactNode; readonly label: string }) {
	return (
		<div className="grid grid-cols-[8.5rem_minmax(0,1fr)] items-center gap-3">
			<dt className="text-muted-foreground text-sm">{label}</dt>
			<dd className="m-0 min-w-0 text-foreground text-sm">{children}</dd>
		</div>
	);
}

function orNotSet(value: string | null): ReactNode {
	return value === null || value.trim() === '' ? (
		<span className="text-muted-foreground">—</span>
	) : (
		value
	);
}

function formatRole(role: string | null | undefined): string {
	if (role === null || role === undefined || role.trim() === '') {
		return 'Member';
	}

	return role
		.split(/[_-]/g)
		.map((part) => part.charAt(0).toUpperCase() + part.slice(1))
		.join(' ');
}

function initials(name: string): string {
	const parts = name.trim().split(/\s+/).filter(Boolean);
	if (parts.length === 0) {
		return '?';
	}
	const [first] = parts;
	const last = parts.length > 1 ? parts[parts.length - 1] : undefined;
	return `${first?.[0] ?? ''}${last?.[0] ?? ''}`.toUpperCase();
}
