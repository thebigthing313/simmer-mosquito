import { Field, FieldLabel } from '@simmer-mosquito/ui-web/components/ui/field';
import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '@simmer-mosquito/ui-web/components/ui/select';
import { useId } from 'react';
import { ORG_ROLE_OPTIONS } from './constants';
import { formatRole } from './helpers';
import type { SimmerRole } from './types';

/** The role picker, shown only to somebody who may actually set one. */
export function RoleField({
	editable,
	onChange,
	value,
}: {
	readonly editable: boolean;
	readonly onChange: (role: SimmerRole) => void;
	readonly value: SimmerRole;
}) {
	const id = useId();
	if (!editable) {
		return null;
	}

	return (
		<Field className="gap-1">
			<FieldLabel htmlFor={id}>Role</FieldLabel>
			<Select value={value} onValueChange={(next) => onChange(next as SimmerRole)}>
				<SelectTrigger id={id} size="sm" className="w-full">
					<SelectValue />
				</SelectTrigger>
				<SelectContent>
					<SelectGroup>
						{ORG_ROLE_OPTIONS.map((option) => (
							<SelectItem key={option} value={option}>
								{formatRole(option)}
							</SelectItem>
						))}
					</SelectGroup>
				</SelectContent>
			</Select>
		</Field>
	);
}
