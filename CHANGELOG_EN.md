# Changelog

All notable changes, refactoring, and bug fixes are documented in this file.

## [2.0.0] - 2026-08-16

### ⚡ Performance & Scalability (1,000+ Cards & Links)
* **Zero-Reflow Thread Engine:** Completely eliminated Layout Thrashing during card dragging. Card dimensions and link graphs are pre-indexed in memory, with 0 DOM queries and 0 `offsetWidth`/`offsetHeight` reads during mouse movement.
* **Incremental Link Updates:** Dragging a card (or group of cards) now updates only its connected threads instead of recalculating hundreds of lines across the whole board.
* **Instant Lasso Selection:** Lasso collision detection is now evaluated via fast in-memory AABB mathematical tests (<0.1ms for 1,000 cards).
* **Linear O(N+L) Data Pipeline:** Replaced nested entity lookups in `_processExplicitLinks` with `Map` hash structures.
* **Hardware-Accelerated Zoom & Pan:** Removed timer-based `textShadow` repaint hacks; pan and zoom now run directly on the GPU compositor at smooth 60+ FPS.

### 🖼️ Multimedia & Gallery
* **Dedicated Gallery Tab:** Built a full-featured visual tab for investigation photos, evidence, and clues with an adaptive thumbnail grid.
* **Clipboard Paste (Ctrl+V):** Paste images directly from the clipboard onto the board (under cursor) or into the gallery list with automatic upload.
* **Dual Frame Aesthetics:** Support for retro Polaroid frames (`polaroid`) with handwritten captions and modern frameless cards (`frameless`).
* **Smart Image Cropping & Positioning:** Configurable image fit modes (`contain` / `cover`) and focal point positioning (`center`, `top`, `bottom`).
* **Batch Drag & Drop:** Upload single files or batches of photos directly from your desktop onto the board or list view with automatic layout alignment.
* **Foundry Document Drag & Drop:** Dropping Actors or Items automatically creates image cards using their portrait tokens.
* **Realistic Detective Corkboard Tilt:** Every photo sent to the board (via Ctrl+V, file drops, or context menu) automatically receives a subtle natural tilt between ±4°, creating a genuine detective investigation board atmosphere.
* **Isolated Media Storage:** Secure file management via `MediaService` (`worlds/[world-id]/cluebook-gallery/`) with GM-socket proxy fallback for non-GM players.
* **Lightbox Image Viewer:** High-resolution fullscreen photo inspector accessible with a single click.
* **Board Layering Priority:** Option to auto-stack gallery photos beneath note cards (`galleryAlwaysBelow`).

### 📌 Interactive Pins & Map Markers
* **Alt + Click Fast Placement:** Instantly drop pin markers anywhere on the board or on top of maps/images with a single click and automatic editor focus.
* **Compact Board Pins:** New lightweight pin entity for maps, tactical locations, and key clue hotspots.
* **Rich Icon Set:** Customizable FontAwesome icons (pushpins, map markers, skulls, stars, crosshairs, fire, keys, shields) with individual color controls.
* **Visual Themes:** Transparent, dark frosted glass (`dark-glass`), and light frosted glass (`light-glass`).
* **Rich Info Popovers:** Contextual popovers on click/hover with enriched text, GM notes, and clickable links.

### 🏷️ VisionOS Board Labels & Headings
* **Inline Editing (Double Click):** Edit label headings directly on the board with seamless inline inputs without opening a modal dialog.
* **Board Organization:** Large decorative headings and plaques to partition detective board zones.
* **Glassmorphism Design:** Apple VisionOS frosted glass (`glass`), solid backdrop (`solid`), and pure floating text (`transparent`).
* **Simplified Color Settings:** Dynamically hides background color picker when transparent style is chosen.
* **Typography Control:** Font family selection (`Caveat`, `Inter`, `Courier Prime`, `Cinzel`), pixel-precise font size, and text color picker.

### 🔗 Clean Typography Links & Mentions
* **Link Redesign:** Replaced heavy, dark rectangular boxes with clean bold underlined typography (`font-weight: 700; text-decoration: underline;`).
* **Rich Hover Preview Popovers:** Floating card previews with life status badges (NPC alive/dead), quest progress (active/done/fail), deadlines, locations, and clue photo thumbnails.

### 🛡️ Strict Foundry VTT v14 Standards
* **ForcedDeletion Migration:** Replaced deprecated `-=key` deletion syntax across all actions, models, sockets, and data helpers with `new foundry.data.operators.ForcedDeletion()`.
* **Atomic Batch Deletions:** Combined card and link deletions into single atomic database updates.
* **Formal DataModels:** Extended `ClueBookEntryModel` schema with typed validation and default values for all media, pin, and label properties.
* **Overlay Event Delegation:** Replaced legacy `TextEditor.activateListeners` in `overlay.js` with native DOM `@UUID` click listeners.
* **Strict CSS Scoping:** Enforced 100% selector scoping under module roots (`.cluebook-window`, `.cb-tracker-widget`, `.cb-edit-dialog`, `.cb-tag-manager`).
* **Full Multilingual Localization:** Updated translations across English, Russian, German, and French.

