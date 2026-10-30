import { ClueBookApp } from "./app.js";
import { ClueBookSocket } from "./socket.js";
import { ClueBookOverlay } from "./overlay.js";
import { TrackerWidget } from "./tracker.js";
import { TimeService } from "./services/time-service.js";
import { TextEnrichmentService } from "./services/text-enrichment-service.js";
import { UIService } from "./services/ui-service.js";
import { WorkspaceRepository } from "./services/workspace-repository.js";
import { WorkspaceAccessService } from "./services/workspace-access-service.js";
import { isEntryTab } from "./data-models.js";

// Global reference to the app instances
let clueBookApp = null;
let trackerWidgetApp = null;
let injectWidget = null;

// Helper to retrieve active board merged settings
export function getActiveBoardSettings() {
  const app = clueBookApp || game.modules?.get("ClueBook")?.api?.getApp?.();
  if (app && typeof app.getSettings === "function") {
    return app.getSettings();
  }
  const activeWs = app?.state?.activeWorkspace
    || game.user?.getFlag("ClueBook", "lastWorkspace")
    || game.user?.getFlag("ClueBook", "settings")?.theme?.defaultWorkspace
    || "personal";
  const activeSettings = WorkspaceRepository.getSettings(activeWs);
  const userSettings = game.user?.getFlag("ClueBook", "settings") || {};
  return {
    ...userSettings,
    ...activeSettings,
    hiddenTabs: activeSettings.hiddenTabs || userSettings.hiddenTabs || {},
    widget: userSettings.widget || {},
    features: { ...(userSettings.features || {}), ...(activeSettings.features || {}) }
  };
}

