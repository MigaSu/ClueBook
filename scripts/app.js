import { ClueBookSocket } from "./socket.js";
import { ClueBookDatePicker } from "./date-picker.js";
import { ClueBookEditDialog } from "./edit-dialog.js";
import { isEntryTab, resolveCropParams } from "./data-models.js";
import { UndoService } from "./services/undo-service.js";
import { TimeService } from "./services/time-service.js";
import { TextEnrichmentService } from "./services/text-enrichment-service.js";
import { UIService } from "./services/ui-service.js";
import { WorkspaceRepository } from "./services/workspace-repository.js";
import { WorkspaceAccessService } from "./services/workspace-access-service.js";
import { MentionAutocompleteController } from "./services/mention-autocomplete.js";
import { ClueBookDataMixin } from "./app-data.js";
import { ClueBookBoardMixin } from "./app-board.js";
import { ClueBookTagManager } from "./tag-manager.js";

import { ClueBookEntryActionsMixin } from "./actions/entry-actions.js";
import { ClueBookWorkspaceActionsMixin } from "./actions/workspace-actions.js";
import { ClueBookIntegrationActionsMixin } from "./actions/integration-actions.js";
import { ClueBookBoardActionsMixin } from "./actions/board-actions.js";
import { ClueBookDragDropMixin } from "./actions/app-dragdrop.js";
import { ClueBookFolderActionsMixin } from "./actions/folder-actions.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

class SceneActionDialog extends ApplicationV2 {
  constructor(options = {}) {
    super(options);
    this.scene = options.scene;
  }

  static DEFAULT_OPTIONS = {
    classes: ["cluebook-window", "cluebook-scene-dialog"],
    window: { icon: "fas fa-map" },
    position: { width: 450, height: "auto" }
  };

  get title() {
    return this.scene?.name || "";
  }

  _renderHTML(context, options) {
    const scene = this.scene;
    const safeName = foundry.utils.escapeHTML(scene?.name || "");
    return Promise.resolve(`
      <div style="padding: 15px; text-align: center; color: #fff; display: flex; flex-direction: column; gap: 15px;">
        ${game.i18n.format("CLUEBOOK.Scene.ActionPrompt", { name: safeName })}
        <div style="display: flex; justify-content: center; gap: 12px;">
          <button type="button" data-action="view" style="flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; padding: 12px 5px; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.2); color: white; border-radius: 8px; cursor: pointer; transition: all 0.2s; min-height: 75px; line-height: 1.2;">
            <i class="fas fa-eye" style="font-size: 18px; margin: 0;"></i>
            <span style="font-size: 13px; font-weight: 500; letter-spacing: 0.5px; white-space: normal;">${game.i18n.localize("CLUEBOOK.Scene.Preview")}</span>
          </button>
          <button type="button" data-action="activate" style="flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; padding: 12px 5px; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.2); color: white; border-radius: 8px; cursor: pointer; transition: all 0.2s; min-height: 75px; line-height: 1.2;">
            <i class="fas fa-bullseye" style="font-size: 18px; margin: 0;"></i>
            <span style="font-size: 13px; font-weight: 500; letter-spacing: 0.5px; white-space: normal;">${game.i18n.localize("CLUEBOOK.Scene.Activate")}</span>
          </button>
          <button type="button" data-action="config" style="flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; padding: 12px 5px; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.2); color: white; border-radius: 8px; cursor: pointer; transition: all 0.2s; min-height: 75px; line-height: 1.2;">
            <i class="fas fa-cog" style="font-size: 18px; margin: 0;"></i>
            <span style="font-size: 13px; font-weight: 500; letter-spacing: 0.5px; white-space: normal;">${game.i18n.localize("CLUEBOOK.Scene.Settings")}</span>
          </button>
        </div>
      </div>
    `);
  }

  _replaceHTML(result, content, options) {
    content.replaceChildren(...new DOMParser().parseFromString(result, "text/html").body.childNodes);
  }