### 🎛️ Smart Status Filters & Ergonomics
* **Quest Status Filter:** Interactive pill buttons in the quest tab header `[ All | ⏳ In Progress | ✅ Completed | ❌ Failed ]` with dynamic count badges for organizing hundreds of tasks.
* **NPC Life Status Filter:** Quick life status filtering for characters `[ All | 💚 Alive | 💀 Dead | ❓ Unknown ]` with real-time counters.
* **1-Click Quick Quest Status Switcher:** Clicking the quest status badge directly opens a rapid dropdown `[ ⏳ In Progress | ✅ Completed | ❌ Failed ]` to update task progress without opening the edit dialog.
* **Deadline Freeze & Visual De-clutter on Done/Failed Quests:** When a quest is completed or failed, the large countdown timer box is automatically hidden from the card face to eliminate noise.
* **Rich Status Popover on Hover:** Hovering over a completed/failed quest badge displays a floating tooltip with assigned deadline details and completion timestamps.
* **Optional Completion Time:** Added an optional "Specify completion time" field in the quest edit modal.

### 🎨 UI/UX Fixes & Stability
* **Overlay Sharing Fix:** Resolved `_formatSCTimestamp is not a function` error when sharing cards with deadlines to players, and simplified the action button title to concise "Share".
* **Double-Click Edit Isolation:** Double-clicking or rapid clicking on quest status badges no longer triggers the edit modal.
* **Floating Portal Menu for Task Status:** Upgraded status selection dropdown to a floating fixed portal to prevent internal card scrolling and clipping.
* **Dangling Link Labels Fix:** Connection lines and label badges are now strictly isolated to render only when both linked cards are actively visible on the board canvas.
* **Smooth Geometric Zoom & Sync:** Upgraded board zoom to scale geometrically with full camera synchronization, impervious to concurrent data updates during mouse wheel rolling.
* **Natural Link Word-Wrapping:** Fixed mid-word line breaking (`word-break: normal; overflow-wrap: break-word;`), ensuring links wrap between whole words rather than breaking arbitrary syllables across letters.
* **Card Controls Visibility:** Fixed card action buttons (`.entry-controls`) clipping against card boundaries.
* **Canvas Text Selection Prevention:** Added `user-select: none` to the board canvas to prevent accidental text selection of the window during panning and dragging.
* **Isolated Button Clicks:** Enhanced event propagation on card control buttons to guarantee instant click response without triggering card dragging or lasso.

## [1.1.2] - 2026-08-10

### ✨ New Features & UX Improvements
* **Collaborative Board Sync:** Implemented smart Live Sync deferral. If you are actively dragging a card, lasso-selecting, panning the camera, or drawing a link, any background updates from other players are gracefully deferred until your action is complete. This completely eliminates the jarring issue of cards "dropping" from your cursor during a drag.

### ⚡ Performance
* **Calendar Time Rendering:** Optimized UI updates when calendar time is running continuously. The widgets will now only re-render when the actual displayed minute changes, eliminating freezes and high CPU load during fast-forward or real-time seconds ticking.

### 🌐 Localization
* **i18n Completion:** Finished replacing all remaining hardcoded strings with localization variables. Full multi-language support across the entire interface.

## [1.1.1] - 2026-08-09

### ✨ New Features
* **Native Calendar Fallback:** Added a built-in Gregorian calendar fallback. The advanced date picker widgets and timeline synchronization will now work perfectly even if no external calendar modules (like SimpleCalendar or Calendaria) are installed.

### 🏗 Refactoring & Architecture
* **Strict DOM Safety:** Completely removed all legacy DOM mutations (`innerHTML`) and jQuery dependencies. Replaced them with safe native ESNext DOM APIs (`document.createElement`, `DOMParser`) to guarantee XSS protection and strict compliance with Foundry V14 architecture standards.
* **Error Boundaries:** Wrapped all global `Hooks` callbacks in `try/catch` statements to ensure that an isolated module failure will never crash the core Foundry canvas.

### 🐛 Bug Fixes
* **V14 UI Controls Crash:** Fixed a crash during the `getSceneControlButtons` hook initialization (`Cannot read properties of undefined (reading 'tokens')`) by safely delaying the active control lookup in Foundry V14.
* **Edit Dialog UI:** Fixed an issue in the Edit Dialog where textareas wouldn't expand. They now dynamically stretch to fill the available vertical space, eliminating empty gaps at the bottom.

