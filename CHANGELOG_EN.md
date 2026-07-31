# Changelog

All notable changes, refactoring, and bug fixes are documented in this file.

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
