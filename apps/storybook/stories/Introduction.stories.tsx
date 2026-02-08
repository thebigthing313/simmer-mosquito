import { Button } from '@simmer/ui/components/button';
import {
	Card,
	CardContent,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle,
} from '@simmer/ui/components/card';
import type { Meta, StoryObj } from '@storybook/react';

const meta = {
	title: 'Introduction',
	parameters: {
		layout: 'fullscreen',
	},
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const Welcome: Story = {
	render: () => (
		<div className="container mx-auto px-6 py-12">
			<div className="mx-auto max-w-3xl space-y-8">
				<div className="space-y-4">
					<h1 className="font-bold text-4xl tracking-tight">
						Welcome to SIMMER Storybook
					</h1>
					<p className="text-muted-foreground text-xl">
						Component library and design system documentation for the SIMMER
						mosquito surveillance application.
					</p>
				</div>

				<div className="grid gap-6 md:grid-cols-2">
					<Card>
						<CardHeader>
							<CardTitle>Forms Package</CardTitle>
							<CardDescription>
								Form components built with TanStack Form and Radix UI
							</CardDescription>
						</CardHeader>
						<CardContent>
							<p className="mb-3 text-muted-foreground text-sm">
								Explore form fields, validation patterns, and complete form
								examples.
							</p>
							<div className="space-y-1 text-sm">
								<div className="font-medium">Available Components:</div>
								<ul className="list-inside list-disc text-muted-foreground">
									<li>TextField - Text input fields</li>
									<li>DateTimeField - Date and time pickers</li>
									<li>FormWrapper - Complete form layouts</li>
									<li>Submit & Reset Buttons</li>
								</ul>
							</div>
						</CardContent>
						<CardFooter>
							<Button variant="outline" asChild>
								<a href="?path=/story/forms-textfield--basic">View Forms</a>
							</Button>
						</CardFooter>
					</Card>

					<Card>
						<CardHeader>
							<CardTitle>UI Components</CardTitle>
							<CardDescription>
								Reusable UI components from @simmer/ui
							</CardDescription>
						</CardHeader>
						<CardContent>
							<p className="text-muted-foreground text-sm">
								Browse buttons, inputs, cards, and other interface elements.
							</p>
						</CardContent>
						<CardFooter>
							<Button variant="outline" disabled>
								Coming Soon
							</Button>
						</CardFooter>
					</Card>
				</div>

				<Card className="border-primary/20 bg-primary/5">
					<CardHeader>
						<CardTitle>Getting Started</CardTitle>
					</CardHeader>
					<CardContent className="space-y-3">
						<div>
							<h3 className="mb-1 font-semibold">Installation</h3>
							<code className="block rounded bg-muted p-2 text-sm">
								pnpm add @simmer/forms @simmer/ui
							</code>
						</div>
						<div>
							<h3 className="mb-1 font-semibold">Usage</h3>
							<code className="block rounded bg-muted p-2 text-sm">
								import {'{ TextField }'} from '@simmer/forms/fields/text-field';
							</code>
						</div>
					</CardContent>
				</Card>

				<div className="space-y-4">
					<h2 className="font-bold text-2xl">Features</h2>
					<ul className="space-y-2 text-muted-foreground">
						<li className="flex items-start gap-2">
							<span className="text-primary">✓</span>
							<span>Built with React 19 and TypeScript</span>
						</li>
						<li className="flex items-start gap-2">
							<span className="text-primary">✓</span>
							<span>Powered by TanStack Form for robust form handling</span>
						</li>
						<li className="flex items-start gap-2">
							<span className="text-primary">✓</span>
							<span>Styled with Tailwind CSS and Radix UI primitives</span>
						</li>
						<li className="flex items-start gap-2">
							<span className="text-primary">✓</span>
							<span>Fully accessible and keyboard navigable</span>
						</li>
						<li className="flex items-start gap-2">
							<span className="text-primary">✓</span>
							<span>Monorepo architecture with pnpm workspaces</span>
						</li>
					</ul>
				</div>
			</div>
		</div>
	),
};
