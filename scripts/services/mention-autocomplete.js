import { isEntryTab } from "../data-models.js";
import { WorkspaceRepository } from "./workspace-repository.js";
import { WorkspaceAccessService } from "./workspace-access-service.js";
import { TextEnrichmentService } from "./text-enrichment-service.js";

/**
 * Calculates pixel coordinates of a caret position inside an input or textarea.
 * @param {HTMLElement} element
 * @param {number} position
 * @returns {{ top: number, left: number, height: number }}
 */
function getCaretCoordinates(element, position) {
  try {
    const div = document.createElement("div");
    const style = window.getComputedStyle(element);
    const properties = [
      "direction", "boxSizing", "width", "height", "overflowX", "overflowY",
      "borderTopWidth", "borderRightWidth", "borderBottomWidth", "borderLeftWidth", "borderStyle",
      "paddingTop", "paddingRight", "paddingBottom", "paddingLeft",
      "fontStyle", "fontVariant", "fontWeight", "fontStretch", "fontSize",
      "fontSizeAdjust", "lineHeight", "fontFamily", "textAlign", "textTransform",
      "textIndent", "textDecoration", "letterSpacing", "wordSpacing",
      "tabSize", "MozTabSize"
    ];

    div.style.position = "absolute";
    div.style.visibility = "hidden";
    div.style.whiteSpace = "pre-wrap";
    div.style.wordWrap = "break-word";
    div.style.top = "0px";
    div.style.left = "-9999px";

    for (const prop of properties) {
      if (style[prop]) div.style[prop] = style[prop];
    }

    div.textContent = element.value.substring(0, position);
    const span = document.createElement("span");
    span.textContent = element.value.substring(position) || ".";
    div.appendChild(span);

    document.body.appendChild(div);
    const coordinates = {
      top: span.offsetTop - element.scrollTop,
      left: span.offsetLeft - element.scrollLeft,
      height: parseInt(style.lineHeight, 10) || parseInt(style.fontSize, 10) || 20
    };
    div.remove();
    return coordinates;
  } catch (e) {
    return { top: 0, left: 0, height: 20 };
  }
}

const TAB_ICONS = Object.freeze({
  notes: "fas fa-sticky-note",
  npc: "fas fa-user-ninja",
  locations: "fas fa-map-marker-alt",
  quests: "fas fa-tasks",
  timeline: "fas fa-history",
  gallery: "fas fa-image",
  labels: "fas fa-tag",
  pins: "fas fa-thumbtack"
});

/**
 * Unified controller for @-mention autocomplete dropdown across ClueBook.
 * Features:
 * - Dynamic entry discovery filtered by WorkspaceAccessService (never leaks hidden/GM entries).
 * - Keyboard navigation (ArrowDown, ArrowUp, Enter, Tab, Escape).
 * - Clean insertion of standardized [[qnmention:id:Name]] tags.
 * - Robust cleanup via AbortController and DOM element destruction.
 */
export class MentionAutocompleteController {
  /**
   * @param {HTMLElement} rootElement
   * @param {Object} [options={}]
   * @param {Function|string} [options.getWorkspaceId]
   * @param {Function|boolean} [options.isShared]
   * @param {Function|string} [options.excludeEntryId]
   * @param {string} [options.selector]
   */
  constructor(rootElement, options = {}) {
    this.root = rootElement;
    this.options = {
      selector: 'textarea.cluebook-input, input[type="text"].cluebook-input, input:not([type]).cluebook-input, .cb-mention-enabled',
      getWorkspaceId: () => "personal",
      ...options
    };

    this._abortController = new AbortController();
    this._dropdown = null;
    this._activeInput = null;
    this._currentMatches = [];
    this._selectedIndex = 0;
    this._atStartPos = -1;

    this._init();
  }

  /**
   * Static factory helper.
   * @param {HTMLElement} rootElement
   * @param {Object} [options={}]
   * @returns {MentionAutocompleteController}
   */
  static attach(rootElement, options = {}) {
    return new MentionAutocompleteController(rootElement, options);
  }

  /**
   * Destroys dropdown DOM element and cleans up all event listeners.
   */
  destroy() {
    this._abortController.abort();
    if (this._dropdown) {
      this._dropdown.remove();
      this._dropdown = null;
    }
    this._activeInput = null;
    this._currentMatches = [];
    this._selectedIndex = 0;
    this._atStartPos = -1;
  }

  _init() {
    if (!this.root) return;

    this._createDropdown();
    this._bindInputs();
    this._bindGlobalEvents();
  }

  _createDropdown() {
    this._dropdown = document.createElement("div");
    this._dropdown.className = "cb-mention-dropdown";
    this._dropdown.style.cssText = `
      position: fixed;
      z-index: 1000000;
      background: rgba(22, 22, 34, 0.98);
      border: 1px solid var(--cb-accent, #7b61ff);
      border-radius: 6px;
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.65);
      min-width: 220px;
      max-width: 360px;
      max-height: 220px;
      overflow-y: auto;
      padding: 4px;
      display: none;
      flex-direction: column;
      gap: 2px;
      box-sizing: border-box;
    `;
    document.body.appendChild(this._dropdown);
  }

