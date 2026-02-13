import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute(
  '/(app)/adult-surveillance/landing-rates/',
)({
  component: RouteComponent,
})

function RouteComponent() {
  return <div>Hello "/(app)/adult-surveillance/landing-rates/"!</div>
}
