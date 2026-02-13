import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute(
  '/(app)/insecticide-control/insecticides/',
)({
  component: RouteComponent,
})

function RouteComponent() {
  return <div>Hello "/(app)/insecticide-control/insecticides/"!</div>
}
