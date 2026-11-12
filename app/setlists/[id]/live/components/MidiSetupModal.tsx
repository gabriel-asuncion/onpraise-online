"use client";

import React, { useState } from "react";
import {
  CONTROL_ACTIONS,
  ControlActionId,
  MidiDeviceOption,
  UserControlPreferences,
} from "../hooks/useKeyboardMidiControls";
import MidiProfileSwitcher from "../../../../components/MidiProfileSwitcher";
import type { MidiProfilesDocument } from "../hooks/midiProfiles";

export interface MidiSetupModalProps {
  preferences: UserControlPreferences;
  profileDocument: MidiProfilesDocument;
  activeProfileId: string | null;
  devices: MidiDeviceOption[];
  outputNames: string[];
  lastMidiMessage: string | null;
  beatNoteCount: number;
  setBeatNoteCount: (count: number) => string | null;
  isLoading: boolean;
  isSaving: boolean;
  isMidiSupported: boolean;
  preferenceError: string | null;
  midiError: string | null;
  learningAction: ControlActionId | null;
  unavailableActions?: ControlActionId[];
  onClose: () => void;
  onScan: () => void;
  onPairDevice: (deviceId: string) => void;
  onLearn: (actionId: ControlActionId) => void;
  onClearMapping: (actionId: ControlActionId) => void;
  onClearAll: () => void;
  onCancelLearn: () => void;
  onSelectProfile: (profileId: string) => void;
  onCreateProfile: (name: string) => void;
  onRenameProfile: (profileId: string, name: string) => void;
  onDeleteProfile: (profileId: string) => void;
}

