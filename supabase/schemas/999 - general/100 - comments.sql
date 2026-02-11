create table public.comments(
    id uuid primary key default gen_random_uuid(),
    group_id uuid not null references public.groups(id) on delete restrict on update cascade,
    comment_text text not null,
    parent_id uuid references public.comments(id) on delete set null on update cascade,
    is_pinned boolean not null default false,
    --- originating tables
    trap_id uuid references public.traps(id) on delete restrict on update cascade,
    collection_id uuid references public.collections(id) on delete restrict on update cascade,
    landing_rate_id uuid references public.landing_rates(id) on delete restrict on update cascade,
    service_request_id uuid references public.service_requests(id) on delete restrict on update cascade,
    contact_id uuid references public.contacts(id) on delete restrict on update cascade,
    aerial_site_id uuid references public.aerial_sites(id) on delete restrict on update cascade,
    sample_id uuid references public.samples(id) on delete restrict on update cascade,
    notification_id uuid references public.notifications(id) on delete restrict on update cascade,
    ----------------------
    parent_type text generated always as (
        case
            when parent_id is not null then 'comment'::text
            when trap_id is not null then 'trap'::text
            when collection_id is not null then 'collection'::text
            when landing_rate_id is not null then 'landing_rate'::text
            when service_request_id is not null then 'service_request'::text
            when contact_id is not null then 'contact'::text
            when aerial_site_id is not null then 'aerial_site'::text
            when sample_id is not null then 'sample'::text
            when notification_id is not null then 'notification'::text
            else 'unknown'::text
        end) stored null,
    created_at timestamptz not null default now(),
    created_by uuid references public.profiles (user_id) on delete set null on update cascade,
    updated_at timestamptz not null default now(),
    updated_by uuid references public.profiles (user_id) on delete set null on update cascade
);

create trigger set_audit_fields
before insert or update on public.comments
for each row
execute function public.set_audit_fields();

create trigger soft_delete_trigger
before delete on public.comments
for each row
execute function simmer.soft_delete();


alter table public.comments enable row level security;

create policy "select: group members"
on public.comments
for select
to authenticated
using (public.user_is_group_member(group_id));

create policy "insert: group members"
on public.comments
for insert
to authenticated
with check (public.user_is_group_member(group_id));

create policy "update: group managers or record creators"
on public.comments
for update
to authenticated
using (
    public.user_has_group_role(group_id, 3) or
    (created_by = (select auth.uid()) and public.user_is_group_member(group_id))
);

create policy "delete: group managers or record creators"
on public.comments
for delete
to authenticated
using (
    public.user_has_group_role(group_id, 3) or
    (created_by = (select auth.uid()) and public.user_is_group_member(group_id))
);