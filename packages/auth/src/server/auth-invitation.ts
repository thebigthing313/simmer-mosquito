export type AuthInvitationState = 'pending' | 'accepted' | 'expired' | 'revoked';

export interface AuthInvitation {
	readonly id: string;
	readonly email: string;
	readonly state: AuthInvitationState;
	readonly organizationId: string | null;
	readonly acceptedUserId: string | null;
	readonly expiresAt: string;
	readonly createdAt: string;
	readonly updatedAt: string;
}

export interface InvitationSummary {
	readonly id: string;
	readonly email: string;
	readonly state: AuthInvitationState;
	readonly organizationId: string | null;
}
