import { createClient } from "./client";

// ==========================================
// --- USER & AUTH PROFILE ACTIONS ---
// ==========================================

/**
 * Retrieves the currently authenticated user's record merged with their live profile.
 */
export async function getAuthUserProfile() {
  const supabase = createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return null;

  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();
  
  if (error) {
    return {
      id: user.id,
      email: user.email || "",
      full_name: user.user_metadata?.full_name || "New Worshipper",
      ministries: [],
      unavailable_dates: []
    };
  }
  return data;
}

/**
 * Fetches all registered database profiles from the production records.
 */
export async function getAllProfiles() {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .order("full_name", { ascending: true });
  
  if (error) throw error;
  return data || [];
}

/**
 * Updates a user's core display metrics inside the profiles table.
 */
export async function updateUserProfile(
  id: string, 
  fullName: string, 
  email: string, 
  avatarUrl: string, 
  ministries: string[]
) {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("profiles")
    .upsert({
      id,
      full_name: fullName,
      email,
      avatar_url: avatarUrl,
      ministries
    }, { onConflict: 'id' });

  if (error) throw error;
  return data;
}

/**
 * Commits a user's calendar unavailable calendar exception dates into their profile tracking block.
 */
export async function updateUserAvailability(id: string, unavailableDates: string[]) {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("profiles")
    .update({ unavailable_dates: unavailableDates })
    .eq("id", id);

  if (error) throw error;
  return data;
}

/**
 * Terminates the active browser session layer securely.
 */
export async function logOutUser() {
  const supabase = createClient();
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

// ==========================================
// --- TEAM & ROSTER LINEUP ACTIONS ---
// ==========================================

/**
 * Locates the default primary ministry team node envelope.
 */
export async function getUserTeam() {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("teams")
    .select("*")
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data;
}

/**
 * Fetches the active roster lineup grid, joining on the live profiles table relation.
 */
export async function getTeamRoster(teamId: string) {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("team_members")
    .select(`
      id,
      role,
      user_id,
      profiles (*)
    `)
    .eq("team_id", teamId);

  if (error) throw error;
  return data || [];
}

/**
 * Binds a profile ID slot to a service position inside the team roster.
 */
export async function addTeamMember(teamId: string, userId: string, role: string) {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("team_members")
    .insert({ team_id: teamId, user_id: userId, role: role });

  if (error) throw error;
  return data;
}

/**
 * Removes a team lineup allocation assignment row from the roster.
 */
export async function removeTeamMember(id: string) {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("team_members")
    .delete()
    .eq("id", id);

  if (error) throw error;
  return data;
}

// ==========================================
// --- SONGS & SETLIST LOGIC ACTIONS ---
// ==========================================

/**
 * Fetches the active setlist schedule configurations linked to a parent team node.
 */
export async function getTeamSetlists(teamId: string) {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("setlists")
    .select("*")
    .eq("team_id", teamId)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data || [];
}

/**
 * Downloads the global indexed songs catalog array.
 */
export async function getAllSongs(options?: {
  visibilityScope?: "workspace" | "global";
  workspaceId?: string | null;
}) {
  const supabase = createClient();
  let query = supabase
    .from("songs")
    .select("*")
    .order("title", { ascending: true });

  if (options?.visibilityScope) {
    query = query.eq("visibility_scope", options.visibilityScope);
    if (options.visibilityScope === "workspace" && options.workspaceId) {
      query = query.eq("team_id", options.workspaceId);
    } else if (options.visibilityScope === "workspace") {
      return [];
    }
  }

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

/**
 * Fetches the sequential step-by-step ChordPro lyrics sections chart for an asset ID.
 */
export async function getSongChordChart(songId: string) {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("song_sections")
    .select("*")
    .eq("song_id", songId)
    .order("sequence_order", { ascending: true });

  if (error) throw error;
  return data || [];
}

/**
 * RESTORED: Fetches single track details for the dynamic dynamic routes component.
 */
export async function getSongDetails(songId: string) {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("songs")
    .select("*")
    .eq("id", songId)
    .single();

  if (error) throw error;
  return data;
}