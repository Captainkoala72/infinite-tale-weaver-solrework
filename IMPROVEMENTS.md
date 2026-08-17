# Rebuild notes

This project is a focused rebuild of Infinite Tale Weaver rather than a visual reskin. The original code was reviewed around four recurring problems: a dense new-save form, limited story customization, save data that became increasingly expensive to load, and backend/AI concerns mixed too closely into the browser experience.

## Product and interface

- Replaced **Create New Save** with a responsive three-step Story Builder: **World**, **Character**, and **How It Plays**.
- Added Quick Start, section-level randomization, inline validation, a live review panel, and local draft recovery.
- Added custom genre, premise, tone, art direction, character appearance, sports-story details, danger rules, and media/model controls.
- Rebuilt the story library around lightweight cards with rename, duplicate-setup, JSON export, and deliberate delete actions.
- Split the play screen into smaller scene and choice components, improved mobile safe areas and horizontal choice access, and added a mobile journal.
- Added editable in-story settings with continuity warnings for changes that could visibly contradict an established adventure.
- Improved typography, focus states, keyboard behavior, reduced-motion support, status messaging, and accessible labels.

## Story continuity and media

- Uses globally unique scene IDs, avoiding collisions in long-running stories.
- Keeps the opening premise and detailed protagonist appearance in the ongoing model context.
- Sends a bounded recent-history window to the model so stories can continue without an ever-growing request payload.
- Persists generated images and video to Firebase Storage and stores durable URLs with each scene.
- Treats video covers separately from still artwork and supports a true text-only setting.

## Firebase architecture

- Removed the Supabase client, server integration, schema, and Lovable runtime packages.
- Added Firebase Authentication with Google sign-in.
- Stores lightweight adventure metadata separately from full state and ordered scene documents in Cloud Firestore.
- Reconstructs a complete adventure only when it is opened, keeping the library query small as stories grow.
- Protects adventures and media with owner-only Firestore and Storage rules.
- Keeps fate-event outcomes server-controlled and verifies a Firebase ID token for every AI or fate server call.
- Adds composite indexes for library sorting and pending fate-event lookup.

## Gemini and server safety

- Makes Gemini the default visible provider for story generation, artwork, narration, live character voice, and optional video.
- Keeps Gemini and Firebase Admin credentials on the server; no private AI key is bundled into client JavaScript.
- Adds per-user daily request limits for chat, image, video, and voice features.
- Uses structured story responses and defensive parsing/repair to preserve playable state when a model response is imperfect.
- Leaves legacy provider adapters optional and hidden so the standard Google AI Studio setup needs only Gemini credentials.

## Maintainability

- Migrated the production setup to TanStack Start, Vite, and a Nitro Node server entry.
- Centralized Firebase auth, storage, save, model, voice, and prompt responsibilities into dedicated modules.
- Added strict TypeScript validation, ESLint, Prettier, deployable Firebase rules/indexes, a safe environment template, and complete setup documentation.

This edition intentionally starts with a fresh Firebase data store. Old Supabase saves are not migrated, matching the requested clean backend replacement.
