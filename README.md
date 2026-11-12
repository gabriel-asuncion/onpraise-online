content = """
# 🎸 Live Worship Performance Engine

A stage-ready, ultra-low latency setlist manager and teleprompter engine built for modern worship teams. Designed to keep the entire band in perfect sync during live performances with real-time WebSockets, zero-latency audio guide cues, and a hardware-accelerated 60fps rendering timeline.

---

## ✨ Core Features

* **⚡ Real-Time Stage Sync:** Powered by Supabase WebSockets. The Music Director (MD) drives the setlist, instantly synchronizing the lyrics, metronome, and section jumps across all band members' devices (iPads, phones, displays).
* **🧠 Smart Audio Cues:** Zero-latency vocal guide cues (e.g., "Chorus", "Verse 1", "Bridge") are intelligently preloaded into device RAM by scanning the setlist AST tree. Cues fire automatically 4 beats before section transitions.
* **🏎️ Hardware-Accelerated Teleprompter:** Custom `requestAnimationFrame` timeline loop decoupled from React state to eliminate layout thrashing. Features $O(1)$ memoized lyric rendering to ensure buttery smooth 60fps scrolling on older stage devices.
* **🎼 Dynamic AST Transposer:** Chords are parsed into an Abstract Syntax Tree and transposed in memory—eliminating the need for heavy regex calculations during the render cycle. Change keys instantly without dropping frames.
* **📅 Event & Roster Management:** Multi-campus workspace architecture. Admins can schedule events, assign volunteers to specific roles (VAST, Pastor, Dancer, Musician, Backup, Music Leader), and manage cross-team access.
* **🧱 Drag & Drop Setlist Builder:** Construct unique song structures on the fly. Reorder sections, override section timings, and instantly deploy updates to the team.

## 🛠️ Tech Stack

* **Framework:** Next.js 14+ (App Router)
* **Language:** TypeScript
* **Styling:** Tailwind CSS
* **Database & Auth:** Supabase (PostgreSQL, Row Level Security)
* **Real-Time:** Supabase Channels (WebSockets)

## 🚀 Getting Started

### 1. Clone & Install

```bash
git clone <repository-url>
cd worship-engine
npm install
```

### 2. Environment Variables
Create a .env.local file in the root directory and add your Supabase credentials:

```bash
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
```

### 3. Database Setup (Supabase)
Ensure the following tables are created in your Supabase SQL Editor with appropriate RLS policies:

- profiles (User registry, multi-campus IDs, ministries)
- teams (Workspace teams for multi-campus isolation)
- events (Service dates, descriptions, service types)
- event_rosters (Role assignments per event)
- songs (Global song library, default BPM, keys, section timings)
- setlists (Groups of songs attached to an event)
- setlist_songs (Songs mapped to a setlist with custom structures and keys)

Note: For local development, you may need to temporarily open RLS policies to allow inserts/deletes without constraint blockers.

### 4. Run the Development Server

```bash
npm run dev
```

Open http://localhost:3000 with your browser to see the result.

### Live and solo MIDI EQ

In MIDI Setup, pair a controller and learn **EQ / Light Show Mode**, **Shuffle Light Show Preset**, and
**Stop and Return to 0:00**. Light show mode exclusively controls MCU channel-one notes 0–31. The mode
toggle, preset encoder, mapped faders, and mapped knobs remain usable; other MIDI button actions are
blocked. It cycles through 24 animated presets, selecting a
new one when playback starts and every four measures. The preset encoder selects a preset until playback
restarts or the HUD shuffle is pressed. The HUD can shuffle or exit the show.
Exiting restores normal MIDI feedback. Play / Stop pauses at the current position; the separate stop
action returns to YouTube 0:00. Scrubbing before the first section is limited by the song's sync offset.
In live and solo modes, the **Local Click Offset** MIDI encoder shifts only this device's click by 10 ms per
step (clockwise later, counter-clockwise earlier), up to 1,000 ms either way. A floating value appears
while adjusting. It resets on stop and
does not change the song, guide cues, other devices, or the saved sync offset.
MIDI Setup also offers transpose and reset, click-sound selection, and timeline zoom. Live transpose
is shared for the current session by the music director; solo transpose is local. Reset returns to
the setlist key in live or the original song key in solo. Relearn the light-show preset control as an
MCU encoder if it was previously assigned to a button.

🏗️ Architecture Highlights
The Engine Loop
The performance teleprompter bypasses React's traditional state management for high-frequency updates. The metronome and progress bars are mutated via direct DOM Ref manipulation, ensuring the engine never triggers a re-render cascade during a song.

Intersection Observer Sync
Scroll-tracking is offloaded to the browser's GPU using the IntersectionObserver API. If a musician manually scrolls away from the active lyric line, a non-blocking "Sync Back" button appears instantly, allowing them to snap back to the MD's playhead without interrupting the background clock.

Smart Garbage Collection
When a performance is halted or transitioning tracks, the engine executes a strict local reset sequence—destroying old animation frames, clearing network locks, and resetting the metronome UI to prevent memory leaks and ghost beats.

Built with precision for worship ministries that demand excellence.