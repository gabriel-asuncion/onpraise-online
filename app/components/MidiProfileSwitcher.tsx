"use client";

import { useState } from "react";
import type { MidiControllerProfile } from "../setlists/[id]/live/hooks/midiProfiles";

interface MidiProfileSwitcherProps {
  profiles: MidiControllerProfile[];
  activeProfileId: string | null;
  onSelect: (profileId: string) => void;
  onCreate: (name: string) => void;
  onRename: (profileId: string, name: string) => void;
  onDelete: (profileId: string) => void;
  disabled?: boolean;
  compact?: boolean;
}

export default function MidiProfileSwitcher({
  profiles,
  activeProfileId,
  onSelect,
  onCreate,
  onRename,
  onDelete,
  disabled = false,
  compact = false,
}: MidiProfileSwitcherProps) {
  const [creating, setCreating] = useState(false);
  const [draftName, setDraftName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);

  const submitCreate = () => {
    const name = draftName.trim();
    if (!name) return;
    onCreate(name);
    setDraftName("");
    setCreating(false);
  };

  return (
    <section className={compact ? "space-y-2" : "space-y-3 rounded-xl border border-outline-variant/20 bg-surface-container p-4"}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className={compact ? "text-xs font-semibold text-on-surface-variant" : ""}>
          <h3 className={compact ? "text-xs font-bold" : "text-sm font-bold"}>Controller profiles</h3>
          {!compact && <p className="mt-1 text-xs text-on-surface-variant">Save separate mappings for each MIDI controller.</p>}
        </div>
        <button
          type="button"
          disabled={disabled}
          onClick={() => { setCreating(true); setEditingId(null); }}
          aria-label="Add MIDI profile"
          className={`flex items-center justify-center rounded-full bg-primary font-bold text-on-primary disabled:opacity-40 ${compact ? "h-7 w-7 text-base" : "h-9 w-9 text-lg"}`}
        >
          +
        </button>
      </div>
      <div className="flex flex-wrap gap-2">
        {profiles.map((profile) => {
          const selected = profile.id === activeProfileId;
          const editing = profile.id === editingId;
          return (
            <div key={profile.id} className={`flex max-w-full items-center gap-1 rounded-lg border px-2 ${compact ? "py-0.5" : "py-1"} ${selected ? "border-primary/50 bg-primary/10" : "border-outline-variant/30 bg-surface-container-low"}`}>
              {editing ? (
                <input
                  autoFocus
                  value={draftName}
                  onChange={(event) => setDraftName(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      const name = draftName.trim();
                      if (name) onRename(profile.id, name);
                      setEditingId(null);
                    } else if (event.key === "Escape") setEditingId(null);
                  }}
                  onBlur={() => {
                    const name = draftName.trim();
                    if (name && name !== profile.name) onRename(profile.id, name);
                    setEditingId(null);
                  }}
                  aria-label="Profile name"
                  className="w-28 bg-transparent px-1 text-xs outline-none"
                />
              ) : (
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => onSelect(profile.id)}
                  className={`max-w-40 truncate px-1 py-1 text-xs font-bold ${selected ? "text-primary" : "text-on-surface"}`}
                  title={profile.name}
                >
                  {profile.name}
                </button>
              )}
              {selected && !editing && (
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => { setDraftName(profile.name); setEditingId(profile.id); setCreating(false); }}
                  aria-label={`Rename ${profile.name}`}
                  title="Rename profile"
                  className="rounded px-1 text-[10px] text-on-surface-variant hover:bg-surface-container-high"
                >
                  Edit
                </button>
              )}
              {selected && profiles.length > 1 && !editing && (
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => onDelete(profile.id)}
                  aria-label={`Delete ${profile.name}`}
                  title="Delete profile"
                  className="rounded px-1 text-sm text-error hover:bg-error/10"
                >
                  ×
                </button>
              )}
            </div>
          );
        })}
      </div>
      {creating && (
        <form
          className="flex gap-2"
          onSubmit={(event) => { event.preventDefault(); submitCreate(); }}
        >
          <input
            autoFocus
            value={draftName}
            onChange={(event) => setDraftName(event.target.value)}
            onKeyDown={(event) => { if (event.key === "Escape") { setCreating(false); setDraftName(""); } }}
            placeholder="Profile name, e.g. SMC Mixer"
            aria-label="New MIDI profile name"
            className="min-w-0 flex-1 rounded-lg border border-outline-variant/30 bg-surface-container-low px-3 py-2 text-xs text-on-surface outline-none focus:border-primary"
          />
          <button type="submit" disabled={!draftName.trim()} className="rounded-lg bg-primary px-3 py-2 text-xs font-bold text-on-primary disabled:opacity-40">Create</button>
          <button type="button" onClick={() => { setCreating(false); setDraftName(""); }} className="rounded-lg px-2 text-xs text-on-surface-variant hover:bg-surface-container-high">Cancel</button>
        </form>
      )}
    </section>
  );
}
