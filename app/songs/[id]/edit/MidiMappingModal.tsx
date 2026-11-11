"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  MIDI_ACTIONS,
  type MidiActionId,
  type MidiBinding,
  type MidiBindingMode,
  type MidiRelativeEncoding,
  type MidiMonitorMessage,
} from "./useMidiLearn";
import MidiProfileSwitcher from "../../../components/MidiProfileSwitcher";
import type { MidiControllerProfile, MidiProfilesDocument } from "../../../setlists/[id]/live/hooks/midiProfiles";

interface MidiMappingModalProps {
  isOpen: boolean;
  onClose: () => void;
  isSupported: boolean;
  isConnected: boolean;
  activeDeviceName: string | null;
  devices: Array<{ id: string; name: string; state: string }>;
  profileDocument: MidiProfilesDocument;
  activeProfileId: string | null;
  isProfileLoading: boolean;
  isProfileSaving: boolean;
  learningActionId: MidiActionId | null;
  bindings: Partial<Record<MidiActionId, MidiBinding>>;
  recentMessages: MidiMonitorMessage[];
  accessError: string | null;
  startListening: (actionId: MidiActionId, mode: MidiBindingMode) => void;
  stopListening: () => void;
  clearBinding: (actionId: MidiActionId) => void;
  resetAllBindings: () => void;
  setBindingMode: (actionId: MidiActionId, mode: MidiBindingMode) => void;
  setBindingChannel: (actionId: MidiActionId, channel: number) => void;
  setRelativeEncoding: (actionId: MidiActionId, encoding: MidiRelativeEncoding) => void;
  scanMidiDevices: () => void;
  pairDevice: (deviceId: string) => void;
  selectProfile: (profileId: string) => void;
  createProfile: (name: string) => void;
  renameProfile: (profileId: string, name: string) => void;
  deleteProfile: (profileId: string) => void;
}

const MODE_LABELS: Record<MidiBindingMode, string> = {
  trigger: "Trigger (Button)",
  absolute: "Absolute (Fader)",
  relative_cw: "Relative (CW Encoder)",
};

function formatBinding(binding: MidiBinding) {
  const channel = binding.channel === -1 ? "Omni" : `Ch ${binding.channel + 1}`;
  const input = binding.type === "cc" ? `CC #${binding.noteOrCcNumber}` : `Note #${binding.noteOrCcNumber}`;
  return `${input} (${channel}) [${MODE_LABELS[binding.mode]}]`;
}

