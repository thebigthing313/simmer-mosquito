import { PasswordField } from '@simmer-mosquito/ui-web/components/password-field';
import { iconRegistry } from '@simmer-mosquito/ui-web/icons/registry';
import { cn } from '@simmer-mosquito/ui-web/lib/utils';
import type { ReactNode } from 'react';

const CheckIcon = iconRegistry.actions.check.icon;
const CircleIcon = iconRegistry.generic.circle.icon;

/**
 * The shortest password the server will take, mirroring `MIN_PASSWORD_LENGTH`
 * in the server's auth endpoints. WorkOS applies the organization's own policy
 * on top, and what it refuses is shown verbatim.
 */
const MIN_PASSWORD_LENGTH = 8;

/**
 * The two fields every "choose a password" step uses. The password is always
 * confirmed, and the requirement list answers live.
 */
export function NewPasswordFields({
	idPrefix,
	label,
	password,
	confirm,
	onPasswordChange,
	onConfirmChange,
}: {
	readonly idPrefix: string;
	readonly label: string;
	readonly password: string;
	readonly confirm: string;
	readonly onPasswordChange: (value: string) => void;
	readonly onConfirmChange: (value: string) => void;
}) {
	return (
		<>
			<PasswordField
				autoComplete="new-password"
				id={`${idPrefix}-password`}
				label={label}
				minLength={MIN_PASSWORD_LENGTH}
				onChange={onPasswordChange}
				value={password}
			/>
			<PasswordField
				autoComplete="new-password"
				id={`${idPrefix}-confirm`}
				label="Confirm password"
				onChange={onConfirmChange}
				value={confirm}
			/>
			<PasswordRequirements confirm={confirm} password={password} />
		</>
	);
}

function PasswordRequirements({
	password,
	confirm,
}: {
	readonly password: string;
	readonly confirm: string;
}) {
	return (
		<ul className="grid gap-1 text-muted-foreground text-xs">
			<Requirement met={password.length >= MIN_PASSWORD_LENGTH}>
				At least {MIN_PASSWORD_LENGTH} characters
			</Requirement>
			<Requirement met={password.length > 0 && password === confirm}>
				Both entries match
			</Requirement>
			<Requirement met={null}>Not a password known to have been breached</Requirement>
		</ul>
	);
}

/**
 * One requirement line. `met: null` marks a rule only the server can settle: it
 * is stated without a checkbox.
 */
function Requirement({
	met,
	children,
}: {
	readonly met: boolean | null;
	readonly children: ReactNode;
}) {
	const Icon = met === true ? CheckIcon : CircleIcon;
	return (
		<li className={cn('flex items-center gap-1.5', met === true && 'text-foreground')}>
			<Icon aria-hidden="true" className={cn('size-3 shrink-0', met === null && 'opacity-50')} />
			{children}
		</li>
	);
}