  _bindInputs() {
    const signal = this._abortController.signal;
    const targets = this.root.querySelectorAll(this.options.selector);

    targets.forEach((inputEl) => {
      // Skip tag input or non-text inputs
      if (inputEl.classList.contains("cb-tag-input")) return;
      if (inputEl.type && !["text", "search", "textarea"].includes(inputEl.type) && inputEl.tagName !== "TEXTAREA") return;

      inputEl.addEventListener("input", () => this._onInput(inputEl), { signal });
      inputEl.addEventListener("keydown", (ev) => this._onKeyDown(ev, inputEl), { signal });
      inputEl.addEventListener("blur", () => {
        setTimeout(() => {
          if (document.activeElement !== this._dropdown && !this._dropdown?.contains(document.activeElement)) {
            this.closeDropdown();
          }
        }, 180);
      }, { signal });
    });
  }

  _bindGlobalEvents() {
    const signal = this._abortController.signal;

    document.addEventListener("click", (ev) => {
      if (this._dropdown && this._dropdown.style.display !== "none") {
        if (!this._dropdown.contains(ev.target) && ev.target !== this._activeInput) {
          this.closeDropdown();
        }
      }
    }, { signal });

    window.addEventListener("resize", () => {
      if (this._dropdown && this._dropdown.style.display !== "none" && this._activeInput) {
        this._positionDropdown(this._activeInput);
      }
    }, { signal });
  }

  /**
   * Queries valid entries matching the query string from the current workspace.
   * Enforces tab checking and workspace permission filtering.
   * @param {string} [query=""]
   * @returns {Array<{ id: string, tab: string, name: string }>}
   */
  getEntries(query = "") {
    const wsId = typeof this.options.getWorkspaceId === "function"
      ? this.options.getWorkspaceId()
      : (this.options.getWorkspaceId || "personal");

    const data = WorkspaceRepository.getData(wsId);
    if (!data || typeof data !== "object") return [];

    const isShared = typeof this.options.isShared === "function"
      ? this.options.isShared()
      : (this.options.isShared ?? Boolean(WorkspaceRepository.resolveTarget(wsId).isShared));

    const allFolders = WorkspaceRepository.getFolders(wsId) || data.folders || {};

    const excludeId = typeof this.options.excludeEntryId === "function"
      ? this.options.excludeEntryId()
      : this.options.excludeEntryId;

    const results = [];
    const q = query.toLowerCase().trim();

    for (const [tabKey, tabData] of Object.entries(data)) {
      if (!isEntryTab(tabKey)) continue;
      if (!tabData || typeof tabData !== "object") continue;

      for (const [id, entry] of Object.entries(tabData)) {
        if (!entry || typeof entry !== "object") continue;
        if (excludeId && id === excludeId) continue;
        if (!WorkspaceAccessService.canUserViewEntry(entry, allFolders, game.user, isShared)) continue;

        const rawTitle = entry.name || entry.event || entry.text || "";
        const cleanTitle = TextEnrichmentService.stripToPlainText(rawTitle).slice(0, 60).trim();
        const displayName = cleanTitle || (game.i18n ? game.i18n.localize("CLUEBOOK.Entry.Untitled") : "(Untitled)");

        if (!q || displayName.toLowerCase().includes(q)) {
          results.push({
            id,
            tab: tabKey,
            name: displayName
          });
        }
      }
    }

    if (q) {
      results.sort((a, b) => {
        const aStarts = a.name.toLowerCase().startsWith(q);
        const bStarts = b.name.toLowerCase().startsWith(q);
        if (aStarts && !bStarts) return -1;
        if (!aStarts && bStarts) return 1;
        return a.name.localeCompare(b.name);
      });
    }

    return results.slice(0, 10);
  }

