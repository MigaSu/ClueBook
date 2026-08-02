import { ClueBookApp } from "./app.js";
import { ClueBookSocket } from "./socket.js";
import { ClueBookOverlay } from "./overlay.js";
import { TrackerWidget } from "./tracker.js";
import { TimeService } from "./services/time-service.js";

// Global reference to the app instances
let clueBookApp = null;
let trackerWidgetApp = null;
let injectWidget = null;

Hooks.once("init", async () => {
  console.log("ClueBook V14 | Initializing...");

  Hooks.on("getSceneControlButtons", (...args) => {
    const settings = game.user?.getFlag("ClueBook", "settings") || {};
    let controlsDict = args[0];

    if (settings.theme?.uiMode !== "controls") {
      // Foundry V14 crash prevention:
      // If the user previously had 'cluebook' as their active control, but then changed uiMode to 'widget',
      // Foundry V14 will crash on load because it tries to read tools from the missing control.
      // We provide a dummy control to prevent the crash and asynchronously switch back to 'tokens'.
      if (ui.controls && (ui.controls.control === "cluebook" || ui.controls.activeControl === "cluebook")) {
        controlsDict["cluebook"] = {
          name: "cluebook",
          title: "ClueBook",
          layer: "cluebook",
          order: 100,
          icon: "fas fa-book-open",
          visible: true,
          activeTool: "dummy",
          tools: {
            dummy: {
              name: "dummy",
              title: "ClueBook",
              icon: "fas fa-book"
            }
          }
        };
        setTimeout(() => {
          if (ui.controls) ui.controls.control = "tokens";
        }, 100);
      }
      return;
    }

    // Foundry V14 changed the hook signature to pass a dictionary of controls: { tokens: {...}, notes: {...} }
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
        ...(settings.widget?.buttons?.notes !== false ? {
          addNote: {
            name: "addNote",
            title: game.i18n.localize("CLUEBOOK.Main.AddNote"),
            icon: "fas fa-sticky-note",
            onClick: () => ClueBookApp.showQuickAddDialog("notes"),
            button: true
          }
        } : {}),
        ...(settings.widget?.buttons?.npc !== false ? {
          addNpc: {
            name: "addNpc",
            title: game.i18n.localize("CLUEBOOK.Main.AddNPC"),
            icon: "fas fa-user",
            onClick: () => ClueBookApp.showQuickAddDialog("npc"),
            button: true
          }
        } : {}),
        ...(settings.widget?.buttons?.locations !== false ? {
          addLocation: {
            name: "addLocation",
            title: game.i18n.localize("CLUEBOOK.Main.AddLocation"),
            icon: "fas fa-map-marked-alt",
            onClick: () => ClueBookApp.showQuickAddDialog("locations"),
            button: true
          }
        } : {}),
        ...(settings.widget?.buttons?.quests !== false ? {
          addQuest: {
            name: "addQuest",
            title: game.i18n.localize("CLUEBOOK.Main.AddQuest"),
            icon: "fas fa-scroll",
            onClick: () => ClueBookApp.showQuickAddDialog("quests"),
            button: true
          }
        } : {}),
        ...(settings.widget?.buttons?.timeline !== false ? {
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

    // Add our group to the dictionary
    controlsDict["cluebook"] = controlGroup;
  });

  game.modules.get("ClueBook").api = {
    openApp: async (options) => {
      if (!clueBookApp) {
        clueBookApp = new ClueBookApp();
      }
      if (!options.tab && options.focusId) {
         const wsId = options.workspace || clueBookApp.state.activeWorkspace;
         let data = {};
         if (wsId === "personal" || wsId.startsWith("personal_")) {
            if (wsId === "personal") {
               data = game.user.getFlag("ClueBook", "data") || {};
            } else {
               const userId = wsId.split("_")[1];
               const user = game.users.get(userId);
               if (user) data = user.getFlag("ClueBook", "data") || {};
            }
         } else {
            const j = game.journal.get(wsId);
            if (j) data = j.getFlag("ClueBook", "data") || {};
         }
         for (const [t, tabData] of Object.entries(data)) {
           if (t === 'links' || t === 'board' || t === 'search') continue;
           if (tabData && tabData[options.focusId]) { options.tab = t; break; }
         }
         if (!options.tab) {
            ui.notifications.warn(game.i18n.localize("CLUEBOOK.App.EntryNotFound"));
            return;
         }
      }

      if (options.workspace) clueBookApp.state.activeWorkspace = options.workspace;
      if (options.tab) clueBookApp.state.activeTab = options.tab;
      
      // Delay to ensure it renders before focusing
      clueBookApp.render(true).then(() => {
        if (options.focusId) {
          setTimeout(() => {
            const el = clueBookApp.element.querySelector(`[data-entry-id="${options.focusId}"]`);
            if (el) {
              el.scrollIntoView({ behavior: 'smooth', block: 'center' });
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
    }
  };

  await loadTemplates([
    "modules/ClueBook/templates/partials/tab-settings.hbs",
    "modules/ClueBook/templates/partials/tab-workspaces.hbs",
    "modules/ClueBook/templates/partials/tab-board.hbs",
    "modules/ClueBook/templates/partials/entry-card.hbs"
  ]);

  // Settings for enableTimeWidget are removed since the widget is deleted
  // Hooks for updateWorldTime keep updating cluebook and tracker
  Hooks.on("updateWorldTime", () => {
    if (clueBookApp && clueBookApp.rendered && !clueBookApp.state.editingEntryId) {
      clueBookApp.render({ parts: ["content"] });
    }
    if (trackerWidgetApp && trackerWidgetApp.rendered) {
      trackerWidgetApp.render({ force: true });
    }
  });
});

Hooks.once("ready", async () => {
  console.log("ClueBook | Ready hook fired! Registering socket.");
  ClueBookSocket.init();
  ClueBookOverlay.init();

  const settings = game.user.getFlag("ClueBook", "settings") || {};
  
  TimeService.registerHook(() => {
    if (clueBookApp && clueBookApp.rendered && !clueBookApp.state.editingEntryId) {
      clueBookApp.render({ parts: ["content"] });
    }
    if (trackerWidgetApp && trackerWidgetApp.rendered) {
      trackerWidgetApp.render({ force: true });
    }
  });

  // Inject floating widget on ready
  injectWidget = () => {
    if (document.getElementById("cluebook-widget")) return;
    const settings = game.user.getFlag("ClueBook", "settings") || {};
    if (settings.theme?.uiMode === "controls") return;

    const pos = game.user.getFlag("ClueBook", "widgetPos") || { left: 20, bottom: 80 };
    
    // РћРіСЂР°РЅРёС‡РёРІР°РµРј РєРѕРѕСЂРґРёРЅР°С‚С‹ СЂР°Р·РјРµСЂР°РјРё С‚РµРєСѓС‰РµРіРѕ РѕРєРЅР° (С‡С‚РѕР±С‹ РІРёРґР¶РµС‚ РЅРµ СѓР»РµС‚РµР» Р·Р° СЌРєСЂР°РЅ)
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
    widget.style.cssText = styleStr + `; --cb-widget-color: ${widgetColor}; --cb-widget-color2: ${widgetColor2};`;
    
    // Р—Р°СЂР°РЅРµРµ РіРµРЅРµСЂРёСЂСѓРµРј HTML РґР»СЏ РјРµРЅСЋ (ADD-05: Р±РµР· РїРµСЂРµСЂРёСЃРѕРІРєРё РЅР° РєР°Р¶РґС‹Р№ hover)
    widget.innerHTML = `
      <div class="cb-widget-main" title="${game.i18n.localize("CLUEBOOK.Main.WidgetTitle")}">
        <i class="fas fa-book-open"></i>
      </div>
      <div class="cb-fab-menu">
        ${settings.widget?.buttons?.notes !== false ? `<a class="cb-fab-btn" data-type="notes" title="${game.i18n.localize("CLUEBOOK.Main.AddNote")}"><i class="fas fa-sticky-note"></i></a>` : ''}
        ${settings.widget?.buttons?.npc !== false ? `<a class="cb-fab-btn" data-type="npc" title="${game.i18n.localize("CLUEBOOK.Main.AddNPC")}"><i class="fas fa-user"></i></a>` : ''}
        ${settings.widget?.buttons?.locations !== false ? `<a class="cb-fab-btn" data-type="locations" title="${game.i18n.localize("CLUEBOOK.Main.AddLocation")}"><i class="fas fa-map-marked-alt"></i></a>` : ''}
        ${settings.widget?.buttons?.quests !== false ? `<a class="cb-fab-btn" data-type="quests" title="${game.i18n.localize("CLUEBOOK.Main.AddQuest")}"><i class="fas fa-scroll"></i></a>` : ''}
        ${settings.widget?.buttons?.timeline !== false ? `<a class="cb-fab-btn" data-type="timeline" title="${game.i18n.localize("CLUEBOOK.Main.AddEvent")}"><i class="fas fa-clock"></i></a>` : ''}
        ${(settings.widget?.buttons?.tracker !== false && settings.features?.enableTracker !== false) ? `<a class="cb-fab-btn" data-type="tracker" title="${game.i18n.localize("CLUEBOOK.Tracker.Title")}"><i class="fas fa-tasks"></i></a>` : ''}
      </div>
    `;

    const menu = widget.querySelector('.cb-fab-menu');
    let hoverTimeout;

    widget.addEventListener("mouseenter", () => {
      if (widget.classList.contains("is-dragging")) return;
      clearTimeout(hoverTimeout);
      
      const currentSettings = game.user.getFlag("ClueBook", "settings") || {};

      if (!widget.classList.contains("cb-menu-active")) {
        widget.classList.add("cb-menu-active");
        const direction = currentSettings.widget?.direction || "up-right";
        menu.setAttribute('data-direction', direction);
      }
    });

    widget.addEventListener("mouseleave", () => {
      hoverTimeout = setTimeout(() => {
        widget.classList.remove("cb-menu-active");
      }, 1500);
    });

    widget.addEventListener("click", (ev) => {
      if (widget.classList.contains("is-dragging")) return;
      
      const btn = ev.target.closest('.cb-fab-btn');
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

    // Make widget draggable manually
    let isDragging = false;
    let dragStartX = 0;
    let dragStartY = 0;
    let startLeft = 0;
    let startTop = 0;
    let hasMoved = false;

    widget.addEventListener('pointerdown', (ev) => {
      if (ev.target.closest('.cb-fab-btn')) return;
      if (ev.button !== 0) return; // only left click
      
      isDragging = true;
      hasMoved = false;
      dragStartX = ev.clientX;
      dragStartY = ev.clientY;
      const rect = widget.getBoundingClientRect();
      startLeft = rect.left;
      startTop = rect.top;
      widget.setPointerCapture(ev.pointerId);
    });

    widget.addEventListener('pointermove', (ev) => {
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
        widget.style.bottom = 'auto';
      }
    });

    widget.addEventListener('pointerup', (ev) => {
      if (!isDragging) return;
      isDragging = false;
      widget.releasePointerCapture(ev.pointerId);
      if (hasMoved) {
        setTimeout(() => widget.classList.remove("is-dragging"), 100);
        game.user.setFlag("ClueBook", "widgetPos", {
          left: parseInt(widget.style.left),
          top: parseInt(widget.style.top)
        });
      }
    });
  };

  injectWidget();
});

Hooks.on("updateUser", (user, updateData) => {
  if (user.id !== game.user.id) return;
  
  // React to tracked events changes
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

  // If UI mode or button settings changed, update Scene Controls and Widget
  if (themeSettings?.uiMode !== undefined || widgetSettings?.buttons !== undefined || featureSettings?.enableTracker !== undefined) {
    const currentSettings = game.user.getFlag("ClueBook", "settings") || {};
    
    if (ui.controls && (themeSettings?.uiMode !== undefined || (currentSettings.theme?.uiMode === "controls" && widgetSettings?.buttons !== undefined))) {
       // Rebuilding Foundry V14 Scene Controls manually causes crashes in older modules like SWADE or game-prep-toolkit.
       // The safest way to apply changes is to ask the user to reload the UI.
       SettingsConfig.reloadConfirm({world: false});
    }
    
    if (themeSettings?.uiMode !== undefined) {
      if (themeSettings.uiMode === "controls") {
        const widget = document.getElementById("cluebook-widget");
        if (widget) widget.remove();
      } else {
        injectWidget();
      }
    }
  }



  // Update FAB menu HTML dynamically when buttons or tracker setting changes
  if ((widgetSettings && widgetSettings.buttons) || (featureSettings && featureSettings.enableTracker !== undefined)) {
    const widget = document.getElementById("cluebook-widget");
    if (widget) {
      const menu = widget.querySelector(".cb-fab-menu");
      if (menu) {
        const currentSettings = game.user.getFlag("ClueBook", "settings") || {};
        menu.innerHTML = `
          ${currentSettings.widget?.buttons?.notes !== false ? `<a class="cb-fab-btn" data-type="notes" title="${game.i18n.localize("CLUEBOOK.Main.AddNote")}"><i class="fas fa-sticky-note"></i></a>` : ''}
          ${currentSettings.widget?.buttons?.npc !== false ? `<a class="cb-fab-btn" data-type="npc" title="${game.i18n.localize("CLUEBOOK.Main.AddNPC")}"><i class="fas fa-user"></i></a>` : ''}
          ${currentSettings.widget?.buttons?.locations !== false ? `<a class="cb-fab-btn" data-type="locations" title="${game.i18n.localize("CLUEBOOK.Main.AddLocation")}"><i class="fas fa-map-marked-alt"></i></a>` : ''}
          ${currentSettings.widget?.buttons?.quests !== false ? `<a class="cb-fab-btn" data-type="quests" title="${game.i18n.localize("CLUEBOOK.Main.AddQuest")}"><i class="fas fa-scroll"></i></a>` : ''}
          ${currentSettings.widget?.buttons?.timeline !== false ? `<a class="cb-fab-btn" data-type="timeline" title="${game.i18n.localize("CLUEBOOK.Main.AddEvent")}"><i class="fas fa-clock"></i></a>` : ''}
          ${(currentSettings.widget?.buttons?.tracker !== false && currentSettings.features?.enableTracker !== false) ? `<a class="cb-fab-btn" data-type="tracker" title="${game.i18n.localize("CLUEBOOK.Tracker.Title")}"><i class="fas fa-tasks"></i></a>` : ''}
        `;
      }
    }
  }

  if (featureSettings?.enableTracker === false) {
    if (trackerWidgetApp) {
      trackerWidgetApp.close({ animate: false });
      trackerWidgetApp = null;
    }
  }


});

// Live Sync
Hooks.on("updateJournalEntry", (journal, data, options, userId) => {
  // If the active workspace journal is updated, re-render the app
  if (clueBookApp && clueBookApp.rendered && journal.id === clueBookApp.state.activeWorkspace) {
    if (userId !== game.user.id && !clueBookApp.state.editingEntryId) {
      const activeEl = document.activeElement;
      if (!(activeEl && clueBookApp.element?.contains(activeEl) && ["INPUT", "TEXTAREA", "SELECT"].includes(activeEl.tagName))) {
        clueBookApp.render();
      }
    }
  }
  
  // Re-render tracker in case quest details (status, deadline) changed
  if (trackerWidgetApp && trackerWidgetApp.rendered) {
    trackerWidgetApp.render({ force: true });
  }
});

