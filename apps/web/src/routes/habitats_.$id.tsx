import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/habitats_/$id')({
  component: RouteComponent,
})

function RouteComponent() {
  return <div>Hello "/habitats_/$id"!</div>
}
