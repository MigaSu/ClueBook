import { ClueBookApp } from "./app.js";
import { CalendarWidget } from "./calendar.js";
import { ClueBookSocket } from "./socket.js";
import { ClueBookOverlay } from "./overlay.js";

// Global reference to the app instance
let clueBookApp = null;
let calendarWidgetApp = null;

Hooks.once("init", async () => {
  console.log("ClueBook V14 | Initializing...");

  await loadTemplates([
    "modules/ClueBook/templates/partials/tab-settings.hbs",
    "modules/ClueBook/templates/partials/tab-workspaces.hbs",
    "modules/ClueBook/templates/partials/tab-board.hbs",
    "modules/ClueBook/templates/partials/entry-card.hbs"
  ]);

  game.settings.register("ClueBook", "calendarData", {
    scope: "world",
    config: false,
    type: Object,
    default: {},
    onChange: () => {
      if (calendarWidgetApp && calendarWidgetApp.rendered) {
        calendarWidgetApp.render({ force: true });
      }
    }
  });

  game.settings.register("ClueBook", "enableTimeWidget", {
    name: "CLUEBOOK.Settings.EnableTimeWidget",
    hint: "CLUEBOOK.Settings.EnableTimeWidgetHint",
    scope: "world",
    config: false,
    type: Boolean,
    default: true,
    onChange: (value) => {
      const settings = game.user.getFlag("ClueBook", "settings") || {};
      if (value && settings.theme?.showCalendarWidget !== false) {
        if (!calendarWidgetApp) {
          calendarWidgetApp = new CalendarWidget();
          calendarWidgetApp.render({ force: true });
        }
      } else {
        if (calendarWidgetApp) {
          calendarWidgetApp.close();
          calendarWidgetApp = null;
        }
      }
      if (clueBookApp && clueBookApp.rendered) {
        clueBookApp.render({ parts: ["content"] });
      }
    }
  });

  // Re-render widget whenever world time changes (Simple Calendar fires this too)
  Hooks.on("updateWorldTime", () => {
    if (calendarWidgetApp && calendarWidgetApp.rendered) {
      calendarWidgetApp.render({ force: true });
    }
    if (clueBookApp && clueBookApp.rendered && !clueBookApp.state.editingEntryId) {
      clueBookApp.render({ parts: ["content"] });
    }
  });
});

Hooks.once("ready", async () => {
  console.log("ClueBook | Ready hook fired! Registering socket.");
  ClueBookSocket.init();
  ClueBookOverlay.init();

  const settings = game.user.getFlag("ClueBook", "settings") || {};
  
  const globalEnableTimeWidget = game.settings.get("ClueBook", "enableTimeWidget");
  if (globalEnableTimeWidget && settings.theme?.showCalendarWidget !== false) {
    calendarWidgetApp = new CalendarWidget();
    calendarWidgetApp.render({ force: true });
  }

  // Register Simple Calendar's dedicated hook for date/time changes
  if (window.SimpleCalendar?.Hooks?.DateTimeChange) {
    Hooks.on(window.SimpleCalendar.Hooks.DateTimeChange, () => {
      if (calendarWidgetApp && calendarWidgetApp.rendered) {
        calendarWidgetApp.render({ force: true });
      }
      if (clueBookApp && clueBookApp.rendered && !clueBookApp.state.editingEntryId) {
        clueBookApp.render({ parts: ["content"] });
      }
    });
  }

  // Inject floating widget on ready
  const injectWidget = () => {
    if (document.getElementById("cluebook-widget")) return;

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

    const settings = game.user.getFlag("ClueBook", "settings") || {};
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
        <a class="cb-fab-btn" data-type="notes" title="${game.i18n.localize("CLUEBOOK.Main.AddNote")}"><i class="fas fa-sticky-note"></i></a>
        <a class="cb-fab-btn" data-type="npc" title="${game.i18n.localize("CLUEBOOK.Main.AddNPC")}"><i class="fas fa-user"></i></a>
        <a class="cb-fab-btn" data-type="locations" title="${game.i18n.localize("CLUEBOOK.Main.AddLocation")}"><i class="fas fa-map-marked-alt"></i></a>
        <a class="cb-fab-btn" data-type="quests" title="${game.i18n.localize("CLUEBOOK.Main.AddQuest")}"><i class="fas fa-scroll"></i></a>
        <a class="cb-fab-btn" data-type="timeline" title="${game.i18n.localize("CLUEBOOK.Main.AddEvent")}"><i class="fas fa-clock"></i></a>
      </div>
    `;

    const menu = widget.querySelector('.cb-fab-menu');
    let hoverTimeout;

    widget.addEventListener("mouseenter", () => {
      if (widget.classList.contains("is-dragging")) return;
      clearTimeout(hoverTimeout);
      
      const currentSettings = game.user.getFlag("ClueBook", "settings") || {};
      if (currentSettings.theme?.showQuickWidget === false) return;

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
        ClueBookApp.showQuickAddDialog(btn.dataset.type);
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
  
  const settings = foundry.utils.getProperty(updateData, "flags.ClueBook.settings.theme");
  if (!settings) return;

  if (settings.showQuickWidget !== undefined) {
    if (!settings.showQuickWidget) {
      // Just hide the bubbles (menu) if it's currently open, do not hide the widget
      const widget = document.getElementById("cluebook-widget");
      if (widget) widget.classList.remove("cb-menu-active");
    }
  }

  if (settings.showCalendarWidget !== undefined) {
    const globalEnableTimeWidget = game.settings.get("ClueBook", "enableTimeWidget");
    if (settings.showCalendarWidget && globalEnableTimeWidget) {
      if (!calendarWidgetApp) {
        calendarWidgetApp = new CalendarWidget();
        calendarWidgetApp.render({ force: true });
      }
    } else {
      if (calendarWidgetApp) {
        calendarWidgetApp.close();
        calendarWidgetApp = null;
      }
    }
  }
});

// Live Sync
Hooks.on("updateJournalEntry", (journal, data, options, userId) => {
  if (!clueBookApp?.rendered) return;
  if (journal.id === clueBookApp.state.activeWorkspace) {
    if (userId === game.user.id || clueBookApp.state.editingEntryId) return;

    // Do not re-render if user is actively typing in an input field to prevent losing focus/input
    const activeEl = document.activeElement;
    if (activeEl && clueBookApp.element?.contains(activeEl) && ["INPUT", "TEXTAREA", "SELECT"].includes(activeEl.tagName)) {
      return;
    }

    clueBookApp.render();
  }
});

