import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute(
  '/(app)/insecticide-control/catch-basin-missions/',
)({
  component: RouteComponent,
})

function RouteComponent() {
  return <div>Hello "/(app)/insecticide-control/catch-basin-missions/"!</div>
}