### 🎨 UI & UX Improvements
* **Edit Dialog Tags:** Moved the tags input group to the very bottom of the edit dialog for better accessibility. The autocomplete dropdown now opens upwards.
* **Module Settings:** Added an "About" footer to the settings menu containing helpful links to the GitHub repository, Discussions board, and Boosty.

## [1.1.0] - 2026-08-02
* **Accessibility:** Completely overhauled the card hiding system. Replaced the simple "Hide" toggle with an advanced "Visibility" menu allowing you to select individual players who can see the card.

### ✨ New Features
* **Settings Reorganization:** Completely overhauled the settings window for better clarity, splitting options into distinct categories (Appearance, Quick Access, Time Widget, Tracker Widget).
* **FAB Customization:** Added the ability to choose which specific buttons appear in the Quick Access (FAB) menu. You can also now completely disable the Tracker feature.
* **Upcoming Events Tracker:** Added a new floating widget to track upcoming events and quests with deadlines.
  * The tracker is accessed via a new button in the FAB (Quick Add) menu.
  * Players can individually choose which events to track by clicking the new "star" button on Entry Cards (Quests & Timeline).
  * Tracker settings are personalized for each user, including an option to show or hide overdue deadlines.
  * Mentions and UUID links inside the Tracker widget are now fully clickable and automatically open the target entry.
* **Personal Board:** Added the ability to completely delete/clear the Personal Workspace from the Workspaces settings tab.
* **Board:** Added the ability to mass pin or unpin a selected group of cards via the Right-Click Context Menu.
* **Integration:** Added full support for the `Calendaria` module (alongside Simple Calendar), including weather and time synchronization.
* **Localization:** Added German (de) and French (fr) translations.
* **UI/UX:** Completely removed ClueBook's internal time widget and its settings to prevent feature duplication with dedicated calendar modules.
* **Architecture:** Abstracted `TimeService` and `TrackerService` for encapsulated and independent date handling and event tracking.
* **Architecture:** DRY refactored `api.openApp` to unify and centralize internal navigation and tab detection.
### 🐛 Bug Fixes
* **JSON Import:** 
  * Fixed a bug where the UI would hang indefinitely during import. The dialog now correctly closes and passes the data using native `DialogV2.wait`.
  * Importing an entry with an ID that already exists in the board now correctly overwrites the old entry instead of duplicating it or ignoring it.
* **UUID Parsing:** Fixed a bug that prevented inner UUIDs for `JournalEntryPage` and `Item` from parsing correctly when pasted into entry texts.
* **AI Prompt:** Updated the AI JSON generator prompt to mention generic calendar modules instead of hard-coded Simple Calendar.

## [1.0.3] - 2026-07-31

### 🏗 Refactoring & Architecture
* **Styles Modularization:** The monolithic `style.css` has been split into logical modules: `core.css`, `cards.css`, `board.css`, `settings.css`, `components.css`.
* **Scripts Modularization:** The massive `app-actions.js` file has been deprecated. The logic is now distributed across multiple mixins:
  * `entry-actions.js`
  * `workspace-actions.js`
  * `integration-actions.js`
  * `board-actions.js`
  * `app-dragdrop.js` (Drag & Drop logic extracted from `app.js`)
* **Templates Split (Partials):** The bulky `content.hbs` has been broken down into convenient `partial` files:
  * `entry-card.hbs`
  * `tab-workspaces.hbs`
  * `tab-settings.hbs`
  * `tab-board.hbs`
* **Code Cleanup:** Removed leftover legacy code from an unfinished folder feature (deleted `_onAddFolder` and `_onToggleFolder` methods, and removed over 200 lines of CSS from `cards.css`).
* **DRY Principle:** Created a centralized utility `ClueBookApp._formatSCTimestamp()` for formatting `SimpleCalendar` dates. All duplicated code blocks across different files have been replaced with this utility call.

### ✨ New Features
* **Tag Settings:** Added a new setting in the "Integrations" section — "Hide Tags on Cards (Keep Filter)". This allows you to visually hide tags on the entries themselves while retaining the ability to filter by them.
* The original "Hide Tags" option has been renamed to "Hide Tags System (Completely)" for clarity.

### 🐛 Bug Fixes
* **Read-Only Mode:** Fixed the read-only display logic. The separation of templates into partial files had broken the relative Handlebars paths (`../isReadOnly`). Replacing them with `@root.isReadOnly` restored full functionality.
* **Visibility Button and GM Secrets:** Fixed the disappearing "Hide from players" button and the broken "GM Secret" section by correcting the context of `isGM` and `settings` (replaced `../` with `@root.`) in `entry-card.hbs`.
* **Color Error (HTML Console Warning):** Fixed the `<input type="color">` console warning: `The specified value "" does not conform to the required format`. Added default values `widgetColor: "#7b61ff"` and `widgetColor2: "#4527a0"` to `DEFAULT_SETTINGS` in `app.js`.
