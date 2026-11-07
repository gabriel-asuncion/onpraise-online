create or replace function public.delete_song_with_sections(p_song_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_song public.songs%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required to delete a song'
      using errcode = '28000';
  end if;

  select *
  into v_song
  from public.songs
  where id = p_song_id
  for update;

  if not found then
    raise exception 'Song not found or unavailable'
      using errcode = 'P0002';
  end if;

  if not public.can_edit_song(v_song.team_id, v_song.visibility_scope, v_song.created_by) then
    raise exception 'You are not authorized to delete this song'
      using errcode = '42501';
  end if;

  delete from public.song_sections
  where song_id = p_song_id;

  delete from public.songs
  where id = p_song_id;
end;
$function$;

revoke all on function public.delete_song_with_sections(uuid) from public;
revoke all on function public.delete_song_with_sections(uuid) from anon;
grant execute on function public.delete_song_with_sections(uuid) to authenticated;
