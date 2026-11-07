"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "../utils/supabase/client";
import { useEngine } from "../app/context/EngineContext";

interface PositionRequest {
  request_id: string;
  requester_id: string;
  requester_name: string | null;
  current_position: string | null;
  requested_position: string;
  submitted_at: string;
  status: "pending";
}

function isPositionRequest(value: unknown): value is PositionRequest {
  if (!value || typeof value !== "object") return false;
  const request = value as Record<string, unknown>;
  return typeof request.request_id === "string" &&
    typeof request.requester_id === "string" &&
    typeof request.requested_position === "string" &&
    typeof request.submitted_at === "string" &&
    request.status === "pending";
}

function getDatabaseErrorInfo(error: unknown) {
  if (!error || typeof error !== "object") {
    return {
      code: "",
      message: error instanceof Error ? error.message : String(error),
      details: "",
      hint: "",
    };
  }

  const value = error as Record<string, unknown>;
  return {
    code: typeof value.code === "string" ? value.code : "",
    message: typeof value.message === "string" ? value.message : "Unknown database error",
    details: typeof value.details === "string" ? value.details : "",
    hint: typeof value.hint === "string" ? value.hint : "",
  };
}

export default function PositionRequestsFab() {
  const supabase = createClient();
  const { activeRole, simulatedRole, userTeamId } = useEngine();
  const [requests, setRequests] = useState<PositionRequest[]>([]);
  const [loadedWorkspaceId, setLoadedWorkspaceId] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [reviewError, setReviewError] = useState("");
  const [unavailableWorkspaceId, setUnavailableWorkspaceId] = useState<string | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");
  const [reviewingRequestId, setReviewingRequestId] = useState<string | null>(null);

  const canReview = simulatedRole === "none" && ["admin", "moderator"].includes(activeRole);

  const loadRequests = useCallback(async () => {
    if (!userTeamId || !canReview) return;

    setIsLoading(true);
    try {
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) throw sessionError;
      if (!session) {
        setRequests([]);
        setLoadedWorkspaceId(userTeamId);
        setReviewError("");
        return;
      }

      const { data, error } = await supabase.rpc("list_pending_position_reassignment_requests", {
        p_workspace_id: userTeamId,
      });
      if (error) throw error;
      const rows: unknown = data;
      if (!Array.isArray(rows) || !rows.every(isPositionRequest)) {
        throw new Error("The position request list returned an unexpected response.");
      }
      setRequests(rows);
      setLoadedWorkspaceId(userTeamId);
      setReviewError("");
    } catch (error) {
      const errorInfo = getDatabaseErrorInfo(error);
      if (errorInfo.code === "PGRST202" || errorInfo.code === "42883") {
        console.warn(
          "Workspace position request RPC is unavailable. Apply the workspace position requests Supabase migration.",
          errorInfo,
        );
        setUnavailableWorkspaceId(userTeamId);
        setReviewError("Position request database functions are not installed. Apply the latest Supabase migration, then retry.");
      } else {
        console.error("Could not load workspace position requests.", errorInfo);
        setReviewError("Position requests could not be loaded. Check your connection and retry.");
      }
      setRequests([]);
      setLoadedWorkspaceId(userTeamId);
    } finally {
      setIsLoading(false);
    }
  }, [canReview, supabase, userTeamId]);

  useEffect(() => {
    if (!canReview || !userTeamId || unavailableWorkspaceId === userTeamId) return;
    const timer = window.setTimeout(() => void loadRequests(), 0);
    const interval = window.setInterval(() => void loadRequests(), 30_000);
    return () => {
      window.clearTimeout(timer);
      window.clearInterval(interval);
    };
  }, [canReview, loadRequests, unavailableWorkspaceId, userTeamId]);

  const handleReview = async (request: PositionRequest, approve: boolean) => {
    const { data: { session }, error: authError } = await supabase.auth.getSession();
    if (authError) {
      console.error("Could not verify the reviewer session.", getDatabaseErrorInfo(authError));
      setReviewError("Your session could not be verified. Please sign in again.");
      return;
    }
    if (!session) {
      setReviewError("Your session could not be verified. Please sign in again.");
      return;
    }
    if (request.requester_id === session.user.id) {
      setReviewError("You cannot review your own position request.");
      return;
    }
    if (!window.confirm(
      approve
        ? `Approve ${request.requester_name || "this member"}'s request for ${request.requested_position}?`
        : `Reject ${request.requester_name || "this member"}'s request for ${request.requested_position}?`,
    )) return;

    setReviewingRequestId(request.request_id);
    setReviewError("");
    try {
      const { error } = await supabase.rpc("review_position_reassignment_request", {
        p_request_id: request.request_id,
        p_approve: approve,
        p_rejection_reason: approve ? null : rejectionReason.trim() || null,
      });
      if (error) throw error;
      setRejectionReason("");
      await loadRequests();
    } catch (error) {
      console.error("Could not review the position request.", error);
      setReviewError(error instanceof Error ? error.message : "The request could not be reviewed.");
    } finally {
      setReviewingRequestId(null);
    }
  };

  const scopedRequests = loadedWorkspaceId === userTeamId ? requests : [];
  const scopedReviewError = loadedWorkspaceId === userTeamId ? reviewError : "";
  if (!canReview || !userTeamId || (scopedRequests.length === 0 && !scopedReviewError)) return null;

  return (
    <>
      {scopedRequests.length > 0 && (
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          aria-label={`Review ${scopedRequests.length} pending position request${scopedRequests.length === 1 ? "" : "s"}`}
          className="fixed bottom-24 right-4 z-[180000] flex min-h-12 items-center gap-2 rounded-full bg-primary px-4 py-3 text-xs font-black text-on-primary shadow-xl transition hover:bg-primary/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary md:bottom-6 md:right-6"
        >
          <span aria-hidden="true">♙</span>
          <span>Position Requests</span>
          <span className="rounded-full bg-white px-2 py-1 text-[10px] text-primary">{scopedRequests.length}</span>
        </button>
      )}

      {scopedReviewError && (
        <div
          role="alert"
          className="fixed bottom-24 right-4 z-[180000] flex max-w-[min(24rem,calc(100vw-2rem))] items-center gap-3 rounded-xl border border-error/30 bg-surface-container-high p-3 text-xs text-on-surface shadow-xl md:bottom-6 md:right-6"
        >
          <span>{scopedReviewError}</span>
          <button
            type="button"
            onClick={() => {
              setUnavailableWorkspaceId(null);
              void loadRequests();
            }}
            className="shrink-0 rounded-lg bg-primary px-3 py-2 font-bold text-on-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            Retry
          </button>
        </div>
      )}

      {isOpen && (
        <div className="fixed inset-0 z-[210000] flex items-center justify-center bg-black/70 p-4" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setIsOpen(false);
        }}>
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="position-review-title"
            className="max-h-[85dvh] w-full max-w-xl overflow-y-auto rounded-2xl border border-outline-variant bg-surface-container p-5 text-on-surface shadow-2xl"
          >
            <header className="mb-4 flex items-center justify-between gap-3">
              <div>
                <h2 id="position-review-title" className="text-lg font-black">Position Requests</h2>
                <p className="text-xs text-on-surface-variant">Pending requests for this workspace only.</p>
              </div>
              <button type="button" onClick={() => setIsOpen(false)} aria-label="Close position requests" className="rounded-lg px-3 py-2 text-sm text-on-surface-variant hover:bg-surface-container-high">✕</button>
            </header>

            {scopedReviewError && <p className="mb-3 rounded-lg bg-error/10 p-3 text-xs text-error" role="alert">{scopedReviewError}</p>}
            {isLoading && <p className="py-5 text-center text-xs text-on-surface-variant" role="status">Loading requests…</p>}
            {!isLoading && scopedRequests.map((request) => (
              <article key={request.request_id} className="mb-3 rounded-xl border border-outline-variant bg-surface-container-high p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-bold">{request.requester_name || "Workspace member"}</h3>
                    <p className="mt-1 text-xs text-on-surface-variant">
                      {request.current_position || "No position"} <span aria-hidden="true">→</span> {request.requested_position}
                    </p>
                  </div>
                  <span className="rounded-full bg-amber-500/15 px-2 py-1 text-[10px] font-black uppercase text-amber-300">{request.status}</span>
                </div>
                <p className="mt-2 text-[10px] text-on-surface-variant">
                  Submitted {new Date(request.submitted_at).toLocaleString()}
                </p>
                <label htmlFor={`rejection-reason-${request.request_id}`} className="sr-only">Optional rejection reason</label>
                <input
                  id={`rejection-reason-${request.request_id}`}
                  value={rejectionReason}
                  onChange={(event) => setRejectionReason(event.target.value.slice(0, 500))}
                  placeholder="Optional reason if rejecting"
                  maxLength={500}
                  className="mt-3 h-10 w-full rounded-lg border border-outline-variant bg-surface px-3 text-xs"
                />
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    disabled={reviewingRequestId === request.request_id}
                    onClick={() => void handleReview(request, false)}
                    className="rounded-lg border border-outline-variant px-3 py-2 text-xs font-bold text-on-surface-variant disabled:opacity-50"
                  >
                    Reject
                  </button>
                  <button
                    type="button"
                    disabled={reviewingRequestId === request.request_id}
                    onClick={() => void handleReview(request, true)}
                    className="rounded-lg bg-primary px-3 py-2 text-xs font-bold text-on-primary disabled:opacity-50"
                  >
                    {reviewingRequestId === request.request_id ? "Reviewing…" : "Approve"}
                  </button>
                </div>
              </article>
            ))}
            {!isLoading && scopedRequests.length === 0 && (
              <p className="py-5 text-center text-xs text-on-surface-variant">No pending requests.</p>
            )}
          </section>
        </div>
      )}
    </>
  );
}
