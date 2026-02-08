import {
	FieldDescription,
	FieldLegend,
	FieldSet,
} from '@simmer/ui/components/field';
import { useFormContext } from '../form-context';

interface FormWrapperProps {
	formLabel?: string;
	formDescription?: string;
	className?: string;
}
export function FormWrapper({
	formLabel,
	formDescription,
	className,
	children,
}: Omit<React.ComponentPropsWithoutRef<'form'>, 'className' | 'onSubmit'> &
	FormWrapperProps) {
	const form = useFormContext();
	return (
		<div className={className}>
			<form
				onSubmit={(e) => {
					e.preventDefault();
					e.stopPropagation();
					form.handleSubmit();
				}}
			>
				<FieldSet>
					{formLabel && <FieldLegend>{formLabel}</FieldLegend>}
					{formDescription && (
						<FieldDescription>{formDescription}</FieldDescription>
					)}
					{children}
				</FieldSet>
			</form>
		</div>
	);
}
