create table public.route_items(
    id uuid primary key default gen_random_uuid(),
    group_id uuid not null references public.groups(id) on delete restrict on update cascade,
    route_id uuid not null references public.routes(id) on delete restrict on update cascade,
    habitat_id uuid references public.habitats(id) on delete restrict on update cascade,
    rank_string text collate "C" not null,
    directions_to_next_item text,
    created_at timestamptz not null default now(),
    created_by uuid references public.profiles (user_id) on delete set null on update cascade,
    updated_at timestamptz not null default now(),
    updated_by uuid references public.profiles (user_id) on delete set null on update cascade,
    constraint route_item_rank_unique unique (route_id, rank_string),
    constraint route_habitat_unique unique (route_id, habitat_id)
);

create trigger set_audit_fields
before insert or update on public.route_items
for each row
execute function public.set_audit_fields();

create trigger soft_delete_trigger
before delete on public.route_items
for each row
execute function simmer.soft_delete();

alter table public.route_items enable row level security;

create policy "select: own groups or group_id is null"
on public.route_items
for select
to authenticated
using (public.user_is_group_member(group_id));

create policy "insert: own group manager"
on public.route_items
for insert
to authenticated
with check (public.user_has_group_role(group_id, 3));

create policy "update: own group manager"
on public.route_items
for update
to authenticated
using (public.user_has_group_role(group_id, 3))
with check (public.user_has_group_role(group_id, 3));

create policy "delete: own group manager"
on public.route_items
for delete
to authenticated
using (public.user_has_group_role(group_id, 3));