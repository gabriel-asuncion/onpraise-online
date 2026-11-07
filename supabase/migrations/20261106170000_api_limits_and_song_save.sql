-- Deploy this migration before enabling dependent API routes and mutation workflows.
-- Business-data mutation functions run as the caller and rely on these checks plus existing RLS.
create table if not exists public.api_rate_limit_buckets (
  user_id uuid not null references auth.users (id) on delete cascade,
  route text not null,
  window_started_at timestamptz not null,
  request_count integer not null check (request_count > 0),
  primary key (user_id, route, window_started_at)
);

alter table public.api_rate_limit_buckets enable row level security;
revoke all on table public.api_rate_limit_buckets from public, anon, authenticated;

create or replace function public.consume_api_rate_limit(
  p_route text,
  p_limit integer,
  p_window_seconds integer
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_window_start timestamptz;
  v_request_count integer;
begin
  if v_user_id is null
    or p_route is null
    or p_route not in ('lyrics', 'youtube-search', 'chord-search')
    or p_limit < 1
    or p_limit > 1000
    or p_window_seconds < 1
    or p_window_seconds > 3600 then
    return false;
  end if;

  v_window_start := to_timestamp(
    floor(extract(epoch from clock_timestamp()) / p_window_seconds) * p_window_seconds
  );

  delete from public.api_rate_limit_buckets
  where user_id = v_user_id
    and route = p_route
    and window_started_at < v_window_start;

  insert into public.api_rate_limit_buckets (user_id, route, window_started_at, request_count)
  values (v_user_id, p_route, v_window_start, 1)
  on conflict (user_id, route, window_started_at)
  do update set request_count = public.api_rate_limit_buckets.request_count + 1
  returning request_count into v_request_count;

  return v_request_count <= p_limit;
end;
$function$;

revoke all on function public.consume_api_rate_limit(text, integer, integer) from public;
revoke all on function public.consume_api_rate_limit(text, integer, integer) from anon;
grant execute on function public.consume_api_rate_limit(text, integer, integer) to authenticated;

create table if not exists public.api_request_slots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  route text not null,
  expires_at timestamptz not null
);

create index if not exists api_request_slots_user_route_expiry_idx
  on public.api_request_slots (user_id, route, expires_at);

alter table public.api_request_slots enable row level security;
revoke all on table public.api_request_slots from public, anon, authenticated;

create or replace function public.acquire_api_request_slot(
  p_route text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_active_count integer;
  v_slot_id uuid;
begin
  if v_user_id is null
    or p_route is null
    or p_route not in ('lyrics', 'youtube-search', 'chord-search') then
    return null;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('route:' || p_route, 0));
  delete from public.api_request_slots where expires_at <= clock_timestamp();

  select count(*) into v_active_count
  from public.api_request_slots
  where user_id = v_user_id
    and route = p_route
    and expires_at > clock_timestamp();
  if v_active_count >= 5 then
    return null;
  end if;

  select count(*) into v_active_count
  from public.api_request_slots
  where route = p_route
    and expires_at > clock_timestamp();
  if v_active_count >= 100 then
    return null;
  end if;

  insert into public.api_request_slots (user_id, route, expires_at)
  values (v_user_id, p_route, clock_timestamp() + interval '30 seconds')
  returning id into v_slot_id;
  return v_slot_id;
end;
$function$;

