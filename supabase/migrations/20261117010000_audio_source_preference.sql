alter table public.user_control_preferences
  add column if not exists audio_source text
  check (audio_source in ('youtube', 'local'));