  _onInput(inputEl) {
    const pos = inputEl.selectionStart;
    const val = inputEl.value;
    const textBeforeCursor = val.slice(0, pos);

    // Look for an '@' mention query not preceded by an alphanumerical character
    const match = textBeforeCursor.match(/(?:^|[\s\n([{"'>])@([^\n\r@,;:!?[\]{}()<>]{0,40})$/);
    if (!match) {
      this.closeDropdown();
      return;
    }

    const query = match[1];
    // Calculate the exact character index of the '@'
    const fullMatch = match[0];
    const offset = fullMatch.length - query.length - 1;
    this._atStartPos = match.index + offset;
    this._activeInput = inputEl;

    this._showDropdown(inputEl, query);
  }

  _showDropdown(inputEl, query) {
    const matches = this.getEntries(query);
    if (!matches.length) {
      this.closeDropdown();
      return;
    }

    this._currentMatches = matches;
    this._selectedIndex = 0;
    this._renderDropdownItems();
    this._positionDropdown(inputEl);
    this._dropdown.style.display = "flex";
  }

  _renderDropdownItems() {
    if (!this._dropdown) return;
    this._dropdown.replaceChildren();

    this._currentMatches.forEach((entry, idx) => {
      const item = document.createElement("div");
      item.className = `cb-mention-item${idx === this._selectedIndex ? " active" : ""}`;
      item.dataset.index = String(idx);
      item.style.cssText = `
        padding: 6px 10px;
        cursor: pointer;
        font-size: 13px;
        color: #e0e0e0;
        display: flex;
        align-items: center;
        gap: 8px;
        background: ${idx === this._selectedIndex ? "rgba(123, 97, 255, 0.35)" : "transparent"};
        border-radius: 4px;
        transition: background 0.1s ease;
      `;

      const icon = document.createElement("i");
      icon.className = TAB_ICONS[entry.tab] || "fas fa-file-alt";
      icon.style.cssText = "color: var(--cb-accent, #7b61ff); font-size: 11px; flex-shrink: 0; width: 14px; text-align: center;";
      item.appendChild(icon);

      const span = document.createElement("span");
      span.style.cssText = "flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;";
      span.textContent = entry.name;
      item.appendChild(span);

      item.addEventListener("mouseenter", () => {
        this._selectedIndex = idx;
        this._updateActiveItem();
      });

      item.addEventListener("mousedown", (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        this._selectedIndex = idx;
        this._insertSelected();
      });

      this._dropdown.appendChild(item);
    });

    this._scrollToActive();
  }

  _updateActiveItem() {
    if (!this._dropdown) return;
    const items = this._dropdown.querySelectorAll(".cb-mention-item");
    items.forEach((item, idx) => {
      const isActive = idx === this._selectedIndex;
      item.classList.toggle("active", isActive);
      item.style.background = isActive ? "rgba(123, 97, 255, 0.35)" : "transparent";
    });
    this._scrollToActive();
  }

  _scrollToActive() {
    const activeEl = this._dropdown?.children[this._selectedIndex];
    if (activeEl) {
      activeEl.scrollIntoView({ block: "nearest" });
    }
  }

  _positionDropdown(inputEl) {
    if (!this._dropdown || !inputEl) return;
    const rect = inputEl.getBoundingClientRect();
    const dropdownWidth = Math.min(360, Math.max(240, rect.width));
    const dropdownHeight = 220;

    let top = rect.bottom + 4;
    let left = rect.left;

    if (inputEl.tagName === "TEXTAREA") {
      const caret = getCaretCoordinates(inputEl, inputEl.selectionStart);
      top = rect.top + caret.top + caret.height + 4;
      left = rect.left + caret.left;
    }

    const maxLeft = window.innerWidth - dropdownWidth - 10;
    left = Math.max(10, Math.min(left, maxLeft));

    const maxTop = window.innerHeight - dropdownHeight - 10;
    if (top > maxTop && rect.top > dropdownHeight + 10) {
      top = inputEl.tagName === "TEXTAREA"
        ? Math.max(10, top - dropdownHeight - 28)
        : Math.max(10, rect.top - dropdownHeight - 4);
    }

    this._dropdown.style.top = `${Math.round(top)}px`;
    this._dropdown.style.left = `${Math.round(left)}px`;
    this._dropdown.style.width = `${Math.round(dropdownWidth)}px`;
  }

  _onKeyDown(ev, inputEl) {
    if (!this._dropdown || this._dropdown.style.display === "none" || !this._currentMatches.length) {
      return;
    }

    if (ev.key === "ArrowDown") {
      ev.preventDefault();
      this._selectedIndex = (this._selectedIndex + 1) % this._currentMatches.length;
      this._updateActiveItem();
    } else if (ev.key === "ArrowUp") {
      ev.preventDefault();
      this._selectedIndex = (this._selectedIndex - 1 + this._currentMatches.length) % this._currentMatches.length;
      this._updateActiveItem();
    } else if (ev.key === "Enter" || ev.key === "Tab") {
      ev.preventDefault();
      ev.stopPropagation();
      this._insertSelected();
    } else if (ev.key === "Escape") {
      ev.preventDefault();
      ev.stopPropagation();
      this.closeDropdown();
    }
  }

  _insertSelected() {
    if (!this._activeInput || this._selectedIndex < 0 || this._selectedIndex >= this._currentMatches.length) {
      return;
    }
    const entry = this._currentMatches[this._selectedIndex];
    if (!entry) return;

    const inputEl = this._activeInput;
    const val = inputEl.value;
    const before = val.slice(0, this._atStartPos);
    const after = val.slice(inputEl.selectionStart);

    // Sanitize colon and closing bracket to preserve strict regex parsing
    const safeName = (entry.name || "Entry").replace(/[:\]]/g, " ").replace(/\s+/g, " ").trim() || "Entry";
    const mentionText = `[[qnmention:${entry.id}:${safeName}]] `;

    inputEl.value = before + mentionText + after;
    const newPos = before.length + mentionText.length;
    inputEl.setSelectionRange(newPos, newPos);
    inputEl.dispatchEvent(new Event("input", { bubbles: true }));

    this.closeDropdown();
    inputEl.focus();
  }

  /**
   * Closes the dropdown and resets active query state.
   */
  closeDropdown() {
    if (this._dropdown) {
      this._dropdown.style.display = "none";
      this._dropdown.replaceChildren();
    }
    this._currentMatches = [];
    this._selectedIndex = 0;
    this._atStartPos = -1;
  }
}
