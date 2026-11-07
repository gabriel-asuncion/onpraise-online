create table if not exists public.workspace_member_positions (
  workspace_id uuid not null references public.teams(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  position text,
  updated_at timestamptz not null default now(),
  primary key (workspace_id, user_id),
  constraint workspace_member_positions_position_check check (
    position is null or position in (
      'Pastor',
      'Music Leader',
      'Musician',
      'Backup',
      'Tech & Media',
      'Usher / Greeter',
      'General Member'
    )
  )
);

create table if not exists public.position_reassignment_requests (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.teams(id) on delete cascade,
  requester_id uuid not null references public.profiles(id) on delete cascade,
  current_position text,
  requested_position text not null,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected')),
  submitted_at timestamptz not null default now(),
  reviewer_id uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  rejection_reason text,
  constraint position_reassignment_current_position_check check (
    current_position is null or current_position in (
      'Pastor',
      'Music Leader',
      'Musician',
      'Backup',
      'Tech & Media',
      'Usher / Greeter',
      'General Member'
    )
  ),
  constraint position_reassignment_requested_position_check check (
    requested_position in (
      'Pastor',
      'Music Leader',
      'Musician',
      'Backup',
      'Tech & Media',
      'Usher / Greeter',
      'General Member'
    )
  ),
  constraint position_reassignment_rejection_reason_length check (
    rejection_reason is null or length(rejection_reason) <= 500
  )
);

create unique index if not exists position_reassignment_one_pending_per_workspace
  on public.position_reassignment_requests (workspace_id, requester_id)
  where status = 'pending';

create index if not exists position_reassignment_workspace_pending
  on public.position_reassignment_requests (workspace_id, submitted_at desc)
  where status = 'pending';

create index if not exists position_reassignment_cooldown_lookup
  on public.position_reassignment_requests (workspace_id, requester_id, submitted_at desc);

alter table public.workspace_member_positions enable row level security;
alter table public.position_reassignment_requests enable row level security;

revoke all on table public.workspace_member_positions from anon, authenticated;
revoke all on table public.position_reassignment_requests from anon, authenticated;

create or replace function public.is_workspace_member_for_positions(
  p_user_id uuid,
  p_workspace_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select exists (
    select 1
    from public.profiles p
    where p.id = p_user_id
      and (
        p.team_id = p_workspace_id
          or p_workspace_id::text = any(coalesce(p.secondary_team_ids::text[], array[]::text[]))
      )
  ) or exists (
    select 1
    from public.team_members tm
    where tm.user_id = p_user_id
      and tm.team_id = p_workspace_id
  );
$function$;

revoke all on function public.is_workspace_member_for_positions(uuid, uuid) from public, anon, authenticated;

create or replace function public.is_workspace_position_reviewer(
  p_user_id uuid,
  p_workspace_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select exists (
    select 1
    from public.profiles p
    where p.id = p_user_id
      and p.role in ('admin', 'moderator')
      and (
        p.team_id = p_workspace_id
        or p_workspace_id::text = any(coalesce(p.secondary_team_ids::text[], array[]::text[]))
      )
  );
$function$;

revoke all on function public.is_workspace_position_reviewer(uuid, uuid) from public, anon, authenticated;

create or replace function public.set_initial_workspace_position(
  p_workspace_id uuid,
  p_position text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;
  if p_position is not null and p_position not in (
    'Pastor', 'Music Leader', 'Musician', 'Backup', 'Tech & Media',
    'Usher / Greeter', 'General Member'
  ) then
    raise exception 'Invalid service position' using errcode = '22023';
  end if;
  if not public.is_workspace_member_for_positions(auth.uid(), p_workspace_id) then
    raise exception 'Workspace membership required' using errcode = '42501';
  end if;

  insert into public.workspace_member_positions (workspace_id, user_id, position)
  values (p_workspace_id, auth.uid(), p_position)
  on conflict (workspace_id, user_id) do nothing;
end;
$function$;

create or replace function public.get_my_position_reassignment_status(
  p_workspace_id uuid
)
returns table (
  current_position text,
  pending_request_id uuid,
  requested_position text,
  pending_submitted_at timestamptz,
  cooldown_until timestamptz
)
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;
  if not public.is_workspace_member_for_positions(auth.uid(), p_workspace_id) then
    raise exception 'Workspace membership required' using errcode = '42501';
  end if;

  return query
  select
    mp.position,
    pending.id,
    pending.requested_position,
    pending.submitted_at,
    last_request.submitted_at + interval '48 hours'
  from (select 1) seed
  left join public.workspace_member_positions mp
    on mp.workspace_id = p_workspace_id and mp.user_id = auth.uid()
  left join lateral (
    select r.id, r.requested_position, r.submitted_at
    from public.position_reassignment_requests r
    where r.workspace_id = p_workspace_id
      and r.requester_id = auth.uid()
      and r.status = 'pending'
    order by r.submitted_at desc
    limit 1
  ) pending on true
  left join lateral (
    select r.submitted_at
    from public.position_reassignment_requests r
    where r.workspace_id = p_workspace_id
      and r.requester_id = auth.uid()
    order by r.submitted_at desc
    limit 1
  ) last_request on true;
end;
$function$;

create or replace function public.create_position_reassignment_request(
  p_workspace_id uuid,
  p_requested_position text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_current_position text;
  v_latest_request timestamptz;
  v_request_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;
  if p_requested_position not in (
    'Pastor', 'Music Leader', 'Musician', 'Backup', 'Tech & Media',
    'Usher / Greeter', 'General Member'
  ) then
    raise exception 'Invalid service position' using errcode = '22023';
  end if;
  if not public.is_workspace_member_for_positions(auth.uid(), p_workspace_id) then
    raise exception 'Workspace membership required' using errcode = '42501';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(auth.uid()::text || ':' || p_workspace_id::text, 0)
  );

  if exists (
    select 1
    from public.position_reassignment_requests r
    where r.workspace_id = p_workspace_id
      and r.requester_id = auth.uid()
      and r.status = 'pending'
  ) then
    raise exception 'A position request is already pending' using errcode = '23505';
  end if;

  select r.submitted_at
  into v_latest_request
  from public.position_reassignment_requests r
  where r.workspace_id = p_workspace_id
    and r.requester_id = auth.uid()
  order by r.submitted_at desc
  limit 1;

  if v_latest_request is not null and v_latest_request + interval '48 hours' > now() then
    raise exception 'Position request cooldown is active until %',
      v_latest_request + interval '48 hours' using errcode = 'P0001';
  end if;

  insert into public.workspace_member_positions (workspace_id, user_id, position)
  values (p_workspace_id, auth.uid(), null)
  on conflict (workspace_id, user_id) do nothing;

  select mp.position
  into v_current_position
  from public.workspace_member_positions mp
  where mp.workspace_id = p_workspace_id
    and mp.user_id = auth.uid()
  for update;

  if v_current_position is not distinct from p_requested_position then
    raise exception 'The requested position is already assigned' using errcode = '22023';
  end if;

  insert into public.position_reassignment_requests (
    workspace_id, requester_id, current_position, requested_position
  )
  values (p_workspace_id, auth.uid(), v_current_position, p_requested_position)
  returning id into v_request_id;

  return v_request_id;
end;
$function$;

create or replace function public.list_pending_position_reassignment_requests(
  p_workspace_id uuid
)
returns table (
  request_id uuid,
  requester_id uuid,
  requester_name text,
  current_position text,
  requested_position text,
  submitted_at timestamptz,
  status text
)
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;
  if not public.is_workspace_position_reviewer(auth.uid(), p_workspace_id) then
    raise exception 'Not authorized to review this workspace' using errcode = '42501';
  end if;

  return query
  select r.id, r.requester_id, requester.full_name,
         r.current_position, r.requested_position, r.submitted_at, r.status
  from public.position_reassignment_requests r
  join public.profiles requester on requester.id = r.requester_id
  where r.workspace_id = p_workspace_id
    and r.status = 'pending'
  order by r.submitted_at asc;
end;
$function$;

create or replace function public.review_position_reassignment_request(
  p_request_id uuid,
  p_approve boolean,
  p_rejection_reason text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_request public.position_reassignment_requests%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;
  if p_rejection_reason is not null and length(p_rejection_reason) > 500 then
    raise exception 'Rejection reason is too long' using errcode = '22023';
  end if;

  select r.* into v_request
  from public.position_reassignment_requests r
  where r.id = p_request_id
  for update;

  if not found then
    raise exception 'Position request not found' using errcode = 'P0002';
  end if;
  if v_request.requester_id = auth.uid() then
    raise exception 'Users cannot review their own position request' using errcode = '42501';
  end if;
  if not public.is_workspace_position_reviewer(auth.uid(), v_request.workspace_id) then
    raise exception 'Not authorized to review this workspace' using errcode = '42501';
  end if;
  if v_request.status <> 'pending' then
    raise exception 'Position request has already been reviewed' using errcode = '22023';
  end if;
  if p_approve and not public.is_workspace_member_for_positions(v_request.requester_id, v_request.workspace_id) then
    raise exception 'The requester is no longer a workspace member' using errcode = '42501';
  end if;

  if p_approve then
    insert into public.workspace_member_positions (workspace_id, user_id, position)
    values (v_request.workspace_id, v_request.requester_id, v_request.requested_position)
    on conflict (workspace_id, user_id)
    do update set position = excluded.position, updated_at = now();
  end if;

  update public.position_reassignment_requests
  set status = case when p_approve then 'approved' else 'rejected' end,
      reviewer_id = auth.uid(),
      reviewed_at = now(),
      rejection_reason = case when p_approve then null else nullif(btrim(p_rejection_reason), '') end
  where id = p_request_id;
end;
$function$;

revoke all on function public.set_initial_workspace_position(uuid, text) from public, anon;
revoke all on function public.get_my_position_reassignment_status(uuid) from public, anon;
revoke all on function public.create_position_reassignment_request(uuid, text) from public, anon;
revoke all on function public.list_pending_position_reassignment_requests(uuid) from public, anon;
revoke all on function public.review_position_reassignment_request(uuid, boolean, text) from public, anon;

grant execute on function public.set_initial_workspace_position(uuid, text) to authenticated;
grant execute on function public.get_my_position_reassignment_status(uuid) to authenticated;
grant execute on function public.create_position_reassignment_request(uuid, text) to authenticated;
grant execute on function public.list_pending_position_reassignment_requests(uuid) to authenticated;
grant execute on function public.review_position_reassignment_request(uuid, boolean, text) to authenticated;
