import { ClueBookEntryModel } from "./data-models.js";

export class ClueBookOverlay {
  static init() {
    // Listen for socket events to show overlay
    game.socket.on("module.ClueBook", (message) => {
      if (message.action === "showOverlay" && message.content) {
        this.show(message.content, message.entry, message.sourceTab);
      }
    });
  }

  static show(contentHTML, entry = null, sourceTab = null) {
    // Remove existing overlay if any
    const existing = document.getElementById('cb-share-overlay');
    if (existing) existing.remove();

    // Create backdrop container
    const backdrop = document.createElement('div');
    backdrop.id = 'cb-share-overlay';
    backdrop.className = 'cb-overlay-backdrop';

    // Create 3D container
    const container = document.createElement('div');
    container.className = 'cb-overlay-container';

    // Create the card
    const card = document.createElement('div');
    card.className = 'cb-overlay-card app window-app cb-epic-overlay';
    card.insertAdjacentHTML('beforeend', contentHTML);

    // Create Close Button
    const closeBtn = document.createElement('div');
    closeBtn.className = 'cb-overlay-close';
    const closeIcon = document.createElement('i');
    closeIcon.className = 'fas fa-times';
    closeBtn.appendChild(closeIcon);
    closeBtn.onclick = (e) => {
      e.stopPropagation();
      this.hide(backdrop);
    };
    card.appendChild(closeBtn);

    // If entry data is provided, add the 'Add Clue' button
    if (entry && sourceTab) {
      const addBtnContainer = document.createElement('div');
      addBtnContainer.className = 'cb-overlay-add-container';
      
      const addBtn = document.createElement('button');
      addBtn.className = 'cb-overlay-add-btn';
      const addIcon = document.createElement('i');
      addIcon.className = 'fas fa-plus';
      addBtn.appendChild(addIcon);
      addBtn.appendChild(document.createTextNode(" " + game.i18n.localize("CLUEBOOK.Overlay.AddClue")));
      
      const dropdown = document.createElement('div');
      dropdown.className = 'cb-overlay-workspaces hidden';
      
      // Collect valid workspaces (Personal + Owned Shared)
      const validWorkspaces = [{ id: 'personal', name: game.i18n.localize("CLUEBOOK.Workspace.Personal") }];
      game.journal.forEach(j => {
        if (j.getFlag("ClueBook", "isWorkspace") && j.isOwner) {
          validWorkspaces.push({ id: j.id, name: j.name });
        }
      });
      
      validWorkspaces.forEach(ws => {
        const wsItem = document.createElement('div');
        wsItem.className = 'cb-ws-item';
        wsItem.innerText = ws.name;
        wsItem.onclick = async (e) => {
          e.stopPropagation();
          await this._saveClue(ws.id, sourceTab, entry);
          dropdown.classList.add('hidden');
          ui.notifications.info(game.i18n.localize("CLUEBOOK.Overlay.CopiedSuccess"));
        };
        dropdown.appendChild(wsItem);
      });
      
      addBtn.onclick = (e) => {
        e.stopPropagation();
        dropdown.classList.toggle('hidden');
      };
      
      addBtnContainer.appendChild(addBtn);
      addBtnContainer.appendChild(dropdown);
      card.appendChild(addBtnContainer);
    }

    container.appendChild(card);
    backdrop.appendChild(container);
    
    // Clicking backdrop closes it
    backdrop.onclick = (e) => {
      if (e.target === backdrop || e.target === container) {
        this.hide(backdrop);
      }
    };

    document.body.appendChild(backdrop);

    // Activate content link listeners on overlay card
    card.querySelectorAll('a.content-link').forEach(link => {
      link.addEventListener('click', async (ev) => {
        ev.preventDefault();
        const uuid = link.dataset.uuid;
        if (uuid) {
          try {
            const doc = await fromUuid(uuid);
            if (doc?.sheet) doc.sheet.render(true);
          } catch(err) {
            console.warn("ClueBook | Failed to open linked document:", err);
          }
        }
      });
    });

    // Trigger animations in next frame
    requestAnimationFrame(() => {
      backdrop.classList.add('cb-overlay-enter');
    });
  }

  static hide(backdrop) {
    backdrop.classList.remove('cb-overlay-enter');
    backdrop.classList.add('cb-overlay-exit');
    
    // Wait for CSS transition (0.5s)
    setTimeout(() => {
      if (backdrop && backdrop.parentNode) {
        backdrop.remove();
      }
    }, 500);
  }

  static async _saveClue(workspaceId, tab, entryData) {
    // Clone entry to avoid modifying the original if it's referenced
    const newEntry = foundry.utils.deepClone(entryData);
    newEntry.id = foundry.utils.randomID();
    
    // Do not add copied clues to the board or pinned list automatically
    newEntry.onBoard = false;
    newEntry.pinned = false;
    
    // Strip qnmention links from text fields
    const stripLinks = (text) => {
      if (!text) return text;
      return text.replace(/\[\[qnmention:[^:]+:([^\]]+)\]\](?:\{([^}]*)\})?/g, (m, name, customText) => {
        return customText || name;
      });
    };
    
    if (newEntry.text) newEntry.text = stripLinks(newEntry.text);
    if (newEntry.event) newEntry.event = stripLinks(newEntry.event);
    if (newEntry.note) newEntry.note = stripLinks(newEntry.note);
    if (newEntry.name) newEntry.name = stripLinks(newEntry.name);
    if (newEntry.subtitle) newEntry.subtitle = stripLinks(newEntry.subtitle);
    if (newEntry.owner) newEntry.owner = stripLinks(newEntry.owner);
    if (newEntry.location) newEntry.location = stripLinks(newEntry.location);
    if (newEntry.attitude) newEntry.attitude = stripLinks(newEntry.attitude);

    // Determine target data path
    const finalEntry = new ClueBookEntryModel(newEntry).toObject();
    const updates = { [`flags.ClueBook.data.${tab}.${newEntry.id}`]: finalEntry };
    
    // Save without overwriting everything (BUG-01 Fix)
    if (workspaceId === "personal") {
      await game.user.update(updates);
    } else {
      const journal = game.journal.get(workspaceId);
      if (journal) {
        await journal.update(updates);
      }
    }
    
    // If cluebook is open, re-render if it's on this workspace (BUG-02 Fix)
    const app = Array.from(foundry.applications.instances.values())
      .find(w => w.constructor.name === "ClueBookApp");
    if (app && app.rendered && app.state.activeWorkspace === workspaceId) {
       app.render({ parts: ["content"] });
    }
  }
}

// Attach to window so it can be called from app-actions.js directly
window.ClueBookOverlay = ClueBookOverlay;

