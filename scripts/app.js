import { ClueBookSocket } from "./socket.js";
import { ClueBookDatePicker } from "./date-picker.js";
import { ClueBookEditDialog } from "./edit-dialog.js";
import { ClueBookDataMixin } from "./app-data.js";
import { ClueBookBoardMixin } from "./app-board.js";
import { ClueBookActionsMixin } from "./app-actions.js";
import { ClueBookTagManager } from "./tag-manager.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

const BaseApp = ClueBookActionsMixin(ClueBookBoardMixin(ClueBookDataMixin(HandlebarsApplicationMixin(ApplicationV2))));

export class ClueBookApp extends BaseApp {
  constructor(options = {}) {
    super(options);
    
    // Store debounced save function per tab
    this._debouncedSaves = {};
  }
  static DEFAULT_OPTIONS = {
    id: "cluebook-app",
    classes: ["cluebook-window"],
    position: {
      width: 1200,
      height: 800
    },
    window: {
      title: "CLUEBOOK.App.Title",
      icon: "fas fa-book",
      resizable: true,
      minimizable: true,
      controls: [
        {
          action: "toggleZenMode",
          icon: "fas fa-expand",
          label: "CLUEBOOK.App.ZenMode"
        }
      ]
    },
    actions: {
      toggleZenMode: ClueBookApp._onToggleZenMode,
      toggleEdit: ClueBookApp._onToggleEdit,
      togglePin: ClueBookApp._onTogglePin,
      toggleVisibility: ClueBookApp._onToggleVisibility,
      shareOverlay: ClueBookApp._onShareOverlay,
      addTime: ClueBookApp._onAddTime,
      deleteEntry: ClueBookApp._onDeleteEntry,
      deleteWorkspace: ClueBookApp._onDeleteWorkspace,
      editWorkspace: ClueBookApp._onEditWorkspace,
      addEntry: ClueBookApp._onAddEntry,
      jumpToBoard: ClueBookApp._onJumpToBoard,
      sendToBoard: ClueBookApp._onSendToBoard,
      removeFromBoard: ClueBookApp._onRemoveFromBoard,
      recenterBoard: ClueBookApp._onRecenterBoard,
      jumpToLinked: ClueBookApp._onJumpToLinked,
      jumpToTab: ClueBookApp._onJumpToTab,
      deleteLink: ClueBookApp._onDeleteLink,
      importJSON: ClueBookApp._onImportJSON,
      copyDataFormat: ClueBookApp._onCopyDataFormat,
      exportJSON: ClueBookApp._onExportJSON,
      pickDate: ClueBookApp._onPickDate,
      clearDate: ClueBookApp._onClearDate,
      activateScene: ClueBookApp._onActivateScene,
      openActor: ClueBookApp._onOpenActor,
      manageTags: ClueBookApp._onManageTags
    }
  };

  get title() {
    return game.i18n.localize(this.options.window.title);
  }

  bringToFront() {
    super.bringToFront();
    if (foundry.applications?.instances) {
      const myZ = parseInt(this.element.style.zIndex || 100);
      for (const app of foundry.applications.instances.values()) {
        if (app.constructor.name === "ClueBookEditDialog" && app.element) {
          const appZ = parseInt(app.element.style.zIndex || 100);
          if (appZ <= myZ) {
            app.element.style.zIndex = myZ + 1;
          }
        }
      }
    }
  }

  static PARTS = {
    tabs: {
      template: "modules/ClueBook/templates/tabs.hbs",
      classes: ["cluebook-tabs"]
    },
    content: {
      template: "modules/ClueBook/templates/content.hbs",
      classes: ["cluebook-content"]
    }
  };

  // State mapping
  state = {
    activeTab: game.user?.getFlag("ClueBook", "lastTab") || "notes",
    activeWorkspace: game.user?.getFlag("ClueBook", "lastWorkspace") || game.user?.getFlag("ClueBook", "settings")?.theme?.defaultWorkspace || "personal",
    searchQuery: "",
    editingEntryId: null,
    highlightedEntryId: null,
    selectedEntryId: null,
    selectedEntries: new Set(),
    searchTags: []
  };

  static DEFAULT_SETTINGS = {
    readOnly: false,
    features: {
      cardsShowExplicitLinks: true,
      cardsShowSuggestedLinks: true,
      boardShowExplicitLinks: false,
      boardShowSuggestedLinks: false
    },
    theme: {
      defaultWorkspace: "personal",
      accent: "#7b61ff",
      opacity: 85,
      linkColor: "#ff5252",
      linkStyle: "6,4",
      showHotkeys: true,
      showCalendarWidget: true,
      showQuickWidget: true,
      snapToGrid: false,
      hoverHighlight: true,
      hoverDelay: 1000,
      highlightDuration: 2
    },
    defaultColors: {
      notes: "yellow",
      npc: "green",
      quests: "purple",
      timeline: "red",
      locations: "blue"
    },
    widget: {
      direction: "up-right"
    }
  };

  getSettings() {
    // We do a deep clone of defaults to prevent mutating them
    const defaults = foundry.utils.deepClone(ClueBookApp.DEFAULT_SETTINGS);
    const localSettings = game.user.getFlag("ClueBook", "settings") || {};
    
    // NOTE: We use plain JS spread instead of foundry.utils.mergeObject because
    // mergeObject silently drops `false` values when overwriting `true` defaults.
    const theme = { ...defaults.theme, ...(localSettings.theme || {}) };
    const features = { ...defaults.features, ...(localSettings.features || {}) };
    const widget = { ...defaults.widget, ...(localSettings.widget || {}) };
    
    let defaultColors, readOnly, tags, showTagsToPlayers, hideGMVisibilityBtn, hideGMOverlayBtn, hideSendToBoardBtn;
    
    if (this.state.activeWorkspace !== "personal") {
      const journal = this._getWorkspaceJournal();
      const sharedSettings = journal ? (journal.getFlag("ClueBook", "settings") || {}) : {};
      defaultColors = { ...defaults.defaultColors, ...(sharedSettings.defaultColors || {}) };
      readOnly = sharedSettings.readOnly ?? defaults.readOnly;
      tags = sharedSettings.tags || {};
      showTagsToPlayers = sharedSettings.showTagsToPlayers ?? true;
      hideGMVisibilityBtn = sharedSettings.hideGMVisibilityBtn ?? false;
      hideGMOverlayBtn = sharedSettings.hideGMOverlayBtn ?? false;
      hideSendToBoardBtn = sharedSettings.hideSendToBoardBtn ?? false;
      
      // Override board-specific theme settings
      if (sharedSettings.theme) {
        if (sharedSettings.theme.linkColor !== undefined) theme.linkColor = sharedSettings.theme.linkColor;
        if (sharedSettings.theme.linkStyle !== undefined) theme.linkStyle = sharedSettings.theme.linkStyle;
        if (sharedSettings.theme.snapToGrid !== undefined) theme.snapToGrid = sharedSettings.theme.snapToGrid;
        if (sharedSettings.theme.hoverHighlight !== undefined) theme.hoverHighlight = sharedSettings.theme.hoverHighlight;
        if (sharedSettings.theme.hoverDelay !== undefined) theme.hoverDelay = sharedSettings.theme.hoverDelay;
        if (sharedSettings.theme.highlightDuration !== undefined) theme.highlightDuration = sharedSettings.theme.highlightDuration;
      }
    } else {
      defaultColors = { ...defaults.defaultColors, ...(localSettings.defaultColors || {}) };
      readOnly = false;
      tags = localSettings.tags || {};
      showTagsToPlayers = localSettings.showTagsToPlayers ?? true;
      hideGMVisibilityBtn = localSettings.hideGMVisibilityBtn ?? false;
      hideGMOverlayBtn = localSettings.hideGMOverlayBtn ?? false;
      hideSendToBoardBtn = localSettings.hideSendToBoardBtn ?? false;
    }
    
    return { theme, features, defaultColors, widget, readOnly, tags, hideGMVisibilityBtn, hideGMOverlayBtn, hideSendToBoardBtn };
  }

