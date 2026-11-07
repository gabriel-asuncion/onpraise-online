do $migration$
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'songs'
      and column_name = 'visibility_scope'
  ) then
    alter table public.songs
      add column visibility_scope text not null default 'workspace';
    update public.songs set visibility_scope = 'global';
  else
    update public.songs
    set visibility_scope = 'global'
    where visibility_scope is null;

    alter table public.songs
      alter column visibility_scope set default 'workspace',
      alter column visibility_scope set not null;
  end if;
end;
$migration$;

do $migration$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.songs'::regclass
      and conname = 'songs_visibility_scope_check'
  ) then
    alter table public.songs
      add constraint songs_visibility_scope_check
      check (visibility_scope in ('workspace', 'global'));
  end if;
end;
$migration$;

create index if not exists songs_visibility_team_approval_idx
  on public.songs (visibility_scope, team_id, approval_status, title);

create index if not exists songs_global_title_idx
  on public.songs (title, artist)
  where visibility_scope = 'global';

create table if not exists public.song_workspace_access (
  song_id uuid not null references public.songs(id) on delete cascade,
  team_id uuid not null references public.teams(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (song_id, team_id)
);

create index if not exists song_workspace_access_team_song_idx
  on public.song_workspace_access (team_id, song_id);

insert into public.song_workspace_access (song_id, team_id)
select id, team_id
from public.songs
where visibility_scope = 'workspace'
  and team_id is not null
on conflict (song_id, team_id) do nothing;

alter table public.song_workspace_access enable row level security;

create or replace function public.is_song_workspace_member(
  p_user_id uuid,
  p_team_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select p_user_id is not null
    and p_team_id is not null
    and (
      exists (
        select 1
        from public.profiles as profile
        where profile.id = p_user_id
          and (
            profile.team_id = p_team_id
            or p_team_id::text = any(coalesce(profile.secondary_team_ids::text[], array[]::text[]))
          )
      )
      or exists (
        select 1
        from public.team_members as membership
        where membership.user_id = p_user_id
          and membership.team_id = p_team_id
      )
    );
$function$;

revoke all on function public.is_song_workspace_member(uuid, uuid) from public;
revoke all on function public.is_song_workspace_member(uuid, uuid) from anon;

create or replace function public.can_access_song_for_user(
  p_song_id uuid,
  p_team_id uuid,
  p_visibility_scope text,
  p_approval_status text,
  p_created_by uuid
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_role text;
begin
  if v_user_id is null then
    return false;
  end if;

  select role
  into v_role
  from public.profiles
  where id = v_user_id;

  if p_visibility_scope = 'global' then
    return true;
  end if;

  if coalesce(v_role, '') in ('admin', 'moderator') then
    return true;
  end if;

  if p_created_by = v_user_id then
    return true;
  end if;

  return p_visibility_scope = 'workspace'
    and (
      exists (
        select 1
        from public.song_workspace_access as assignment
        where assignment.song_id = p_song_id
          and public.is_song_workspace_member(v_user_id, assignment.team_id)
      )
      or (
        not exists (
          select 1
          from public.song_workspace_access as assignment
          where assignment.song_id = p_song_id
        )
        and public.is_song_workspace_member(v_user_id, p_team_id)
      )
    );
end;
$function$;

revoke all on function public.can_access_song_for_user(uuid, uuid, text, text, uuid) from public;
revoke all on function public.can_access_song_for_user(uuid, uuid, text, text, uuid) from anon;
grant execute on function public.can_access_song_for_user(uuid, uuid, text, text, uuid) to authenticated;

create or replace function public.can_edit_song(
  p_team_id uuid,
  p_visibility_scope text,
  p_created_by uuid
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_role text;
begin
  if v_user_id is null then
    return false;
  end if;

  select role into v_role
  from public.profiles
  where id = v_user_id;

  if coalesce(v_role, '') in ('admin', 'moderator') then
    return true;
  end if;
  if coalesce(v_role, '') <> 'musician' then
    return false;
  end if;
  if p_created_by is distinct from v_user_id then
    return false;
  end if;
  if p_visibility_scope = 'global' then
    return true;
  end if;

  return p_visibility_scope = 'workspace'
    and p_team_id is not null
    and public.is_song_workspace_member(v_user_id, p_team_id);
end;
$function$;

create or replace function public.can_create_song(
  p_team_id uuid,
  p_visibility_scope text,
  p_created_by uuid,
  p_approval_status text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select auth.uid() is not null
    and p_created_by = auth.uid()
    and p_visibility_scope in ('workspace', 'global')
    and p_approval_status = 'pending'
    and exists (
      select 1
      from public.profiles as profile
      where profile.id = auth.uid()
        and profile.role in ('admin', 'moderator', 'musician')
    )
    and public.is_song_workspace_member(auth.uid(), p_team_id);
$function$;

revoke all on function public.can_edit_song(uuid, text, uuid) from public;
revoke all on function public.can_edit_song(uuid, text, uuid) from anon;
grant execute on function public.can_edit_song(uuid, text, uuid) to authenticated;
revoke all on function public.can_create_song(uuid, text, uuid, text) from public;
revoke all on function public.can_create_song(uuid, text, uuid, text) from anon;
grant execute on function public.can_create_song(uuid, text, uuid, text) to authenticated;

revoke all on table public.song_workspace_access from public, anon, authenticated;
grant select on table public.song_workspace_access to authenticated;

drop policy if exists song_workspace_access_visible_to_song_editors on public.song_workspace_access;
create policy song_workspace_access_visible_to_song_editors
  on public.song_workspace_access
  for select to authenticated
  using (
    exists (
      select 1
      from public.songs as song
      where song.id = song_workspace_access.song_id
        and public.can_edit_song(song.team_id, song.visibility_scope, song.created_by)
    )
  );

alter table public.songs enable row level security;

do $migration$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'songs'
      and policyname = 'songs_visible_rows'
  ) then
    execute $policy$
      create policy songs_visible_rows on public.songs
      as permissive for select to authenticated
      using (public.can_access_song_for_user(id, team_id, visibility_scope, approval_status, created_by))
    $policy$;
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'songs'
      and policyname = 'songs_visibility_scope_guard'
  ) then
    execute $policy$
      create policy songs_visibility_scope_guard on public.songs
      as restrictive for select to authenticated
      using (public.can_access_song_for_user(id, team_id, visibility_scope, approval_status, created_by))
    $policy$;
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'songs'
      and policyname = 'songs_create_by_workspace_member'
  ) then
    execute $policy$
      create policy songs_create_by_workspace_member on public.songs
      as permissive for insert to authenticated
      with check (public.can_create_song(team_id, visibility_scope, created_by, approval_status))
    $policy$;
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'songs'
      and policyname = 'songs_insert_guard'
  ) then
    execute $policy$
      create policy songs_insert_guard on public.songs
      as restrictive for insert to authenticated
      with check (public.can_create_song(team_id, visibility_scope, created_by, approval_status))
    $policy$;
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'songs'
      and policyname = 'songs_update_by_owner_or_moderator'
  ) then
    execute $policy$
      create policy songs_update_by_owner_or_moderator on public.songs
      as permissive for update to authenticated
      using (public.can_edit_song(team_id, visibility_scope, created_by))
      with check (public.can_edit_song(team_id, visibility_scope, created_by))
    $policy$;
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'songs'
      and policyname = 'songs_update_guard'
  ) then
    execute $policy$
      create policy songs_update_guard on public.songs
      as restrictive for update to authenticated
      using (public.can_edit_song(team_id, visibility_scope, created_by))
      with check (public.can_edit_song(team_id, visibility_scope, created_by))
    $policy$;
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'songs'
      and policyname = 'songs_delete_by_owner_or_moderator'
  ) then
    execute $policy$
      create policy songs_delete_by_owner_or_moderator on public.songs
      as permissive for delete to authenticated
      using (public.can_edit_song(team_id, visibility_scope, created_by))
    $policy$;
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'songs'
      and policyname = 'songs_delete_guard'
  ) then
    execute $policy$
      create policy songs_delete_guard on public.songs
      as restrictive for delete to authenticated
      using (public.can_edit_song(team_id, visibility_scope, created_by))
    $policy$;
  end if;
