create or replace function public.find_other_songs_by_youtube_video_id(
  p_video_id text,
  p_exclude_song_id uuid default null
)
returns table (
  duplicate_found boolean,
  accessible_song_id uuid,
  accessible_title text,
  accessible_visibility_scope text
)
language plpgsql
volatile
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
    end,
    case
      when public.can_access_song_for_user(
        matched.id, matched.team_id, matched.visibility_scope, matched.approval_status, matched.created_by
      ) then matched.visibility_scope
      else null
    end
  from public.songs as matched
  where matched.id is distinct from p_exclude_song_id
    and (regexp_match(
      coalesce(matched.youtube_url, ''),
      '(?:[?&]v=|youtu\.be/|/shorts/|/embed/|/live/|/v/|/u/[^/]+/)([A-Za-z0-9_-]{11})'
    ))[1] = p_video_id
  order by public.can_access_song_for_user(
    matched.id, matched.team_id, matched.visibility_scope, matched.approval_status, matched.created_by
  ) desc, matched.id
  limit 1;
end;
$function$;

revoke all on function public.find_other_songs_by_youtube_video_id(text, uuid) from public;
revoke all on function public.find_other_songs_by_youtube_video_id(text, uuid) from anon;
grant execute on function public.find_other_songs_by_youtube_video_id(text, uuid) to authenticated;