Hooks.once("init", async () => {
  try {
    console.log("ClueBook | Initializing...");

    // Register Welcome Message Setting
    game.settings.register("ClueBook", "hideWelcomeMessage112", {
      name: "Hide Welcome Message",
      scope: "world",
      config: false,
      type: Boolean,
      default: false
    });

    Hooks.on("renderChatMessageHTML", (message, html) => {
      try {
        const root = html instanceof HTMLElement ? html : html?.[0];
        const btn = root?.querySelector(".cluebook-welcome-dismiss");
        if (btn) {
          btn.addEventListener("click", async (ev) => {
            ev.preventDefault();
            await game.settings.set("ClueBook", "hideWelcomeMessage112", true);
            const checkIcon = document.createElement("i");
            checkIcon.className = "fas fa-check";
            btn.replaceChildren(checkIcon, document.createTextNode(` ${game.i18n.localize("CLUEBOOK.EditDialog.Saved")}`));
            btn.style.background = "rgba(46, 204, 113, 0.4)";
            btn.style.pointerEvents = "none";
          });
        }
      } catch (err) {
        console.error("ClueBook | renderChatMessageHTML hook error:", err);
      }
    });

    Hooks.on("getSceneControlButtons", (...args) => {
      try {
        const settings = game.user?.getFlag("ClueBook", "settings") || {};
        const controlsDict = args[0];

        if (settings.theme?.uiMode !== "controls") {
          // Foundry V13/V14 crash prevention:
          // If the user previously had 'cluebook' as their active control, then changed uiMode to 'widget',
          // provide a hidden dummy control and asynchronously switch back to 'tokens'.
          if (controlsDict && !Array.isArray(controlsDict) && typeof controlsDict === "object") {
            controlsDict["cluebook"] = {
              name: "cluebook",
              title: "ClueBook",
              layer: "cluebook",
              order: 100,
              icon: "fas fa-book-open",
              visible: false,
              activeTool: "dummy",
              tools: {
                dummy: {
                  name: "dummy",
                  title: "ClueBook",
                  icon: "fas fa-book"
                }
              }
            };
          }

          setTimeout(() => {
            try {
              if (ui.controls && (ui.controls.control?.name === "cluebook" || ui.controls.control === "cluebook")) {
                ui.controls.initialize({ control: "tokens" });
              }
            } catch (e) {}
          }, 500);
          return;
        }

        if (!controlsDict || typeof controlsDict !== "object") {
          console.error("ClueBook | getSceneControlButtons: Could not find controls dictionary in hook arguments:", args);
          return;
        }

        const controlGroup = {
          name: "cluebook",
          title: "ClueBook",
          layer: "cluebook",
          order: 100,
          icon: "fas fa-book-open",
          visible: true,
          activeTool: "menu",
          tools: {
            menu: {
              name: "menu",
              title: "ClueBook",
              icon: "fas fa-book",
              visible: false
            },
            openApp: {
              name: "openApp",
              title: game.i18n.localize("CLUEBOOK.Main.OpenApp"),
              icon: "fas fa-book-open",
              onClick: () => game.modules.get("ClueBook").api.openApp({}),
              button: true
            },
            ...(settings.widget?.buttons?.notes !== false && !settings.hiddenTabs?.notes ? {
              addNote: {
                name: "addNote",
                title: game.i18n.localize("CLUEBOOK.Main.AddNote"),
                icon: "fas fa-sticky-note",
                onClick: () => ClueBookApp.showQuickAddDialog("notes"),
                button: true
              }
            } : {}),
            ...(settings.widget?.buttons?.npc !== false && !settings.hiddenTabs?.npc ? {
              addNpc: {
                name: "addNpc",
                title: game.i18n.localize("CLUEBOOK.Main.AddNPC"),
                icon: "fas fa-user",
                onClick: () => ClueBookApp.showQuickAddDialog("npc"),
                button: true
              }
            } : {}),
            ...(settings.widget?.buttons?.locations !== false && !settings.hiddenTabs?.locations ? {
              addLocation: {
                name: "addLocation",
                title: game.i18n.localize("CLUEBOOK.Main.AddLocation"),
                icon: "fas fa-map-marked-alt",
                onClick: () => ClueBookApp.showQuickAddDialog("locations"),
                button: true
              }
            } : {}),
            ...(settings.widget?.buttons?.quests !== false && !settings.hiddenTabs?.quests ? {
              addQuest: {
                name: "addQuest",
                title: game.i18n.localize("CLUEBOOK.Main.AddQuest"),
                icon: "fas fa-scroll",
                onClick: () => ClueBookApp.showQuickAddDialog("quests"),
                button: true
              }
            } : {}),
            ...(settings.widget?.buttons?.timeline !== false && !settings.hiddenTabs?.timeline ? {
              addTimeline: {
                name: "addTimeline",
                title: game.i18n.localize("CLUEBOOK.Main.AddEvent"),
                icon: "fas fa-clock",
                onClick: () => ClueBookApp.showQuickAddDialog("timeline"),
                button: true
              }
            } : {}),
            ...(settings.widget?.buttons?.tracker !== false && settings.features?.enableTracker !== false ? {
              toggleTracker: {
                name: "toggleTracker",
                title: game.i18n.localize("CLUEBOOK.Tracker.Title"),
                icon: "fas fa-tasks",
                onClick: () => game.modules.get("ClueBook").api.toggleTracker(),
                button: true
              }
            } : {})
          }
        };

        if (Array.isArray(controlsDict)) {
          controlsDict.push({
            ...controlGroup,
            tools: Object.values(controlGroup.tools)
          });
        } else {
          controlsDict["cluebook"] = controlGroup;
        }
      } catch (err) {
        console.error("ClueBook | getSceneControlButtons hook error:", err);
      }
    });

    /**
     * Public ClueBook Module API
     */
    game.modules.get("ClueBook").api = {
      /** @returns {ClueBookApp|null} */
      getApp: () => clueBookApp,

      /**
       * Opens ClueBook optionally targeting a workspace, tab, and specific entry ID.
       * @param {{ workspace?: string, tab?: string, focusId?: string }} [options={}]
       */
      openApp: async (options = {}) => {
        if (!clueBookApp) {
          clueBookApp = new ClueBookApp();
        }
        const wsId = options.workspace || clueBookApp.state.activeWorkspace;
        const target = WorkspaceRepository.resolveTarget(wsId);
        if (!options.tab && options.focusId) {
          const data = WorkspaceRepository.getData(wsId);
          for (const [t, tabData] of Object.entries(data)) {
            if (!isEntryTab(t)) continue;
            const entry = tabData?.[options.focusId];
            if (entry && WorkspaceAccessService.canUserViewEntry(entry, data.folders, game.user, target.isShared)) {
              options.tab = t;
              break;
            }
          }
          if (!options.tab) {
            ui.notifications.warn(game.i18n.localize("CLUEBOOK.App.EntryNotFound"));
            return;
          }
        }

        if (options.workspace && options.workspace !== clueBookApp.state.activeWorkspace) {
          clueBookApp.state.activeWorkspace = options.workspace;
          clueBookApp.state.camera = null;
          clueBookApp.state.selectedEntries.clear();
          clueBookApp.state.selectedEntryId = null;
        }
        if (options.tab) clueBookApp.state.activeTab = options.tab;

        clueBookApp.render(true).then(() => {
          if (options.focusId) {
            setTimeout(() => {
              const el = clueBookApp.element?.querySelector(`[data-entry-id="${options.focusId}"]`);
              if (el) {
                el.scrollIntoView({ behavior: "smooth", block: "center" });
                el.classList.add("is-highlighted");
                setTimeout(() => el.classList.remove("is-highlighted"), 3000);
              }
            }, 300);
          }
        });
      },

      toggleTracker: () => {
        if (!trackerWidgetApp) trackerWidgetApp = new TrackerWidget();
        if (trackerWidgetApp.rendered) {
          trackerWidgetApp.close({ animate: false });
          trackerWidgetApp = null;
        } else {
          trackerWidgetApp.render({ force: true });
        }
      },

      closeTracker: () => {
        if (trackerWidgetApp) {
          trackerWidgetApp.close({ animate: false });
          trackerWidgetApp = null;
        }
      },

      /**
       * Resets floating FAB and Tracker widget positions to safe screen defaults.
       */
      resetWidgetPositions: async () => {
        try {
          await game.user.unsetFlag("ClueBook", "widgetPos");
          await game.user.unsetFlag("ClueBook", "trackerWidgetPos");

          const existingWidget = document.getElementById("cluebook-widget");
          if (existingWidget) existingWidget.remove();
          if (injectWidget) injectWidget();

          if (trackerWidgetApp && trackerWidgetApp.rendered) {
            trackerWidgetApp.setPosition({
              left: Math.max(20, window.innerWidth - 310),
              top: 80
            });
          }

          ui.notifications.info(game.i18n.localize("CLUEBOOK.Settings.WidgetPositionsReset"));
        } catch (err) {
          console.error("ClueBook | resetWidgetPositions error:", err);
        }
      },

      TextEnrichmentService,
      UIService
    };

    const loadTpl = foundry.applications?.handlebars?.loadTemplates ?? loadTemplates;
    await loadTpl([
      "modules/ClueBook/templates/partials/tab-settings.hbs",
      "modules/ClueBook/templates/partials/tab-workspaces.hbs",
      "modules/ClueBook/templates/partials/tab-board.hbs",
      "modules/ClueBook/templates/partials/entry-card.hbs"
    ]);
  } catch (err) {
    console.error("ClueBook | init hook error:", err);
  }
});

