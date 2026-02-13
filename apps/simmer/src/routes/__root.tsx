import appCss from '@simmer/ui/styles/globals.css?url';
import {
	createRootRouteWithContext,
	HeadContent,
	Outlet,
	Scripts,
} from '@tanstack/react-router';
import { TanStackRouterDevtools } from '@tanstack/react-router-devtools';
import type { ReactNode } from 'react';
import favicon from '../assets/simmer-favicon.svg?url';

export type MyRouterContext = {
	mainOutlet: { header: string; description: string } | null;
};

function RootLayout() {
	return (
		<RootDocument>
			<Outlet />
			<TanStackRouterDevtools />
		</RootDocument>
	);
}

export const Route = createRootRouteWithContext<MyRouterContext>()({
	head: () => ({
		meta: [
			{ charSet: 'utf-8' },
			{ name: 'viewport', content: 'width=device-width, initial-scale=1' },
			{ title: 'SIMMER Desktop' },
		],
		links: [
			{ rel: 'preconnect', href: 'https://fonts.googleapis.com' },
			{
				rel: 'preconnect',
				href: 'https://fonts.gstatic.com',
				crossOrigin: 'anonymous',
			},
			{
				rel: 'stylesheet',
				href: 'https://fonts.googleapis.com/css2?family=Poppins:ital,wght@0,100;0,200;0,300;0,400;0,500;0,600;0,700;0,800;0,900;1,100;1,200;1,300;1,400;1,500;1,600;1,700;1,800;1,900&display=swap',
			},
			{ rel: 'stylesheet', href: appCss },
			{ rel: 'icon', type: 'image/svg+xml', href: favicon },
		],
	}),
	component: RootLayout,
});

function RootDocument({ children }: Readonly<{ children: ReactNode }>) {
	return (
		<html lang="en">
			<head>
				<HeadContent />
			</head>
			<body>
				{children}
				<Scripts />
			</body>
		</html>
	);
}