export default function MidiMappingModal(props: MidiMappingModalProps) {
  const {
    isOpen, onClose, isSupported, isConnected, activeDeviceName, devices,
    profileDocument, activeProfileId, isProfileLoading, isProfileSaving, learningActionId,
    bindings, recentMessages, accessError, startListening, stopListening, clearBinding,
    resetAllBindings, setBindingMode, setBindingChannel, setRelativeEncoding,
    scanMidiDevices, pairDevice, selectProfile, createProfile, renameProfile, deleteProfile,
  } = props;
  const [unmappedModes, setUnmappedModes] = useState<Partial<Record<MidiActionId, MidiBindingMode>>>({});
  const [optionsActionId, setOptionsActionId] = useState<MidiActionId | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        stopListening();
        onClose();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isOpen, onClose, stopListening]);

  const portalTarget = typeof document === "undefined" ? null : document.body;
  if (!isOpen || !portalTarget) return null;

  const groupedActions = MIDI_ACTIONS.reduce<Record<string, typeof MIDI_ACTIONS>>((groups, action) => {
    (groups[action.group] ??= []).push(action);
    return groups;
  }, {});
  const activeProfile = profileDocument.profiles.find((profile: MidiControllerProfile) => profile.id === activeProfileId) ?? null;
  const pairedDeviceConnected = devices.some((device) => device.id === activeProfile?.pairedDeviceId && device.state === "connected");
  const beginLearn = (actionId: MidiActionId, mode: MidiBindingMode) => {
    setUnmappedModes((previous) => ({ ...previous, [actionId]: mode }));
    startListening(actionId, mode);
  };
  const onModeChange = (actionId: MidiActionId, mode: MidiBindingMode) => {
    setUnmappedModes((previous) => ({ ...previous, [actionId]: mode }));
    setBindingMode(actionId, mode);
  };

  return createPortal((
    <div
      className="fixed inset-0 z-[300000] flex items-end justify-center bg-black/70 p-3 backdrop-blur-sm sm:items-center"
      data-shortcuts-disabled="true"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          stopListening();
          onClose();
        }
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="midi-mapping-title"
        className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-outline-variant/30 bg-surface-container-low text-on-surface shadow-2xl"
      >
        <header className="flex items-center justify-between border-b border-outline-variant/20 px-5 py-4">
          <div>
            <h2 id="midi-mapping-title" className="text-base font-extrabold">MIDI Setup</h2>
            <p className="mt-1 text-xs text-on-surface-variant">Pair one controller, then learn actions and faders.</p>
          </div>
          <button type="button" onClick={() => { stopListening(); onClose(); }} aria-label="Close MIDI mappings" className="flex h-9 w-9 items-center justify-center rounded-full bg-surface-container-high text-xl text-on-surface-variant hover:text-on-surface">×</button>
        </header>

        <div className="flex-1 space-y-4 overflow-y-auto p-3 sm:p-4">
          <MidiProfileSwitcher
            profiles={profileDocument.profiles}
            activeProfileId={activeProfileId}
            onSelect={selectProfile}
            onCreate={createProfile}
            onRename={renameProfile}
            onDelete={deleteProfile}
            disabled={isProfileLoading}
            compact
          />
          <section className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`max-w-48 truncate rounded-full px-2.5 py-1 text-[10px] font-bold ${activeProfile?.pairedDeviceId && pairedDeviceConnected ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" : "bg-surface-container-high text-on-surface-variant"}`}>
                {activeProfile?.pairedDeviceId
                  ? pairedDeviceConnected
                    ? `Connected: ${activeProfile.pairedDeviceName || activeDeviceName || "MIDI device"}`
                    : `Not connected: ${activeProfile.pairedDeviceName || "paired device"}`
                  : isConnected ? `Connected: ${activeDeviceName}` : "No MIDI input connected"}
              </span>
              <button type="button" onClick={scanMidiDevices} className="rounded-md bg-surface-container-high px-2.5 py-1.5 text-[10px] font-bold text-on-surface hover:bg-surface-bright">
                Scan
              </button>
            {devices.length > 0 && (
              <label className="min-w-0 flex-1">
                <select
                  value={activeProfile?.pairedDeviceId ?? ""}
                  onChange={(event) => pairDevice(event.target.value)}
                  disabled={!activeProfileId}
                  aria-label="Paired MIDI controller"
                  className="w-full rounded-md border border-outline-variant/30 bg-surface-container-low px-2 py-1.5 text-xs text-on-surface disabled:opacity-50"
                >
                  <option value="">Unpair controller</option>
                  {devices.map((device) => <option key={device.id} value={device.id}>{device.name}{device.state === "connected" ? "" : ` (${device.state})`}</option>)}
                </select>
              </label>
            )}
            </div>
          {!isSupported && (
            <p role="status" className="text-[11px] text-amber-700 dark:text-amber-300">
              MIDI is unavailable in this browser. Use a supported desktop browser over HTTPS.
            </p>
          )}
            {accessError && <p role="alert" className="text-xs text-error">{accessError}</p>}
            {(isProfileLoading || isProfileSaving) && <p className="text-[10px] text-on-surface-variant">{isProfileLoading ? "Loading profiles…" : "Saving profiles…"}</p>}
          </section>

          {learningActionId && (
            <div role="status" className="flex items-center justify-between gap-3 rounded-lg border border-primary/40 bg-primary/10 px-3 py-2 text-xs">
              <span>Listening for <strong>{MIDI_ACTIONS.find((action) => action.id === learningActionId)?.label}</strong> — press or move a control.</span>
              <button type="button" onClick={stopListening} className="shrink-0 rounded-md px-2 py-1 text-[10px] font-bold text-primary">Cancel</button>
            </div>
          )}
          {recentMessages.length > 0 && (
            <div className="space-y-0.5 font-mono text-[10px] text-on-surface-variant" aria-live="polite" aria-label="Recent MIDI messages">
              {recentMessages.slice(0, 4).map((message, index) => (
                <div key={`${message.type}-${message.number}-${message.value}-${message.channel}-${index}`}>
                  [Type: {message.type.toUpperCase()}, Number: {message.number}, Value: {message.value}, Channel: {message.channel + 1}]
                </div>
              ))}
            </div>
          )}
          {Object.entries(groupedActions).map(([group, actions]) => (
            <section key={group} className="space-y-2">
              <h3 className="px-1 text-xs font-black uppercase tracking-widest text-on-surface-variant">{group}</h3>
              <div className="overflow-hidden rounded-xl border border-outline-variant/20 bg-surface-container">
                {actions.map((action) => {
                  const binding = bindings[action.id];
                  const mode = binding?.mode ?? unmappedModes[action.id] ?? action.modes[0];
                  const learning = learningActionId === action.id;
                  const showOptions = optionsActionId === action.id;
                  return (
                    <div key={action.id} className={`border-b border-outline-variant/10 last:border-b-0 ${learning ? "bg-primary/10" : ""}`}>
                      <div className="flex items-center justify-between gap-3 px-3 py-2.5">
                        <div className="min-w-0">
                          <div className="truncate text-xs font-semibold" title={action.description}>{action.label}</div>
                          <p className="mt-0.5 truncate text-[10px] text-on-surface-variant">
                            {binding ? formatBinding(binding) : "Unmapped"}
                          </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-1.5">
                          {binding && (
                            <button type="button" onClick={() => clearBinding(action.id)} aria-label={`Clear ${action.label} mapping`} className="rounded-md px-2 py-1.5 text-[10px] font-bold text-on-surface-variant hover:bg-surface-container-high">
                              Clear
                            </button>
                          )}
                          <button
                            type="button"
                            disabled={!isSupported || !activeProfile?.pairedDeviceId || !pairedDeviceConnected}
                            onClick={() => learning ? stopListening() : beginLearn(action.id, mode)}
                            className={`min-w-16 rounded-md px-2.5 py-1.5 text-[10px] font-bold disabled:cursor-not-allowed disabled:opacity-40 ${learning ? "bg-primary text-on-primary" : "bg-surface-container-high text-on-surface hover:bg-surface-bright"}`}
                          >
                            {learning ? "Listening…" : binding ? "Relearn" : "Learn"}
                          </button>
                          <button
                            type="button"
                            onClick={() => setOptionsActionId(showOptions ? null : action.id)}
                            aria-expanded={showOptions}
                            aria-label={`${showOptions ? "Hide" : "Show"} ${action.label} options`}
                            title="Mapping options"
                            className="h-7 w-7 rounded-md text-sm font-bold text-on-surface-variant hover:bg-surface-container-high"
                          >
                            ⋯
                          </button>
                        </div>
                      </div>
                      {learning && <p className="sr-only" aria-live="assertive">Press a key or turn a knob.</p>}
                      {showOptions && (
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-outline-variant/10 px-3 py-2 text-[10px]">
                          <label className="flex items-center gap-2">
                            Mode
                            <select
                              aria-label={`${action.label} input mode`}
                              value={mode}
                              onChange={(event) => onModeChange(action.id, event.target.value as MidiBindingMode)}
                              className="max-w-40 rounded-md border border-outline-variant/30 bg-surface-container-low px-2 py-1.5 text-[10px]"
                            >
                              {action.modes.map((option) => <option key={option} value={option}>{MODE_LABELS[option]}</option>)}
                            </select>
                          </label>
                          {binding && (
                            <label className="flex items-center gap-2">
                              Channel
                              <select
                                value={binding.channel}
                                onChange={(event) => setBindingChannel(action.id, Number(event.target.value))}
                                className="rounded-md border border-outline-variant/30 bg-surface-container-low px-2 py-1.5"
                              >
                                <option value={-1}>Omni</option>
                                {Array.from({ length: 16 }, (_, channel) => <option key={channel} value={channel}>Ch {channel + 1}</option>)}
                              </select>
                            </label>
                          )}
                          {binding?.mode === "relative_cw" && (
                            <label className="flex items-center gap-2">
                              Relative encoding
                              <select
                                value={binding.relativeEncoding ?? "m_vave_cw"}
                                onChange={(event) => setRelativeEncoding(action.id, event.target.value as MidiRelativeEncoding)}
                                className="rounded-md border border-outline-variant/30 bg-surface-container-low px-2 py-1.5"
                              >
                                <option value="m_vave_cw">M-Vave CW (Left/Right)</option>
                                <option value="two_complement">Two&apos;s complement</option>
                                <option value="sign_magnitude">Sign magnitude</option>
                              </select>
                            </label>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
        </div>

        <footer className="flex items-center justify-between border-t border-outline-variant/20 px-3 py-2">
          <button type="button" onClick={() => { stopListening(); resetAllBindings(); }} className="rounded-md px-2 py-1.5 text-[10px] font-semibold text-on-surface-variant hover:bg-surface-container-high">Clear profile mappings</button>
          <button type="button" onClick={() => { stopListening(); onClose(); }} className="rounded-lg bg-primary px-4 py-2 text-xs font-bold text-on-primary">Done</button>
        </footer>
      </section>
    </div>
  ), portalTarget);
}