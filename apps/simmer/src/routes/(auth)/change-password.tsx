import { FormWrapper } from '@simmer/forms/form/form-wrapper';
import { SubmitButton } from '@simmer/forms/form/submit-button';
import { useAppForm } from '@simmer/forms/form-context';
import { Button } from '@simmer/ui/components/button';
import {
	Card,
	CardContent,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle,
} from '@simmer/ui/components/card';
import { createFileRoute, Link } from '@tanstack/react-router';

export const Route = createFileRoute('/(auth)/change-password')({
	component: ChangePasswordPage,
});

function ChangePasswordPage() {
	const form = useAppForm({
		defaultValues: {
			currentPassword: '',
			newPassword: '',
			confirmPassword: '',
		},
		onSubmit: async ({ value }) => {
			// No auth logic yet
			console.log('Change password submitted:', value);
		},
	});

	return (
		<Card className="w-full max-w-md">
			<CardHeader>
				<CardTitle>Change Password</CardTitle>
				<CardDescription>
					Enter your current password and choose a new one
				</CardDescription>
			</CardHeader>
			<CardContent>
				<form.AppForm>
					<FormWrapper>
						<form.AppField name="currentPassword">
							{(field) => (
								<field.PasswordField
									fieldProps={{
										fieldLabel: 'Current Password',
										required: true,
									}}
									placeholder="Enter your current password"
								/>
							)}
						</form.AppField>
						<form.AppField name="newPassword">
							{(field) => (
								<field.PasswordField
									fieldProps={{
										fieldLabel: 'New Password',
										required: true,
									}}
									placeholder="Create a new password"
								/>
							)}
						</form.AppField>
						<form.AppField name="confirmPassword">
							{(field) => (
								<field.PasswordField
									fieldProps={{
										fieldLabel: 'Confirm New Password',
										required: true,
									}}
									placeholder="Confirm your new password"
								/>
							)}
						</form.AppField>
						<form.Subscribe>
							<SubmitButton className="w-full">Change Password</SubmitButton>
						</form.Subscribe>
					</FormWrapper>
				</form.AppForm>
			</CardContent>
			<CardFooter className="flex flex-col gap-2">
				<div className="text-center text-sm">
					<Button variant="link" size="sm" asChild className="px-0">
						<Link to="/login">Back to login</Link>
					</Button>
				</div>
			</CardFooter>
		</Card>
	);
}
