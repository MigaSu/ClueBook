import { TrackerService } from "./services/tracker-service.js";
import { TimeService } from "./services/time-service.js";
import { TextEnrichmentService } from "./services/text-enrichment-service.js";

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
      expandText: TrackerWidget.#onExpandText
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
    
    const savedPos = game.user.getFlag("ClueBook", "trackerWidgetPos") || { left: Math.round(window.innerWidth / 2 + 100), top: 200 };
    const maxLeft = Math.max(0, window.innerWidth - 340);
    const maxTop = Math.max(0, window.innerHeight - 100);
    const pos = {
      left: Math.max(10, Math.min(savedPos.left ?? 10, maxLeft)),
      top: Math.max(10, Math.min(savedPos.top ?? 10, maxTop))
    };
    this.position.left = pos.left;
    this.position.top = pos.top;

    return context;
  }

  _onRender(context, options) {
    super._onRender(context, options);
    const widget = this.element;
    if (!widget) return;

    const savedPos = game.user.getFlag("ClueBook", "trackerWidgetPos") || { left: Math.round(window.innerWidth / 2 + 100), top: 200 };
    const maxLeft = Math.max(0, window.innerWidth - (widget.offsetWidth || 320) - 10);
    const maxTop = Math.max(0, window.innerHeight - (widget.offsetHeight || 60) - 10);
    const pos = {
      left: Math.max(10, Math.min(savedPos.left ?? 10, maxLeft)),
      top: Math.max(10, Math.min(savedPos.top ?? 10, maxTop))
    };
    widget.style.left = `${pos.left}px`;
    widget.style.top = `${pos.top}px`;

    // Bind mention link clicks
    TextEnrichmentService.bindMentionClicks(widget, (mentionId, ev) => {
      const linkEl = ev?.nodeType ? ev : (ev?.currentTarget ?? ev?.target);
      const ws = linkEl?.closest(".cb-tracker-item")?.dataset?.workspace;
      if (ws) {
        game.modules.get("ClueBook")?.api?.openApp({ workspace: ws, focusId: mentionId });
      }
    });

    // Dragging the widget
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
          const mLeft = Math.max(0, window.innerWidth - (widget.offsetWidth || 320) - 10);
          const mTop = Math.max(0, window.innerHeight - (widget.offsetHeight || 60) - 10);
          const curLeft = Math.max(10, Math.min(startLeft + dx, mLeft));
          const curTop = Math.max(10, Math.min(startTop + dy, mTop));
          widget.style.left = `${curLeft}px`;
          widget.style.top = `${curTop}px`;
        }
      });

      header.addEventListener("pointerup", (ev) => {
        if (!isDragging) return;
        isDragging = false;
        header.releasePointerCapture(ev.pointerId);
        if (hasMoved) {
          setTimeout(() => widget.classList.remove("is-dragging"), 100);
          const mLeft = Math.max(0, window.innerWidth - (widget.offsetWidth || 320) - 10);
          const mTop = Math.max(0, window.innerHeight - (widget.offsetHeight || 60) - 10);
          const newLeft = Math.max(10, Math.min(parseInt(widget.style.left) || 0, mLeft));
          const newTop = Math.max(10, Math.min(parseInt(widget.style.top) || 0, mTop));
          widget.style.left = `${newLeft}px`;
          widget.style.top = `${newTop}px`;
          this.position.left = newLeft;
          this.position.top = newTop;
          game.user.setFlag("ClueBook", "trackerWidgetPos", { left: newLeft, top: newTop });
        }
      });
    }

    // HTML5 Drag and Drop for Manual Sorting (untimed items)
    const list = widget.querySelector(".cb-tracker-list");
    if (list) {
      let draggedItem = null;

      list.addEventListener("dragstart", (ev) => {
        const item = ev.target.closest('.cb-tracker-item[draggable="true"]');
        if (!item) {
          ev.preventDefault();
          return;
        }
        draggedItem = item;
        draggedItem.classList.add("is-dragging-item");
        ev.dataTransfer.effectAllowed = "move";
        // Firefox requires data to be set
        ev.dataTransfer.setData("text/plain", draggedItem.dataset.id);
      });

      list.addEventListener("dragover", (ev) => {
        ev.preventDefault();
        ev.dataTransfer.dropEffect = "move";
        if (!draggedItem) return;

        const targetItem = ev.target.closest('.cb-tracker-item[draggable="true"]');
        if (targetItem && targetItem !== draggedItem) {
          const rect = targetItem.getBoundingClientRect();
          const next = (ev.clientY - rect.top) / (rect.bottom - rect.top) > 0.5;
          list.insertBefore(draggedItem, next ? targetItem.nextSibling : targetItem);
        }
      });

      list.addEventListener("dragend", () => {
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
}
