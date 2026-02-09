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
import { MailCheckIcon } from 'lucide-react';

export const Route = createFileRoute('/(auth)/verify-email')({
	component: VerifyEmailPage,
});

function VerifyEmailPage() {
	return (
		<Card className="w-full max-w-md">
			<CardHeader>
				<div className="mb-4 flex justify-center">
					<div className="rounded-full bg-primary/10 p-3">
						<MailCheckIcon className="h-6 w-6 text-primary" />
					</div>
				</div>
				<CardTitle className="text-center">Verify Your Email</CardTitle>
				<CardDescription className="text-center">
					We've sent a verification email to your address. Please check your
					inbox and click the verification link to activate your account.
				</CardDescription>
			</CardHeader>
			<CardContent className="flex flex-col gap-4">
				<div className="rounded-lg border border-dashed bg-muted/30 p-4 text-center text-sm">
					<p className="mb-1 font-medium">Haven't received the email?</p>
					<p className="text-muted-foreground">
						Check your spam folder or wait a few minutes.
					</p>
				</div>
				<Button variant="outline" className="w-full">
					Resend Verification Email
				</Button>
			</CardContent>
			<CardFooter className="flex flex-col gap-2">
				<div className="text-center text-muted-foreground text-sm">
					Once verified, you can{' '}
					<Button variant="link" size="sm" asChild className="px-0">
						<Link to="/login">login to your account</Link>
					</Button>
				</div>
			</CardFooter>
		</Card>
	);
}
