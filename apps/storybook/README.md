# SIMMER Storybook

Component library documentation for the SIMMER mosquito surveillance application.

## Overview

This Storybook application showcases and documents the reusable components from the SIMMER monorepo, with a focus on the form components from `@simmer/forms`.

## Getting Started

### Installation

From the root of the monorepo:

```bash
pnpm install
```

### Development

Run Storybook in development mode:

```bash
# From the root
pnpm --filter @simmer/storybook dev

# Or from this directory
pnpm dev
```

Storybook will be available at `http://localhost:6006`

### Build

Build Storybook for production:

```bash
pnpm build
```

### Preview

Preview the built Storybook:

```bash
pnpm preview
```

## Project Structure

```
apps/storybook/
├── .storybook/          # Storybook configuration
│   ├── main.ts          # Main config
│   └── preview.ts       # Global decorators and parameters
├── stories/             # Story files
│   ├── Introduction.stories.tsx
│   ├── TextField.stories.tsx
│   ├── DateTimeField.stories.tsx
│   ├── FormWrapper.stories.tsx
│   └── FormButtons.stories.tsx
├── src/
│   └── index.css        # Global styles with Tailwind
├── package.json
├── tsconfig.json
├── tailwind.config.js
└── vite.config.ts
```

## Writing Stories

Stories are located in the `stories/` directory and can also be co-located with components in the packages.

Example story:

```tsx
import type { Meta, StoryObj } from '@storybook/react';
import { TextField } from '@simmer/forms/fields/text-field';

const meta = {
  title: 'Forms/TextField',
  component: TextField,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
} satisfies Meta<typeof TextField>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Basic: Story = {
  render: () => {
    const form = useAppForm({
      defaultValues: { username: '' },
    });
    return (
      <form.Field name="username">
        {(field) => <TextField placeholder="Enter username" />}
      </form.Field>
    );
  },
};
```

## Features

- **React 19** - Latest React features
- **TypeScript** - Full type safety
- **Vite** - Fast build tool
- **Tailwind CSS** - Utility-first styling
- **TanStack Form** - Powerful form management
- **Radix UI** - Accessible components

## Packages Documented

- `@simmer/forms` - Form components with TanStack Form integration
- `@simmer/ui` - Base UI components (buttons, inputs, cards, etc.)

## Contributing

When adding new components to the packages, please add corresponding stories to document their usage and behavior.