Hooks.once("ready", async () => {
  try {
    console.log("ClueBook | Ready hook fired! Registering socket.");
    ClueBookSocket.init();
    ClueBookOverlay.init();

    if (game.user.isGM && !game.settings.get("ClueBook", "hideWelcomeMessage112")) {
      const content = `
        <div class="cluebook-welcome-message" style="text-align: center; padding: 10px; background: rgba(0,0,0,0.2); border: 1px solid rgba(123,97,255,0.3); border-radius: 8px;">
          <i class="fas fa-user-astronaut" style="font-size: 48px; color: #7b61ff; margin-bottom: 10px; drop-shadow: 0 0 10px rgba(123,97,255,0.5);"></i>
          <h3 style="margin-bottom: 5px; color: var(--cb-accent, #7b61ff);">${game.i18n.localize("CLUEBOOK.Welcome.Title")}</h3>
          <div style="margin-bottom: 15px; font-size: 14px;">${game.i18n.localize("CLUEBOOK.Welcome.Message")}</div>
          <div style="display: flex; gap: 10px; justify-content: center; flex-wrap: wrap; margin-bottom: 15px;">
            <a href="https://github.com/MigaSu/ClueBook/discussions" target="_blank" class="cluebook-btn" style="text-decoration: none; padding: 6px 12px; font-size: 13px; font-weight: bold; background: rgba(123, 97, 255, 0.15); border: 1px solid rgba(123, 97, 255, 0.4); color: inherit; border-radius: 4px; transition: all 0.2s; display: flex; align-items: center; gap: 6px;">
              <i class="fas fa-comments"></i> ${game.i18n.localize("CLUEBOOK.Settings.AboutDiscussionsText")}
            </a>
            <a href="https://boosty.to/migasu" target="_blank" class="cluebook-btn" style="text-decoration: none; padding: 6px 12px; font-size: 13px; font-weight: bold; background: linear-gradient(135deg, #f15f2c, #ff3366); border: none; color: #fff; border-radius: 4px; transition: all 0.2s; display: flex; align-items: center; gap: 6px;">
              <i class="fas fa-heart"></i> ${game.i18n.localize("CLUEBOOK.Settings.AboutBoostyText")}
            </a>
          </div>
          <button class="cluebook-welcome-dismiss" style="background: rgba(0,0,0,0.5); border: 1px solid rgba(255,255,255,0.2); color: #fff; padding: 5px 10px; border-radius: 4px; font-size: 12px; cursor: pointer;">
            <i class="fas fa-times"></i> ${game.i18n.localize("CLUEBOOK.Welcome.DontShowAgain")}
          </button>
        </div>
      `;

      ChatMessage.create({
        user: game.user.id,
        speaker: { alias: "ClueBook" },
        content,
        whisper: [game.user.id]
      });
    }

    let lastWorldMinute = null;
    const triggerTimeUpdate = () => {
      const currentWorldTime = game.time?.worldTime;
      if (currentWorldTime === undefined || currentWorldTime === null) return;

      const currentWorldMinute = Math.floor(currentWorldTime / 60);
      if (lastWorldMinute === currentWorldMinute) return;
      lastWorldMinute = currentWorldMinute;

      try {
        if (clueBookApp && clueBookApp.rendered) {
          clueBookApp.render({ parts: ["content"] });
        }
        if (trackerWidgetApp && trackerWidgetApp.rendered) {
          trackerWidgetApp.render();
        }
      } catch (e) {
        console.error("ClueBook | Time update render error:", e);
      }
    };

    TimeService.registerHook(triggerTimeUpdate);

    setInterval(() => {
      if ((clueBookApp && clueBookApp.rendered) || (trackerWidgetApp && trackerWidgetApp.rendered)) {
        triggerTimeUpdate();
      }
    }, 5000);

    // Inject floating widget on ready (default position safely clear of #players panel)
    injectWidget = () => {
      if (document.getElementById("cluebook-widget")) return;
      const settings = getActiveBoardSettings();
      if (settings.theme?.uiMode === "controls") return;

      const defaultTop = Math.max(120, Math.round(window.innerHeight * 0.25));
      const pos = game.user.getFlag("ClueBook", "widgetPos") || { left: 20, top: defaultTop };

      let left = pos.left !== undefined ? pos.left : 20;
      if (left > window.innerWidth - 60) left = window.innerWidth - 60;
      if (left < 0) left = 20;

      let styleStr = `left: ${left}px;`;

      if (pos.top !== undefined) {
        let top = pos.top;
        if (top > window.innerHeight - 60) top = window.innerHeight - 60;
        if (top < 0) top = 20;
        styleStr += ` top: ${top}px; bottom: auto;`;
      } else {
        let bottom = pos.bottom !== undefined ? pos.bottom : 80;
        if (bottom > window.innerHeight - 60) bottom = window.innerHeight - 60;
        if (bottom < 0) bottom = 80;
        styleStr += ` bottom: ${bottom}px; top: auto;`;
      }

      const widgetColor = settings.theme?.widgetColor || settings.theme?.accent || "#7b61ff";
      const widgetColor2 = settings.theme?.widgetColor2 || "#4527a0";

      const widget = document.createElement("div");
      widget.id = "cluebook-widget";
      widget.className = "cluebook-widget";
      widget.style.cssText = `${styleStr}; --cb-widget-color: ${widgetColor}; --cb-widget-color2: ${widgetColor2};`;

      const mainDiv = document.createElement("div");
      mainDiv.className = "cb-widget-main";
      mainDiv.title = game.i18n.localize("CLUEBOOK.Main.WidgetTitle");
      const mainIcon = document.createElement("i");
      mainIcon.className = "fas fa-book-open";
      mainDiv.appendChild(mainIcon);
      widget.appendChild(mainDiv);

      const buildMenu = (currentSettings, container) => {
        container.replaceChildren();
        const buttons = [
          { key: "notes", type: "notes", title: "CLUEBOOK.Main.AddNote", icon: "fas fa-sticky-note" },
          { key: "npc", type: "npc", title: "CLUEBOOK.Main.AddNPC", icon: "fas fa-user" },
          { key: "locations", type: "locations", title: "CLUEBOOK.Main.AddLocation", icon: "fas fa-map-marked-alt" },
          { key: "quests", type: "quests", title: "CLUEBOOK.Main.AddQuest", icon: "fas fa-scroll" },
          { key: "timeline", type: "timeline", title: "CLUEBOOK.Main.AddEvent", icon: "fas fa-clock" }
        ];

        for (const b of buttons) {
          const isTabHidden = currentSettings.hiddenTabs?.[b.key] === true;
          if (currentSettings.widget?.buttons?.[b.key] !== false && !isTabHidden) {
            const a = document.createElement("a");
            a.className = "cb-fab-btn";
            a.dataset.type = b.type;
            a.title = game.i18n.localize(b.title);
            const i = document.createElement("i");
            i.className = b.icon;
            a.appendChild(i);
            container.appendChild(a);
          }
        }

        if (currentSettings.widget?.buttons?.tracker !== false && currentSettings.features?.enableTracker !== false) {
          const a = document.createElement("a");
          a.className = "cb-fab-btn";
          a.dataset.type = "tracker";
          a.title = game.i18n.localize("CLUEBOOK.Tracker.Title");
          const i = document.createElement("i");
          i.className = "fas fa-tasks";
          a.appendChild(i);
          container.appendChild(a);
        }
      };

      const menu = document.createElement("div");
      menu.className = "cb-fab-menu";
      buildMenu(settings, menu);
      widget.appendChild(menu);
      widget._buildMenu = buildMenu;

      let hoverTimeout;

      widget.addEventListener("mouseenter", () => {
        if (widget.classList.contains("is-dragging")) return;
        clearTimeout(hoverTimeout);

        const currentSettings = getActiveBoardSettings();
        buildMenu(currentSettings, menu);

        if (!widget.classList.contains("cb-menu-active")) {
          widget.classList.add("cb-menu-active");
          const direction = currentSettings.widget?.direction || "up-right";
          menu.setAttribute("data-direction", direction);
        }
      });

      widget.addEventListener("mouseleave", () => {
        hoverTimeout = setTimeout(() => {
          widget.classList.remove("cb-menu-active");
        }, 1500);
      });

      widget.addEventListener("click", (ev) => {
        if (widget.classList.contains("is-dragging")) return;

        const btn = ev.target.closest(".cb-fab-btn");
        if (btn) {
          ev.stopPropagation();
          if (btn.dataset.type === "tracker") {
            game.modules.get("ClueBook").api.toggleTracker();
          } else {
            ClueBookApp.showQuickAddDialog(btn.dataset.type);
          }
          return;
        }

        if (!clueBookApp) clueBookApp = new ClueBookApp();

        if (clueBookApp.rendered) {
          clueBookApp.close();
        } else {
          clueBookApp.render({ force: true });
        }
      });

      document.body.appendChild(widget);

      let isDragging = false;
      let dragStartX = 0;
      let dragStartY = 0;
      let startLeft = 0;
      let startTop = 0;
      let hasMoved = false;

      widget.addEventListener("pointerdown", (ev) => {
        if (ev.target.closest(".cb-fab-btn")) return;
        if (ev.button !== 0) return;

        isDragging = true;
        hasMoved = false;
        dragStartX = ev.clientX;
        dragStartY = ev.clientY;
        const rect = widget.getBoundingClientRect();
        startLeft = rect.left;
        startTop = rect.top;
        widget.setPointerCapture(ev.pointerId);
      });

      widget.addEventListener("pointermove", (ev) => {
        if (!isDragging) return;
        const dx = ev.clientX - dragStartX;
        const dy = ev.clientY - dragStartY;
        if (Math.abs(dx) > 5 || Math.abs(dy) > 5) {
          hasMoved = true;
          widget.classList.add("is-dragging");
        }
        if (hasMoved) {
          widget.style.left = `${startLeft + dx}px`;
          widget.style.top = `${startTop + dy}px`;
          widget.style.bottom = "auto";
        }
      });

      widget.addEventListener("pointerup", (ev) => {
        if (!isDragging) return;
        isDragging = false;
        widget.releasePointerCapture(ev.pointerId);
        if (hasMoved) {
          setTimeout(() => widget.classList.remove("is-dragging"), 100);
          game.user.setFlag("ClueBook", "widgetPos", {
            left: parseInt(widget.style.left, 10),
            top: parseInt(widget.style.top, 10)
          });
        }
      });
    };

    injectWidget();
  } catch (err) {
    console.error("ClueBook | ready hook error:", err);
  }
});

