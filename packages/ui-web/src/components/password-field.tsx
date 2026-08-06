'use client';

import { Field, FieldLabel } from '@simmer-mosquito/ui-web/components/ui/field';
import {
	InputGroup,
	InputGroupAddon,
	InputGroupButton,
	InputGroupInput,
} from '@simmer-mosquito/ui-web/components/ui/input-group';
import { iconRegistry } from '@simmer-mosquito/ui-web/icons/registry';
import { useState } from 'react';

const EyeShowIcon = iconRegistry.generic.eye.icon;
const EyeHideIcon = iconRegistry.generic.eyeOff.icon;

/**
 * A password input with a reveal toggle.
 *
 * Authentication is exactly where someone needs to confirm what they typed — a
 * mistyped password on a screen that will not show it is a lockout with no
 * diagnosis. Every password field in both front ends therefore gets the toggle,
 * which is why this is one component rather than one per sign-in page.
 */
export function PasswordField({
	id,
	label,
	autoComplete,
	value,
	onChange,
	minLength,
}: {
	readonly id: string;
	readonly label: string;
	readonly autoComplete: string;
	readonly value: string;
	readonly onChange: (value: string) => void;
	readonly minLength?: number;
}) {
	const [visible, setVisible] = useState(false);
	const ToggleIcon = visible ? EyeHideIcon : EyeShowIcon;

	return (
		<Field>
			<FieldLabel htmlFor={id}>{label}</FieldLabel>
			<InputGroup>
				<InputGroupInput
					autoComplete={autoComplete}
					id={id}
					{...(minLength === undefined ? {} : { minLength })}
					onChange={(event) => onChange(event.target.value)}
					required
					type={visible ? 'text' : 'password'}
					value={value}
				/>
				<InputGroupAddon align="inline-end">
					<InputGroupButton
						aria-label={visible ? 'Hide password' : 'Show password'}
						aria-pressed={visible}
						onClick={() => setVisible((current) => !current)}
						size="icon-xs"
						type="button"
					>
						<ToggleIcon className="size-4" />
					</InputGroupButton>
				</InputGroupAddon>
			</InputGroup>
		</Field>
	);
}
