import { NextResponse } from "next/server";
import type { User } from "@supabase/supabase-js";
import { createClient } from "../../utils/supabase/server";

type ApiAccessResult =
  | { ok: true; user: User; release: () => Promise<void> }
  | { ok: false; response: NextResponse };

export async function requireRateLimitedUser(
  route: string,
  limit = 30,
): Promise<ApiAccessResult> {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Authentication required." }, { status: 401 }),
    };
  }

  const { data: allowed, error } = await supabase.rpc("consume_api_rate_limit", {
    p_route: route,
    p_limit: limit,
    p_window_seconds: 60,
  });
  if (error) {
    console.error("API rate-limit check failed.", { route, code: error.code });
    return {
      ok: false,
      response: NextResponse.json({ error: "Request protection is temporarily unavailable." }, { status: 503 }),
    };
  }
  if (allowed !== true) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Too many requests. Please try again shortly." },
        { status: 429, headers: { "Retry-After": "60" } },
      ),
    };
  }

  const { data: slotId, error: slotError } = await supabase.rpc("acquire_api_request_slot", {
    p_route: route,
  });
  if (slotError) {
    console.error("API concurrency check failed.", { route, code: slotError.code });
    return {
      ok: false,
      response: NextResponse.json({ error: "Request protection is temporarily unavailable." }, { status: 503 }),
    };
  }
  if (typeof slotId !== "string") {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Too many requests are already in progress. Please try again shortly." },
        { status: 429, headers: { "Retry-After": "5" } },
      ),
    };
  }

  return {
    ok: true,
    user,
    release: async () => {
      try {
        const { error: releaseError } = await supabase.rpc("release_api_request_slot", {
          p_slot_id: slotId,
        });
        if (releaseError) {
          console.warn("API concurrency slot release failed.", { route, code: releaseError.code });
        }
      } catch (releaseError) {
        console.warn("API concurrency slot release failed; the lease will expire automatically.", { route, releaseError });
      }
    },
  };
}