Hooks.on("updateUser", (user, updateData) => {
  try {
    if (user.id !== game.user.id) return;

    const trackedEvents = foundry.utils.getProperty(updateData, "flags.ClueBook.trackedEvents");
    if (trackedEvents !== undefined) {
      if (trackerWidgetApp && trackerWidgetApp.rendered) {
        trackerWidgetApp.render({ force: true });
      }
      if (clueBookApp && clueBookApp.rendered && !clueBookApp.state.editingEntryId) {
        clueBookApp.render({ parts: ["content"] });
      }
    }

    const settings = foundry.utils.getProperty(updateData, "flags.ClueBook.settings");
    if (!settings) return;

    const themeSettings = settings.theme;
    const widgetSettings = settings.widget;
    const featureSettings = settings.features;

    if (themeSettings?.uiMode !== undefined || widgetSettings?.buttons !== undefined || featureSettings?.enableTracker !== undefined) {
      const currentSettings = game.user.getFlag("ClueBook", "settings") || {};

      if (ui.controls && (themeSettings?.uiMode !== undefined || (currentSettings.theme?.uiMode === "controls" && widgetSettings?.buttons !== undefined))) {
        const SettingsConfigClass = foundry.applications?.settings?.SettingsConfig ?? SettingsConfig;
        SettingsConfigClass.reloadConfirm({ world: false });
      }

      if (themeSettings?.uiMode !== undefined) {
        if (themeSettings.uiMode === "controls") {
          const widget = document.getElementById("cluebook-widget");
          if (widget) widget.remove();
        } else if (injectWidget) {
          injectWidget();
        }
      }
    }

    if ((widgetSettings && widgetSettings.buttons) || (featureSettings && featureSettings.enableTracker !== undefined)) {
      const widget = document.getElementById("cluebook-widget");
      if (widget && widget._buildMenu) {
        const menu = widget.querySelector(".cb-fab-menu");
        if (menu) {
          widget._buildMenu(getActiveBoardSettings(), menu);
        }
      }
    }

    if (featureSettings?.enableTracker === false) {
      if (trackerWidgetApp) {
        trackerWidgetApp.close({ animate: false });
        trackerWidgetApp = null;
      }
    }
  } catch (err) {
    console.error("ClueBook | updateUser hook error:", err);
  }
});

// Live Sync
Hooks.on("updateJournalEntry", (journal, data, options, userId) => {
  try {
    if (clueBookApp && clueBookApp.rendered && journal.id === clueBookApp.state.activeWorkspace) {
      if ((userId !== game.user.id || options?.cluebookProxy) && !clueBookApp.state.editingEntryId) {
        const activeEl = document.activeElement;
        if (!(activeEl && clueBookApp.element?.contains(activeEl) && ["INPUT", "TEXTAREA", "SELECT"].includes(activeEl.tagName))) {
          if (clueBookApp.state.isBoardInteracting) {
            clueBookApp.state.pendingRender = true;
          } else {
            clueBookApp.render({ parts: ["tabs", "content"] });
          }
        }
      }
    }

    if (trackerWidgetApp && trackerWidgetApp.rendered) {
      trackerWidgetApp.render({ force: true });
    }

    const widget = document.getElementById("cluebook-widget");
    if (widget && widget._buildMenu) {
      const currentSettings = getActiveBoardSettings();
      const menu = widget.querySelector(".cb-fab-menu");
      if (menu) widget._buildMenu(currentSettings, menu);
    }
  } catch (err) {
    console.error("ClueBook | updateJournalEntry hook error:", err);
  }
});