  /**
   * Defines the tabs for the application
   */
  get tabs() {
    return [
      { id: "search", icon: "fas fa-search", label: game.i18n.localize("CLUEBOOK.Tabs.Search") },
      { id: "notes", icon: "fas fa-sticky-note", label: game.i18n.localize("CLUEBOOK.Tabs.Notes") },
      { id: "npc", icon: "fas fa-user", label: game.i18n.localize("CLUEBOOK.Tabs.NPC") },
      { id: "locations", icon: "fas fa-map-marked-alt", label: game.i18n.localize("CLUEBOOK.Tabs.Locations") },
      { id: "quests", icon: "fas fa-scroll", label: game.i18n.localize("CLUEBOOK.Tabs.Quests") },
      { id: "timeline", icon: "fas fa-clock", label: game.i18n.localize("CLUEBOOK.Tabs.Timeline") },
      { id: "board", icon: "fas fa-project-diagram", label: game.i18n.localize("CLUEBOOK.Tabs.Board") }
    ];
  }


  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    
    this._prepareWorkspaceList(context);
    const data = await this._prepareWorkspaceData(context);
    this._prepareUIState(context);
    
    if (context.isSettings || context.isWorkspaces) {
      context.showAddBtn = false;
      context.isBoardView = false;
      return context;
    }
    
    const entries = await this._prepareEntriesForTab(context, data);
    this._processExplicitLinks(context, data, entries);
    this._processTags(context, entries);
    this._processDates(context, entries);

    context.entries = entries;
    context.showAddBtn = this.state.activeTab !== "board" && this.state.activeTab !== "search";
    context.isBoardView = this.state.activeTab === "board";
    context.editingEntryId = this.state.editingEntryId;
    context.highlightedEntryId = this.state.highlightedEntryId;

