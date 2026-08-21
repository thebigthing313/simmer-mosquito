export * from './organizations.js';
export * from './profiles.js';
export type { IdentityCommandType, IdentityDomainCommand } from './shared.js';

import type { UpdateOrganizationDetailsCommand } from './organizations.js';
import type { CreateProfileCommand, UpdateProfileCommand } from './profiles.js';

export type IdentityCommand =
	| UpdateOrganizationDetailsCommand
	| CreateProfileCommand
	| UpdateProfileCommand;