end;
$migration$;

create or replace function public.guard_global_song_updates()
returns trigger
language plpgsql
set search_path = ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_role text;
begin
  if v_user_id is null then
    return new;
  end if;

  select role into v_role
  from public.profiles
  where id = v_user_id;

  if (
    (new.approval_status is distinct from old.approval_status and new.approval_status is distinct from 'pending')
    or (new.reviewer_feedback is distinct from old.reviewer_feedback and new.reviewer_feedback is not null)
  ) and coalesce(v_role, '') not in ('admin', 'moderator') then
    raise exception 'Not authorized to review this song'
      using errcode = '42501';
  end if;

  if old.visibility_scope = 'global' or new.visibility_scope is distinct from old.visibility_scope then
    if old.created_by is distinct from v_user_id
      and coalesce(v_role, '') not in ('admin', 'moderator') then
      raise exception 'Not authorized to modify this global song'
        using errcode = '42501';
    end if;
  end if;

  if new.created_by is distinct from old.created_by or new.team_id is distinct from old.team_id then
    raise exception 'Song ownership and workspace cannot be changed'
      using errcode = '42501';
  end if;

  if new.visibility_scope is distinct from old.visibility_scope
    or new.title is distinct from old.title
    or new.artist is distinct from old.artist
    or new.tempo is distinct from old.tempo
    or new.original_key is distinct from old.original_key
    or new.key_signature is distinct from old.key_signature
    or new.themes is distinct from old.themes
    or new.section_timings is distinct from old.section_timings
    or new.chordpro_content is distinct from old.chordpro_content
    or new.youtube_url is distinct from old.youtube_url then
    new.approval_status := 'pending';
    new.reviewer_feedback := null;
  end if;

  return new;