    return context;
  }

  _prepareWorkspaceList(context) {
    const personalName = game.user.getFlag("ClueBook", "personalWorkspaceName") || game.i18n.localize("CLUEBOOK.Workspace.PersonalOnlyMe");
    const availableWorkspaces = [{ id: "personal", name: personalName }];

    if (game.user.isGM) {
      game.users.forEach(u => {
        if (u.id !== game.user.id && !u.isGM) {
          const uData = u.getFlag("ClueBook", "data") || {};
          let isEmpty = true;
          for (const [tabKey, tabData] of Object.entries(uData)) {
            if (tabKey === "board" || tabKey === "links" || tabKey === "search") continue;
            if (tabData && Object.keys(tabData).length > 0) {
              isEmpty = false;
              break;
            }
          }
          if (!isEmpty) {
            const uName = u.getFlag("ClueBook", "personalWorkspaceName") || game.i18n.format("CLUEBOOK.Workspace.PersonalUser", { user: u.name });
            availableWorkspaces.push({ id: `personal_${u.id}`, name: game.i18n.format("CLUEBOOK.Workspace.Player", { user: uName }) });
          }
        }
      });
    }

    game.journal.forEach(j => {
      // Поддержка legacy ClueBook_Shared_DB для старых миров, но без хардкода дальше
      if (j.getFlag("ClueBook", "isWorkspace") && j.testUserPermission(game.user, "OBSERVER")) {
        availableWorkspaces.push({ id: j.id, name: j.name });
      }
    });

    if (this.state.activeWorkspace !== "personal" && !this.state.activeWorkspace.startsWith("personal_") && !game.journal.get(this.state.activeWorkspace)) {
      this.state.activeWorkspace = "personal";
    }
    
    context.workspaces = availableWorkspaces;
  }

  async _prepareWorkspaceData(context) {
    let data = this._getWorkspaceData();
    
    if (this.state.activeWorkspace === "personal") {
      context.workspaceName = game.user.getFlag("ClueBook", "personalWorkspaceName") || game.i18n.localize("CLUEBOOK.Workspace.Personal");
      context.isShared = false;
    } else if (this.state.activeWorkspace.startsWith("personal_")) {
      const uId = this.state.activeWorkspace.split("_")[1];
      const u = game.users.get(uId);
      if (u && game.user.isGM) {
        context.workspaceName = u.getFlag("ClueBook", "personalWorkspaceName") || game.i18n.format("CLUEBOOK.Workspace.PersonalUser", { user: u.name });
        context.isShared = false;
        context.isReadOnly = false;
      } else {
        this.state.activeWorkspace = "personal";
        data = game.user.getFlag("ClueBook", "data") || {};
        context.workspaceName = game.i18n.localize("CLUEBOOK.Workspace.Personal");
        context.isShared = false;
      }
    } else {
      const journal = this._getWorkspaceJournal();
      if (journal) {
        context.workspaceName = journal.name;
        context.isShared = true;
      }
    }

    data = await this._sanitizeData(data);
    return data;
  }

  _prepareUIState(context) {
    context.tabs = this.tabs;
    if (!context.tabs.some(t => t.id === this.state.activeTab) && !["settings", "workspaces"].includes(this.state.activeTab)) {
      this.state.activeTab = "notes";
    }
    
    context.activeTab = this.state.activeTab;
    context.activeWorkspace = this.state.activeWorkspace;
    context.searchQuery = this.state.searchQuery;
    
    const globalTags = this.getSettings()?.tags || {};
    const showTagsToPlayers = this.getSettings()?.showTagsToPlayers ?? true;
    const hideTags = this.getSettings()?.features?.hideTags;
    context.showTags = !hideTags;
    
    if (context.showTags) {
      context.availableSearchTags = Object.values(globalTags)
        .filter(t => game.user.isGM || (!t.isSecret && showTagsToPlayers))
        .sort((a, b) => a.name.localeCompare(b.name))
        .map(t => ({
          ...t,
          isActive: (this.state.searchTags || []).includes(t.id)
        }));
    } else {
      context.availableSearchTags = [];
    }

    context.isSettings = this.state.activeTab === "settings";
    context.isWorkspaces = this.state.activeTab === "workspaces";
    context.settings = this.getSettings();
    context.isGM = game.user.isGM;
    context.globalTimeWidget = game.settings.get("ClueBook", "enableTimeWidget");
    this.state.isReadOnly = this.state.isZenMode || (context.isShared && context.settings.readOnly && !context.isGM);
    context.isReadOnly = this.state.isReadOnly;
  }

  async _prepareEntriesForTab(context, data) {
    const entries = [];
    const skipHidden = context.isShared && !context.isGM;

    if (this.state.activeTab === "search") {
      const q = this.state.searchQuery.toLowerCase();
      const tagsFilter = this.state.searchTags || [];
      if (q || tagsFilter.length > 0) {
        for (const [tabKey, tabData] of Object.entries(data)) {
          if (tabKey === "links" || tabKey === "board" || tabKey === "search") continue;
          for (const [id, entry] of Object.entries(tabData || {})) {
            if (!entry || (skipHidden && entry.isHidden)) continue;
            
            let matchText = !q;
            let matchTags = tagsFilter.length === 0;

            if (q) {
              for (const val of Object.values(entry)) {
                if (typeof val === "string" && val.toLowerCase().includes(q)) {
                  matchText = true;
                  break;
                }
              }
            }

            if (tagsFilter.length > 0) {
              if (Array.isArray(entry.tags)) matchTags = tagsFilter.every(tId => entry.tags.includes(tId));
            }

            if (matchText && matchTags) {
              const enriched = await this._enrichEntry(entry);
              entries.push({ id, sourceTab: tabKey, ...entry, enriched });
            }
          }
        }
      }
      context.links = [];
    } else if (this.state.activeTab === "board") {
      for (const [tabKey, tabData] of Object.entries(data)) {
        if (tabKey === "board" || tabKey === "links" || tabKey === "search") continue;
        for (const [id, entry] of Object.entries(tabData || {})) {
          if (!entry || (skipHidden && entry.isHidden)) continue;
          if (entry.onBoard) {
            const enriched = await this._enrichEntry(entry);
            entries.push({ id, sourceTab: tabKey, ...entry, enriched });
          }
        }
      }
      context.links = Object.values(data.links || {});
    } else {
      const tabData = data[this.state.activeTab] || {};
      let sortedEntries;
      if (this.state.activeTab === "timeline") {
        sortedEntries = Object.entries(tabData).sort((a, b) => {
          const tA = a[1].startTimestamp ?? Number.MAX_SAFE_INTEGER;
          const tB = b[1].startTimestamp ?? Number.MAX_SAFE_INTEGER;
          return tA - tB;
        });
      } else {
        sortedEntries = Object.entries(tabData).sort((a, b) => (a[1].sort || 0) - (b[1].sort || 0));
      }
      for (const [id, entry] of sortedEntries) {
        if (!entry || (skipHidden && entry.isHidden)) continue;
        const enriched = await this._enrichEntry(entry);
        entries.push({ id, sourceTab: this.state.activeTab, ...entry, enriched });
      }
    }
    return entries;
  }

  _processExplicitLinks(context, data, entries) {
    const allLinks = data.links || [];
    const allEntities = [];
    for (const [tabKey, tabData] of Object.entries(data)) {
      if (tabKey === "links" || tabKey === "search" || tabKey === "board") continue;
      for (const [id, entry] of Object.entries(tabData || {})) {
        if (entry) {
          let previewText = entry.text || entry.note || entry.event || "";
          previewText = previewText.replace(/\[\[qnmention:[^:]+:([^\]]+)\]\](?:\{([^}]*)\})?/g, (m, name, cText) => cText || name);
          previewText = previewText.replace(/@UUID\[[^\]]+\](?:\{([^\}]+)\})?/g, (m, p1) => p1 || game.i18n.localize("CLUEBOOK.EntryDetails.Link"));
          previewText = previewText.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').substring(0, 150).trim() + "...";
          allEntities.push({ id, title: entry.name || entry.event || entry.text || game.i18n.localize("CLUEBOOK.EntryDetails.Untitled"), preview: previewText });
        }
      }
    }

    const PRESET_COLORS = ["yellow", "red", "green", "blue", "purple", "orange", "teal", "pink", "brown"];
    const isBoard = this.state.activeTab === "board";
    
    for (const entry of entries) {
      entry.isCustomColor = entry.color && !PRESET_COLORS.includes(entry.color);
      entry.explicitLinks = [];
      const showExplicit = isBoard ? context.settings.features?.boardShowExplicitLinks : context.settings.features?.cardsShowExplicitLinks;
      
      if (showExplicit !== false) {
        for (const l of Object.values(allLinks)) {
          if (l.source === entry.id || l.target === entry.id) {
            const otherId = l.source === entry.id ? l.target : l.source;
            const otherEntity = allEntities.find(e => e.id === otherId);
            if (otherEntity) {
              let cleanName = otherEntity.title.replace(/\[\[qnmention:[^:]+:([^\]]+)\]\](?:\{([^}]*)\})?/g, (m, name, cText) => cText || name);
              cleanName = cleanName.replace(/@UUID\[[^\]]+\](?:\{([^\}]+)\})?/g, (m, p1) => p1 || game.i18n.localize("CLUEBOOK.EntryDetails.Link"));
              cleanName = cleanName.replace(/<[^>]+>/g, '').substring(0, 40).trim();
              entry.explicitLinks.push({ id: otherId, name: cleanName, label: l.label, preview: otherEntity.preview });
            }
          }
        }
      }
    }
  }

  _processTags(context, entries) {
    if (!context.showTags) {
      for (const entry of entries) {
        entry.resolvedTags = [];
      }
      return;
    }
    const globalTags = this.getSettings()?.tags || {};
    const showTagsToPlayers = this.getSettings()?.showTagsToPlayers ?? true;
    for (const entry of entries) {
      if (!Array.isArray(entry.tags) || entry.tags.length === 0) {
        entry.resolvedTags = [];
        continue;
      }
      
      let resolvedTags = [];
      for (const tagId of entry.tags) {
        const tag = globalTags[tagId];
        if (!tag) continue;
        if (!context.isGM) {
          if (!showTagsToPlayers) continue;
          if (tag.isSecret) continue;
        }
        resolvedTags.push(tag);
      }
      entry.resolvedTags = resolvedTags.sort((a, b) => a.name.localeCompare(b.name));
    }
  }

  _processDates(context, entries) {
    context.isSimpleCalendarActive = !!window.SimpleCalendar;
    if (!context.isSimpleCalendarActive || !window.SimpleCalendar?.api) return;
    
    const scApi = window.SimpleCalendar.api;
    for (const entry of entries) {
      if (entry.sourceTab === "quests" && entry.deadlineTimestamp) {
        const dl = entry.deadlineTimestamp;
        const curr = game.time.worldTime;
        const diff = dl - curr;
        
        const dt = scApi.timestampToDate(dl);
        entry.formattedDeadline = scApi.formatDateTime(dt).date + " " + scApi.formatDateTime(dt).time;
        entry.formattedDeadlineDate = scApi.formatDateTime(dt).date;
        entry.formattedDeadlineTime = scApi.formatDateTime(dt).time;
        
        const absDiff = Math.abs(diff);
        const d = Math.floor(absDiff / 86400);
        const h = Math.floor((absDiff % 86400) / 3600);
        const m = Math.floor((absDiff % 3600) / 60);
        const dStr = d > 0 ? d + game.i18n.localize("CLUEBOOK.Time.DaysShort") : '';
        const hStr = h > 0 ? h + game.i18n.localize("CLUEBOOK.Time.HoursShort") : '';
        const mStr = m + game.i18n.localize("CLUEBOOK.Time.MinutesShort");
        const timeStr = `${dStr}${hStr}${mStr}`.trim();

        if (diff < 0) {
          entry.isOverdue = true;
          entry.timeRemaining = timeStr;
          entry.timeStr = timeStr;
        } else {
          entry.isOverdue = false;
          entry.timeRemaining = timeStr;
          entry.timeStr = timeStr;
        }
      }

      if (entry.sourceTab === "quests" && entry.status) {
        if (entry.status === "active") entry.translatedStatus = game.i18n.localize("CLUEBOOK.Quest.Active");
        else if (entry.status === "completed") entry.translatedStatus = game.i18n.localize("CLUEBOOK.Quest.Completed");
        else entry.translatedStatus = entry.status;
      }

      if (entry.sourceTab === "timeline") {
        if (entry.startTimestamp) {
          const dt = scApi.timestampToDate(entry.startTimestamp);
          entry.formattedStart = scApi.formatDateTime(dt).date + " " + scApi.formatDateTime(dt).time;
          entry.formattedStartDate = scApi.formatDateTime(dt).date;
          entry.formattedStartTime = scApi.formatDateTime(dt).time;
        }
        if (entry.endTimestamp) {
          const dt = scApi.timestampToDate(entry.endTimestamp);
          entry.formattedEnd = scApi.formatDateTime(dt).date + " " + scApi.formatDateTime(dt).time;
          entry.formattedEndDate = scApi.formatDateTime(dt).date;
          entry.formattedEndTime = scApi.formatDateTime(dt).time;
        }
      }
    }
  }


  flushDebouncedSaves() {
    for (const key of Object.keys(this._debouncedSaves)) {
      const fn = this._debouncedSaves[key];
      if (typeof fn?.flush === "function") fn.flush();
    }
  }

  _onClose(options) {
    this.flushDebouncedSaves();
    super._onClose(options);
    if (this._outsideClickHandler) {
      document.removeEventListener('mousedown', this._outsideClickHandler);
      this._outsideClickHandler = null;
    }
    if (this._boardMoveHandler) {
      document.removeEventListener('mousemove', this._boardMoveHandler);
      this._boardMoveHandler = null;
    }
    if (this._boardUpHandler) {
      document.removeEventListener('mouseup', this._boardUpHandler);
      this._boardUpHandler = null;
    }
    const dropdown = document.querySelector('.cb-mention-dropdown');
    if (dropdown) dropdown.remove();
    const tooltip = document.querySelector('.cb-custom-tooltip');
    if (tooltip) tooltip.remove();
    const popover = document.querySelector('#cb-hover-preview-popover');
    if (popover) popover.remove();
  }

  async render(options, _options) {
    const scrollStates = new Map();
    if (this.element) {
       this.element.querySelectorAll('.window-content, .cluebook-content, .entries-list, .cb-content-area, .cb-board-container, .cb-tags-wrapper').forEach((el, index) => {
          let path = el.className.split(' ').join('-');
          const parentTab = el.closest('.cb-tab-pane');
          if (parentTab) path += '-' + parentTab.dataset.tab;
          path += '-' + index;
          scrollStates.set(path, { top: el.scrollTop, left: el.scrollLeft });
       });
    }
    
    await super.render(options, _options);
    
    if (this.element && scrollStates.size > 0) {
       const restoreScroll = () => {
         this.element.querySelectorAll('.window-content, .cluebook-content, .entries-list, .cb-content-area, .cb-board-container, .cb-tags-wrapper').forEach((el, index) => {
            let path = el.className.split(' ').join('-');
            const parentTab = el.closest('.cb-tab-pane');
            if (parentTab) path += '-' + parentTab.dataset.tab;
            path += '-' + index;
            if (scrollStates.has(path)) {
               const state = scrollStates.get(path);
               el.scrollTop = state.top;
               el.scrollLeft = state.left;
            }
         });
       };
       restoreScroll();
       setTimeout(restoreScroll, 20); // Fallback after DOM layout settles
    }
    return this;
  }

  _onRender(context, options) {
    super._onRender(context, options);

    const html = this.element;
    
    // Live update the widget color if it exists
    const widget = document.getElementById("cluebook-widget");
    if (widget) {
      const widgetColor = this.getSettings()?.theme?.widgetColor || this.getSettings()?.theme?.accent || "#7b61ff";
      const widgetColor2 = this.getSettings()?.theme?.widgetColor2 || "#4527a0";
      widget.style.setProperty('--cb-widget-color', widgetColor);
      widget.style.setProperty('--cb-widget-color2', widgetColor2);
    }
    
    // Make sure the application window can receive keyboard focus
    if (!html.hasAttribute('tabindex')) {
      html.setAttribute('tabindex', '-1');
    }
    // Bind Keyboard Shortcuts (Hotkeys) only once
    if (!this._globalEventsBound) {
      this._globalEventsBound = true;
      
      // When clicking anywhere in the app, focus it so hotkeys work
      html.addEventListener('click', () => {
        if (document.activeElement === document.body || !html.contains(document.activeElement)) {
          html.focus({ preventScroll: true });
        }
      });
      
      html.addEventListener('keydown', (ev) => {
        // Ignore if typing in an input
        if (['INPUT', 'TEXTAREA', 'SELECT'].includes(ev.target.tagName)) return;
        
        if (this.state.selectedEntryId || this.state.selectedEntries.size > 0) {
          if (ev.key === "Delete" || ev.key === "Backspace") {
            ev.preventDefault();
            if (this.state.isReadOnly) return;
            
            if (this.state.selectedEntries.size > 1) {
              this._onDeleteGroup();
            } else {
              const id = this.state.selectedEntryId || Array.from(this.state.selectedEntries)[0];
              const entryEl = html.querySelector(`[data-entry-id="${id}"]`);
              if (entryEl) {
                if (this.state.activeTab === "board") {
                  this.constructor._onRemoveFromBoard.call(this, null, entryEl);
                } else {
                  this.constructor._onDeleteEntry.call(this, null, entryEl);
                }
              }
            }
          } else if (ev.key === "Escape") {
            ev.preventDefault();
            this.state.selectedEntryId = null;
            this.state.selectedEntries.clear();
            html.querySelectorAll('.cluebook-entry.is-selected').forEach(el => el.classList.remove('is-selected'));
          }
        }
      });
    }

    const settings = this.getSettings();
    
    if (this._savedScrollPos !== undefined) {
      const contentPane = html.querySelector('.cluebook-content');
      if (contentPane) contentPane.scrollTop = this._savedScrollPos;
      this._savedScrollPos = undefined;
    }

    if (this.state.activeTab === "board") {
      html.style.overflow = "hidden";
    } else {
      html.style.overflow = "";
    }
    
    // Apply aesthetics globally
    html.style.setProperty('--cb-bg-glass', `rgba(26, 26, 36, ${settings.theme.opacity / 100})`);
    html.style.setProperty('--cb-accent', settings.theme.accent);
    const hex = settings.theme.accent.replace('#', '');
    if (hex.length === 6) {
      const r = parseInt(hex.substring(0, 2), 16);
      const g = parseInt(hex.substring(2, 4), 16);
      const b = parseInt(hex.substring(4, 6), 16);
      html.style.setProperty('--cb-accent-glow', `rgba(${r}, ${g}, ${b}, 0.4)`);
    }

    if (this.state.activeTab === "settings") {
      this._bindSettingsListeners(html);
    }
    
    // Bind workspace selector
    const workspaceSelect = html.querySelector('#cb-workspace-select');
    if (workspaceSelect) {
      workspaceSelect.addEventListener('change', async (ev) => {
        this.flushDebouncedSaves();
        this.state.activeWorkspace = ev.target.value;
        await game.user.setFlag("ClueBook", "lastWorkspace", ev.target.value);
        this.render();
      });
    }

    // Bind workspace creation
    const workspaceCreate = html.querySelector('#cb-workspace-create');
    if (workspaceCreate) {
      workspaceCreate.addEventListener('click', (ev) => {
        ev.preventDefault();
        this._createNewWorkspace();
      });
    }
    
    // Bind hide hotkeys
    const hideHotkeysBtn = html.querySelector('[data-action="hideHotkeys"]');
    if (hideHotkeysBtn) {
      hideHotkeysBtn.addEventListener('click', async (ev) => {
        ev.preventDefault();
        await game.user.update({ "flags.ClueBook.settings.theme.showHotkeys": false });
        this.render({ parts: ["content"] });
      });
    }

    // Bind search input
    const searchInput = html.querySelector('#cluebook-search');
    if (searchInput) {
      searchInput.addEventListener('input', (ev) => {
        this.state.searchQuery = ev.target.value;
        this.render({ parts: ["content"] });
      });
      // Restore focus
      if (this.state.searchQuery !== "") {
        searchInput.focus();
        searchInput.selectionStart = searchInput.value.length;
      }
    }

    // Bind search clear button
    const searchClearBtn = html.querySelector('#cluebook-search-clear');
    if (searchClearBtn) {
      searchClearBtn.addEventListener('click', (ev) => {
        ev.preventDefault();
        this.state.searchQuery = "";
        this.state.searchTags = [];
        this.render({ parts: ["content"] });
      });
    }

    // Bind card tag clicks (switch to search tab with clicked tag)
    html.querySelectorAll('.cluebook-tags-container .cb-tag[data-tag-id]').forEach(tagEl => {
      tagEl.addEventListener('click', async (ev) => {
        ev.stopPropagation();
        const tagId = ev.currentTarget.dataset.tagId;
        if (!tagId) return;
        this.state.activeTab = "search";
        this.state.searchTags = [tagId];
        await game.user.setFlag("ClueBook", "lastTab", "search");
        this.render();
      });
    });

    // Bind search tags toggle
    html.querySelectorAll('.cb-search-tag').forEach(tagEl => {
      tagEl.addEventListener('click', (ev) => {
        const tagId = ev.currentTarget.dataset.tagId;
        const idx = this.state.searchTags.indexOf(tagId);
        if (idx > -1) {
          this.state.searchTags.splice(idx, 1);
        } else {
          this.state.searchTags.push(tagId);
        }
        this.render({ parts: ["content"] });
      });
    });

    // Bind tab clicks
    html.querySelectorAll('.item[data-tab]').forEach(el => {
      el.addEventListener('click', async (ev) => {
        this.flushDebouncedSaves();
        // Clear search query and edit mode on tab change
        this.state.searchQuery = "";
        this.state.searchTags = [];
        this.state.editingEntryId = null;
        const tab = ev.currentTarget.dataset.tab;
        this.state.activeTab = tab;
        
        if (tab !== "board") {
          if (this._boardMoveHandler) document.removeEventListener('mousemove', this._boardMoveHandler);
          if (this._boardUpHandler) document.removeEventListener('mouseup', this._boardUpHandler);
        }
        
        await game.user.setFlag("ClueBook", "lastTab", tab);
        this.render();
      });
    });

    // Bind auto-save inputs
    html.querySelectorAll('.cluebook-input').forEach(input => {
      input.addEventListener('input', (ev) => {
        this._handleInputDebounced(ev.currentTarget);
      });
    });

    // --- @ Mention Autocomplete ---
    this._bindMentionAutocomplete(html);
    
    // --- Custom Tooltips ---
    this._bindCustomTooltips(html);

    // --- Hover Preview Popovers for Card Links ---
    this._bindLinkHoverPopovers(html);

    let lastSelectedListEntryId = null;

    // Handle Selection logic
    html.querySelectorAll('.cluebook-entry').forEach(entry => {
      entry.addEventListener('mousedown', (ev) => {
        // Skip list-view selection logic if we are on the board
        if (this.state.activeTab === "board") return;
        
        // Only select on left click, ignore if clicking inputs
        if (ev.button !== 0) return;
        if (['INPUT', 'TEXTAREA', 'SELECT'].includes(ev.target.tagName)) return;
        
        const entryId = entry.dataset.entryId;

        if (ev.shiftKey && lastSelectedListEntryId) {
          ev.preventDefault();
          const listContainer = entry.closest('.entries-list');
          if (!listContainer) return;
          const allEntries = Array.from(listContainer.querySelectorAll('.cluebook-entry:not([style*="display: none"])'));
          const startIdx = allEntries.findIndex(e => e.dataset.entryId === lastSelectedListEntryId);
          const endIdx = allEntries.findIndex(e => e.dataset.entryId === entryId);
          if (startIdx !== -1 && endIdx !== -1) {
             const minIdx = Math.min(startIdx, endIdx);
             const maxIdx = Math.max(startIdx, endIdx);
             html.querySelectorAll('.cluebook-entry.is-selected').forEach(el => el.classList.remove('is-selected'));
             this.state.selectedEntries.clear();
             for (let i = minIdx; i <= maxIdx; i++) {
                const id = allEntries[i].dataset.entryId;
                this.state.selectedEntries.add(id);
                allEntries[i].classList.add('is-selected');
             }
          }
        } else if (ev.ctrlKey || ev.metaKey) {
          ev.preventDefault();
          if (this.state.selectedEntries.has(entryId)) {
             this.state.selectedEntries.delete(entryId);
             entry.classList.remove('is-selected');
             if (this.state.selectedEntryId === entryId) this.state.selectedEntryId = null;
          } else {
             this.state.selectedEntries.add(entryId);
             entry.classList.add('is-selected');
             this.state.selectedEntryId = entryId;
             lastSelectedListEntryId = entryId;
          }
        } else {
          html.querySelectorAll('.cluebook-entry.is-selected').forEach(el => el.classList.remove('is-selected'));
          this.state.selectedEntries.clear();
          
          this.state.selectedEntryId = entryId;
          this.state.selectedEntries.add(entryId);
          entry.classList.add('is-selected');
          lastSelectedListEntryId = entryId;
        }
        
        entry.focus({ preventScroll: true }); // Give focus so keydown on window works reliably
      });
      
      entry.addEventListener('contextmenu', (ev) => {
        if (this.state.activeTab === "board") return;
        if (['INPUT', 'TEXTAREA', 'SELECT'].includes(ev.target.tagName)) return;

        const entryId = entry.dataset.entryId;
        if (!this.state.selectedEntries.has(entryId)) {
           html.querySelectorAll('.cluebook-entry.is-selected').forEach(el => el.classList.remove('is-selected'));
           this.state.selectedEntries.clear();
           this.state.selectedEntries.add(entryId);
           entry.classList.add('is-selected');
           this.state.selectedEntryId = entryId;
           lastSelectedListEntryId = entryId;
        }

        if (this.state.selectedEntries.size > 1 && this._showListContextMenu) {
           ev.preventDefault();
           ev.stopPropagation();
           this._showListContextMenu(ev);
        }
      });
      
      // Make entry focusable so it can capture key events without scrolling
      entry.setAttribute('tabindex', '-1');
    });

    // Auto-focus new/editing entry
    if (this.state.editingEntryId) {
      const editingNode = html.querySelector(`.cluebook-entry[data-entry-id="${this.state.editingEntryId}"]`);
      if (editingNode) {
        const firstInput = editingNode.querySelector('.cluebook-input');
        if (firstInput) {
          firstInput.focus({ preventScroll: true });
          if (typeof firstInput.selectionStart === 'number') {
            firstInput.selectionStart = firstInput.value.length;
          }
        }
      }
    }

    // Double-click to edit
    html.querySelectorAll('.cluebook-entry .entry-content').forEach(contentNode => {
      contentNode.addEventListener('dblclick', (ev) => {
        const entry = ev.currentTarget.closest('.cluebook-entry');
        if (entry) {
          ClueBookApp._onToggleEdit.call(this, ev, entry);
        }
      });
    });

    // Intercept Scene Links to offer View/Activate/Configure
    html.addEventListener('click', async (ev) => {
      const sceneLink = ev.target.closest('a.content-link[data-type="Scene"]');
      if (sceneLink) {
        ev.preventDefault();
        ev.stopPropagation();
        
        const uuid = sceneLink.dataset.uuid;
        const scene = await fromUuid(uuid);
        if (!scene) return;
        
        const { ApplicationV2 } = foundry.applications.api;
        
        class SceneActionDialog extends ApplicationV2 {
          static DEFAULT_OPTIONS = {
            id: `scene-dialog-${scene.id}`,
            classes: ["cluebook-window"],
            window: { title: scene.name, icon: "fas fa-map" },
            position: { width: 450, height: "auto" }
          };
          
          _renderHTML(context, options) {
            return Promise.resolve(`
              <div style="padding: 15px; text-align: center; color: #fff; display: flex; flex-direction: column; gap: 15px;">
                ${game.i18n.format("CLUEBOOK.Scene.ActionPrompt", { name: scene.name })}
                <div style="display: flex; justify-content: center; gap: 12px;">
                  <button data-action="view" style="flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; padding: 12px 5px; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.2); color: white; border-radius: 8px; cursor: pointer; transition: all 0.2s; height: auto !important; min-height: 75px; line-height: 1.2;">
                    <i class="fas fa-eye" style="font-size: 18px; margin: 0;"></i>
                    <span style="font-size: 13px; font-weight: 500; letter-spacing: 0.5px; white-space: normal;">${game.i18n.localize("CLUEBOOK.Scene.Preview")}</span>
                  </button>
                  <button data-action="activate" style="flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; padding: 12px 5px; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.2); color: white; border-radius: 8px; cursor: pointer; transition: all 0.2s; height: auto !important; min-height: 75px; line-height: 1.2;">
                    <i class="fas fa-bullseye" style="font-size: 18px; margin: 0;"></i>
                    <span style="font-size: 13px; font-weight: 500; letter-spacing: 0.5px; white-space: normal;">${game.i18n.localize("CLUEBOOK.Scene.Activate")}</span>
                  </button>
                  <button data-action="config" style="flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; padding: 12px 5px; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.2); color: white; border-radius: 8px; cursor: pointer; transition: all 0.2s; height: auto !important; min-height: 75px; line-height: 1.2;">
                    <i class="fas fa-cog" style="font-size: 18px; margin: 0;"></i>
                    <span style="font-size: 13px; font-weight: 500; letter-spacing: 0.5px; white-space: normal;">${game.i18n.localize("CLUEBOOK.Scene.Settings")}</span>
                  </button>
                </div>
              </div>
            `);
          }
          
          _replaceHTML(result, content, options) {
            content.innerHTML = result;
          }
          
          _onRender(context, options) {
            super._onRender(context, options);
            const html = this.element;
            
            html.style.background = "rgba(26, 26, 36, 0.95)";
            html.style.backdropFilter = "blur(12px)";
            html.style.webkitBackdropFilter = "blur(12px)";
            html.style.border = "1px solid rgba(255,255,255,0.1)";
            html.style.boxShadow = "0 10px 30px rgba(0,0,0,0.8)";
            html.style.color = "#fff";
            html.style.borderRadius = "8px";
            
            const header = html.querySelector('.window-header');
            if (header) {
               header.style.background = "rgba(0,0,0,0.3)";
               header.style.borderBottom = "1px solid rgba(255,255,255,0.1)";
               header.style.color = "#fff";
               header.style.borderRadius = "8px 8px 0 0";
            }
            
            const content = html.querySelector('.window-content');
            if (content) {
               content.style.background = "transparent";
               content.style.color = "#fff";
               content.style.padding = "0";
            }
            
            html.querySelectorAll('button').forEach(btn => {
              btn.addEventListener('mouseenter', () => {
                btn.style.background = "rgba(123, 97, 255, 0.4)";
                btn.style.borderColor = "#7b61ff";
                btn.style.boxShadow = "0 0 10px rgba(123, 97, 255, 0.3)";
              });
              btn.addEventListener('mouseleave', () => {
                btn.style.background = "rgba(255,255,255,0.05)";
                btn.style.borderColor = "rgba(255,255,255,0.2)";
                btn.style.boxShadow = "none";
              });
              btn.addEventListener('click', (ev) => {
                const action = ev.currentTarget.dataset.action;
                if (action === "view") scene.view();
                if (action === "activate") scene.activate();
                if (action === "config") scene.sheet.render(true);
                this.close();
              });
            });
          }
        }
        
        new SceneActionDialog().render(true);
      }
    });

    // Setup Board Interactivity
    if (this.state.activeTab === "board" && !this.state.searchQuery) {
      this._setupBoardInteractivity(html);
    }

    // Setup List Drag & Drop
    if (!this.state.isBoardView && !this.state.searchQuery && this.state.activeTab !== "settings" && this.state.activeTab !== "workspaces" && !this.state.isReadOnly) {
      this._setupListDragDrop(html);
    }
  }

  _setupListDragDrop(html) {
    let draggedItem = null;
    const listContainer = html.querySelector('.entries-list');
    if (!listContainer) return;

    listContainer.addEventListener('dragover', ev => ev.preventDefault());

    html.querySelectorAll('.entries-list .cluebook-entry').forEach(entry => {
      entry.addEventListener('dragstart', (ev) => {
        if (ev.target.closest('.entry-controls') || ev.target.closest('.edit-mode')) {
          ev.preventDefault();
          return;
        }
        draggedItem = entry;

        listContainer.classList.add('is-dragging-list');
        setTimeout(() => entry.classList.add('is-dragging'), 0);
      });

      entry.addEventListener('dragend', async () => {
        if (!draggedItem) return;
        listContainer.classList.remove('is-dragging-list');
        draggedItem.classList.remove('is-dragging');
        draggedItem = null;

        // Save the new sort order
        const allEntries = Array.from(listContainer.querySelectorAll('.cluebook-entry'));
        const updates = {};
        
        allEntries.forEach((el, index) => {
          const id = el.dataset.entryId;
          const flagPath = `flags.ClueBook.data.${this.state.activeTab}.${id}.sort`;
          updates[flagPath] = index;
        });

        await this._updateWorkspaceData(updates);
      });

      entry.addEventListener('dragenter', (ev) => {
        ev.preventDefault();
        if (!draggedItem || draggedItem === entry) return;

        const allEntries = Array.from(listContainer.children);
        const draggedIndex = allEntries.indexOf(draggedItem);
        const targetIndex = allEntries.indexOf(entry);

        if (draggedIndex < targetIndex) {
          listContainer.insertBefore(draggedItem, entry.nextSibling);
        } else {
          listContainer.insertBefore(draggedItem, entry);
        }
      });
    });
  }

  _bindSettingsListeners(html) {
    const saveSetting = async (scope, key, value) => {
      // Foundry resolves "flags.ClueBook.settings.X.Y" paths into proper nested objects
      const flagPath = `flags.ClueBook.settings.${key}`;
      
      // Handle global module settings
      if (key.startsWith('global.')) {
        const globalKey = key.split('.')[1];
        await game.settings.set("ClueBook", globalKey, value);
        this.render();
        return;
      }
      
      // Theme settings are ALWAYS saved to the personal user
      if (key.startsWith('theme.')) {
        await game.user.update({ [flagPath]: value });
      } else {
        // Visibility, widget and defaultColors follow workspace scope
        if (this.state.isShared) {
          const journal = this._getWorkspaceJournal();
          if (journal) {
            if (journal.isOwner) {
              await journal.update({ [flagPath]: value });
            } else {
              game.socket.emit("module.ClueBook", {
                action: "updateBoardData",
                journalId: journal.id,
                updateData: { [flagPath]: value }
              });
            }
          }
        } else {
          await game.user.update({ [flagPath]: value });
        }
      }
      this.render();
    };

    html.querySelectorAll('.setting-input').forEach(el => {
      el.addEventListener('change', (ev) => {
        const target = ev.currentTarget;
        const key = target.dataset.key;
        
        const contentPane = html.querySelector('.cluebook-content');
        if (contentPane) this._savedScrollPos = contentPane.scrollTop;

        let value = target.value;
        if (target.type === 'checkbox') value = target.checked;
        if (target.type === 'range') value = Number(target.value);
        saveSetting(this.state.isShared ? 'shared' : 'personal', key, value);
      });
    });
  }


  /**
   * Raw saving without debounce for internal actions
   */
  async _saveDataRaw(tab, entryId, field, value) {
    const flagPath = `flags.ClueBook.data.${tab}.${entryId}.${field}`;
    await this._updateWorkspaceData({ [flagPath]: value });
  }

  /**
   * Debounced save handler for inputs
   */
  _handleInputDebounced(target) {
    const entryElement = target.closest('.cluebook-entry');
    if (!entryElement) return; // Ignore inputs that are not part of an entry (e.g. settings inputs)
    const entryId = entryElement.dataset.entryId;
    const sourceTab = entryElement.dataset.sourceTab || this.state.activeTab;
    const field = target.dataset.field;
    
    const debounceKey = `${entryId}-${field}`;
    if (!this._debouncedSaves[debounceKey]) {
      this._debouncedSaves[debounceKey] = foundry.utils.debounce(() => {
        this._saveDataRaw(sourceTab, entryId, field, target.value);
      }, 500);
    }
    this._debouncedSaves[debounceKey]();
  }


  // ---- @-Mention Autocomplete System ----
  _bindCustomTooltips(html) {
    let tooltipTimeout;
    let tooltipEl;

    const removeTooltip = () => {
      clearTimeout(tooltipTimeout);
      if (tooltipEl) {
        tooltipEl.style.opacity = '0';
        tooltipEl.style.transform = 'translateX(-50%) translateY(5px)';
        const el = tooltipEl;
        setTimeout(() => { if (el && el.parentNode) el.remove(); }, 300);
        tooltipEl = null;
      }
    };

    html.querySelectorAll('.cb-link-chip').forEach(chip => {
      chip.addEventListener('mouseenter', () => {
        const preview = chip.dataset.qnPreview;
        if (!preview) return;
        const name = chip.textContent.trim();

        tooltipTimeout = setTimeout(() => {
          removeTooltip(); // Clean any existing
          
          tooltipEl = document.createElement('div');
          tooltipEl.className = 'cb-custom-tooltip';
          tooltipEl.innerHTML = `<strong>${name}</strong><div style="margin-top: 4px; opacity: 0.9;">${preview}</div>`;
          document.body.appendChild(tooltipEl);

          const rect = chip.getBoundingClientRect();
          tooltipEl.style.left = (rect.left + rect.width / 2) + 'px';
          tooltipEl.style.top = (rect.top - 5) + 'px';
          
          // Trigger reflow for animation
          tooltipEl.offsetHeight;
          tooltipEl.style.opacity = '1';
          tooltipEl.style.transform = 'translateX(-50%) translateY(-100%)';

        }, 1000); // 1 second delay
      });

      chip.addEventListener('mouseleave', () => {
        clearTimeout(tooltipTimeout);
        removeTooltip();
      });
      
      chip.addEventListener('click', () => {
        clearTimeout(tooltipTimeout);
        removeTooltip();
      });
    });
  }

  _bindMentionAutocomplete(html) {
    // Create a single shared dropdown element
    let dropdown = document.querySelector('.cb-mention-dropdown');
    if (!dropdown) {
      dropdown = document.createElement('div');
      dropdown.className = 'cb-mention-dropdown';
      dropdown.style.cssText = `
        position: fixed; z-index: 99999;
        background: #1a1a2e; border: 1px solid rgba(123,97,255,0.6);
        border-radius: 8px; padding: 4px 0; min-width: 200px; max-width: 320px;
        max-height: 200px; overflow-y: auto; display: none;
        box-shadow: 0 8px 24px rgba(0,0,0,0.6);
      `;
      document.body.appendChild(dropdown);
    }

    let activeTextarea = null;
    let atStartPos = -1;

    const closeDropdown = () => {
      dropdown.style.display = 'none';
      dropdown.innerHTML = '';
      atStartPos = -1;
    };

    const getEntries = () => {
      let data = {};
      if (this.state.activeWorkspace !== 'personal') {
        const j = this._getWorkspaceJournal();
        if (j) data = j.getFlag('ClueBook', 'data') || {};
      } else {
        data = game.user.getFlag('ClueBook', 'data') || {};
      }
      const all = [];
      for (const [tab, tabData] of Object.entries(data)) {
        if (tab === 'links' || tab === 'board' || tab === 'search') continue;
        for (const [id, entry] of Object.entries(tabData || {})) {
          if (!entry) continue;
          const name = (entry.name || entry.event || entry.text || '').replace(/<[^>]+>/g, '').trim().slice(0, 60);
          if (name.length > 1) all.push({ id, tab, name });
        }
      }
      return all;
    };

    const insertMention = (textarea, entry) => {
      const val = textarea.value;
      const before = val.slice(0, atStartPos);
      const after = val.slice(textarea.selectionStart);
      const marker = `[[qnmention:${entry.id}:${entry.name}]]{}`;
      textarea.value = before + marker + after;
      const newPos = before.length + marker.length;
      textarea.setSelectionRange(newPos - 1, newPos - 1); // Place cursor inside {}
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
      closeDropdown();
      textarea.focus();
    };

    const showDropdown = (textarea, query) => {
      const entries = getEntries().filter(e => e.name.toLowerCase().includes(query.toLowerCase())).slice(0, 10);
      if (!entries.length) { closeDropdown(); return; }

      dropdown.innerHTML = '';
      entries.forEach(entry => {
        const item = document.createElement('div');
        item.className = 'cb-mention-item';
        item.style.cssText = `
          padding: 6px 12px; cursor: pointer; font-size: 13px;
          color: #e0e0e0; transition: background 0.15s;
        `;
        item.innerHTML = `<i class="fas fa-tag" style="color:#7b61ff;margin-right:6px;font-size:11px;"></i>${entry.name}`;
        item.addEventListener('mousedown', (e) => {
          e.preventDefault();
          insertMention(textarea, entry);
        });
        item.addEventListener('mouseover', () => { item.style.background = 'rgba(123,97,255,0.2)'; });
        item.addEventListener('mouseout', () => { item.style.background = ''; });
        dropdown.appendChild(item);
      });

      const rect = textarea.getBoundingClientRect();
      dropdown.style.display = 'block';
      dropdown.style.left = rect.left + 'px';
      dropdown.style.top = (rect.bottom + 4) + 'px';
      dropdown.style.width = rect.width + 'px';
    };

    html.querySelectorAll('textarea.cluebook-input').forEach(textarea => {
      textarea.addEventListener('input', (ev) => {
        const pos = textarea.selectionStart;
        const val = textarea.value;
        // Find last @ before cursor
        const textBeforeCursor = val.slice(0, pos);
        const atIdx = textBeforeCursor.lastIndexOf('@');
        if (atIdx === -1) { closeDropdown(); return; }
        const query = textBeforeCursor.slice(atIdx + 1);
        // @ must not have spaces (so we stop completing on space)
        if (query.includes(' ') || query.includes('\n')) { closeDropdown(); return; }
        atStartPos = atIdx;
        activeTextarea = textarea;
        showDropdown(textarea, query);
      });

      textarea.addEventListener('keydown', (ev) => {
        if (dropdown.style.display === 'none') return;
        const items = dropdown.querySelectorAll('.cb-mention-item');
        const current = dropdown.querySelector('.cb-mention-item.active');
        if (ev.key === 'ArrowDown') {
          ev.preventDefault();
          const next = current ? current.nextElementSibling : items[0];
          if (current) current.classList.remove('active');
          if (next) { next.classList.add('active'); next.style.background = 'rgba(123,97,255,0.2)'; }
        } else if (ev.key === 'ArrowUp') {
          ev.preventDefault();
          const prev = current ? current.previousElementSibling : items[items.length - 1];
          if (current) current.classList.remove('active');
          if (prev) { prev.classList.add('active'); prev.style.background = 'rgba(123,97,255,0.2)'; }
        } else if (ev.key === 'Enter' && current) {
          ev.preventDefault();
          current.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
        } else if (ev.key === 'Escape') {
          closeDropdown();
        }
      });

      textarea.addEventListener('blur', () => {
        setTimeout(closeDropdown, 150);
      });
    });

    // Render mention links in view mode (already-saved mentions)
    html.querySelectorAll('.display-text, .display-gm-notes, .timeline-event, .cb-smart-badge').forEach(el => {
      el.innerHTML = el.innerHTML.replace(
        /\[\[qnmention:([^:]+):([^\]]+)\]\](?:\{([^}]*)\})?/g,
        (_, id, name, customText) => {
          const displayText = customText || name;
          return `<a class="cb-mention-link" data-mention-id="${id}" title="${game.i18n.format("CLUEBOOK.App.GoToEntry", { name: name })}">${displayText}</a>`;
        }
      );
    });

    html.querySelectorAll('.cb-mention-link').forEach(link => {
      link.addEventListener('click', async (ev) => {
        ev.stopPropagation();
        const targetId = link.dataset.mentionId;
        if (!targetId) return;
        // Jump to linked entry (reuse existing jumpToLinked logic)
        let data = {};
        if (this.state.activeWorkspace !== 'personal') {
          const j = this._getWorkspaceJournal();
          if (j) data = j.getFlag('ClueBook', 'data') || {};
        } else {
          data = game.user.getFlag('ClueBook', 'data') || {};
        }
        let targetTab = null;
        for (const [tab, tabData] of Object.entries(data)) {
          if (tab === 'links' || tab === 'board' || tab === 'search') continue;
          if (tabData && tabData[targetId]) { targetTab = tab; break; }
        }
        if (!targetTab) { ui.notifications.warn(game.i18n.localize("CLUEBOOK.App.EntryNotFound")); return; }
        await game.user.setFlag('ClueBook', 'lastTab', targetTab);
        this.state.activeTab = targetTab;
        this.state.highlightedEntryId = targetId;
        // Full render so the tabs nav also updates to the new active tab
        await this.render();
        // Scroll highlighted card into view after DOM update
        setTimeout(() => {
          const el = this.element?.querySelector(`.cluebook-entry[data-entry-id="${targetId}"]`);
          if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 80);
        const settings = this.getSettings();
        const durationMs = (settings.theme.highlightDuration || 2) * 1000;
        setTimeout(() => {
          if (this.state.highlightedEntryId === targetId) {
            this.state.highlightedEntryId = null;
            const el = this.element?.querySelector(`.cluebook-entry[data-entry-id="${targetId}"]`);
            if (el) el.classList.remove('is-highlighted');
          }
        }, durationMs);
      });
    });
  }

  _bindLinkHoverPopovers(html) {
    let popover = document.querySelector('#cb-hover-preview-popover');
    if (!popover) {
      popover = document.createElement('div');
      popover.id = 'cb-hover-preview-popover';
      popover.className = 'cb-hover-popover';
      document.body.appendChild(popover);
    }

    const cleanText = (str) => {
      if (!str) return "";
      let res = str.replace(/\[\[qnmention:[^:]+:([^\]]+)\]\](?:\{([^}]*)\})?/g, (m, name, cText) => cText || name);
      res = res.replace(/@UUID\[[^\]]+\](?:\{([^\}]+)\})?/g, (m, p1) => p1 || "");
      return res.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    };

    const showPopover = (targetEl, targetId) => {
      if (!targetId) return;

      let data = {};
      if (this.state.activeWorkspace !== 'personal') {
        const j = this._getWorkspaceJournal();
        if (j) data = j.getFlag('ClueBook', 'data') || {};
      } else {
        data = game.user.getFlag('ClueBook', 'data') || {};
      }

      let targetTab = null;
      let targetEntry = null;

      for (const [tab, tabData] of Object.entries(data)) {
        if (tab === 'links' || tab === 'board' || tab === 'search') continue;
        if (tabData && tabData[targetId]) {
          targetTab = tab;
          targetEntry = tabData[targetId];
          break;
        }
      }

      if (!targetEntry) return;

      const tabInfo = {
        notes: { icon: 'fa-sticky-note', label: game.i18n.localize("CLUEBOOK.Tabs.Notes"), color: '#fbc02d' },
        npc: { icon: 'fa-user', label: game.i18n.localize("CLUEBOOK.Tabs.NPC"), color: '#4caf50' },
        locations: { icon: 'fa-map-marked-alt', label: game.i18n.localize("CLUEBOOK.Tabs.Locations"), color: '#2196f3' },
        quests: { icon: 'fa-scroll', label: game.i18n.localize("CLUEBOOK.Tabs.Quests"), color: '#7b61ff' },
        timeline: { icon: 'fa-clock', label: game.i18n.localize("CLUEBOOK.Tabs.Timeline"), color: '#ff9800' }
      }[targetTab] || { icon: 'fa-link', label: game.i18n.localize("CLUEBOOK.EntryDetails.Link"), color: '#7b61ff' };

      let titleText = cleanText(targetEntry.name || targetEntry.event || targetEntry.text || game.i18n.localize("CLUEBOOK.EntryDetails.Untitled"));
      if (titleText.length > 80) titleText = titleText.substring(0, 80) + '...';

      let rawText = cleanText(targetEntry.text || targetEntry.note || targetEntry.event || "");
      if (rawText.length > 180) rawText = rawText.substring(0, 180) + '...';

      let statusBadge = '';
      if (targetTab === 'quests' && targetEntry.status) {
        const statusMap = {
          active: game.i18n.localize("CLUEBOOK.Quest.Active"),
          completed: game.i18n.localize("CLUEBOOK.Quest.Completed"),
          failed: game.i18n.localize("CLUEBOOK.Quest.Failed")
        };
        const statusText = statusMap[targetEntry.status] || targetEntry.status;
        statusBadge = `<div class="cb-popover-badge" style="background: rgba(123,97,255,0.3); color: #d1c4ff;"><i class="fas fa-scroll"></i> ${statusText}</div>`;
      } else if (targetTab === 'npc' && targetEntry.lifeStatus) {
        const lifeMap = {
          alive: game.i18n.localize("CLUEBOOK.Entry.Alive"),
          dead: game.i18n.localize("CLUEBOOK.Entry.Dead"),
          unknown: game.i18n.localize("CLUEBOOK.Entry.Unknown")
        };
        const lifeText = lifeMap[targetEntry.lifeStatus] || targetEntry.lifeStatus;
        statusBadge = `<div class="cb-popover-badge" style="background: rgba(255,255,255,0.1); color: #eee;"><i class="fas fa-heartbeat"></i> ${lifeText}</div>`;
      }

      popover.innerHTML = `
        <div class="cb-popover-header" style="border-left: 3px solid ${targetEntry.color || tabInfo.color};">
          <div class="cb-popover-type"><i class="fas ${tabInfo.icon}"></i> ${tabInfo.label}</div>
          <div class="cb-popover-title">${titleText}</div>
        </div>
        ${statusBadge}
        ${rawText && rawText !== titleText ? `<div class="cb-popover-body">${rawText}</div>` : ''}
      `;

      const rect = targetEl.getBoundingClientRect();
      let left = rect.left + window.scrollX;
      let top = rect.bottom + window.scrollY + 6;

      if (left + 290 > window.innerWidth) left = window.innerWidth - 300;
      if (left < 10) left = 10;
      if (top + 160 > window.innerHeight) top = rect.top + window.scrollY - 170;

      popover.style.left = `${left}px`;
      popover.style.top = `${top}px`;
      popover.classList.add('is-visible');
    };

    const hidePopover = () => {
      popover.classList.remove('is-visible');
    };

    html.querySelectorAll('.cb-link-chip, .cb-mention-link').forEach(linkEl => {
      linkEl.addEventListener('mouseenter', (ev) => {
        const targetId = ev.currentTarget.dataset.targetId || ev.currentTarget.dataset.mentionId;
        showPopover(ev.currentTarget, targetId);
      });
      linkEl.addEventListener('mouseleave', () => {
        hidePopover();
      });
      linkEl.addEventListener('click', () => {
        hidePopover();
      });
    });
  }

}

