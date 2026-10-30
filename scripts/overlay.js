import { WorkspaceRepository } from "./services/workspace-repository.js";
import { WorkspaceAccessService } from "./services/workspace-access-service.js";

export class ClueBookOverlay {
  static init() {
    game.socket.on("module.ClueBook", (message) => {
      try {
        if (message?.action === "showOverlay" && message.content) {
          this.show(message.content, message.entry, message.sourceTab);
        }
      } catch (err) {
        console.error("ClueBook | Overlay socket error:", err);
      }
    });
  }

  static show(contentHTML, entry = null, sourceTab = null) {
    const existing = document.getElementById("cb-share-overlay");
    if (existing) existing.remove();

    const backdrop = document.createElement("div");
    backdrop.id = "cb-share-overlay";
    backdrop.className = "cb-overlay-backdrop";

    const container = document.createElement("div");
    container.className = "cb-overlay-container";

    const card = document.createElement("div");
    card.className = "cb-overlay-card app window-app cb-epic-overlay";
    const parsedContent = new DOMParser().parseFromString(String(contentHTML || ""), "text/html");
    parsedContent.querySelectorAll("script, iframe, object, embed").forEach(el => el.remove());
    card.append(...parsedContent.body.childNodes);

    const closeBtn = document.createElement("div");
    closeBtn.className = "cb-overlay-close";
    const closeIcon = document.createElement("i");
    closeIcon.className = "fas fa-times";
    closeBtn.appendChild(closeIcon);
    closeBtn.onclick = (e) => {
      e.stopPropagation();
      this.hide(backdrop);
    };
    card.appendChild(closeBtn);

    if (entry && sourceTab) {
      const addBtnContainer = document.createElement("div");
      addBtnContainer.className = "cb-overlay-add-container";

      const addBtn = document.createElement("button");
      addBtn.type = "button";
      addBtn.className = "cb-overlay-add-btn";
      const addIcon = document.createElement("i");
      addIcon.className = "fas fa-plus";
      addBtn.appendChild(addIcon);
      addBtn.appendChild(document.createTextNode(" " + game.i18n.localize("CLUEBOOK.Overlay.AddClue")));

      const dropdown = document.createElement("div");
      dropdown.className = "cb-overlay-workspaces hidden";

      // Offer Personal + all writable Shared Boards (Owner OR Observer when not Read-Only)
      const validWorkspaces = [{ id: "personal", name: game.i18n.localize("CLUEBOOK.Workspace.Personal") }];
      game.journal.forEach(j => {
        if (!j.getFlag("ClueBook", "isWorkspace")) return;
        const target = WorkspaceRepository.resolveTarget(j.id);
        if (target.canRead && (target.canWriteDirect || target.canWriteSocket)) {
          validWorkspaces.push({ id: j.id, name: j.name });
        }
      });

      validWorkspaces.forEach(ws => {
        const wsItem = document.createElement("div");
        wsItem.className = "cb-ws-item";
        wsItem.textContent = ws.name;
        wsItem.onclick = async (e) => {
          e.stopPropagation();
          try {
            await this._saveClue(ws.id, sourceTab, entry);
            dropdown.classList.add("hidden");
            ui.notifications.info(game.i18n.localize("CLUEBOOK.Overlay.CopiedSuccess"));
          } catch (err) {
            console.error("ClueBook | Failed to save overlay clue:", err);
          }
        };
        dropdown.appendChild(wsItem);
      });

      addBtn.onclick = (e) => {
        e.stopPropagation();
        dropdown.classList.toggle("hidden");
      };

      addBtnContainer.appendChild(addBtn);
      addBtnContainer.appendChild(dropdown);
      card.appendChild(addBtnContainer);
    }

    container.appendChild(card);
    backdrop.appendChild(container);

    backdrop.onclick = (e) => {
      if (e.target === backdrop || e.target === container) {
        this.hide(backdrop);
      }
    };

    document.body.appendChild(backdrop);

    card.querySelectorAll("a.content-link").forEach(link => {
      link.addEventListener("click", async (ev) => {
        ev.preventDefault();
        const uuid = link.dataset.uuid;
        if (uuid) {
          try {
            const doc = await fromUuid(uuid);
            if (doc?.sheet) doc.sheet.render(true);
          } catch (err) {
            console.warn("ClueBook | Failed to open linked document:", err);
          }
        }
      });
    });

    requestAnimationFrame(() => {
      backdrop.classList.add("cb-overlay-enter");
    });
  }

  static hide(backdrop) {
    backdrop.classList.remove("cb-overlay-enter");
    backdrop.classList.add("cb-overlay-exit");

    setTimeout(() => {
      if (backdrop && backdrop.parentNode) {
        backdrop.remove();
      }
    }, 500);
  }

  static async _saveClue(workspaceId, tab, entryData) {
    const newId = foundry.utils.randomID();
    const existingTabEntries = WorkspaceRepository.getData(workspaceId)?.[tab] || {};
    let maxSort = 0;
    for (const item of Object.values(existingTabEntries)) {
      if (item && typeof item.sort === "number" && item.sort > maxSort) {
        maxSort = item.sort;
      }
    }

    const sanitizedEntry = WorkspaceAccessService.sanitizeClueCopy(tab, entryData, maxSort + 1);
    await WorkspaceRepository.saveEntry(workspaceId, tab, newId, sanitizedEntry);

    const app = Array.from(foundry.applications.instances.values())
      .find(w => w.constructor.name === "ClueBookApp");
    if (app && app.rendered && app.state.activeWorkspace === workspaceId) {
      app.render({ parts: ["tabs", "content"] });
    }
  }
}

window.ClueBookOverlay = ClueBookOverlay;