end;
$function$;

drop trigger if exists songs_guard_global_updates on public.songs;
create trigger songs_guard_global_updates
before update on public.songs
for each row execute function public.guard_global_song_updates();

revoke all on function public.guard_global_song_updates() from public;
revoke all on function public.guard_global_song_updates() from anon;
revoke all on function public.guard_global_song_updates() from authenticated;

create or replace function public.save_song_with_sections(
  p_song_id uuid,
  p_song_data jsonb,
  p_sections jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_user_role text;
  v_song_id uuid;
  v_team_id uuid;
  v_song_team_id uuid;
  v_section jsonb;
  v_sequence integer := 0;
  v_visibility_scope text;
  v_workspace_ids uuid[];
  v_workspace_id uuid;
  v_youtube_url text;
  v_video_id text;
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
  if nullif(p_song_data ->> 'tempo', '') is not null
    and p_song_data ->> 'tempo' !~ '^[0-9]{1,3}$' then
    raise exception 'Invalid song tempo' using errcode = '22023';
  end if;
  if nullif(p_song_data ->> 'tempo', '') is not null
    and (p_song_data ->> 'tempo')::integer not between 30 and 300 then
    raise exception 'Invalid song tempo' using errcode = '22023';
  end if;

  select role, team_id
  into v_user_role, v_team_id
  from public.profiles
  where id = v_user_id;

  if coalesce(v_user_role, '') not in ('admin', 'moderator', 'musician') then
    raise exception 'Musician access or higher is required to edit songs'
      using errcode = '42501';
  end if;

  if p_song_id is not null then
    if not exists (
      select 1
      from public.songs as existing
      where existing.id = p_song_id
        and (
          v_user_role in ('admin', 'moderator')
          or (
            existing.created_by = v_user_id
            and (
              existing.visibility_scope = 'global'
              or public.is_song_workspace_member(v_user_id, existing.team_id)
            )
          )
        )
    ) then
      raise exception 'Not authorized to edit this song' using errcode = '42501';
    end if;
    select team_id into v_song_team_id
    from public.songs
    where id = p_song_id;
  else
    v_song_team_id := v_team_id;
    if nullif(p_song_data ->> 'team_id', '') is not null then
      begin
        v_song_team_id := (p_song_data ->> 'team_id')::uuid;
      exception when invalid_text_representation then
        raise exception 'Invalid song workspace' using errcode = '22023';
      end;
    end if;
    if v_song_team_id is null then
      raise exception 'A workspace membership is required to save songs'
        using errcode = '42501';
    end if;
    if not public.is_song_workspace_member(v_user_id, v_song_team_id) then
      raise exception 'You must belong to the song workspace'
        using errcode = '42501';
    end if;
  end if;

  if p_song_data ? 'visibility_scope' then
    v_visibility_scope := p_song_data ->> 'visibility_scope';
  elsif p_song_id is not null then
    select visibility_scope into v_visibility_scope
    from public.songs where id = p_song_id;
  else
    v_visibility_scope := 'workspace';
  end if;

  if v_visibility_scope is null or v_visibility_scope not in ('workspace', 'global') then
    raise exception 'Invalid song visibility' using errcode = '22023';
  end if;

  if p_song_data ? 'workspace_ids' then
    if jsonb_typeof(p_song_data -> 'workspace_ids') <> 'array' then
      raise exception 'Invalid song workspace assignments' using errcode = '22023';
    end if;
    if jsonb_array_length(p_song_data -> 'workspace_ids') > 100 then
      raise exception 'Invalid song workspace assignments' using errcode = '22023';
    end if;
    begin
      select coalesce(array_agg(distinct value::uuid), array[]::uuid[])
      into v_workspace_ids
      from jsonb_array_elements_text(p_song_data -> 'workspace_ids') as assignments(value);
    exception when invalid_text_representation then
      raise exception 'Invalid song workspace assignment' using errcode = '22023';
    end;
  elsif p_song_id is not null then
    select coalesce(array_agg(team_id), array[]::uuid[])
    into v_workspace_ids
    from public.song_workspace_access
    where song_id = p_song_id;
    if cardinality(v_workspace_ids) = 0 then
      v_workspace_ids := array[v_song_team_id];
    end if;
  else
    v_workspace_ids := array[v_song_team_id];
  end if;

  if v_visibility_scope = 'workspace' and cardinality(v_workspace_ids) = 0 then
    raise exception 'Select at least one workspace for a workspace song'
      using errcode = '22023';
  end if;

  foreach v_workspace_id in array v_workspace_ids
  loop
    if not public.is_song_workspace_member(v_user_id, v_workspace_id) then
      raise exception 'You can only share a song with workspaces you belong to'
        using errcode = '42501';
    end if;
  end loop;

  v_youtube_url := nullif(btrim(p_song_data ->> 'youtube_url'), '');
  if v_youtube_url is not null then
    if not (
      v_youtube_url ~* '^https?://(?:(?:www|m|music)\.)?youtube\.com(?:/|[?#])'
      or v_youtube_url ~* '^https?://(?:www\.)?youtu\.be/'
      or v_youtube_url ~* '^https?://(?:www\.)?youtube-nocookie\.com(?:/|[?#])'
    ) then
      raise exception 'Invalid YouTube URL' using errcode = '22023';
    end if;

    v_video_id := (regexp_match(
      v_youtube_url,
      '(?:[?&]v=|youtu\.be/|/shorts/|/embed/|/live/|/v/|/u/[^/]+/)([A-Za-z0-9_-]{11})'
    ))[1];
    if v_video_id is null then
      raise exception 'Invalid YouTube URL' using errcode = '22023';
    end if;

    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended('youtube-video:' || v_video_id, 0)
    );
    if exists (
      select 1
      from public.songs as existing
      where existing.id is distinct from p_song_id
        and (regexp_match(
          coalesce(existing.youtube_url, ''),
          '(?:[?&]v=|youtu\.be/|/shorts/|/embed/|/live/|/v/|/u/[^/]+/)([A-Za-z0-9_-]{11})'
        ))[1] = v_video_id
    ) then
      raise exception 'A song using this YouTube video already exists'
        using errcode = '23505';
    end if;
  end if;

  if p_song_id is not null then
    update public.songs
    set title = btrim(p_song_data ->> 'title'),
        artist = coalesce(nullif(btrim(p_song_data ->> 'artist'), ''), 'Unknown Artist'),
        tempo = coalesce(nullif(p_song_data ->> 'tempo', '')::integer, 75),
        original_key = coalesce(p_song_data ->> 'original_key', p_song_data ->> 'key_signature'),
        key_signature = coalesce(p_song_data ->> 'key_signature', p_song_data ->> 'original_key'),
        themes = p_song_data ->> 'themes',
        section_timings = p_song_data -> 'section_timings',
        chordpro_content = p_song_data ->> 'chordpro_content',
        youtube_url = v_youtube_url,
        youtube_sync_offset_ms = coalesce(nullif(p_song_data ->> 'youtube_sync_offset_ms', '')::integer, 0),
        is_youtube_sync_validated = coalesce((p_song_data ->> 'is_youtube_sync_validated')::boolean, false),
        visibility_scope = v_visibility_scope,
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
      key_signature,
      themes,
      section_timings,
      chordpro_content,
      youtube_url,
      youtube_sync_offset_ms,
      is_youtube_sync_validated,
      visibility_scope,
      approval_status,
      created_by,
      team_id
    )
    values (
      btrim(p_song_data ->> 'title'),
      coalesce(nullif(btrim(p_song_data ->> 'artist'), ''), 'Unknown Artist'),
      coalesce(nullif(p_song_data ->> 'tempo', '')::integer, 75),
      coalesce(p_song_data ->> 'original_key', p_song_data ->> 'key_signature'),
      coalesce(p_song_data ->> 'key_signature', p_song_data ->> 'original_key'),
      p_song_data ->> 'themes',
      p_song_data -> 'section_timings',
      p_song_data ->> 'chordpro_content',
      v_youtube_url,
      coalesce(nullif(p_song_data ->> 'youtube_sync_offset_ms', '')::integer, 0),
      coalesce((p_song_data ->> 'is_youtube_sync_validated')::boolean, false),
      v_visibility_scope,
      'pending',
      v_user_id,
      v_song_team_id
    )
    returning id into v_song_id;
  end if;

  delete from public.song_workspace_access where song_id = v_song_id;
  insert into public.song_workspace_access (song_id, team_id)
  select v_song_id, assignment.team_id
  from unnest(v_workspace_ids) as assignment(team_id);

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
    or p_route not in ('lyrics', 'youtube-search', 'chord-search', 'song-import-duplicate')
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