create or replace function public.release_api_request_slot(p_slot_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null or p_slot_id is null then
    return false;
  end if;

  delete from public.api_request_slots
  where id = p_slot_id and user_id = v_user_id;
  return found;
end;
$function$;

revoke all on function public.acquire_api_request_slot(text) from public;
revoke all on function public.acquire_api_request_slot(text) from anon;
grant execute on function public.acquire_api_request_slot(text) to authenticated;
revoke all on function public.release_api_request_slot(uuid) from public;
revoke all on function public.release_api_request_slot(uuid) from anon;
grant execute on function public.release_api_request_slot(uuid) to authenticated;

create or replace function public.save_song_with_sections(
  p_song_id uuid,
  p_song_data jsonb,
  p_sections jsonb
)
returns uuid
language plpgsql
set search_path = ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_user_role text;
  v_song_id uuid;
  v_team_id uuid;
  v_section jsonb;
  v_sequence integer := 0;
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;
  if jsonb_typeof(p_song_data) <> 'object'
    or jsonb_typeof(p_sections) <> 'array'
    or jsonb_array_length(p_sections) > 200 then
    raise exception 'Invalid song data' using errcode = '22023';
  end if;
  if nullif(btrim(p_song_data ->> 'title'), '') is null
    or length(p_song_data ->> 'title') > 160
    or length(coalesce(p_song_data ->> 'artist', '')) > 160 then
    raise exception 'Invalid song title or artist' using errcode = '22023';
  end if;

  select role, team_id
  into v_user_role, v_team_id
  from public.profiles
  where id = v_user_id;

  if p_song_id is not null then
    if not exists (
      select 1
      from public.songs
      where id = p_song_id
        and (created_by = v_user_id or v_user_role in ('admin', 'moderator'))
    ) then
      raise exception 'Not authorized to edit this song' using errcode = '42501';
    end if;

    update public.songs
    set title = btrim(p_song_data ->> 'title'),
        artist = coalesce(nullif(btrim(p_song_data ->> 'artist'), ''), 'Unknown Artist'),
        tempo = coalesce(nullif(p_song_data ->> 'tempo', '')::integer, 75),
        original_key = p_song_data ->> 'original_key',
        themes = p_song_data ->> 'themes',
        section_timings = p_song_data -> 'section_timings',
        chordpro_content = p_song_data ->> 'chordpro_content',
        youtube_url = p_song_data ->> 'youtube_url',
        youtube_sync_offset_ms = coalesce(nullif(p_song_data ->> 'youtube_sync_offset_ms', '')::integer, 0),
        is_youtube_sync_validated = coalesce((p_song_data ->> 'is_youtube_sync_validated')::boolean, false),
        approval_status = 'pending',
        reviewer_feedback = null
    where id = p_song_id;

    v_song_id := p_song_id;
  else
    insert into public.songs (
      title,
      artist,
      tempo,
      original_key,
      themes,
      section_timings,
      chordpro_content,
      youtube_url,
      youtube_sync_offset_ms,
      is_youtube_sync_validated,
      approval_status,
      created_by,
      team_id
    )
    values (
      btrim(p_song_data ->> 'title'),
      coalesce(nullif(btrim(p_song_data ->> 'artist'), ''), 'Unknown Artist'),
      coalesce(nullif(p_song_data ->> 'tempo', '')::integer, 75),
      p_song_data ->> 'original_key',
      p_song_data ->> 'themes',
      p_song_data -> 'section_timings',
      p_song_data ->> 'chordpro_content',
      p_song_data ->> 'youtube_url',
      coalesce(nullif(p_song_data ->> 'youtube_sync_offset_ms', '')::integer, 0),
      coalesce((p_song_data ->> 'is_youtube_sync_validated')::boolean, false),
      'pending',
      v_user_id,
      v_team_id
    )
    returning id into v_song_id;
  end if;

  delete from public.song_sections where song_id = v_song_id;
  for v_section in select value from jsonb_array_elements(p_sections)
  loop
    if jsonb_typeof(v_section) <> 'object'
      or nullif(btrim(v_section ->> 'section_name'), '') is null then
      raise exception 'Invalid song section' using errcode = '22023';
    end if;

    insert into public.song_sections (song_id, section_name, content, sequence_order)
    values (
      v_song_id,
      btrim(v_section ->> 'section_name'),
      coalesce(v_section ->> 'content', ''),
      v_sequence
    );
    v_sequence := v_sequence + 1;
  end loop;

  return v_song_id;
end;
$function$;

revoke all on function public.save_song_with_sections(uuid, jsonb, jsonb) from public;
revoke all on function public.save_song_with_sections(uuid, jsonb, jsonb) from anon;
grant execute on function public.save_song_with_sections(uuid, jsonb, jsonb) to authenticated;

create or replace function public.assign_event_roster(
  p_event_id uuid,
  p_user_id uuid,
  p_role text,
  p_setlist_id uuid,
  p_source_roster_id uuid default null
)
returns uuid
language plpgsql
set search_path = ''
as $function$
declare
  v_actor_role text;
  v_team_id uuid;
  v_roster_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;
  if p_user_id is null or nullif(btrim(p_role), '') is null or length(p_role) > 64 then
    raise exception 'Invalid roster assignment' using errcode = '22023';
  end if;

  select role into v_actor_role from public.profiles where id = auth.uid();
  if coalesce(v_actor_role, '') not in ('admin', 'moderator') then
    raise exception 'Not authorized to manage event roster' using errcode = '42501';
  end if;

  select team_id into v_team_id
  from public.events
  where id = p_event_id
  for update;
  if not found then
    raise exception 'Event not found' using errcode = 'P0002';
  end if;

  if p_setlist_id is not null and not exists (
    select 1 from public.setlists where id = p_setlist_id and event_id = p_event_id
  ) then
    raise exception 'Setlist does not belong to this event' using errcode = '22023';
  end if;

  if p_source_roster_id is not null then
    delete from public.event_rosters
    where id = p_source_roster_id
      and event_id = p_event_id
      and user_id = p_user_id;
    if not found then
      raise exception 'Source roster assignment was not found' using errcode = 'P0002';
    end if;
  end if;

  select id into v_roster_id
  from public.event_rosters
  where event_id = p_event_id
    and user_id = p_user_id
    and role = p_role
    and setlist_id is not distinct from p_setlist_id
  limit 1;

  if v_roster_id is not null then
    return v_roster_id;
  end if;

  insert into public.event_rosters (event_id, user_id, role, setlist_id, team_id)
  values (p_event_id, p_user_id, btrim(p_role), p_setlist_id, v_team_id)
  returning id into v_roster_id;
  return v_roster_id;
end;
$function$;

revoke all on function public.assign_event_roster(uuid, uuid, text, uuid, uuid) from public;
revoke all on function public.assign_event_roster(uuid, uuid, text, uuid, uuid) from anon;
grant execute on function public.assign_event_roster(uuid, uuid, text, uuid, uuid) to authenticated;

create or replace function public.remove_event_roster_assignment(
  p_event_id uuid,
  p_roster_id uuid
)
returns uuid
language plpgsql
set search_path = ''
as $function$
declare
  v_actor_role text;
  v_deleted_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;
  select role into v_actor_role from public.profiles where id = auth.uid();
  if coalesce(v_actor_role, '') not in ('admin', 'moderator') then
    raise exception 'Not authorized to manage event roster' using errcode = '42501';
  end if;

  perform 1 from public.events where id = p_event_id for update;
  if not found then
    raise exception 'Event not found' using errcode = 'P0002';
  end if;

  delete from public.event_rosters
  where id = p_roster_id and event_id = p_event_id
  returning id into v_deleted_id;
  if v_deleted_id is null then
    raise exception 'Roster assignment not found' using errcode = 'P0002';
  end if;
  return v_deleted_id;
end;
$function$;

revoke all on function public.remove_event_roster_assignment(uuid, uuid) from public;
revoke all on function public.remove_event_roster_assignment(uuid, uuid) from anon;
grant execute on function public.remove_event_roster_assignment(uuid, uuid) to authenticated;

create or replace function public.add_song_to_setlist(
  p_setlist_id uuid,
  p_song_id uuid,
  p_sequence_order integer,
  p_start_time text
)
returns uuid
language plpgsql
set search_path = ''
as $function$
declare
  v_actor_role text;
  v_row_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;
  select role into v_actor_role from public.profiles where id = auth.uid();
  if coalesce(v_actor_role, '') not in ('admin', 'moderator') then
    raise exception 'Not authorized to edit setlists' using errcode = '42501';
  end if;

  perform 1 from public.setlists where id = p_setlist_id for update;
  if not found then
    raise exception 'Setlist not found' using errcode = 'P0002';
  end if;
  if p_song_id is null or p_sequence_order < 1 or length(coalesce(p_start_time, '')) > 32 then
    raise exception 'Invalid setlist song' using errcode = '22023';
  end if;

  insert into public.setlist_songs (setlist_id, song_id, sequence_order, start_time)
  values (p_setlist_id, p_song_id, p_sequence_order, p_start_time)
  returning id into v_row_id;
  return v_row_id;
end;
$function$;

revoke all on function public.add_song_to_setlist(uuid, uuid, integer, text) from public;
revoke all on function public.add_song_to_setlist(uuid, uuid, integer, text) from anon;
grant execute on function public.add_song_to_setlist(uuid, uuid, integer, text) to authenticated;

create or replace function public.remove_song_from_setlist(
  p_setlist_id uuid,
  p_setlist_song_id uuid
)
returns uuid
language plpgsql
set search_path = ''
as $function$
declare
  v_actor_role text;
  v_deleted_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;
  select role into v_actor_role from public.profiles where id = auth.uid();
  if coalesce(v_actor_role, '') not in ('admin', 'moderator') then
    raise exception 'Not authorized to edit setlists' using errcode = '42501';
  end if;

  perform 1 from public.setlists where id = p_setlist_id for update;
  if not found then
    raise exception 'Setlist not found' using errcode = 'P0002';
  end if;

  delete from public.setlist_songs
  where id = p_setlist_song_id and setlist_id = p_setlist_id
  returning id into v_deleted_id;
  if v_deleted_id is null then
    raise exception 'Setlist song not found' using errcode = 'P0002';
  end if;
  return v_deleted_id;
end;
$function$;

revoke all on function public.remove_song_from_setlist(uuid, uuid) from public;
revoke all on function public.remove_song_from_setlist(uuid, uuid) from anon;
grant execute on function public.remove_song_from_setlist(uuid, uuid) to authenticated;

create or replace function public.update_setlist_song_details(
  p_setlist_id uuid,
  p_updates jsonb
)
returns void
language plpgsql
set search_path = ''
as $function$
declare
  v_actor_role text;
  v_item jsonb;
  v_offset integer;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;
  if jsonb_typeof(p_updates) <> 'array' or jsonb_array_length(p_updates) > 500 then
    raise exception 'Invalid setlist updates' using errcode = '22023';
  end if;

  select role into v_actor_role from public.profiles where id = auth.uid();
  if coalesce(v_actor_role, '') not in ('admin', 'moderator') then
    raise exception 'Not authorized to edit setlists' using errcode = '42501';
  end if;

  perform 1 from public.setlists where id = p_setlist_id for update;
  if not found then
    raise exception 'Setlist not found' using errcode = 'P0002';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_updates) as update_item(value)
    where jsonb_typeof(value) <> 'object'
      or nullif(value ->> 'id', '') is null
  ) then
    raise exception 'Invalid setlist update item' using errcode = '22023';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_updates) as update_item(value)
    group by value ->> 'id'
    having count(*) > 1
  ) then
    raise exception 'Duplicate setlist update item' using errcode = '22023';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_updates) as update_item(value)
    where value ? 'sequence_order'
      and coalesce((value ->> 'sequence_order')::integer, 0) < 1
  ) then
    raise exception 'Invalid sequence order' using errcode = '22023';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_updates) as update_item(value)
    where value ? 'sequence_order'
    group by value ->> 'sequence_order'
    having count(*) > 1
  ) then
    raise exception 'Duplicate sequence order' using errcode = '22023';
  end if;

  if (
    select count(*)
    from jsonb_array_elements(p_updates) as update_item(value)
  ) <> (
    select count(*)
    from public.setlist_songs as song
    where song.setlist_id = p_setlist_id
      and song.id in (
        select (value ->> 'id')::uuid
        from jsonb_array_elements(p_updates) as update_item(value)
      )
  ) then
    raise exception 'Setlist update contains unavailable songs' using errcode = '42501';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_updates) as update_item(value)
    where value ? 'sequence_order'
  ) then
    select coalesce(max(sequence_order), 0) + jsonb_array_length(p_updates) + 1
    into v_offset
    from public.setlist_songs
    where setlist_id = p_setlist_id;

    update public.setlist_songs
    set sequence_order = sequence_order + v_offset
    where setlist_id = p_setlist_id
      and id in (
        select (value ->> 'id')::uuid
        from jsonb_array_elements(p_updates) as update_item(value)
        where value ? 'sequence_order'
      );
  end if;

  for v_item in select value from jsonb_array_elements(p_updates)
  loop
    update public.setlist_songs
    set sequence_order = case
          when v_item ? 'sequence_order' then (v_item ->> 'sequence_order')::integer
          else sequence_order
        end,
        group_name = case
          when v_item ? 'group_name' then v_item ->> 'group_name'
          else group_name
        end,
        group_color = case
          when v_item ? 'group_color' then v_item ->> 'group_color'
          else group_color
        end
    where id = (v_item ->> 'id')::uuid
      and setlist_id = p_setlist_id;
  end loop;
end;
$function$;

revoke all on function public.update_setlist_song_details(uuid, jsonb) from public;
revoke all on function public.update_setlist_song_details(uuid, jsonb) from anon;
grant execute on function public.update_setlist_song_details(uuid, jsonb) to authenticated;
