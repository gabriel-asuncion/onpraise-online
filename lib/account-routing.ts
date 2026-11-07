export interface AccountProfileSummary {
  full_name: string | null;
  team_id: string | null;
  secondary_team_ids: string[] | null;
  ministries: string[] | null;
  is_super_admin?: boolean | null;
  role?: string | null;
}

export interface AccountLandingDecision {
  profile: AccountProfileSummary | null;
  hasTeamMembership: boolean;
  destination: "/dashboard" | "/onboarding";
}

export function hasProfileMembership(profile: AccountProfileSummary | null): boolean {
  if (!profile) return false;
  return Boolean(
    profile.team_id ||
      profile.secondary_team_ids?.some(Boolean) ||
      profile.ministries?.some((ministry) => typeof ministry === "string" && ministry.trim().length > 0),
  );
}

export function isAccountSetupComplete(
  profile: AccountProfileSummary | null,
  hasTeamMembership = false,
): boolean {
  return Boolean(profile && (hasProfileMembership(profile) || hasTeamMembership));
}

export function getAccountLandingPath(
  profile: AccountProfileSummary | null,
  hasTeamMembership = false,
): "/dashboard" | "/onboarding" {
  return isAccountSetupComplete(profile, hasTeamMembership) ? "/dashboard" : "/onboarding";
}

export async function resolveAccountLandingDecision(
  loadProfile: () => Promise<AccountProfileSummary | null>,
  loadTeamMembership: () => Promise<boolean>,
): Promise<AccountLandingDecision> {
  const profile = await loadProfile();
  const profileMembership = hasProfileMembership(profile);
  const hasTeamMembership = Boolean(profile && !profileMembership && await loadTeamMembership());

  return {
    profile,
    hasTeamMembership,
    destination: getAccountLandingPath(profile, hasTeamMembership),
  };
}
