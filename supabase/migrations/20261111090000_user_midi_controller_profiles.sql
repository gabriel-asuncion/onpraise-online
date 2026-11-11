alter table public.user_control_preferences
  add column if not exists midi_profiles jsonb not null
  default '{"version":1,"activeProfileId":null,"profiles":[]}'::jsonb;
