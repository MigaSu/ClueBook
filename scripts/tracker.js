import { TrackerService } from "./services/tracker-service.js";
import { TimeService } from "./services/time-service.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class TrackerWidget extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "cb-tracker-widget",
    classes: ["cb-tracker-widget"],
    tag: "div",
    window: {
      frame: false,
      positioned: true
    },
    position: {
      width: 320,
      height: "auto"
    },
    actions: {
      openApp: TrackerWidget.#onOpenApp,
      closeWidget: TrackerWidget.#onCloseWidget,
      jumpToEntry: TrackerWidget.#onJumpToEntry,
      untrackEntry: TrackerWidget.#onUntrackEntry,
      expandText: TrackerWidget.#onExpandText,
      jumpToMention: TrackerWidget.#onJumpToMention
    }
  };

  static PARTS = {
    widget: {
      template: "modules/ClueBook/templates/tracker-widget.hbs"
    }
  };

  async _prepareContext(options) {
    const context = {
      events: [],
      hasEvents: false
    };

    const trackedIds = game.user.getFlag("ClueBook", "trackedEvents") || [];
    if (!trackedIds.length) return context;

    const userSettings = game.user.getFlag("ClueBook", "settings") || {};
    const showOverdue = userSettings.features?.showOverdueInTracker !== false;

    const events = await TrackerService.getTrackedEvents(trackedIds, showOverdue);

    context.events = events;
    context.hasEvents = events.length > 0;
    context.isSimpleCalendarActive = TimeService.isActive();
    
    const pos = game.user.getFlag("ClueBook", "trackerWidgetPos") || { left: Math.round(window.innerWidth / 2 + 100), top: 200 };
    this.position.left = pos.left;
    this.position.top = pos.top;

    return context;
  }

  _onRender(context, options) {
    super._onRender(context, options);
    const widget = this.element;
    if (!widget) return;

    const pos = game.user.getFlag("ClueBook", "trackerWidgetPos") || { left: Math.round(window.innerWidth / 2 + 100), top: 200 };
    widget.style.left = `${pos.left}px`;
    widget.style.top = `${pos.top}px`;

    // Dragging
    let isDragging = false, hasMoved = false;
    let dragStartX = 0, dragStartY = 0, startLeft = 0, startTop = 0;

    const header = widget.querySelector(".cb-tracker-header");
    if (header) {
      header.addEventListener("pointerdown", (ev) => {
        if (ev.button !== 0 || ev.target.closest("[data-action]")) return;
        isDragging = true;
        hasMoved = false;
        dragStartX = ev.clientX;
        dragStartY = ev.clientY;
        const rect = widget.getBoundingClientRect();
        startLeft = rect.left;
        startTop = rect.top;
        header.setPointerCapture(ev.pointerId);
      });

      header.addEventListener("pointermove", (ev) => {
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
        }
      });

      header.addEventListener("pointerup", (ev) => {
        if (!isDragging) return;
        isDragging = false;
        header.releasePointerCapture(ev.pointerId);
        if (hasMoved) {
          setTimeout(() => widget.classList.remove("is-dragging"), 100);
          const newLeft = parseInt(widget.style.left);
          const newTop = parseInt(widget.style.top);
          this.position.left = newLeft;
          this.position.top = newTop;
          game.user.setFlag("ClueBook", "trackerWidgetPos", { left: newLeft, top: newTop });
        }
      });
    }

    // HTML5 Drag and Drop for Manual Sorting
    const scApi = window.SimpleCalendar?.api;
    if (!scApi) {
      const list = widget.querySelector(".cb-tracker-list");
      if (list) {
        let draggedItem = null;

        list.addEventListener("dragstart", (ev) => {
          draggedItem = ev.target.closest(".cb-tracker-item");
          if (!draggedItem) return;
          draggedItem.classList.add("is-dragging-item");
          ev.dataTransfer.effectAllowed = "move";
          // Firefox requires data to be set
          ev.dataTransfer.setData("text/plain", draggedItem.dataset.id); 
        });

        list.addEventListener("dragover", (ev) => {
          ev.preventDefault();
          ev.dataTransfer.dropEffect = "move";
          const targetItem = ev.target.closest(".cb-tracker-item");
          if (targetItem && targetItem !== draggedItem) {
            const rect = targetItem.getBoundingClientRect();
            const next = (ev.clientY - rect.top) / (rect.bottom - rect.top) > 0.5;
            list.insertBefore(draggedItem, next ? targetItem.nextSibling : targetItem);
          }
        });

        list.addEventListener("dragend", (ev) => {
          if (draggedItem) {
            draggedItem.classList.remove("is-dragging-item");
            draggedItem = null;
          }
        });

        list.addEventListener("drop", async (ev) => {
          ev.preventDefault();
          if (!draggedItem) return;

          const items = Array.from(list.querySelectorAll(".cb-tracker-item"));
          const domIds = items.map(el => el.dataset.id);
          
          let trackedIds = Array.from(game.user.getFlag("ClueBook", "trackedEvents") || []);
          const nonDomIds = trackedIds.filter(id => !domIds.includes(id));
          
          const newOrder = [...domIds, ...nonDomIds];
          await game.user.setFlag("ClueBook", "trackedEvents", newOrder);
        });
      }
    }
  }

  static async #onCloseWidget(event, target) {
    event.preventDefault();
    game.modules.get("ClueBook")?.api?.closeTracker();
  }

  static async #onOpenApp(event, target) {
    event.preventDefault();
    game.modules.get("ClueBook")?.api?.openApp({});
  }

  static async #onJumpToEntry(event, target) {
    event.preventDefault();
    const li = target.closest(".cb-tracker-item");
    if (!li) return;
    const entryId = li.dataset.id;
    const workspaceId = li.dataset.workspace;
    const tab = li.dataset.tab;
    if (!entryId || !workspaceId) return;

    if (!globalThis.clueBookApp) {
      // Need to import ClueBookApp if it wasn't done, but normally it's available.
      // But we can trigger the global API if we expose it, or just use hooks.
      // Safe way is to use game.modules.get("ClueBook").api
    }
    
    const api = game.modules.get("ClueBook")?.api;
    if (api) {
      await api.openApp({ workspace: workspaceId, tab: tab, focusId: entryId });
    }
  }

  static async #onUntrackEntry(event, target) {
    event.preventDefault();
    event.stopPropagation();
    const entryId = target.closest("[data-id]")?.dataset.id;
    if (!entryId) return;

    let tracked = Array.from(game.user.getFlag("ClueBook", "trackedEvents") || []);
    tracked = tracked.filter(id => id !== entryId);
    
    // Setting the flag automatically triggers updateUser hook in main.js, which re-renders apps
    await game.user.setFlag("ClueBook", "trackedEvents", tracked);
  }

  static async #onExpandText(event, target) {
    if (event.target.closest('a')) return;
    event.stopPropagation();
    target.classList.toggle("is-expanded");
  }  

  static async #onJumpToMention(event, target) {
    event.preventDefault();
    event.stopPropagation();
    const entryId = target.dataset.mentionId;
    const workspaceId = target.dataset.workspace;
    if (!entryId || !workspaceId) return;

    const api = game.modules.get("ClueBook")?.api;
    if (api) {
       await api.openApp({ workspace: workspaceId, focusId: entryId });
    }
  }
}