create or replace function public.find_existing_song_by_youtube_video_id(p_video_id text)
returns table (
  duplicate_found boolean,
  accessible_song_id uuid,
  accessible_title text
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;
  if p_video_id is null or p_video_id !~ '^[A-Za-z0-9_-]{11}$' then
    raise exception 'Invalid YouTube video ID' using errcode = '22023';
  end if;
  if not public.consume_api_rate_limit('song-import-duplicate', 20, 60) then
    raise exception 'YouTube duplicate check rate limit exceeded' using errcode = 'P0001';
  end if;

  return query
  select
    true,
    case
      when public.can_access_song_for_user(
        matched.id, matched.team_id, matched.visibility_scope, matched.approval_status, matched.created_by
      ) then matched.id
      else null
    end,
    case
      when public.can_access_song_for_user(
        matched.id, matched.team_id, matched.visibility_scope, matched.approval_status, matched.created_by
      ) then matched.title
      else null
    end
  from public.songs as matched
  where (regexp_match(
    coalesce(matched.youtube_url, ''),
    '(?:[?&]v=|youtu\.be/|/shorts/|/embed/|/live/|/v/|/u/[^/]+/)([A-Za-z0-9_-]{11})'
  ))[1] = p_video_id
  order by public.can_access_song_for_user(
    matched.id, matched.team_id, matched.visibility_scope, matched.approval_status, matched.created_by
  ) desc, matched.id
  limit 1;
end;
$function$;

revoke all on function public.find_existing_song_by_youtube_video_id(text) from public;
revoke all on function public.find_existing_song_by_youtube_video_id(text) from anon;
grant execute on function public.find_existing_song_by_youtube_video_id(text) to authenticated;

alter table public.song_sections enable row level security;

do $migration$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'song_sections'
      and policyname = 'song_sections_visible_rows'
  ) then
    execute $policy$
      create policy song_sections_visible_rows on public.song_sections
      as permissive for select to authenticated
      using (
        exists (
          select 1 from public.songs as song
          where song.id = song_sections.song_id
            and public.can_access_song_for_user(
              song.id, song.team_id, song.visibility_scope, song.approval_status, song.created_by
            )
        )
      )
    $policy$;
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'song_sections'
      and policyname = 'song_sections_visibility_guard'
  ) then
    execute $policy$
      create policy song_sections_visibility_guard on public.song_sections
      as restrictive for select to authenticated
      using (
        exists (
          select 1 from public.songs as song
          where song.id = song_sections.song_id
            and public.can_access_song_for_user(
              song.id, song.team_id, song.visibility_scope, song.approval_status, song.created_by
            )
        )
      )
    $policy$;
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'song_sections'
      and policyname = 'song_sections_manage_by_song_owner'
  ) then
    execute $policy$
      create policy song_sections_manage_by_song_owner on public.song_sections
      as permissive for all to authenticated
      using (
        exists (
          select 1 from public.songs as song
          where song.id = song_sections.song_id
            and public.can_edit_song(song.team_id, song.visibility_scope, song.created_by)
        )
      )
      with check (
        exists (
          select 1 from public.songs as song
          where song.id = song_sections.song_id
            and public.can_edit_song(song.team_id, song.visibility_scope, song.created_by)
        )
      )
    $policy$;
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'song_sections'
      and policyname = 'song_sections_write_guard'
  ) then
    execute $policy$
      create policy song_sections_write_guard on public.song_sections
      as restrictive for all to authenticated
      using (
        exists (
          select 1 from public.songs as song
          where song.id = song_sections.song_id
            and public.can_edit_song(song.team_id, song.visibility_scope, song.created_by)
        )
      )
      with check (
        exists (
          select 1 from public.songs as song
          where song.id = song_sections.song_id
            and public.can_edit_song(song.team_id, song.visibility_scope, song.created_by)
        )
      )
    $policy$;
  end if;
