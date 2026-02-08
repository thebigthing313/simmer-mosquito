import { Button } from '@simmer/ui/components/button';
import { createFileRoute, Link, Outlet } from '@tanstack/react-router';

export const Route = createFileRoute('/(auth)')({
	component: AuthLayout,
});

function AuthLayout() {
	return (
		<div className="flex min-h-screen flex-col">
			<div className="flex flex-1 items-center justify-center p-4">
				<Outlet />
			</div>
			<nav className="border-t bg-muted/50 p-4">
				<div className="container mx-auto">
					<div className="flex flex-wrap justify-center gap-2">
						<Button variant="outline" size="sm" asChild>
							<Link to="/login">Login</Link>
						</Button>
						<Button variant="outline" size="sm" asChild>
							<Link to="/create-account">Create Account</Link>
						</Button>
						<Button variant="outline" size="sm" asChild>
							<Link to="/forgot-password">Forgot Password</Link>
						</Button>
						<Button variant="outline" size="sm" asChild>
							<Link to="/forgot-password-landing">Forgot Password Landing</Link>
						</Button>
						<Button variant="outline" size="sm" asChild>
							<Link to="/verify-email">Verify Email</Link>
						</Button>
						<Button variant="outline" size="sm" asChild>
							<Link to="/change-password">Change Password</Link>
						</Button>
					</div>
				</div>
			</nav>
		</div>
	);
}