export function MidiSetupModal({
  preferences,
  profileDocument,
  activeProfileId,
  devices,
  outputNames,
  lastMidiMessage,
  beatNoteCount,
  setBeatNoteCount,
  isLoading,
  isSaving,
  isMidiSupported,
  preferenceError,
  midiError,
  learningAction,
  unavailableActions = [],
  onClose,
  onScan,
  onPairDevice,
  onLearn,
  onClearMapping,
  onClearAll,
  onCancelLearn,
  onSelectProfile,
  onCreateProfile,
  onRenameProfile,
  onDeleteProfile,
}: MidiSetupModalProps) {
  const categories = ["Playback", "Audio", "Display", "Visuals / Hardware"] as const;
  const pairedDeviceConnected = devices.some((device) => device.id === preferences.pairedDeviceId);
  const [draftCount, setDraftCount] = useState<string | null>(null);
  const [countError, setCountError] = useState("");

  return (
    <div
      className="fixed inset-0 z-[300000] flex items-end justify-center bg-black/70 p-3 backdrop-blur-sm sm:items-center"
      data-shortcuts-disabled="true"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="midi-setup-title"
        className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-outline-variant/30 bg-surface-container-low text-on-surface shadow-2xl"
      >
        <header className="flex items-center justify-between border-b border-outline-variant/20 px-5 py-4">
          <div>
            <h2 id="midi-setup-title" className="text-base font-extrabold">MIDI Setup</h2>
            <p className="mt-1 text-xs text-on-surface-variant">Pair one controller, then learn actions and faders.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close MIDI setup" className="flex h-9 w-9 items-center justify-center rounded-full bg-surface-container-high text-on-surface-variant hover:text-on-surface">
            <span className="material-symbols-outlined">close</span>
          </button>
        </header>

        <div className="flex-1 space-y-5 overflow-y-auto p-4 sm:p-5">
          <MidiProfileSwitcher
            profiles={profileDocument.profiles}
            activeProfileId={activeProfileId}
            onSelect={onSelectProfile}
            onCreate={onCreateProfile}
            onRename={onRenameProfile}
            onDelete={onDeleteProfile}
            disabled={isLoading}
          />

          <section className="space-y-3 rounded-xl border border-outline-variant/20 bg-surface-container p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold">Controller pairing</h3>
                <p className="mt-1 text-xs text-on-surface-variant">
                  {preferences.pairedDeviceId
                    ? pairedDeviceConnected
                      ? `Paired: ${preferences.pairedDeviceName || "MIDI device"}`
                      : `Not connected: ${preferences.pairedDeviceName || "paired device"}`
                    : "No controller paired"}
                </p>
              </div>
              <button type="button" onClick={onScan} className="rounded-lg bg-primary px-3 py-2 text-xs font-bold text-on-primary hover:opacity-90">
                Scan MIDI devices
              </button>
            </div>

            {devices.length > 0 && (
              <label className="block space-y-1.5">
                <span className="text-[11px] font-semibold text-on-surface-variant">Select one connected controller</span>
                <select
                  value={preferences.pairedDeviceId ?? ""}
                  onChange={(event) => onPairDevice(event.target.value)}
                  className="w-full rounded-lg border border-outline-variant/30 bg-surface-container-low px-3 py-2 text-sm text-on-surface"
                >
                  <option value="">Unpair controller</option>
                  {devices.map((device) => (
                    <option key={device.id} value={device.id}>{device.name}{device.state === "connected" ? "" : ` (${device.state})`}</option>
                  ))}
                </select>
              </label>
            )}
            {isMidiSupported && devices.length === 0 && (
              <p className="text-xs text-on-surface-variant">No MIDI inputs detected yet. Connect a controller, then scan again.</p>
            )}

            {!isMidiSupported && (
              <p role="status" className="rounded-lg bg-amber-500/10 p-3 text-xs text-amber-300">
                MIDI is unavailable in this browser. Use a supported desktop browser over HTTPS, or continue with keyboard shortcuts.
              </p>
            )}
            <p className="text-xs text-on-surface-variant">
              MIDI outputs: {outputNames.length ? outputNames.join(", ") : "None detected. The Bluetooth bridge must expose a MIDI output for lights."}
            </p>
            <p className="text-xs text-on-surface-variant" aria-live="polite">
              Last input: {lastMidiMessage ?? "No MIDI messages received yet. Press a controller button to test."}
            </p>
            {midiError && <p role="alert" className="text-xs text-error">{midiError}</p>}
            {preferenceError && <p role="alert" className="text-xs text-error">{preferenceError}</p>}
            <p className="text-[10px] text-on-surface-variant">
              {isLoading ? "Loading your saved controls…" : isSaving ? "Saving preferences…" : "Preferences are saved to your user account."}
            </p>
          </section>

          {learningAction && (
            <div role="status" className="flex items-center justify-between gap-3 rounded-xl border border-primary/40 bg-primary/10 px-4 py-3 text-sm">
              <span>Press a controller button or move a fader for <strong>{learningAction === "beatLightFirst" ? "First beat light" : CONTROL_ACTIONS.find((action) => action.id === learningAction)?.label}</strong>.</span>
              <button type="button" onClick={onCancelLearn} className="shrink-0 rounded-md px-2 py-1 text-xs font-bold text-primary">Cancel</button>
            </div>
          )}

          <section className="space-y-2 rounded-xl border border-outline-variant/20 bg-surface-container p-4">
            <h3 className="text-sm font-bold">Metronome lights</h3>
            <p className="text-xs text-on-surface-variant">Consecutive notes are split evenly across four beats. This profile&apos;s live and solo pages share this setting.</p>
            <div className="flex flex-wrap items-end gap-3">
              <label className="flex flex-col gap-1 text-xs">Number of notes
                <input type="number" min={4} max={128} step={4} value={draftCount ?? String(beatNoteCount)}
                  onChange={(event) => { setDraftCount(event.target.value); setCountError(""); }}
                  onBlur={() => {
                    if (draftCount === null) return;
                    const error = setBeatNoteCount(draftCount.trim() ? Number(draftCount) : NaN);
                    setCountError(error ?? "");
                    if (!error) setDraftCount(null);
                  }}
                  className="w-24 rounded-md border border-outline-variant/30 bg-surface-container-low px-2 py-1.5" />
              </label>
              <div className="text-xs">First note: {preferences.beatLights ? `${preferences.beatLights.firstNote} (Ch ${preferences.beatLights.channel + 1})` : "MCU default or editor profile"}</div>
              <button type="button" disabled={!pairedDeviceConnected || Boolean(countError) ||
                (draftCount !== null && (!Number.isInteger(Number(draftCount)) || Number(draftCount) < 4 || Number(draftCount) > 128 || Number(draftCount) % 4 !== 0))}
                onClick={() => learningAction === "beatLightFirst" ? onCancelLearn() : onLearn("beatLightFirst")}
                className="rounded-lg bg-primary px-3 py-2 text-xs font-bold text-on-primary disabled:opacity-40">
                {learningAction === "beatLightFirst" ? "Cancel learn" : "Learn first note"}
              </button>
            </div>
            {countError && <p role="alert" className="text-xs text-error">{countError}</p>}
          </section>

          {categories.map((category) => (
            <section key={category} className="space-y-2">
              <h3 className="px-1 text-xs font-black uppercase tracking-widest text-on-surface-variant">{category}</h3>
              <div className="overflow-hidden rounded-xl border border-outline-variant/20 bg-surface-container">
                {CONTROL_ACTIONS.filter((action) => action.category === category).map((action) => {
                  const mapping = preferences.mappings[action.id];
                  const isLearning = learningAction === action.id;
                  const isUnavailable = unavailableActions.includes(action.id);
                  const mappingDescription = mapping
                    ? `${mapping.deviceName} · ${mapping.messageType === "pitchbend" ? "Pitch bend" : `${mapping.messageType === "cc" ? "CC" : "Note"} ${mapping.number}`} · Ch ${mapping.channel + 1}`
                    : null;
                  return (
                    <div key={action.id} className="flex items-center justify-between gap-3 border-b border-outline-variant/10 px-3 py-2.5 last:border-b-0">
                      <div className="min-w-0">
                        <div className="truncate text-xs font-semibold">{action.label}</div>
                        <div className="mt-0.5 truncate text-[10px] text-on-surface-variant">
                          {isUnavailable
                            ? "Not available in Solo mode"
                            : action.id === "cycleLightShowPreset" && mapping && mapping.messageType !== "cc"
                              ? "Previous button mapping is inactive. Relearn using an MCU encoder."
                            : mappingDescription
                              ? `Keyboard: ${action.shortcut} · MIDI: ${mappingDescription}`
                              : `Keyboard: ${action.shortcut}`}
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-1.5">
                        {mapping && (
                          <button type="button" onClick={() => onClearMapping(action.id)} aria-label={`Clear ${action.label} MIDI mapping`} className="rounded-md px-2 py-1.5 text-[10px] font-bold text-on-surface-variant hover:bg-surface-container-high">
                            Clear
                          </button>
                        )}
                        <button
                          type="button"
                          disabled={isUnavailable || !preferences.pairedDeviceId || !pairedDeviceConnected || isLoading}
                          onClick={() => onLearn(action.id)}
                          className={`min-w-16 rounded-md px-2.5 py-1.5 text-[10px] font-bold disabled:cursor-not-allowed disabled:opacity-40 ${isLearning ? "bg-primary text-on-primary" : "bg-surface-container-high text-on-surface hover:bg-surface-bright"}`}
                        >
                          {isLearning ? "Listening…" : mapping ? "Relearn" : "Learn"}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
        </div>

        <footer className="flex items-center justify-between border-t border-outline-variant/20 px-4 py-3">
          <button type="button" onClick={onClearAll} className="rounded-md px-3 py-2 text-xs font-semibold text-on-surface-variant hover:bg-surface-container-high">
            Clear all MIDI mappings
          </button>
          <button type="button" onClick={onClose} className="rounded-lg bg-primary px-4 py-2 text-xs font-bold text-on-primary">
            Done
          </button>
        </footer>
      </div>
    </div>
  );
}
