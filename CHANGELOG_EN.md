# Changelog

All notable changes, refactoring, and bug fixes are documented in this file.

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
