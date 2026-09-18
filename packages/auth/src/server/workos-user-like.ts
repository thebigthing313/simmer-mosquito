export interface WorkOsUserLike {
	readonly id: string;
	readonly email: string;
	readonly firstName?: string | null;
	readonly lastName?: string | null;
	readonly emailVerified?: boolean | null;
	readonly profilePictureUrl?: string | null;
}

export interface WorkOsAuthenticationResponseLike {
	readonly user: WorkOsUserLike;
	readonly organizationId?: string;
	readonly sealedSession?: string;
}