  _onRender(context, options) {
    super._onRender(context, options);
    const html = this.element;
    const scene = this.scene;
    if (!scene) return;

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

const BaseApp = ClueBookFolderActionsMixin(
  ClueBookDragDropMixin(
    ClueBookEntryActionsMixin(
      ClueBookWorkspaceActionsMixin(
        ClueBookIntegrationActionsMixin(
          ClueBookBoardActionsMixin(
            ClueBookBoardMixin(
              ClueBookDataMixin(
                HandlebarsApplicationMixin(ApplicationV2)
              )
            )
          )
        )
      )
    )
  )
);

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
      toggleTrack: ClueBookApp._onToggleTrack,
      togglePin: ClueBookApp._onTogglePin,
      toggleVisibility: ClueBookApp._onToggleVisibility,
      shareOverlay: ClueBookApp._onShareOverlay,
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
      importJSON: ClueBookApp._onImportJSON,
      copyDataFormat: ClueBookApp._onCopyDataFormat,
      exportJSON: ClueBookApp._onExportJSON,
      activateScene: ClueBookApp._onActivateScene,
      openActor: ClueBookApp._onOpenActor,
      manageTags: ClueBookApp._onManageTags,
      viewImage: ClueBookApp._onViewImage,
      uploadBatchGallery: ClueBookApp._onUploadBatchGallery,
      toggleQuestStatusMenu: ClueBookApp._onToggleQuestStatusMenu,
      createFolder: ClueBookApp._onCreateFolder,
      editFolder: ClueBookApp._onEditFolder,
      deleteFolder: ClueBookApp._onDeleteFolder,
      toggleFolderCollapse: ClueBookApp._onToggleFolderCollapse,
      toggleFolderPosition: ClueBookApp._onToggleFolderPosition,
      toggleFolderVisibility: ClueBookApp._onToggleFolderVisibility,
      addEntryToFolder: ClueBookApp._onAddEntryToFolder,
      sendFolderToBoard: ClueBookApp._onSendFolderToBoard,
      toggleSortMenu: ClueBookApp._onToggleSortMenu,
      toggleViewMenu: ClueBookApp._onToggleViewMenu,
      toggleFavoriteWorkspace: ClueBookApp._onToggleFavoriteWorkspace,
      filterSearchCategory: ClueBookApp._onFilterSearchCategory,
      resetWidgetPositions: ClueBookApp._onResetWidgetPositions,
      openBoardToc: ClueBookApp._onOpenBoardToc,
      undo: ClueBookApp._onUndoAction
    }
  };

  get title() {
    return game.i18n.localize(this.options.window.title);
  }

  static _formatSCTimestamp(timestamp) {
    const formatted = TimeService.formatTimestamp(timestamp);
    return {
      date: formatted.date,
      time: formatted.time,
      full: formatted.fullStr !== "—" ? formatted.fullStr : ""
    };
  }

  /**
   * Cleans mentions, UUID links, HTML tags, and secret blocks into clean plain text for row labels and snippets.
   * @param {string} str 
   * @returns {string}
   */
  static _cleanPlainText(str) {
    if (!str) return "";
    let res = String(str);
    // Remove secret blocks if any
    res = res.replace(/<section\s+class="secret"[^>]*>[\s\S]*?<\/section>/gi, ' ');
    res = res.replace(/\[\[\/gm\s+[\s\S]*?\]\]/gi, ' ');
    // Parse ClueBook quick mentions: [[qnmention:id:Name]]{CustomText} or [[qnmention:id:Name]]
    res = res.replace(/\[\[qnmention:[^:]+:([^\]]+)\]\](?:\{([^}]*)\})?/g, (m, name, cText) => (cText && cText.trim()) || name || "");
    // Parse Foundry document links: @UUID[...]{Label} or @Actor[...]{Label}
    res = res.replace(/@\w+\[[^\]]*\](?:\{([^}]*)\})?/g, (m, label) => (label && label.trim()) || "");
    // Strip HTML tags
    res = res.replace(/<[^>]*>?/gm, ' ');
    // Clean HTML entities
    res = res.replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'");
    // Normalize extra whitespace
    res = res.replace(/\s+/g, ' ').trim();
    return res;
  }

  /**
   * Extracts display title and snippet from entry name and note text.
   * @param {string} name 
   * @param {string} noteText 
   * @param {number} maxTitleLen 
   * @param {number} maxSnippetLen 
   * @returns {{ displayTitle: string, snippet: string }}
   */
  static _extractTitleAndSnippet(name, noteText, maxTitleLen = 80, maxSnippetLen = 140) {
    const rawNote = ClueBookApp._cleanPlainText(noteText);
    const rawName = ClueBookApp._cleanPlainText(name);

    let displayTitle = rawName;
    let snippet = "";

    if (!displayTitle && rawNote) {
      // Split by sentence ending (. ! ? \n)
      const match = rawNote.match(/^([^\n.!?]+[\n.!?]?)/);
      const firstSentence = (match ? match[1] : rawNote).trim();
      displayTitle = firstSentence.length > maxTitleLen ? firstSentence.substring(0, maxTitleLen - 3) + '...' : firstSentence;
      const rest = rawNote.substring(firstSentence.length).replace(/^[\n.!?\s]+/, '').trim();
      snippet = rest.length > maxSnippetLen ? rest.substring(0, maxSnippetLen - 3) + '...' : rest;
    } else if (rawNote) {
      snippet = rawNote.length > maxSnippetLen ? rawNote.substring(0, maxSnippetLen - 3) + '...' : rawNote;
    } else if (!displayTitle) {
      displayTitle = game.i18n.localize("CLUEBOOK.Entry.Untitled");
    }

    return { displayTitle, snippet };
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
    isShared: false,
    isReadOnly: false,
    searchQuery: "",
    editingEntryId: null,
    highlightedEntryId: null,
    selectedEntryId: null,
    selectedEntries: new Set(),
    searchTags: [],
    searchCategoryFilter: "all",
    questFilter: "all",
    npcFilter: "all",
    isQuestArchiveOpen: false,
    isNpcArchiveOpen: false,
    camera: null
  };

  static DEFAULT_SETTINGS = {
    readOnly: false,
    features: {
      cardsShowExplicitLinks: true,
      cardsShowSuggestedLinks: true,
      boardShowExplicitLinks: false,
      boardShowSuggestedLinks: false,
      hideTags: false,
      hideTagsOnCards: false,
      galleryAlwaysBelow: false,
      disablePhotoTilt: false,
      showTabBadges: true,
      showCardPortraits: false,
      showBacklinks: true
    },
    theme: {
      defaultWorkspace: "personal",
      accent: "#7b61ff",
      widgetColor: "#7b61ff",
      widgetColor2: "#4527a0",
      opacity: 85,
      linkColor: "#ff5252",
      linkStyle: "6,4",
      showHotkeys: true,
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
      locations: "blue",
      gallery: "teal"
    },
    widget: {
      direction: "up-right"
    },
    hiddenTabs: {
      search: false,
      notes: false,
      npc: false,
      locations: false,
      quests: false,
      timeline: false,
      gallery: false,
      board: false
    }
  };

  getSettings() {
    const defaults = foundry.utils.deepClone(ClueBookApp.DEFAULT_SETTINGS);
    const localSettings = game.user.getFlag("ClueBook", "settings") || {};
    const target = WorkspaceRepository.resolveTarget(this.state.activeWorkspace);
    const wsSettings = target.id === "personal" ? localSettings : WorkspaceRepository.getSettings(this.state.activeWorkspace);

    const theme = { ...defaults.theme, ...(localSettings.theme || {}) };
    const features = { ...defaults.features, ...(localSettings.features || {}), ...(wsSettings.features || {}) };
    const widget = { ...defaults.widget, ...(localSettings.widget || {}) };

    if (target.isShared && wsSettings.theme) {
      if (wsSettings.theme.linkColor !== undefined) theme.linkColor = wsSettings.theme.linkColor;
      if (wsSettings.theme.linkStyle !== undefined) theme.linkStyle = wsSettings.theme.linkStyle;
      if (wsSettings.theme.snapToGrid !== undefined) theme.snapToGrid = wsSettings.theme.snapToGrid;
      if (wsSettings.theme.hoverHighlight !== undefined) theme.hoverHighlight = wsSettings.theme.hoverHighlight;
      if (wsSettings.theme.hoverDelay !== undefined) theme.hoverDelay = wsSettings.theme.hoverDelay;
      if (wsSettings.theme.highlightDuration !== undefined) theme.highlightDuration = wsSettings.theme.highlightDuration;
    }

    const defaultColors = { ...defaults.defaultColors, ...(wsSettings.defaultColors || {}) };
    const readOnly = target.isShared ? (wsSettings.readOnly ?? defaults.readOnly) : false;
    const tags = wsSettings.tags || {};
    const showTagsToPlayers = wsSettings.showTagsToPlayers ?? true;
    const hideEditBtn = wsSettings.hideEditBtn ?? false;
    const hideTrackerBtn = wsSettings.hideTrackerBtn ?? false;
    const hideActorBtn = wsSettings.hideActorBtn ?? false;
    const hideSceneBtn = wsSettings.hideSceneBtn ?? false;
    const hideDeleteBtn = wsSettings.hideDeleteBtn ?? false;
    const hideGMVisibilityBtn = wsSettings.hideGMVisibilityBtn ?? false;
    const hideGMOverlayBtn = wsSettings.hideGMOverlayBtn ?? false;
    const hideSendToBoardBtn = wsSettings.hideSendToBoardBtn ?? false;
    const hiddenTabs = wsSettings.hiddenTabs || {};

    return {
      theme,
      features,
      defaultColors,
      widget,
      readOnly,
      tags,
      showTagsToPlayers,
      hideEditBtn,
      hideTrackerBtn,
      hideActorBtn,
      hideSceneBtn,
      hideDeleteBtn,
      hideGMVisibilityBtn,
      hideGMOverlayBtn,
      hideSendToBoardBtn,
      hiddenTabs
    };
  }

  static ALL_TABS = [
    { id: "search", icon: "fas fa-search", label: "CLUEBOOK.Tabs.Search" },
    { id: "notes", icon: "fas fa-sticky-note", label: "CLUEBOOK.Tabs.Notes" },
    { id: "npc", icon: "fas fa-user", label: "CLUEBOOK.Tabs.NPC" },
    { id: "locations", icon: "fas fa-map-marked-alt", label: "CLUEBOOK.Tabs.Locations" },
    { id: "quests", icon: "fas fa-scroll", label: "CLUEBOOK.Tabs.Quests" },
    { id: "timeline", icon: "fas fa-clock", label: "CLUEBOOK.Tabs.Timeline" },
    { id: "gallery", icon: "fas fa-camera-retro", label: "CLUEBOOK.Tabs.Gallery" },
    { id: "board", icon: "fas fa-project-diagram", label: "CLUEBOOK.Tabs.Board" }
  ];

  /**
   * Defines the tabs for the application with per-board visibility filtering
   */
  get tabs() {
    const settings = this.getSettings();
    const hidden = settings.hiddenTabs || {};
    const visible = ClueBookApp.ALL_TABS
      .filter(t => !hidden[t.id])
      .map(t => ({
        id: t.id,
        icon: t.icon,
        label: game.i18n.localize(t.label)
      }));

    if (visible.length === 0) {
      return [
        { id: "notes", icon: "fas fa-sticky-note", label: game.i18n.localize("CLUEBOOK.Tabs.Notes") }
      ];
    }
    return visible;
  }


  async _prepareContext(options) {
    const context = await super._prepareContext(options);

    this._prepareWorkspaceList(context);
    const data = await this._prepareWorkspaceData(context);
    const allFolders = data.folders || {};
    const canView = (e) => e && !e._deleted && WorkspaceAccessService.canUserViewEntry(e, allFolders, game.user, context.isShared);

    // Count board pins & tab counts (filtered by user visibility)
    let boardPinCount = 0;
    for (const tabKey of ["notes", "npc", "locations", "quests", "timeline", "gallery", "pins"]) {
      boardPinCount += Object.values(data[tabKey] || {}).filter(e => canView(e) && e.onBoard === true).length;
    }
    context.boardPinCount = boardPinCount;
    const savedCameras = game.user?.getFlag("ClueBook", "boardCameras") || {};
    const activeCam = this.state.camera || savedCameras[this.state.activeWorkspace] || { zoom: 1 };
    context.boardZoomPercent = Math.round((activeCam.zoom || 1) * 100);

    const tabCounts = {
      notes: Object.values(data.notes || {}).filter(canView).length,
      npc: Object.values(data.npc || {}).filter(canView).length,
      locations: Object.values(data.locations || {}).filter(canView).length,
      quests: Object.values(data.quests || {}).filter(e => canView(e) && (!e.status || e.status === "active")).length,
      timeline: Object.values(data.timeline || {}).filter(canView).length,
      gallery: Object.values(data.gallery || {}).filter(canView).length,
      board: boardPinCount
    };

    const showBadges = context.settings?.features?.showTabBadges !== false;
    context.tabs = context.tabs.map(t => ({
      ...t,
      badge: (showBadges && tabCounts[t.id] !== undefined && tabCounts[t.id] > 0) ? tabCounts[t.id] : null
    }));

    if (context.isSettings || context.isWorkspaces) {
      context.showAddBtn = false;
      context.isBoardView = false;
      return context;
    }

    const entries = await this._prepareEntriesForTab(context, data);
    this._processExplicitLinks(context, data, entries);
    this._processBacklinks(context, data, entries);
    this._processTags(context, entries);
    this._processDates(context, entries);

    // Group entries by folders for the active tab (partitioned into top and bottom)
    const isFolderVisible = (f) => WorkspaceAccessService.isFolderVisible(f, game.user, context.isShared);

    const tabFolders = Object.entries(allFolders)
      .filter(([fId, f]) => f && f.tab === this.state.activeTab && isFolderVisible(f))
      .sort((a, b) => (a[1].sort || 0) - (b[1].sort || 0));

    const foldersList = tabFolders.map(([fId, f]) => {
      const folderEntries = entries.filter(e => e.folderId === fId);
      const isBottom = f.position === "bottom";
      const isCustomColor = f.color && f.color.startsWith("#");
      let customStyle = "";
      let customIconStyle = "";
      if (isCustomColor) {
        const { r, g, b } = UIService.hexToRgb(f.color);
        if (r < 30 && g < 30 && b < 30) {
          customStyle = `background: rgba(0, 0, 0, 0.5) !important; border-color: rgba(255, 255, 255, 0.25) !important; --cb-folder-color: #ffffff;`;
          customIconStyle = `color: #ffffff !important;`;
        } else {
          customStyle = `background: rgba(${r}, ${g}, ${b}, 0.14) !important; border-color: rgba(${r}, ${g}, ${b}, 0.45) !important; --cb-folder-color: ${f.color};`;
          customIconStyle = `color: ${f.color} !important;`;
        }
      }
      return {
        id: fId,
        name: f.name,
        tab: f.tab,
        color: f.color || "purple",
        isCustomColor: isCustomColor,
        customStyle: customStyle,
        customIconStyle: customIconStyle,
        position: f.position || "top",
        isTop: !isBottom,
        isBottom: isBottom,
        sort: f.sort || 0,
        isCollapsed: f.isCollapsed ?? false,
        isHidden: f.isHidden ?? false,
        visibleTo: f.visibleTo || [],
        entries: folderEntries,
        count: folderEntries.length
      };
    });

    const foldersTop = foldersList.filter(f => f.isTop);
    const foldersBottom = foldersList.filter(f => f.isBottom);
    const rootEntries = entries.filter(e => (!e.folderId || !allFolders[e.folderId]) && (!allFolders[e.folderId] || isFolderVisible(allFolders[e.folderId])));

    context.folders = foldersList;
    context.foldersTop = foldersTop;
    context.foldersBottom = foldersBottom;
    context.rootEntries = rootEntries;
    context.entries = entries; // For empty states and backward compatibility

    context.showAddBtn = this.state.activeTab !== "board" && this.state.activeTab !== "search";
    context.isBoardView = this.state.activeTab === "board";
    context.editingEntryId = this.state.editingEntryId;
    context.highlightedEntryId = this.state.highlightedEntryId;

    // View modes per tab (gallery is always grid)
    const tabViewModes = game.user?.getFlag("ClueBook", "tabViewModes") || this.state.tabViewModes || {};
    const currentViewMode = this.state.activeTab === "gallery" ? "grid" : (tabViewModes[this.state.activeTab] || "grid");
    context.currentViewMode = currentViewMode;
    context.isGridView = currentViewMode === "grid";
    context.isCompactView = currentViewMode === "compact";
    context.isListView = currentViewMode === "list";

    const viewModeLabels = {
      grid: { label: game.i18n.localize("CLUEBOOK.View.Grid"), icon: "fa-th-large" },
      compact: { label: game.i18n.localize("CLUEBOOK.View.Compact"), icon: "fa-table" },
      list: { label: game.i18n.localize("CLUEBOOK.View.List"), icon: "fa-list-ul" }
    };
    context.currentViewLabel = (viewModeLabels[currentViewMode] || viewModeLabels.grid).label;
    context.currentViewIcon = (viewModeLabels[currentViewMode] || viewModeLabels.grid).icon;

    // Add enableTracker to context based on user settings
    const userSettings = game.user?.getFlag("ClueBook", "settings") || {};
    context.enableTracker = userSettings.features?.enableTracker !== false;

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
            if (!isEntryTab(tabKey)) continue;
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
      if (j.getFlag("ClueBook", "isWorkspace") && j.testUserPermission(game.user, "OBSERVER")) {
        availableWorkspaces.push({ id: j.id, name: j.name });
      }
    });

    if (this.state.activeWorkspace !== "personal" && !this.state.activeWorkspace.startsWith("personal_") && !game.journal.get(this.state.activeWorkspace)) {
      this.state.activeWorkspace = "personal";
    }

    const favoriteWorkspaces = game.user?.getFlag("ClueBook", "favoriteWorkspaces") || [];
    context.favoriteWorkspaces = favoriteWorkspaces;
    context.isFavoriteActiveWorkspace = favoriteWorkspaces.includes(this.state.activeWorkspace);
    context.workspaces = availableWorkspaces;
  }

  async _prepareWorkspaceData(context) {
    let data = this._getWorkspaceData();

    if (this.state.activeWorkspace === "personal") {
      context.workspaceName = game.user.getFlag("ClueBook", "personalWorkspaceName") || game.i18n.localize("CLUEBOOK.Workspace.Personal");
      context.isShared = false;
    } else if (this.state.activeWorkspace.startsWith("personal_")) {
      const uId = this.state.activeWorkspace.slice("personal_".length);
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
      } else {
        this.state.activeWorkspace = "personal";
        data = game.user.getFlag("ClueBook", "data") || {};
        context.workspaceName = game.i18n.localize("CLUEBOOK.Workspace.Personal");
        context.isShared = false;
      }
    }

    this.state.isShared = Boolean(context.isShared);
    this._prepareUIState(context);
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

    const currentSettings = this.getSettings();
    const visibleTags = WorkspaceAccessService.getVisibleTags(currentSettings?.tags || {}, currentSettings, game.user, Boolean(context.isShared));
    const hideTags = currentSettings?.features?.hideTags;
    context.showTags = !hideTags;

    if (context.showTags) {
      context.availableSearchTags = Object.values(visibleTags)
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
    context.settings = currentSettings;
    context.isGM = game.user.isGM;
    this.state.isReadOnly = Boolean(this.state.isZenMode || (context.isShared && context.settings.readOnly && !context.isGM));
    context.isReadOnly = this.state.isReadOnly;
  }

  async _resolveCardPortrait(entry, sourceTab, showPortraits) {
    if (!showPortraits || (sourceTab !== "npc" && sourceTab !== "locations")) return "";
    if (entry.img) return entry.img;
    try {
      if (sourceTab === "npc" && entry.actorUuid) {
        const actor = await fromUuid(entry.actorUuid);
        const actorImg = actor?.img || actor?.prototypeToken?.texture?.src || "";
        return (actorImg && actorImg !== CONST.DEFAULT_TOKEN && actorImg !== "icons/svg/mystery-man.svg") ? actorImg : "";
      }
      if (sourceTab === "locations" && entry.sceneUuid) {
        const scene = await fromUuid(entry.sceneUuid);
        return scene?.thumbnail || scene?.background?.src || "";
      }
    } catch (e) { }
    return "";
  }

  async _prepareEntriesForTab(context, data) {
    const entries = [];
    const trackedIds = game.user.getFlag("ClueBook", "trackedEvents") || [];
    const allFolders = data.folders || {};
    const showPortraits = Boolean(context.settings?.features?.showCardPortraits);

    const isEntryVisible = (entry) => WorkspaceAccessService.canUserViewEntry(entry, allFolders, game.user, context.isShared);

    if (this.state.activeTab === "search") {
      const q = (this.state.searchQuery || "").toLowerCase();
      const tagsFilter = this.state.searchTags || [];
      if (q || tagsFilter.length > 0) {
        for (const [tabKey, tabData] of Object.entries(data)) {
          if (!isEntryTab(tabKey)) continue;
          for (const [id, entry] of Object.entries(tabData || {})) {
            if (!entry || !isEntryVisible(entry)) continue;

            let matchText = !q;
            let matchTags = tagsFilter.length === 0;

            if (q) {
              for (const [fieldKey, val] of Object.entries(entry)) {
                if (fieldKey === "gmNotes" && !context.isGM) continue;
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
              const enriched = await this._enrichEntry(entry, id);
              const cardPortraitImg = await this._resolveCardPortrait(entry, tabKey, showPortraits);
              const cropStyle = resolveCropParams(entry, tabKey).style;
              const { displayTitleHTML, snippetHTML, plainTitle, plainSnippet } = await TextEnrichmentService.extractDisplayAndSnippet(
                entry.name || entry.title,
                entry.note || entry.text || entry.event
              );
              const displayOwner = TextEnrichmentService.stripToPlainText(entry.owner);
              const displaySubtitle = TextEnrichmentService.stripToPlainText(entry.subtitle);
              entries.push({ id, sourceTab: tabKey, ...entry, cardPortraitImg, cropStyle, isTracked: trackedIds.includes(id), displayTitleHTML, snippetHTML, displayTitle: plainTitle, snippet: plainSnippet, displayOwner, displaySubtitle, enriched });
            }
          }
        }
      }

      // Group search results by category
      const CATEGORY_DEFS = {
        npc: { label: game.i18n.localize("CLUEBOOK.Tabs.NPC") || "NPC", icon: "fas fa-user", order: 1 },
        locations: { label: game.i18n.localize("CLUEBOOK.Tabs.Locations") || "Locations", icon: "fas fa-map-marked-alt", order: 2 },
        notes: { label: game.i18n.localize("CLUEBOOK.Tabs.Notes") || "Notes", icon: "fas fa-sticky-note", order: 3 },
        quests: { label: game.i18n.localize("CLUEBOOK.Tabs.Quests") || "Quests", icon: "fas fa-scroll", order: 4 },
        timeline: { label: game.i18n.localize("CLUEBOOK.Tabs.Timeline") || "Timeline", icon: "fas fa-clock", order: 5 },
        gallery: { label: game.i18n.localize("CLUEBOOK.Tabs.Gallery") || "Gallery", icon: "fas fa-camera-retro", order: 6 },
        pins: { label: game.i18n.localize("CLUEBOOK.Tabs.Pins") || "Pins", icon: "fas fa-thumbtack", order: 7 },
        labels: { label: game.i18n.localize("CLUEBOOK.Tabs.Labels") || "Labels", icon: "fas fa-font", order: 8 }
      };

      const groupedMap = new Map();
      entries.forEach(item => {
        const catKey = item.sourceTab || "notes";
        if (!groupedMap.has(catKey)) {
          groupedMap.set(catKey, []);
        }
        groupedMap.get(catKey).push(item);
      });

      const activeFilter = this.state.searchCategoryFilter || "all";
      const categoryChips = [
        { id: "all", label: game.i18n.localize("CLUEBOOK.Search.AllCategories") || "All", count: entries.length, active: activeFilter === "all", order: 0 }
      ];

      groupedMap.forEach((items, catKey) => {
        const def = CATEGORY_DEFS[catKey] || { label: catKey, icon: "fas fa-tag", order: 99 };
        categoryChips.push({
          id: catKey,
          label: def.label,
          icon: def.icon,
          count: items.length,
          active: activeFilter === catKey,
          order: def.order
        });
      });

      categoryChips.sort((a, b) => a.order - b.order);
      context.searchCategoryChips = categoryChips;

      const searchGroups = [];
      groupedMap.forEach((items, catKey) => {
        if (activeFilter !== "all" && activeFilter !== catKey) return;
        const def = CATEGORY_DEFS[catKey] || { label: catKey, icon: "fas fa-tag", order: 99 };
        searchGroups.push({
          tab: catKey,
          label: def.label,
          icon: def.icon,
          count: items.length,
          entries: items,
          order: def.order
        });
      });

      searchGroups.sort((a, b) => a.order - b.order);
      context.searchGroups = searchGroups;
      context.hasSearchResults = entries.length > 0;
      context.links = [];
    } else if (this.state.activeTab === "board") {
      for (const [tabKey, tabData] of Object.entries(data)) {
        if (!isEntryTab(tabKey)) continue;
        for (const [id, entry] of Object.entries(tabData || {})) {
          if (!entry || !isEntryVisible(entry)) continue;
          if (entry.onBoard) {
            const enriched = await this._enrichEntry(entry, id);
            const cardPortraitImg = await this._resolveCardPortrait(entry, tabKey, showPortraits);
            const cropStyle = resolveCropParams(entry, tabKey).style;
            const displayTitle = TextEnrichmentService.stripToPlainText(entry.name || entry.title) || game.i18n.localize("CLUEBOOK.Entry.Untitled");
            entries.push({ id, sourceTab: tabKey, ...entry, cardPortraitImg, cropStyle, isTracked: trackedIds.includes(id), displayTitle, displayTitleHTML: displayTitle, enriched });
          }
        }
      }
      const galleryBelow = this.getSettings()?.features?.galleryAlwaysBelow;
      entries.sort((a, b) => {
        const aBackdrop = a.frameStyle === "backdrop" ? 0 : 1;
        const bBackdrop = b.frameStyle === "backdrop" ? 0 : 1;
        if (aBackdrop !== bBackdrop) return aBackdrop - bBackdrop;
        if (galleryBelow) {
          const aGallery = a.sourceTab === "gallery" ? 0 : 1;
          const bGallery = b.sourceTab === "gallery" ? 0 : 1;
          if (aGallery !== bGallery) return aGallery - bGallery;
        }
        return (a.sort || 0) - (b.sort || 0);
      });

      context.boardTocItems = entries
        .filter(e => e.sourceTab === "labels" && e.isToc && e.name)
        .map(e => ({ id: e.id, name: e.name, x: e.boardX, y: e.boardY }))
        .sort((a, b) => a.name.localeCompare(b.name));

      const boardEntryIds = new Set(entries.map(e => e.id));
      context.links = Object.values(data.links || {}).filter(l =>
        l.source && l.target && boardEntryIds.has(l.source) && boardEntryIds.has(l.target)
      );
    } else {
      const tabData = data[this.state.activeTab] || {};
      let sortedEntries = Object.entries(tabData);

      const tabSortModes = game.user?.getFlag("ClueBook", "tabSortModes") || {};

      if (this.state.activeTab === "timeline") {
        const sortMode = this.state.timelineSortMode || tabSortModes.timeline || "chronological";
        this.state.timelineSortMode = sortMode;
        context.currentTimelineSortLabel = sortMode === "manual"
          ? game.i18n.localize("CLUEBOOK.Sort.Manual")
          : (sortMode === "chronological_desc"
            ? game.i18n.localize("CLUEBOOK.Sort.ChronologicalDesc")
            : game.i18n.localize("CLUEBOOK.Sort.ChronologicalAsc"));

        if (sortMode === "manual") {
          sortedEntries.sort((a, b) => (a[1].sort || 0) - (b[1].sort || 0));
        } else {
          sortedEntries.sort((a, b) => {
            const tA = a[1].startTimestamp;
            const tB = b[1].startTimestamp;
            const hasA = !a[1].useTextTime && (tA !== null && tA !== undefined && !isNaN(tA));
            const hasB = !b[1].useTextTime && (tB !== null && tB !== undefined && !isNaN(tB));

            if (hasA && hasB) {
              return sortMode === "chronological_desc" ? (tB - tA) : (tA - tB);
            }
            if (hasA && !hasB) return -1;
            if (!hasA && hasB) return 1;
            return (a[1].sort || 0) - (b[1].sort || 0);
          });
        }
      } else if (this.state.activeTab === "quests") {
        const sortMode = this.state.questSortMode || tabSortModes.quests || "chronological";
        this.state.questSortMode = sortMode;
        context.currentQuestSortLabel = sortMode === "manual"
          ? game.i18n.localize("CLUEBOOK.Sort.Manual")
          : (sortMode === "chronological_desc"
            ? game.i18n.localize("CLUEBOOK.Sort.ChronologicalDesc")
            : game.i18n.localize("CLUEBOOK.Sort.ChronologicalAsc"));

        if (sortMode === "manual") {
          sortedEntries.sort((a, b) => (a[1].sort || 0) - (b[1].sort || 0));
        } else {
          sortedEntries.sort((a, b) => {
            const tA = a[1].deadlineTimestamp;
            const tB = b[1].deadlineTimestamp;
            const hasA = !a[1].useTextTime && (tA !== null && tA !== undefined && !isNaN(tA));
            const hasB = !b[1].useTextTime && (tB !== null && tB !== undefined && !isNaN(tB));

            if (hasA && hasB) {
              return sortMode === "chronological_desc" ? (tB - tA) : (tA - tB);
            }
            if (hasA && !hasB) return -1;
            if (!hasA && hasB) return 1;
            return (a[1].sort || 0) - (b[1].sort || 0);
          });
        }
      } else {
        sortedEntries.sort((a, b) => (a[1].sort || 0) - (b[1].sort || 0));
      }

      // Status filters and Archive for Quests
      if (this.state.activeTab === "quests") {
        const questFilter = this.state.questFilter || "all";
        const allTabEntries = Object.values(tabData).filter(isEntryVisible);
        context.questCounts = {
          all: allTabEntries.length,
          active: allTabEntries.filter(e => e.status === "active" || !e.status).length,
          completed: allTabEntries.filter(e => e.status === "completed").length,
          failed: allTabEntries.filter(e => e.status === "failed").length
        };
        context.activeQuestFilter = questFilter;
        context.isQuestArchiveOpen = this.state.isQuestArchiveOpen ?? false;

        if (questFilter === "active") {
          sortedEntries = sortedEntries.filter(([id, e]) => e.status === "active" || !e.status);
        } else if (questFilter === "completed") {
          sortedEntries = sortedEntries.filter(([id, e]) => e.status === "completed");
        } else if (questFilter === "failed") {
          sortedEntries = sortedEntries.filter(([id, e]) => e.status === "failed");
        }
      }

      // Status filters and Archive for NPC
      if (this.state.activeTab === "npc") {
        const npcFilter = this.state.npcFilter || "all";
        const allTabEntries = Object.values(tabData).filter(isEntryVisible);
        context.npcCounts = {
          all: allTabEntries.length,
          alive: allTabEntries.filter(e => e.lifeStatus === "alive" || (!e.lifeStatus && !e.isDead)).length,
          dead: allTabEntries.filter(e => e.lifeStatus === "dead" || e.isDead).length,
          unknown: allTabEntries.filter(e => e.lifeStatus === "unknown").length
        };
        context.activeNpcFilter = npcFilter;
        context.isNpcArchiveOpen = this.state.isNpcArchiveOpen ?? false;

        if (npcFilter === "alive") {
          sortedEntries = sortedEntries.filter(([id, e]) => e.lifeStatus === "alive" || (!e.lifeStatus && !e.isDead));
        } else if (npcFilter === "dead") {
          sortedEntries = sortedEntries.filter(([id, e]) => e.lifeStatus === "dead" || e.isDead);
        } else if (npcFilter === "unknown") {
          sortedEntries = sortedEntries.filter(([id, e]) => e.lifeStatus === "unknown");
        }
      }

      for (const [id, entry] of sortedEntries) {
        if (!entry || !isEntryVisible(entry)) continue;
        const enriched = await this._enrichEntry(entry, id);
        const cardPortraitImg = await this._resolveCardPortrait(entry, this.state.activeTab, showPortraits);
        const cropStyle = resolveCropParams(entry, this.state.activeTab).style;

        // Auto-extract clean HTML title & snippet with clickable mentions for list/compact views
        const { displayTitleHTML, snippetHTML, plainTitle, plainSnippet } = await TextEnrichmentService.extractDisplayAndSnippet(
          entry.name || entry.title,
          entry.note || entry.text || entry.event
        );
        const displayOwner = TextEnrichmentService.stripToPlainText(entry.owner);
        const displaySubtitle = TextEnrichmentService.stripToPlainText(entry.subtitle);

        entries.push({
          id,
          sourceTab: this.state.activeTab,
          ...entry,
          cardPortraitImg,
          cropStyle,
          isTracked: trackedIds.includes(id),
          displayTitleHTML,
          snippetHTML,
          displayTitle: plainTitle,
          snippet: plainSnippet,
          displayOwner,
          displaySubtitle,
          enriched
        });
      }
    }
    return entries;
  }

  _processExplicitLinks(context, data, entries) {
    const allLinks = Object.values(data.links || {});
    const isBoard = this.state.activeTab === "board";
    const showExplicit = isBoard ? context.settings.features?.boardShowExplicitLinks : context.settings.features?.cardsShowExplicitLinks;
    const PRESET_COLORS = ["yellow", "red", "green", "blue", "purple", "orange", "teal", "pink", "brown"];
    const allFolders = data.folders || {};

    const entityMap = new Map();
    const linksByCard = new Map();

    if (showExplicit !== false) {
      // 1. Build O(1) entity lookup map (filtered by user visibility)
      for (const [tabKey, tabData] of Object.entries(data)) {
        if (!isEntryTab(tabKey)) continue;
        for (const [id, entry] of Object.entries(tabData || {})) {
          if (entry && WorkspaceAccessService.canUserViewEntry(entry, allFolders, game.user, context.isShared)) {
            let previewText = entry.text || entry.note || entry.event || "";
            if (previewText) {
              previewText = previewText.replace(/\[\[qnmention:[^:]+:([^\]]+)\]\](?:\{([^}]*)\})?/g, (m, name, cText) => cText || name)
                .replace(/@UUID\[[^\]]+\](?:\{([^\}]+)\})?/g, (m, p1) => p1 || game.i18n.localize("CLUEBOOK.EntryDetails.Link"))
                .replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').substring(0, 150).trim() + "...";
            }
            const rawTitle = entry.name || entry.event || entry.text || game.i18n.localize("CLUEBOOK.EntryDetails.Untitled");
            const cleanTitle = rawTitle.replace(/\[\[qnmention:[^:]+:([^\]]+)\]\](?:\{([^}]*)\})?/g, (m, name, cText) => cText || name)
              .replace(/@UUID\[[^\]]+\](?:\{([^\}]+)\})?/g, (m, p1) => p1 || game.i18n.localize("CLUEBOOK.EntryDetails.Link"))
              .replace(/<[^>]+>/g, '').substring(0, 40).trim();
            entityMap.set(id, { cleanTitle, preview: previewText });
          }
        }
      }

      // 2. Index links by connected cards
      for (const l of allLinks) {
        if (!l.source || !l.target) continue;
        if (!linksByCard.has(l.source)) linksByCard.set(l.source, []);
        if (!linksByCard.has(l.target)) linksByCard.set(l.target, []);
        linksByCard.get(l.source).push({ otherId: l.target, label: l.label });
        linksByCard.get(l.target).push({ otherId: l.source, label: l.label });
      }
    }

    for (const entry of entries) {
      entry.isCustomColor = entry.color && !PRESET_COLORS.includes(entry.color);
      entry.explicitLinks = [];

      if (showExplicit !== false) {
        const connected = linksByCard.get(entry.id);
        if (connected) {
          for (const conn of connected) {
            const other = entityMap.get(conn.otherId);
            if (other) {
              entry.explicitLinks.push({
                id: conn.otherId,
                name: other.cleanTitle,
                label: conn.label,
                preview: other.preview
              });
            }
          }
        }
      }
    }
  }

  _processBacklinks(context, data, entries) {
    if (context.settings.features?.showBacklinks === false) {
      for (const entry of entries) entry.backlinks = [];
      return;
    }

    const allFolders = data.folders || {};
    const mentionRegex = /\[\[qnmention:([a-zA-Z0-9_-]+):([^\]]*)\]\]/g;
    const backlinksByTarget = new Map();

    const TAB_ICONS = {
      notes: "fas fa-sticky-note",
      npc: "fas fa-user",
      locations: "fas fa-map-marked-alt",
      quests: "fas fa-scroll",
      timeline: "fas fa-clock",
      gallery: "fas fa-camera-retro",
      pins: "fas fa-thumbtack",
      labels: "fas fa-font"
    };

    // Index all accessible mentions across the active workspace
    for (const [tabKey, tabData] of Object.entries(data)) {
      if (!isEntryTab(tabKey)) continue;
      for (const [sId, sEntry] of Object.entries(tabData || {})) {
        if (!sEntry || !WorkspaceAccessService.canUserViewEntry(sEntry, allFolders, game.user, context.isShared)) continue;

        const combinedText = `${sEntry.text || ''} ${sEntry.note || ''} ${sEntry.event || ''} ${sEntry.caption || ''} ${sEntry.location || ''} ${sEntry.subtitle || ''} ${sEntry.owner || ''}`;
        if (!combinedText.includes("[[qnmention:")) continue;

        let match;
        mentionRegex.lastIndex = 0;
        const seenInThisEntry = new Set();
        while ((match = mentionRegex.exec(combinedText)) !== null) {
          const targetId = match[1];
          if (!targetId || targetId === sId || seenInThisEntry.has(targetId)) continue;
          seenInThisEntry.add(targetId);

          if (!backlinksByTarget.has(targetId)) backlinksByTarget.set(targetId, []);

          const rawTitle = sEntry.name || sEntry.event || sEntry.text || game.i18n.localize("CLUEBOOK.EntryDetails.Untitled");
          const cleanTitle = TextEnrichmentService.stripToPlainText(rawTitle) || game.i18n.localize("CLUEBOOK.EntryDetails.Untitled");
          backlinksByTarget.get(targetId).push({
            id: sId,
            tab: tabKey,
            title: cleanTitle.length > 32 ? cleanTitle.slice(0, 32) + '...' : cleanTitle,
            icon: TAB_ICONS[tabKey] || "fas fa-tag",
            color: sEntry.color || "#7b61ff"
          });
        }
      }
    }

    for (const entry of entries) {
      entry.backlinks = backlinksByTarget.get(entry.id) || [];
    }
  }

  _processTags(context, entries) {
    if (!context.showTags || this.getSettings()?.features?.hideTagsOnCards) {
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
    context.isSimpleCalendarActive = TimeService.isActive();
    const isTimeActive = TimeService.isActive();

    for (const entry of entries) {
      if (entry.sourceTab === "quests" && entry.status) {
        if (entry.status === "active") entry.translatedStatus = game.i18n.localize("CLUEBOOK.Quest.Active");
        else if (entry.status === "completed") entry.translatedStatus = game.i18n.localize("CLUEBOOK.Quest.Completed");
        else if (entry.status === "failed") entry.translatedStatus = game.i18n.localize("CLUEBOOK.Quest.Failed");
        else entry.translatedStatus = entry.status;
      }

      if (entry.sourceTab === "quests") {
        if (!entry.useTextTime && isTimeActive && entry.deadlineTimestamp !== null && entry.deadlineTimestamp !== undefined) {
          const dl = entry.deadlineTimestamp;
          const curr = game.time.worldTime;
          const diff = dl - curr;

          const fmt = ClueBookApp._formatSCTimestamp(entry.deadlineTimestamp);
          entry.formattedDeadline = fmt.full;
          entry.formattedDeadlineDate = fmt.date;
          entry.formattedDeadlineTime = fmt.time;
          entry.deadlinePrecise = fmt.time ? `${fmt.date} ${fmt.time}` : (fmt.full || fmt.date);

          const absDiff = Math.abs(diff);
          const d = Math.floor(absDiff / 86400);
          const h = Math.floor((absDiff % 86400) / 3600);
          const m = Math.floor((absDiff % 3600) / 60);
          const dStr = d > 0 ? d + game.i18n.localize("CLUEBOOK.Time.DaysShort") : "";
          const hStr = h > 0 ? h + game.i18n.localize("CLUEBOOK.Time.HoursShort") : "";
          const mStr = m + game.i18n.localize("CLUEBOOK.Time.MinutesShort");
          const timeStr = `${dStr}${hStr}${mStr}`.trim();

          entry.isOverdue = diff < 0;
          entry.timeRemaining = timeStr;
          entry.timeStr = timeStr;
        } else if (entry.deadline) {
          entry.deadlinePrecise = entry.deadline;
        }
      }

      if (entry.sourceTab === "timeline") {
        if (entry.useTextTime) {
          if (entry.time || entry.date) {
            entry.timelineIntervalPrecise = entry.time || entry.date;
          }
          continue;
        }

        if (!isTimeActive) {
          if (entry.time || entry.date) {
            entry.timelineIntervalPrecise = entry.time || entry.date;
          }
          continue;
        }

        let startStr = "";
        let endStr = "";
        if (entry.startTimestamp !== null && entry.startTimestamp !== undefined) {
          const dt = TimeService.timestampToDate(entry.startTimestamp);
          if (dt) {
            const fmt = ClueBookApp._formatSCTimestamp(entry.startTimestamp);
            entry.formattedStart = fmt.full;
            entry.formattedStartDate = fmt.date;
            entry.formattedStartTime = fmt.time;
            startStr = fmt.time ? `${fmt.date} ${fmt.time}` : (fmt.full || fmt.date);
          }
        } else if (entry.time || entry.date) {
          startStr = entry.time || entry.date;
        }

        if (entry.endTimestamp !== null && entry.endTimestamp !== undefined) {
          const dt = TimeService.timestampToDate(entry.endTimestamp);
          if (dt) {
            const fmt = ClueBookApp._formatSCTimestamp(entry.endTimestamp);
            entry.formattedEnd = fmt.full;
            entry.formattedEndDate = fmt.date;
            entry.formattedEndTime = fmt.time;
            if (entry.formattedStartDate && entry.formattedEndDate === entry.formattedStartDate && fmt.time) {
              endStr = fmt.time;
            } else {
              endStr = fmt.time ? `${fmt.date} ${fmt.time}` : (fmt.full || fmt.date);
            }
          }
        }

        if (startStr && endStr) {
          entry.timelineIntervalPrecise = `${startStr} — ${endStr}`;
        } else if (startStr) {
          entry.timelineIntervalPrecise = startStr;
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
    if (this._mentionController) {
      this._mentionController.destroy();
      this._mentionController = null;
    }
    const dropdown = document.querySelector('.cb-mention-dropdown');
    if (dropdown) dropdown.remove();
    const tooltip = document.querySelector('.cb-custom-tooltip');
    if (tooltip) tooltip.remove();
    const popover = document.querySelector('#cb-hover-preview-popover');
    if (popover) popover.remove();
    if (this._popoverTimer) {
      clearTimeout(this._popoverTimer);
      this._popoverTimer = null;
    }
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
      this._isAppWindowActive = true;

      // When interacting anywhere in the app, track active state and focus
      html.addEventListener('pointerdown', () => {
        this._isAppWindowActive = true;
      });
      window.addEventListener('pointerdown', (ev) => {
        if (this.element && !this.element.contains(ev.target)) {
          this._isAppWindowActive = false;
        }
      }, true);

      html.addEventListener('click', () => {
        if (document.activeElement === document.body || !html.contains(document.activeElement)) {
          html.focus({ preventScroll: true });
        }
      });

      // Window-level capture listener for Ctrl+Z: blocks Foundry canvas token undo when ClueBook is active
      window.addEventListener('keydown', (ev) => {
        if (!this.rendered) return;
        if (['INPUT', 'TEXTAREA', 'SELECT'].includes(ev.target.tagName) || ev.target.isContentEditable) return;

        const isUndoKey = (ev.key === "z" || ev.key === "Z" || ev.key === "я" || ev.key === "Я" || ev.code === "KeyZ");
        if ((ev.ctrlKey || ev.metaKey) && isUndoKey && !ev.shiftKey) {
          const isOverApp = this.element && (
            document.activeElement === this.element ||
            this.element.contains(document.activeElement) ||
            this.element.matches(':hover') ||
            this._isAppWindowActive
          );
          if (isOverApp) {
            ev.preventDefault();
            ev.stopPropagation();
            ev.stopImmediatePropagation();
            this._onUndo();
          }
        }
      }, true);

      html.addEventListener('keydown', (ev) => {
        // Ignore if typing in an input
        if (['INPUT', 'TEXTAREA', 'SELECT'].includes(ev.target.tagName)) return;

        if ((ev.ctrlKey || ev.metaKey) && (ev.key === "z" || ev.key === "Z" || ev.key === "я" || ev.key === "Я") && !ev.shiftKey) {
          ev.preventDefault();
          this._onUndo();
          return;
        }

        if (ev.key === "a" && (ev.ctrlKey || ev.metaKey)) {
          ev.preventDefault();
          const listContainer = html.querySelector('.entries-list');
          if (listContainer) {
            const visibleEntries = listContainer.querySelectorAll('.cluebook-entry:not([style*="display: none"])');
            this.state.selectedEntries.clear();
            visibleEntries.forEach(el => {
              const id = el.dataset.entryId;
              if (id) {
                this.state.selectedEntries.add(id);
                el.classList.add('is-selected');
              }
            });
            this._updateSelectionHUD();
          }
          return;
        }

        if (ev.key === "Delete" || ev.key === "Backspace") {
          const activeTag = document.activeElement?.tagName?.toLowerCase();
          if (activeTag === 'input' || activeTag === 'textarea' || document.activeElement?.isContentEditable) return;

          const selectedIds = Array.from(this.state.selectedEntries);
          const singleId = selectedIds.length === 1 ? selectedIds[0] : (selectedIds.length === 0 ? this.state.selectedEntryId : null);

          if (selectedIds.length > 1) {
            ev.preventDefault();
            if (this.state.isReadOnly) return;
            this._onDeleteGroup();
          } else if (singleId) {
            const entryEl = html.querySelector(`[data-entry-id="${singleId}"]`);
            if (entryEl) {
              ev.preventDefault();
              if (this.state.isReadOnly) return;
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
          this._updateSelectionHUD();
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
        await this._switchWorkspace(ev.target.value);
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
        await WorkspaceRepository.updatePaths("personal", { "flags.ClueBook.settings.theme.showHotkeys": false });
        this.render({ parts: ["content"] });
      });
    }

    // Bind search input
    const searchInput = html.querySelector('#cluebook-search');
    if (searchInput) {
      let searchDebounceTimeout = null;
      searchInput.addEventListener('input', (ev) => {
        const val = ev.target.value;
        clearTimeout(searchDebounceTimeout);
        searchDebounceTimeout = setTimeout(() => {
          this.state.searchQuery = val;
          this.render({ parts: ["content"] });
        }, 120);
      });

      // Restore focus & cursor position
      if (this.state.searchQuery) {
        searchInput.focus();
        searchInput.selectionStart = searchInput.selectionEnd = searchInput.value.length;
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

    // Bind Quest Status Filter Buttons
    html.querySelectorAll('[data-action="filterQuestStatus"]').forEach(btn => {
      btn.addEventListener('click', (ev) => {
        ev.preventDefault();
        const status = ev.currentTarget.dataset.status;
        this.state.questFilter = status;
        this.render({ parts: ["content"] });
      });
    });

    // Bind NPC Status Filter Buttons
    html.querySelectorAll('[data-action="filterNpcStatus"]').forEach(btn => {
      btn.addEventListener('click', (ev) => {
        ev.preventDefault();
        const status = ev.currentTarget.dataset.status;
        this.state.npcFilter = status;
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
        this.state.selectedEntries.clear();
        this.state.selectedEntryId = null;
        this._updateSelectionHUD();
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

    // --- Hover Preview Popovers for Card Links, Backlinks & Mentions ---
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
            this._updateSelectionHUD();
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
          this._updateSelectionHUD();
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
        // GM shortcut: Shift + Right Click instantly toggles visibility
        if (game.user.isGM && ev.shiftKey) {
          ev.preventDefault();
          ev.stopPropagation();
          this.constructor._onToggleVisibility.call(this, ev, entry);
          return;
        }

        // If right-clicked entry is not part of multi-selection, select only this entry
        if (!this.state.selectedEntries.has(entryId) || this.state.selectedEntries.size <= 1) {
          html.querySelectorAll('.cluebook-entry.is-selected').forEach(el => el.classList.remove('is-selected'));
          this.state.selectedEntries.clear();
          this.state.selectedEntries.add(entryId);
          entry.classList.add('is-selected');
          this.state.selectedEntryId = entryId;
          lastSelectedListEntryId = entryId;
          this._updateSelectionHUD();
        } else {
          this.state.selectedEntryId = entryId;
          lastSelectedListEntryId = entryId;
        }

        if (this.state.selectedEntries.size >= 1 && this._showListContextMenu) {
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

    // Double-click on card / row to edit (or inline edit for labels)
    html.querySelectorAll('.cluebook-entry').forEach(entryNode => {
      entryNode.addEventListener('dblclick', (ev) => {
        // Do not trigger edit if double-clicking on buttons, links, mention tags, or inputs
        if (ev.target.closest('a, button, .cb-mention-link, .content-link, .cb-quest-status-wrapper, .cb-clickable-badge, [data-action], .cb-row-actions, .cb-tag, .cb-link-chip, input, select, textarea')) {
          return;
        }
        // Double-click opens edit dialog for all entries (including labels)
        ClueBookApp._onToggleEdit.call(this, ev, entryNode);
      });
    });

    // Bind all mention links in the app window
    TextEnrichmentService.bindMentionClicks(html);

    // Intercept Content Links (both Scene action dialog and standard Foundry Documents)
    html.addEventListener('click', async (ev) => {
      const link = ev.target.closest('a.content-link');
      if (link && !link.classList.contains('cb-mention-link')) {
        const uuid = link.dataset.uuid || link.dataset.id;
        const type = link.dataset.type;
        if (type === "Scene" || uuid?.startsWith("Scene.")) {
          ev.preventDefault();
          ev.stopPropagation();
          const scene = await fromUuid(uuid);
          if (scene) new SceneActionDialog({ scene, id: `scene-dialog-${scene.id}` }).render(true);
        } else if (uuid) {
          try {
            const doc = await fromUuid(uuid);
            if (doc?.sheet) {
              ev.preventDefault();
              ev.stopPropagation();
              doc.sheet.render(true);
            }
          } catch (e) {
            console.error("ClueBook | Failed to open document from UUID link:", e);
          }
        }
      }
    });

    // Wire Clear Selection in HUD
    const clearSelectionBtn = html.querySelector('[data-action="clearSelection"]');
    if (clearSelectionBtn) {
      clearSelectionBtn.addEventListener('click', (ev) => {
        ev.preventDefault();
        this.state.selectedEntries.clear();
        this.state.selectedEntryId = null;
        html.querySelectorAll('.cluebook-entry.is-selected').forEach(el => el.classList.remove('is-selected'));
        this._updateSelectionHUD();
      });
    }

    // Click outside entries in non-board view to clear selection
    if (this.state.activeTab !== "board") {
      const contentList = html.querySelector('.cluebook-content:not(.board-canvas)');
      if (contentList) {
        contentList.addEventListener('click', (ev) => {
          if (this.state.activeTab === "board") return;
          if (!ev.target.closest('.cluebook-entry') && !ev.target.closest('.cb-context-menu') && !ev.target.closest('.cb-selection-hud') && !ev.target.closest('.cb-tab-toolbar') && !ev.target.closest('.cb-folder-header')) {
            if (this.state.selectedEntries.size > 0) {
              this.state.selectedEntries.clear();
              this.state.selectedEntryId = null;
              html.querySelectorAll('.cluebook-entry.is-selected').forEach(el => el.classList.remove('is-selected'));
              this._updateSelectionHUD();
            }
          }
        });
      }
    }

    // Setup Board Interactivity
    if (this.state.activeTab === "board" && !this.state.searchQuery) {
      this._setupBoardInteractivity(html);
    }

    // Setup List Drag & Drop
    if (!this.state.isBoardView && !this.state.searchQuery && this.state.activeTab !== "settings" && this.state.activeTab !== "workspaces" && !this.state.isReadOnly) {
      this._setupListDragDrop(html);
    }

    // Setup Global Clipboard Paste (Ctrl+V)
    this._setupClipboardPaste(html);

    // Setup Header Quick Board Switcher
    this._renderHeaderBoards(html);
  }

  /**
   * Updates multi-selection floating HUD visibility and count
   */
  _updateSelectionHUD() {
    const hud = this.element?.querySelector('.cb-selection-hud');
    if (!hud) return;
    const count = this.state.selectedEntries?.size || 0;
    if (count > 1) {
      hud.style.display = 'flex';
      const countEl = hud.querySelector('.cb-selection-count');
      if (countEl) countEl.textContent = count;
    } else {
      hud.style.display = 'none';
    }
  }

  /**
   * Fast inline editing of label text directly on the board
   * @param {HTMLElement} labelCard 
   */
  _startLabelInlineEdit(labelCard) {
    if (this.state.isReadOnly) return;
    const id = labelCard.dataset.entryId;
    const textEl = labelCard.querySelector('.cb-board-label-text');
    if (!textEl || labelCard.classList.contains('is-inline-editing')) return;

    labelCard.classList.add('is-inline-editing');
    const isPlaceholder = !!textEl.querySelector('em');
    const currentText = isPlaceholder ? '' : textEl.textContent.trim();

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'cb-label-inline-input';
    input.value = currentText;
    input.placeholder = game.i18n.localize('CLUEBOOK.Label.TextPlaceholder') || 'Heading...';
    input.style.fontSize = textEl.style.fontSize || '';
    input.style.fontFamily = getComputedStyle(textEl).fontFamily;
    input.style.color = textEl.style.color || '#ffffff';

    textEl.style.display = 'none';
    textEl.parentNode.appendChild(input);
    input.focus();
    input.select();

    let saved = false;
    const saveAndClose = async () => {
      if (saved) return;
      saved = true;
      const newName = input.value.trim();
      labelCard.classList.remove('is-inline-editing');
      input.remove();
      textEl.style.display = '';

      if (newName !== currentText) {
        textEl.textContent = newName || '';
        await this._updateWorkspaceData({
          [`flags.ClueBook.data.labels.${id}.name`]: newName
        });
        this.render({ parts: ["content"] });
      }
    };

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        saveAndClose();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        saved = true;
        labelCard.classList.remove('is-inline-editing');
        input.remove();
        textEl.style.display = '';
      }
    });

    input.addEventListener('blur', () => {
      saveAndClose();
    });
  }



  _bindSettingsListeners(html) {
    const saveSetting = async (_scope, key, value) => {
      if (!key) return;
      const flagPath = `flags.ClueBook.settings.${key}`;

      if (key.startsWith('global.')) {
        const globalKey = key.split('.')[1];
        await game.settings.set("ClueBook", globalKey, value);
        this.render();
        return;
      }

      // Theme & FAB widget preferences are personal to each user; board features/visibility follow active workspace
      if (key.startsWith('theme.') || key.startsWith('widget.')) {
        await WorkspaceRepository.updatePaths("personal", { [flagPath]: value });
      } else {
        await WorkspaceRepository.updatePaths(this.state.activeWorkspace, { [flagPath]: value });
      }

      const widget = document.getElementById("cluebook-widget");
      if (widget && widget._buildMenu) {
        const currentSettings = this.getSettings();
        const menu = widget.querySelector(".cb-fab-menu");
        if (menu) widget._buildMenu(currentSettings, menu);
      }

      this.render({ parts: ["tabs", "content"] });
    };

    html.querySelectorAll('.setting-input').forEach(el => {
      el.addEventListener('change', (ev) => {
        const target = ev.currentTarget;
        const key = target.dataset.key;

        const contentPane = html.querySelector('.cluebook-content');
        if (contentPane) this._savedScrollPos = contentPane.scrollTop;

        let value = target.value;
        if (target.type === 'checkbox') {
          value = target.dataset.invert === 'true' ? !target.checked : target.checked;
        }
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
        const preview = chip.dataset.cbPreview || chip.dataset.qnPreview;
        if (!preview) return;
        const name = chip.textContent.trim();

        tooltipTimeout = setTimeout(() => {
          removeTooltip(); // Clean any existing

          tooltipEl = document.createElement('div');
          tooltipEl.className = 'cb-custom-tooltip';
          const strong = document.createElement('strong');
          strong.textContent = name;
          tooltipEl.appendChild(strong);
          const previewDiv = document.createElement('div');
          previewDiv.style.cssText = 'margin-top: 4px; opacity: 0.9;';
          previewDiv.textContent = preview;
          tooltipEl.appendChild(previewDiv);
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
    if (this._mentionController) {
      this._mentionController.destroy();
    }
    this._mentionController = MentionAutocompleteController.attach(html, {
      getWorkspaceId: () => this.state.activeWorkspace,
      isShared: () => this.state.isShared
    });

    html.querySelectorAll('.cb-mention-link').forEach(link => {
      link.addEventListener('click', async (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        const targetId = link.dataset.mentionId;
        if (!targetId) return;

        const data = this._getWorkspaceData();
        const allFolders = data.folders || {};
        let targetTab = null;

        for (const [tabKey, tabData] of Object.entries(data)) {
          if (!isEntryTab(tabKey)) continue;
          const candidate = tabData?.[targetId];
          if (candidate && WorkspaceAccessService.canUserViewEntry(candidate, allFolders, game.user, this.state.isShared)) {
            targetTab = tabKey;
            break;
          }
        }

        if (!targetTab) {
          ui.notifications.warn(game.i18n.localize("CLUEBOOK.App.EntryNotFound"));
          return;
        }

        // Navigate directly to the entry's tab
        this.state.activeTab = targetTab;
        this.state.highlightedEntryId = targetId;
        await game.user.setFlag("ClueBook", "lastTab", targetTab);
        await this.render();

        setTimeout(() => {
          const card = this.element?.querySelector(`.cluebook-entry[data-entry-id="${targetId}"]`);
          if (card) {
            card.scrollIntoView({ behavior: 'smooth', block: 'center' });
            card.classList.add('is-highlighted');
            setTimeout(() => card.classList.remove('is-highlighted'), 2000);
          }
        }, 100);
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

    const showPopover = (targetEl, targetId) => {
      if (!targetId || !targetEl || !targetEl.isConnected) return;

      const data = this._getWorkspaceData();
      const allFolders = data.folders || {};

      let targetTab = null;
      let targetEntry = null;

      for (const [tab, tabData] of Object.entries(data)) {
        if (!isEntryTab(tab)) continue;
        const candidate = tabData?.[targetId];
        if (candidate && !candidate._deleted && WorkspaceAccessService.canUserViewEntry(candidate, allFolders, game.user, Boolean(this.state.isShared))) {
          targetTab = tab;
          targetEntry = candidate;
          break;
        }
      }

      if (!targetEntry) return;

      const esc = (v) => foundry.utils.escapeHTML(String(v ?? ""));
      const tabInfo = {
        notes: { icon: 'fa-sticky-note', label: game.i18n.localize("CLUEBOOK.Tabs.Notes"), color: '#fbc02d' },
        npc: { icon: 'fa-user', label: game.i18n.localize("CLUEBOOK.Tabs.NPC"), color: '#4caf50' },
        locations: { icon: 'fa-map-marked-alt', label: game.i18n.localize("CLUEBOOK.Tabs.Locations"), color: '#2196f3' },
        quests: { icon: 'fa-scroll', label: game.i18n.localize("CLUEBOOK.Tabs.Quests"), color: '#7b61ff' },
        timeline: { icon: 'fa-clock', label: game.i18n.localize("CLUEBOOK.Tabs.Timeline"), color: '#ff9800' },
        gallery: { icon: 'fa-image', label: game.i18n.localize("CLUEBOOK.Tabs.Gallery"), color: '#e91e63' },
        pins: { icon: 'fa-thumbtack', label: game.i18n.localize("CLUEBOOK.Tabs.Pins"), color: '#ff5252' },
        labels: { icon: 'fa-tag', label: game.i18n.localize("CLUEBOOK.Tabs.Labels"), color: '#ffffff' }
      }[targetTab] || { icon: 'fa-link', label: game.i18n.localize("CLUEBOOK.EntryDetails.Link"), color: '#7b61ff' };

      let titleText = TextEnrichmentService.stripToPlainText(targetEntry.name || targetEntry.event || targetEntry.text || game.i18n.localize("CLUEBOOK.EntryDetails.Untitled"));
      if (titleText.length > 80) titleText = titleText.substring(0, 80) + '...';

      let rawText = TextEnrichmentService.stripToPlainText(targetEntry.text || targetEntry.note || targetEntry.caption || targetEntry.event || "");
      if (rawText.length > 180) rawText = rawText.substring(0, 180) + '...';

      let badgesHTML = '';
      if (targetTab === 'quests') {
        const status = targetEntry.status || 'active';
        if (status === 'completed') {
          badgesHTML += `<div class="cb-popover-badge" style="background: rgba(76,175,80,0.25); border: 1px solid rgba(76,175,80,0.5); color: #86efac;"><i class="fas fa-check-circle"></i> ${esc(game.i18n.localize("CLUEBOOK.Quest.Completed"))}</div>`;
        } else if (status === 'failed') {
          badgesHTML += `<div class="cb-popover-badge" style="background: rgba(239,68,68,0.25); border: 1px solid rgba(239,68,68,0.5); color: #fca5a5;"><i class="fas fa-times-circle"></i> ${esc(game.i18n.localize("CLUEBOOK.Quest.Failed"))}</div>`;
        } else {
          badgesHTML += `<div class="cb-popover-badge" style="background: rgba(123,97,255,0.25); border: 1px solid rgba(123,97,255,0.5); color: #c4b5fd;"><i class="fas fa-hourglass-half"></i> ${esc(game.i18n.localize("CLUEBOOK.Quest.Active"))}</div>`;
        }
        if (targetEntry.deadline) {
          badgesHTML += `<div class="cb-popover-badge" style="background: rgba(255,152,0,0.2); border: 1px solid rgba(255,152,0,0.4); color: #fdba74;"><i class="fas fa-clock"></i> ${esc(TextEnrichmentService.stripToPlainText(targetEntry.deadline))}</div>`;
        }
      } else if (targetTab === 'npc') {
        const isDead = targetEntry.lifeStatus === 'dead' || targetEntry.isDead;
        const isUnknown = targetEntry.lifeStatus === 'unknown';
        if (isDead) {
          badgesHTML += `<div class="cb-popover-badge" style="background: rgba(239,68,68,0.25); border: 1px solid rgba(239,68,68,0.5); color: #fca5a5;"><i class="fas fa-skull"></i> ${esc(game.i18n.localize("CLUEBOOK.Entry.Dead"))}</div>`;
        } else if (isUnknown) {
          badgesHTML += `<div class="cb-popover-badge" style="background: rgba(156,163,175,0.25); border: 1px solid rgba(156,163,175,0.5); color: #d1d5db;"><i class="fas fa-question-circle"></i> ${esc(game.i18n.localize("CLUEBOOK.Entry.Unknown"))}</div>`;
        } else {
          badgesHTML += `<div class="cb-popover-badge" style="background: rgba(76,175,80,0.25); border: 1px solid rgba(76,175,80,0.5); color: #86efac;"><i class="fas fa-heartbeat"></i> ${esc(game.i18n.localize("CLUEBOOK.Entry.Alive"))}</div>`;
        }
        if (targetEntry.location) {
          badgesHTML += `<div class="cb-popover-badge" style="background: rgba(59,130,246,0.2); border: 1px solid rgba(59,130,246,0.4); color: #93c5fd;"><i class="fas fa-map-marker-alt"></i> ${esc(TextEnrichmentService.stripToPlainText(targetEntry.location))}</div>`;
        }
        if (targetEntry.attitude) {
          badgesHTML += `<div class="cb-popover-badge" style="background: rgba(234,179,8,0.2); border: 1px solid rgba(234,179,8,0.4); color: #fde047;"><i class="fas fa-smile"></i> ${esc(TextEnrichmentService.stripToPlainText(targetEntry.attitude))}</div>`;
        }
      } else if (targetTab === 'locations') {
        if (targetEntry.subtitle) {
          badgesHTML += `<div class="cb-popover-badge" style="background: rgba(59,130,246,0.2); border: 1px solid rgba(59,130,246,0.4); color: #93c5fd;"><i class="fas fa-map-pin"></i> ${esc(TextEnrichmentService.stripToPlainText(targetEntry.subtitle))}</div>`;
        }
        if (targetEntry.owner) {
          badgesHTML += `<div class="cb-popover-badge" style="background: rgba(147,51,234,0.2); border: 1px solid rgba(147,51,234,0.4); color: #d8b4fe;"><i class="fas fa-user"></i> ${esc(TextEnrichmentService.stripToPlainText(targetEntry.owner))}</div>`;
        }
      } else if (targetTab === 'pins') {
        badgesHTML += `<div class="cb-popover-badge" style="background: rgba(239,68,68,0.2); border: 1px solid rgba(239,68,68,0.4); color: #fca5a5;"><i class="fas ${esc(targetEntry.icon || 'fa-thumbtack')}"></i> ${esc(game.i18n.localize("CLUEBOOK.Tabs.Pins"))}</div>`;
      }

      let imageThumb = '';
      const showPortraitsInPopover = this.getSettings()?.features?.showCardPortraits !== false;
      let portraitSrc = targetEntry.img || '';
      if (!portraitSrc && targetEntry.actorId) {
        const actor = game.actors?.get(targetEntry.actorId);
        if (actor?.img) portraitSrc = actor.img;
      }
      if ((targetTab === 'gallery' || (showPortraitsInPopover && (targetTab === 'npc' || targetTab === 'locations'))) && portraitSrc) {
        imageThumb = `<div class="cb-popover-thumb" style="margin-bottom: 8px; border-radius: 6px; overflow: hidden; max-height: 120px; display: flex; align-items: center; justify-content: center; background: rgba(0,0,0,0.4); border: 1px solid rgba(255,255,255,0.1);"><img src="${esc(portraitSrc)}" style="max-height: 120px; width: 100%; object-fit: cover; object-position: top center;"></div>`;
      }

      const rawHTML = `
        <div class="cb-popover-header" style="border-left: 3px solid ${esc(targetEntry.color || tabInfo.color)};">
          <div class="cb-popover-type"><i class="fas ${esc(tabInfo.icon)}"></i> ${esc(tabInfo.label)}</div>
          <div class="cb-popover-title">${esc(titleText)}</div>
        </div>
        ${imageThumb}
        ${badgesHTML ? `<div style="display: flex; gap: 4px; flex-wrap: wrap; margin-bottom: 6px;">${badgesHTML}</div>` : ''}
        ${rawText && rawText !== titleText ? `<div class="cb-popover-body">${esc(rawText)}</div>` : ''}
      `;
      popover.replaceChildren(...new DOMParser().parseFromString(rawHTML, "text/html").body.childNodes);

      // Measure dimensions accurately in hidden state
      popover.style.visibility = 'hidden';
      popover.classList.add('is-visible');

      const rect = targetEl.getBoundingClientRect();
      let left = rect.left;
      let top = rect.bottom + 6;

      const popoverWidth = popover.offsetWidth || 270;
      const popoverHeight = popover.offsetHeight || 160;

      if (top + popoverHeight > window.innerHeight - 8) {
        top = rect.top - popoverHeight - 6;
      }
      if (top < 8) top = 8;

      if (left + popoverWidth > window.innerWidth - 8) {
        left = window.innerWidth - popoverWidth - 8;
      }
      if (left < 8) left = 8;

      popover.style.left = `${Math.round(left)}px`;
      popover.style.top = `${Math.round(top)}px`;
      popover.style.visibility = 'visible';
    };

    const hidePopover = () => {
      if (this._popoverTimer) {
        clearTimeout(this._popoverTimer);
        this._popoverTimer = null;
      }
      if (popover) {
        popover.classList.remove('is-visible');
        popover.style.visibility = 'hidden';
      }
    };

    html.querySelectorAll('.cb-link-chip, .cb-backlink-chip, .cb-mention-link, a[data-mention-id], a[data-target-id]').forEach(linkEl => {
      linkEl.addEventListener('mouseenter', (ev) => {
        const currentTarget = ev.currentTarget;
        const targetId = currentTarget?.dataset?.targetId || currentTarget?.dataset?.mentionId;
        if (!targetId) return;
        if (this._popoverTimer) clearTimeout(this._popoverTimer);
        this._popoverTimer = setTimeout(() => {
          showPopover(currentTarget, targetId);
        }, 120);
      });
      linkEl.addEventListener('mouseleave', () => {
        hidePopover();
      });
      linkEl.addEventListener('click', () => {
        hidePopover();
      });
    });
  }

  /**
   * Switches active workspace in 1 click without losing active tab
   * @param {string} workspaceId 
   */
  async _switchWorkspace(workspaceId) {
    if (!workspaceId || this.state.activeWorkspace === workspaceId) return;
    this.flushDebouncedSaves();
    this.state.activeWorkspace = workspaceId;
    this.state.camera = null;
    this.state.editingEntryId = null;
    this.state.selectedEntryId = null;
    this.state.selectedEntries.clear();
    await game.user.setFlag("ClueBook", "lastWorkspace", workspaceId);

    // Refresh FAB menu immediately for new active board
    const widget = document.getElementById("cluebook-widget");
    if (widget && widget._buildMenu) {
      const currentSettings = this.getSettings();
      const menu = widget.querySelector(".cb-fab-menu");
      if (menu) widget._buildMenu(currentSettings, menu);
    }

    this.render();
  }

  /**
   * Injects quick board switcher chips directly into the window header
   * @param {HTMLElement} html 
   */
  _renderHeaderBoards(html) {
    const header = this.element?.querySelector('.window-header');
    if (!header) return;

    // Remove existing header boards container if re-rendered
    header.querySelectorAll('.cb-header-boards').forEach(el => el.remove());

    const titleEl = header.querySelector('.window-title');
    if (!titleEl) return;

    const favoriteIds = game.user?.getFlag("ClueBook", "favoriteWorkspaces") || [];
    if (!favoriteIds || favoriteIds.length === 0) return;

    const personalName = game.user?.getFlag("ClueBook", "personalWorkspaceName") || game.i18n.localize("CLUEBOOK.Workspace.Personal");

    // Collect all accessible shared journals
    const sharedJournals = game.journal.filter(j =>
      j.getFlag("ClueBook", "isWorkspace") &&
      (j.testUserPermission(game.user, "OBSERVER") || game.user.isGM)
    ).map(j => ({ id: j.id, name: j.name, isShared: true }));

    // Build all available boards
    const allBoards = [
      { id: "personal", name: personalName, isPersonal: true },
      ...sharedJournals
    ];

    if (game.user.isGM) {
      game.users.forEach(u => {
        if (u.id !== game.user.id && !u.isGM) {
          const uData = u.getFlag("ClueBook", "data") || {};
          let isEmpty = true;
          for (const [tabKey, tabData] of Object.entries(uData)) {
            if (!isEntryTab(tabKey)) continue;
            if (tabData && Object.keys(tabData).length > 0) {
              isEmpty = false;
              break;
            }
          }
          if (!isEmpty) {
            const uPersonalName = u.getFlag("ClueBook", "personalWorkspaceName") || game.i18n.format("CLUEBOOK.Workspace.PersonalUser", { user: u.name });
            allBoards.push({ id: `personal_${u.id}`, name: game.i18n.format("CLUEBOOK.Workspace.Player", { user: uPersonalName }), isOtherPlayer: true });
          }
        }
      });
    }

    // Determine which boards to show as chips in header (strictly favorite boards)
    let displayedBoards = allBoards.filter(b => favoriteIds.includes(b.id));
    if (!displayedBoards.length) return;

    // Limit to max 5 chips to prevent header overcrowding
    if (displayedBoards.length > 5) {
      displayedBoards = displayedBoards.slice(0, 5);
    }

    const container = document.createElement('div');
    container.className = 'cb-header-boards flexrow';

    displayedBoards.forEach(b => {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = `cb-header-board-chip ${this.state.activeWorkspace === b.id ? 'active' : ''}`;
      chip.dataset.workspaceId = b.id;
      chip.title = b.name;

      const iconClass = b.isPersonal ? 'fa-user' : (b.isOtherPlayer ? 'fa-user-secret' : 'fa-users');
      const chipIcon = document.createElement('i');
      chipIcon.className = `fas ${iconClass}`;
      const chipLabel = document.createElement('span');
      chipLabel.className = 'cb-chip-label';
      chipLabel.textContent = b.name;
      chip.append(chipIcon, chipLabel);

      chip.addEventListener('pointerdown', ev => ev.stopPropagation());
      chip.addEventListener('mousedown', ev => ev.stopPropagation());
      chip.addEventListener('click', async (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        await this._switchWorkspace(b.id);
      });

      container.appendChild(chip);
    });

    // Dropdown button for all boards
    const dropdownBtn = document.createElement('button');
    dropdownBtn.type = 'button';
    dropdownBtn.className = 'cb-header-board-dropdown-btn';
    dropdownBtn.title = game.i18n.localize('CLUEBOOK.Workspaces.AllBoards') || 'All Boards';
    const dropIcon = document.createElement('i');
    dropIcon.className = 'fas fa-chevron-down';
    dropdownBtn.appendChild(dropIcon);
    dropdownBtn.addEventListener('pointerdown', ev => ev.stopPropagation());
    dropdownBtn.addEventListener('mousedown', ev => ev.stopPropagation());
    dropdownBtn.addEventListener('click', (ev) => {
      ev.preventDefault();
      ev.stopPropagation();

      const menuItems = allBoards.map(b => ({
        id: b.id,
        label: b.name,
        icon: b.isPersonal ? 'fa-user' : (b.isOtherPlayer ? 'fa-user-secret' : 'fa-users'),
        isActive: this.state.activeWorkspace === b.id
      }));

      menuItems.push({
        id: '__manage__',
        label: game.i18n.localize('CLUEBOOK.Workspaces.ManageBoardsLink') || 'Manage Boards...',
        icon: 'fa-cog',
        isDivider: true
      });

      UIService.showFloatingMenu({
        target: dropdownBtn,
        currentId: this.state.activeWorkspace,
        minWidth: 220,
        items: menuItems,
        onSelect: async (item) => {
          if (item.id === '__manage__') {
            this.state.activeTab = 'workspaces';
            this.render();
          } else {
            await this._switchWorkspace(item.id);
          }
        }
      });
    });

    container.appendChild(dropdownBtn);
    titleEl.after(container);
  }

  static async _onFilterSearchCategory(event, target) {
    if (event?.preventDefault) event.preventDefault();
    const category = target.dataset.category || "all";
    this.state.searchCategoryFilter = category;
    this.render({ parts: ["content"] });
  }

  static async _onToggleFavoriteWorkspace(event, target) {
    if (event?.preventDefault) event.preventDefault();
    if (event?.stopPropagation) event.stopPropagation();
    const wsId = target.dataset.workspaceId || this.state.activeWorkspace;
    if (!wsId) return;

    let favorites = game.user.getFlag("ClueBook", "favoriteWorkspaces") || [];
    if (favorites.includes(wsId)) {
      favorites = favorites.filter(id => id !== wsId);
    } else {
      favorites.push(wsId);
    }

    await game.user.setFlag("ClueBook", "favoriteWorkspaces", favorites);
    this.render();
  }

  static async _onResetWidgetPositions(event) {
    if (event?.preventDefault) event.preventDefault();
    await game.modules.get("ClueBook")?.api?.resetWidgetPositions?.();
  }

  async _onUndo() {
    if (this.state.isReadOnly) return;
    const wsId = this.state.activeWorkspace || "personal";
    const patch = UndoService.popUndoPatch(wsId);
    if (!patch || Object.keys(patch).length === 0) {
      ui.notifications.info(game.i18n.localize("CLUEBOOK.Undo.Empty"));
      return;
    }
    await WorkspaceRepository.updatePaths(wsId, patch, { skipUndo: true });
    ui.notifications.info(game.i18n.localize("CLUEBOOK.Undo.Success"));
    await this.render({ parts: ["content"] });
  }

  static async _onUndoAction(event, target) {
    if (event?.preventDefault) event.preventDefault();
    await this._onUndo();
  }

}

