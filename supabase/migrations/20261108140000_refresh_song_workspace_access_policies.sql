drop policy if exists songs_visible_rows on public.songs;
drop policy if exists songs_visibility_scope_guard on public.songs;

create policy songs_visible_rows on public.songs
  as permissive for select to authenticated
  using (
    public.can_access_song_for_user(
      id, team_id, visibility_scope, approval_status, created_by
    )
  );

create policy songs_visibility_scope_guard on public.songs
  as restrictive for select to authenticated
  using (
    public.can_access_song_for_user(
      id, team_id, visibility_scope, approval_status, created_by
    )
  );

drop policy if exists song_sections_visible_rows on public.song_sections;
drop policy if exists song_sections_visibility_guard on public.song_sections;

create policy song_sections_visible_rows on public.song_sections
  as permissive for select to authenticated
  using (
    exists (
      select 1
      from public.songs as song
      where song.id = song_sections.song_id
        and public.can_access_song_for_user(
          song.id, song.team_id, song.visibility_scope, song.approval_status, song.created_by
        )
    )
  );

create policy song_sections_visibility_guard on public.song_sections
  as restrictive for select to authenticated
  using (
    exists (
      select 1
      from public.songs as song
      where song.id = song_sections.song_id
        and public.can_access_song_for_user(
          song.id, song.team_id, song.visibility_scope, song.approval_status, song.created_by
        )
    )
  );