end;
$migration$;

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
  v_setlist_team_id uuid;
  v_song_team_id uuid;
  v_song_scope text;
  v_song_approval text;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;
  select role into v_actor_role from public.profiles where id = auth.uid();
  if coalesce(v_actor_role, '') not in ('admin', 'moderator') then
    raise exception 'Not authorized to edit setlists' using errcode = '42501';
  end if;

  select team_id into v_setlist_team_id
  from public.setlists where id = p_setlist_id for update;
  if not found then
    raise exception 'Setlist not found' using errcode = 'P0002';
  end if;
  if p_song_id is null or p_sequence_order < 1 or length(coalesce(p_start_time, '')) > 32 then
    raise exception 'Invalid setlist song' using errcode = '22023';
  end if;

  select team_id, visibility_scope, approval_status
  into v_song_team_id, v_song_scope, v_song_approval
  from public.songs
  where id = p_song_id;
  if not found then
    raise exception 'Song not found' using errcode = 'P0002';
  end if;
  if not (
    (v_song_scope = 'global' and v_song_approval = 'approved')
    or (
      v_song_scope = 'workspace'
      and (
        exists (
          select 1
          from public.song_workspace_access as assignment
          where assignment.song_id = p_song_id
            and assignment.team_id = v_setlist_team_id
        )
        or (
          not exists (
            select 1
            from public.song_workspace_access as assignment
            where assignment.song_id = p_song_id
          )
          and v_song_team_id = v_setlist_team_id
        )
      )
    )
  ) then
    raise exception 'Song is not available to this setlist' using errcode = '42501';
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
