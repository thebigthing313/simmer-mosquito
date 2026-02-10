create table public.service_request_tags (
    id uuid primary key default gen_random_uuid(),
    group_id uuid not null references public.groups(id) on delete restrict on update cascade,
    service_request_id uuid not null references public.service_requests(id) on delete cascade on update cascade,
    tag_id uuid not null references public.tags(id) on delete cascade on update cascade,
    created_at timestamptz not null default now(),
    created_by uuid references public.profiles (user_id) on delete set null on update cascade,
    updated_at timestamptz not null default now(),
    updated_by uuid references public.profiles (user_id) on delete set null on update cascade,
    constraint service_request_tag_unique unique (service_request_id, tag_id)
);

create trigger set_audit_fields
before insert or update on public.service_request_tags
for each row
execute function public.set_audit_fields();

create trigger soft_delete_trigger
before delete on public.service_request_tags
for each row
execute function simmer.soft_delete();

alter table public.service_request_tags enable row level security;

create policy "select: own groups"
on public.service_request_tags
for select
to authenticated
using (public.user_is_group_member(group_id));

create policy "insert: own groups collector"
on public.service_request_tags
for insert
to authenticated
with check (public.user_has_group_role(group_id, 4));

create policy "update: own groups collector"
on public.service_request_tags
for update
to authenticated
using (public.user_has_group_role(group_id, 4))
with check (public.user_has_group_role(group_id, 4));

create policy "delete: own groups collector"
on public.service_request_tags
for delete
to authenticated
using (public.user_has_group_role(group_id, 4));