import { ClueBookEditDialog } from "../edit-dialog.js";
import { ClueBookSocket } from "../socket.js";
import { ClueBookTagManager } from "../tag-manager.js";

import { TimeService } from "../services/time-service.js";
export const ClueBookEntryActionsMixin = (Base) => class extends Base {
  static async _onManageTags(event, target) {
    let journal = null;
    if (this.state.activeWorkspace !== "personal") {
      journal = this._getWorkspaceJournal();
    }
    
    new ClueBookTagManager({
      workspace: this.state.activeWorkspace,
      journal: journal
    }).render(true);
  }

  static async _onToggleZenMode(event, target) {
    this.state.isZenMode = !this.state.isZenMode;
    if (this.state.isZenMode) {
      this.element.classList.add("zen-mode");
      target.innerHTML = `<i class="fas fa-compress"></i>`;
    } else {
      this.element.classList.remove("zen-mode");
      target.innerHTML = `<i class="fas fa-expand"></i>`;
    }
    this.render({ parts: ["content"] });
  }

  static async _onToggleEdit(event, target) {
    event.stopPropagation();
    if (this.state.isReadOnly) return;
    const entryElement = target.closest('.cluebook-entry, .cluebook-folder');
    if (!entryElement) return;

    const entryId = entryElement.dataset.entryId;
    const sourceTab = entryElement.dataset.sourceTab || this.state.activeTab;

    let dataObj = {};
    if (this.state.activeWorkspace === "personal") {
      dataObj = game.user.getFlag("ClueBook", "data") || {};
    } else {
      const journal = this._getWorkspaceJournal();
      if (journal) dataObj = journal.getFlag("ClueBook", "data") || {};
    }

    const entryData = dataObj[sourceTab]?.[entryId];
    if (!entryData) return;

    new ClueBookEditDialog({
      entry: entryData,
      sourceTab: sourceTab,
      entryId: entryId,
      workspace: this.state.activeWorkspace,
      onSave: async (updateData) => {
        const flagUpdates = {};
        for (const [key, value] of Object.entries(updateData)) {
          flagUpdates[`flags.ClueBook.data.${sourceTab}.${entryId}.${key}`] = value;
        }
        await this._updateWorkspaceData(flagUpdates);
        this.render({ parts: ["content"] });
      }
    }).render(true);
  }

  static async _onTogglePin(event, target) {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    const entryEl = target.closest('.cluebook-entry');
    const entryId = entryEl.dataset.entryId;
    const sourceTab = entryEl.dataset.sourceTab || this.state.activeTab;

    const isPinned = entryEl.dataset.pinned === "true";
    const newValue = !isPinned;

    await this._saveDataRaw(sourceTab, entryId, "pinned", newValue);

    if (newValue) {
      this.state.selectedEntries.delete(entryId);
      if (this.state.selectedEntryId === entryId) this.state.selectedEntryId = null;
    }

    this.render({ parts: ["content"] });
  }

  static async _onToggleTrack(event, target) {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    const entryEl = target.closest('.cluebook-entry');
    if (!entryEl) return;
    const entryId = entryEl.dataset.entryId;
    if (!entryId) return;

    let tracked = Array.from(game.user.getFlag("ClueBook", "trackedEvents") || []);
    if (tracked.includes(entryId)) {
      tracked = tracked.filter(id => id !== entryId);
    } else {
      tracked.push(entryId);
    }
    await game.user.setFlag("ClueBook", "trackedEvents", tracked);
  }

  static async _onAddTime(event, target) {
    const minsToAdd = parseInt(target.dataset.mins) || 0;
    if (minsToAdd === 0) return;

    const entryElement = target.closest('.cluebook-entry');
    const entryId = entryElement.dataset.entryId;
    const sourceTab = entryElement.dataset.sourceTab || this.state.activeTab;
    const timeInput = entryElement.querySelector('input[data-field="time"]');
    
    if (!timeInput) return;
    
    let currentStr = timeInput.value.trim();
    if (!currentStr) currentStr = "00:00"; // default to midnight if empty
    
    let hours = 0;
    let mins = 0;
    let prefix = ""; // To preserve dates like "01.01.2025 "
    let suffix = "";

    const timeMatch = currentStr.match(/(.*?)(\d{1,2}):(\d{2})(.*)/);
    
    if (timeMatch) {
      prefix = timeMatch[1];
      hours = parseInt(timeMatch[2]);
      mins = parseInt(timeMatch[3]);
      suffix = timeMatch[4];
      
      mins += minsToAdd;
      while (mins >= 60) {
        mins -= 60;
        hours += 1;
      }
      while (hours >= 24) {
        hours -= 24;
      }
      
      const newTimeStr = `${prefix}${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}${suffix}`;
      timeInput.value = newTimeStr;
      
      // Save
      this._saveDataRaw(sourceTab, entryId, "time", newTimeStr);
    } else {
      ui.notifications.warn(game.i18n.localize("CLUEBOOK.AppActions.TimeFormatError"));
    }
  }

  static async _onToggleVisibility(event, target) {
    event.stopPropagation();
    try {
      const entry = target.closest('.cluebook-entry, .cluebook-folder') || target.closest('.cluebook-board-node');
      if (!entry) return;
      const entryId = entry.dataset.entryId;
      const sourceTab = entry.dataset.sourceTab || this.state.activeTab;
      
      let data = this._getWorkspaceData();
      const currentEntry = data[sourceTab]?.[entryId];
      if (!currentEntry) return;
      
      if (event.shiftKey) {
        const shouldHide = !currentEntry.isHidden;
        await this._updateWorkspaceData({
          [`flags.ClueBook.data.${sourceTab}.${entryId}.isHidden`]: shouldHide,
          [`flags.ClueBook.data.${sourceTab}.${entryId}.visibleTo`]: []
        });
        this.render({ parts: ["content"] });
        return;
      }

      const allUsers = game.users.filter(u => !u.isGM);
      const visibleTo = currentEntry.visibleTo || [];
      const isVisibleToAll = !currentEntry.isHidden && (visibleTo.length === 0 || visibleTo.length === allUsers.length);
      
      let userCheckboxes = allUsers.map(u => {
        const isChecked = isVisibleToAll || visibleTo.includes(u.id);
        return `
          <label style="display: flex; align-items: center; gap: 8px; margin-bottom: 6px; cursor: pointer;">
            <input type="checkbox" name="visibleTo" value="${u.id}" ${isChecked ? 'checked' : ''}>
            <span style="font-weight: 500;">${u.name}</span>
          </label>
        `;
      }).join('');

      const content = `
        <form id="cluebook-visibility-form" style="display: flex; flex-direction: column; gap: 12px; padding: 10px;">
          <div style="display: flex; gap: 8px;">
            <button type="button" id="btn-visible-all" style="flex: 1; padding: 6px 10px; font-size: 12px; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 6px; background: rgba(255,255,255,0.08); border: 1px solid var(--color-border-light-2); border-radius: 4px; color: var(--color-text-light-highlight);">
              <i class="fas fa-eye"></i> ${game.i18n.localize("CLUEBOOK.Entry.VisibleToAll")}
            </button>
            <button type="button" id="btn-hide-all" style="flex: 1; padding: 6px 10px; font-size: 12px; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 6px; background: rgba(255,255,255,0.08); border: 1px solid var(--color-border-light-2); border-radius: 4px; color: var(--color-text-light-highlight);">
              <i class="fas fa-eye-slash"></i> ${game.i18n.localize("CLUEBOOK.Entry.HideFromAll")}
            </button>
          </div>
          <p class="hint" style="margin: 0; font-size: 12px; opacity: 0.8;">${game.i18n.localize("CLUEBOOK.Entry.SelectPlayers")}</p>
          <div style="display: flex; flex-direction: column; max-height: 200px; overflow-y: auto; padding: 8px; background: rgba(0,0,0,0.15); border-radius: 5px; border: 1px solid var(--color-border-light-1);">
            ${userCheckboxes}
          </div>
        </form>
      `;

      const result = await foundry.applications.api.DialogV2.wait({
        window: { title: game.i18n.localize("CLUEBOOK.Entry.VisibilityTitle") },
        content: content,
        render: (event) => {
          const root = event.target?.element || event.target || document;
          const btnVisibleAll = root.querySelector("#btn-visible-all");
          const btnHideAll = root.querySelector("#btn-hide-all");
          const playerCbs = root.querySelectorAll('input[name="visibleTo"]');

          if (btnVisibleAll) {
            btnVisibleAll.addEventListener("click", (e) => {
              e.preventDefault();
              playerCbs.forEach(cb => cb.checked = true);
            });
          }
          if (btnHideAll) {
            btnHideAll.addEventListener("click", (e) => {
              e.preventDefault();
              playerCbs.forEach(cb => cb.checked = false);
            });
          }
        },
        buttons: [{
          action: "save",
          label: game.i18n.localize("CLUEBOOK.Entry.Save"),
          icon: "fas fa-save",
          callback: (event, button, dialog) => {
            const form = dialog.element.querySelector("form");
            const selected = Array.from(form.querySelectorAll('input[name="visibleTo"]:checked')).map(cb => cb.value);

            if (selected.length === allUsers.length) {
              return { isHidden: false, visibleTo: [] };
            } else if (selected.length === 0) {
              return { isHidden: true, visibleTo: [] };
            } else {
              return { isHidden: false, visibleTo: selected };
            }
          }
        }],
        rejectClose: false
      });

      if (result) {
        await this._updateWorkspaceData({
          [`flags.ClueBook.data.${sourceTab}.${entryId}.isHidden`]: result.isHidden,
          [`flags.ClueBook.data.${sourceTab}.${entryId}.visibleTo`]: result.visibleTo
        });
        this.render({ parts: ["content"] });
      }
    } catch (error) {
      console.error("ClueBook | Error in _onToggleVisibility:", error);
    }
  }

  static async _onSelectColor(event, target) {
    if (this.state.isReadOnly) return;
    const entry = target.closest('.cluebook-entry');
    const color = target.dataset.color;
    const entryId = entry.dataset.entryId;
    const sourceTab = entry.dataset.sourceTab || this.state.activeTab;

    // Update DOM immediately for responsiveness
    entry.dataset.color = color;

    // Save to flags
    await this._saveDataRaw(sourceTab, entryId, "color", color);
  }

  static async _onSendToBoard(event, target) {
    const entry = target.closest('.cluebook-entry');
    const entryId = entry.dataset.entryId;
    const sourceTab = entry.dataset.sourceTab || this.state.activeTab;
    
    const isOnBoard = entry.dataset.onBoard === "true";
    if (isOnBoard && entry.dataset.pinned === "true") {
      ui.notifications.warn(game.i18n.localize("CLUEBOOK.AppActions.CannotRemovePinned"));
      return;
    }
    const newValue = !isOnBoard;

    await this._saveDataRaw(sourceTab, entryId, "onBoard", newValue);
    this.render({ parts: ["content"] });
  }

  static async _onRemoveFromBoard(event, target) {
    const entry = target.closest('.cluebook-entry');
    if (entry && entry.dataset.pinned === "true") {
      ui.notifications.warn(game.i18n.localize("CLUEBOOK.AppActions.CannotRemovePinned"));
      return;
    }
    const proceed = await foundry.applications.api.DialogV2.confirm({
      window: { title: game.i18n.localize("CLUEBOOK.AppActions.RemoveFromBoardTitle") },
      content: game.i18n.localize("CLUEBOOK.AppActions.RemoveFromBoardPrompt"),
      rejectClose: false
    });

    if (!proceed) return;

    const entryId = entry.dataset.entryId;
    const sourceTab = entry.dataset.sourceTab;

    await this._saveDataRaw(sourceTab, entryId, "onBoard", false);
    
    // Delete associated links
    let links = this._getWorkspaceLinks();
    const updates = {};
    let linkDeleted = false;
    for (const [key, l] of Object.entries(links)) {
      if (l.source === entryId || l.target === entryId) {
        updates[`flags.ClueBook.data.links.-=${key}`] = null;
        linkDeleted = true;
      }
    }
    
    if (linkDeleted) {
      await this._updateWorkspaceData(updates);
    }
    this.render({ parts: ["content"] });
  }

  static async _onAddEntry(event, target) {
    const id = foundry.utils.randomID();
    const activeTab = this.state.activeTab;
    const newEntry = this._getEmptyEntryForTab(activeTab);
    
    // Assign highest sort order
    let maxSort = 0;
    const targetDoc = this._getWorkspaceJournal() || game.user;
    const currentData = targetDoc.getFlag("ClueBook", "data")?.[activeTab] || {};
    Object.values(currentData).forEach(e => {
      if (e && e.sort !== undefined && e.sort > maxSort) maxSort = e.sort;
    });
    newEntry.sort = maxSort + 1;
    newEntry.id = id;
    
    const flagPath = `flags.ClueBook.data.${activeTab}.${id}`;
    const updateData = { [flagPath]: newEntry };

    await this._updateWorkspaceData(updateData);
    
    // Auto-refresh the main app
    this.render({ parts: ["content"] });

    // Open Edit Dialog automatically for the new entry
    new ClueBookEditDialog({
      entry: newEntry,
      sourceTab: activeTab,
      entryId: id,
      workspace: this.state.activeWorkspace,
      onSave: async (updateData) => {
        const flagUpdates = {};
        for (const [key, value] of Object.entries(updateData)) {
          flagUpdates[`flags.ClueBook.data.${activeTab}.${id}.${key}`] = value;
        }
        await this._updateWorkspaceData(flagUpdates);
        this.render({ parts: ["content"] });
      }
    }).render(true);
  }

  static async _onDeleteEntry(event, target) {
    if (event) event.stopPropagation();
    const entryEl = target.closest('.cluebook-entry, .cluebook-folder');
    if (!entryEl) return;
    if (entryEl.dataset.pinned === "true") {
      ui.notifications.warn(game.i18n.localize("CLUEBOOK.AppActions.CannotDeletePinned"));
      return;
    }
    const proceed = await foundry.applications.api.DialogV2.confirm({
      window: { title: game.i18n.localize("CLUEBOOK.AppActions.DeleteEntryTitle") },
      content: game.i18n.localize("CLUEBOOK.AppActions.DeleteEntryPrompt"),
      rejectClose: false
    });

    if (!proceed) return;

    const entryId = entryEl.dataset.entryId;
    const sourceTab = entryEl.dataset.sourceTab || this.state.activeTab;
    
    // Also delete any associated links
    let links = this._getWorkspaceLinks();
    const updates = {};
    for (const [key, l] of Object.entries(links)) {
      if (l.source === entryId || l.target === entryId) {
        updates[`flags.ClueBook.data.links.-=${key}`] = null;
      }
    }
    if (Object.keys(updates).length > 0) {
      await this._updateWorkspaceData(updates);
    }

    await this._updateWorkspaceData({
      [`flags.ClueBook.data.${sourceTab}.-=${entryId}`]: null
    });
    
    this.render({ parts: ["content"] });
  }

  _showListContextMenu(ev) {
    if (this.state.isReadOnly) return;
    
    const existingMenu = document.querySelector('.cb-context-menu');
    if (existingMenu) existingMenu.remove();

    const menu = document.createElement('div');
    menu.className = 'cb-context-menu';
    menu.innerHTML = `
      <div class="cb-menu-item" data-action="mass-edit"><i class="fas fa-pencil-alt"></i> ${game.i18n.localize("CLUEBOOK.MassEdit.Edit")}</div>
      <div class="cb-menu-separator"></div>
      <div class="cb-menu-item" data-action="toggle-visibility"><i class="fas fa-eye-slash"></i> ${game.i18n.localize("CLUEBOOK.MassEdit.Visibility")}</div>
      <div class="cb-menu-item" data-action="toggle-board"><i class="fas fa-project-diagram"></i> ${game.i18n.localize("CLUEBOOK.MassEdit.Board")}</div>
      <div class="cb-menu-separator"></div>
      <div class="cb-menu-item danger" data-action="delete"><i class="fas fa-trash"></i> ${game.i18n.localize("CLUEBOOK.Entry.Delete")} [Del]</div>
    `;

    document.body.appendChild(menu);

    menu.style.left = `${ev.clientX}px`;
    menu.style.top = `${ev.clientY}px`;

    const closeMenu = (e) => {
      if (e && e.target && e.target.closest && e.target.closest('.cb-context-menu')) return;
      menu.remove();
      document.removeEventListener('click', closeMenu);
      document.removeEventListener('contextmenu', closeMenu);
    };

    setTimeout(() => {
      document.addEventListener('click', closeMenu);
      document.addEventListener('contextmenu', closeMenu);
    }, 100);

    menu.addEventListener('click', async (menuEv) => {
      menuEv.stopPropagation();
      const actionEl = menuEv.target.closest('.cb-menu-item');
      if (!actionEl) return;
      
      const action = actionEl.dataset.action;
      closeMenu();
      await this._executeListContextMenuAction(action);
    });
  }

  async _executeListContextMenuAction(action) {
    const ids = Array.from(this.state.selectedEntries);
    if (ids.length < 1) return;

    if (action === 'delete') {
      return this._onDeleteGroup();
    } else if (action === 'toggle-visibility') {
      return this._onMassToggleVisibility(ids);
    } else if (action === 'toggle-board') {
      return this._onMassToggleBoard(ids);
    } else if (action === 'mass-edit') {
      return this._onMassEditDialog(ids);
    }
  }

  async _onMassToggleVisibility(ids) {
    const updates = {};
    const workspaceData = this._getWorkspaceData();
    let hideAll = false;
    
    // If any selected entry is visible, the action will hide all. Otherwise show all.
    for (const id of ids) {
       for (const [tab, list] of Object.entries(workspaceData)) {
         if (list[id]) {
           if (!list[id].isHidden) hideAll = true;
           break;
         }
       }
    }

    ids.forEach(id => {
      for (const [tab, list] of Object.entries(workspaceData)) {
        if (list[id]) {
          updates[`flags.ClueBook.data.${tab}.${id}.isHidden`] = hideAll;
        }
      }
    });

    if (Object.keys(updates).length > 0) {
      await this._updateWorkspaceData(updates);
      this.render({ parts: ["content"] });
    }
  }

  async _onMassToggleBoard(ids) {
    const updates = {};
    const workspaceData = this._getWorkspaceData();
    let sendToBoard = false;
    
    // If any selected entry is NOT on board, the action will send all to board. Otherwise remove all.
    for (const id of ids) {
       for (const [tab, list] of Object.entries(workspaceData)) {
         if (list[id]) {
           if (!list[id].onBoard) sendToBoard = true;
           break;
         }
       }
    }

    ids.forEach(id => {
      for (const [tab, list] of Object.entries(workspaceData)) {
        if (list[id]) {
          updates[`flags.ClueBook.data.${tab}.${id}.onBoard`] = sendToBoard;
          if (sendToBoard && (list[id].boardX === undefined || list[id].boardY === undefined)) {
             updates[`flags.ClueBook.data.${tab}.${id}.boardX`] = Math.floor(Math.random() * 200) + 100;
             updates[`flags.ClueBook.data.${tab}.${id}.boardY`] = Math.floor(Math.random() * 200) + 100;
          }
        }
      }
    });

    if (Object.keys(updates).length > 0) {
      await this._updateWorkspaceData(updates);
      this.render({ parts: ["content"] });
    }
  }

  async _onMassEditDialog(ids) {
    const workspaceData = this._getWorkspaceData();
    const entries = [];
    
    // First pass to get all entries and their tags
    ids.forEach(id => {
      for (const [tab, list] of Object.entries(workspaceData)) {
        if (list[id]) {
           entries.push({ tab, id, data: list[id] });
           break;
        }
      }
    });

    if (entries.length === 0) return;

    // Compute common tags
    let commonTags = new Set(entries[0].data.tags || []);
    for (let i = 1; i < entries.length; i++) {
      const entryTags = new Set(entries[i].data.tags || []);
      commonTags = new Set([...commonTags].filter(x => entryTags.has(x)));
    }

    const mockEntry = {
       tags: Array.from(commonTags),
       color: "",
       textColor: ""
    };

    new ClueBookEditDialog({
      entry: mockEntry,
      workspace: this.state.activeWorkspace,
      isMassEdit: true,
      entriesCount: ids.length,
      onSave: async (savedData) => {
        const updates = {};
        
        const tagsToAdd = (savedData.tags || []).filter(t => !commonTags.has(t));
        const tagsToRemove = Array.from(commonTags).filter(t => !(savedData.tags || []).includes(t));
        
        entries.forEach(entry => {
          const pathPrefix = `flags.ClueBook.data.${entry.tab}.${entry.id}`;
          
          if (savedData.color) {
             updates[`${pathPrefix}.color`] = savedData.color === "custom" ? (savedData.customColorHex || "#7b61ff") : savedData.color;
             updates[`${pathPrefix}.isCustomColor`] = (savedData.color === "custom" || !["yellow", "red", "green", "blue", "purple", "orange", "teal", "pink", "brown"].includes(savedData.color));
          }
          if (savedData.textColor) {
             updates[`${pathPrefix}.textColor`] = savedData.textColor;
          }
          
          if (tagsToAdd.length > 0 || tagsToRemove.length > 0) {
             let currentTags = [...(entry.data.tags || [])];
             // Remove tags
             if (tagsToRemove.length > 0) {
                 currentTags = currentTags.filter(t => !tagsToRemove.includes(t));
             }
             // Add tags
             if (tagsToAdd.length > 0) {
                 tagsToAdd.forEach(t => {
                     if (!currentTags.includes(t)) currentTags.push(t);
                 });
             }
             updates[`${pathPrefix}.tags`] = currentTags;
          }
        });
        
        if (Object.keys(updates).length > 0) {
          await this._updateWorkspaceData(updates);
          this.render({ parts: ["content"] });
        }
      }
    }).render(true);
  }

  async _onDeleteGroup() {
    const ids = Array.from(this.state.selectedEntries);
    if (ids.length === 0) return;

    // Filter out pinned entries
    const nonPinnedIds = ids.filter(id => {
      const el = this.element.querySelector(`[data-entry-id="${id}"]`);
      return !el || el.dataset.pinned !== "true";
    });

    if (nonPinnedIds.length === 0) {
      ui.notifications.warn(game.i18n.localize("CLUEBOOK.Board.AllPinnedWarn"));
      return;
    }

    const isBoard = this.state.activeTab === "board";

    const proceed = await foundry.applications.api.DialogV2.confirm({
      window: { title: isBoard ? game.i18n.localize("CLUEBOOK.AppActions.RemoveFromBoardTitle") : game.i18n.localize("CLUEBOOK.AppActions.DeleteGroupTitle") },
      content: game.i18n.format(isBoard ? "CLUEBOOK.AppActions.RemoveFromBoardPrompt" : "CLUEBOOK.AppActions.DeleteGroupPrompt", { count: nonPinnedIds.length }),
      rejectClose: false
    });

    if (!proceed) return;

    const updates = {};
    let links = this._getWorkspaceLinks();

    nonPinnedIds.forEach(id => {
      const entryEl = this.element.querySelector(`[data-entry-id="${id}"]`);
      if (entryEl) {
        const sourceTab = entryEl.dataset.sourceTab;
        if (sourceTab) {
          if (isBoard) {
            updates[`flags.ClueBook.data.${sourceTab}.${id}.onBoard`] = false;
          } else {
            updates[`flags.ClueBook.data.${sourceTab}.-=${id}`] = null;
          }
        }
      }
      
      // Delete associated links if we are completely deleting the entries, OR if we are removing them from the board (since they are no longer on the board to be linked)
      // Actually, removing from board should also delete links attached to it
      for (const [key, l] of Object.entries(links)) {
        if (l.source === id || l.target === id) {
          updates[`flags.ClueBook.data.links.-=${key}`] = null;
        }
      }
    });

    if (Object.keys(updates).length > 0) {
      await this._updateWorkspaceData(updates);
    }
    
    this.state.selectedEntries.clear();
    this.state.selectedEntryId = null;
    this.render({ parts: ["content"] });
  }

  async _createNewWorkspace() {
    let userCheckboxes = '';
    game.users.forEach(u => {
      if (u.id === game.user.id || u.isGM) return;
      userCheckboxes += `<label style="display:block; margin-bottom: 5px;"><input type="checkbox" name="user_${u.id}"> ${u.name}</label>`;
    });

    const defaultName = game.i18n.localize("CLUEBOOK.AppActions.NewBoardDefaultName");
    const content = `
      <form>
        <div class="form-group">
          <label>${game.i18n.localize("CLUEBOOK.AppActions.BoardNamePrompt")}</label>
          <input type="text" name="workspaceName" value="${defaultName}" required autofocus>
        </div>
        <hr>
        <div class="form-group">
          <label>${game.i18n.localize("CLUEBOOK.AppActions.WhoHasAccessPrompt")}</label>
          <div style="max-height: 150px; overflow-y: auto; background: rgba(0,0,0,0.1); padding: 5px; border-radius: 5px; margin-top: 5px;">
            ${userCheckboxes || game.i18n.localize("CLUEBOOK.AppActions.NoOtherPlayers")}
          </div>
        </div>
        <hr>
        <div class="form-group" style="display: flex; align-items: center; gap: 10px; margin-top: 10px;">
          <input type="checkbox" name="readOnly" id="cb-ws-readonly">
          <label for="cb-ws-readonly" style="margin: 0; cursor: pointer;">${game.i18n.localize("CLUEBOOK.AppActions.ReadOnlyForPlayers")}</label>
        </div>
      </form>
    `;

    new foundry.applications.api.DialogV2({
      window: { title: game.i18n.localize("CLUEBOOK.AppActions.CreateNewBoardTitle") },
      content: content,
      buttons: [
        {
          action: "create",
          label: game.i18n.localize("CLUEBOOK.AppActions.CreateBtn"),
          icon: "fas fa-check",
          default: true,
          callback: async (event, button, dialog) => {
            const form = button.form;
            const name = form.elements.workspaceName?.value?.trim();
            if (!name) return;

            const ownership = { default: 0 };
            ownership[game.user.id] = 3;
            game.users.filter(u => u.isGM).forEach(gm => ownership[gm.id] = 3);

            form.querySelectorAll('input[type="checkbox"]:checked').forEach(input => {
              if (input.name === "readOnly") return;
              const userId = input.name.split('_')[1];
              if (userId) ownership[userId] = 3;
            });

            let folder = game.folders.find(f => f.name === "ClueBook Boards" && f.type === "JournalEntry");
            if (!folder && game.user.isGM) {
              folder = await Folder.create({ name: "ClueBook Boards", type: "JournalEntry" });
            }

            if (game.user.isGM) {
              const isReadOnly = form.elements.readOnly?.checked ?? false;
              const journal = await JournalEntry.create({
                name: name,
                folder: folder ? folder.id : null,
                ownership: ownership,
                flags: {
                  ClueBook: {
                    isWorkspace: true,
                    data: {},
                    settings: { readOnly: isReadOnly }
                  }
                }
              });

              if (journal) {
                this.state.activeWorkspace = journal.id;
                this.render();
              }
            } else {
              game.socket.emit("module.ClueBook", {
                action: "createBoard",
                userId: game.user.id,
                name: name,
                ownership: ownership
              });
              ui.notifications.info(game.i18n.localize("CLUEBOOK.AppActions.CreateRequestSent"));
            }
          }
        },
        {
          action: "cancel",
          label: game.i18n.localize("CLUEBOOK.AppActions.Cancel"),
          icon: "fas fa-times"
        }
      ],
      rejectClose: false
    }).render(true);
  }

  static async showQuickAddDialog(type, activeWorkspace = null) {
    if (!activeWorkspace) {
      const app = Array.from(foundry.applications.instances.values()).find(w => w.constructor.name === "ClueBookApp");
      activeWorkspace = app ? app.state.activeWorkspace : (game.user?.getFlag("ClueBook", "lastWorkspace") || "personal");
    }
    let content = '';
    let title = '';

    if (type === "notes") {
      title = game.i18n.localize("CLUEBOOK.AppActions.QuickAddTitleNote");
      content = `
        <div style="display: flex; flex-direction: column; gap: 8px; margin-bottom: 10px;">
          <input type="text" name="name" class="cluebook-input" placeholder="${game.i18n.localize("CLUEBOOK.EntryDetails.Untitled")}" style="width: 100%;" autofocus onkeydown="if(event.key === 'Enter') { event.preventDefault(); event.stopPropagation(); const next = this.closest('.window-content').querySelector('textarea'); if (next) next.focus(); }">
          <textarea name="text" class="cluebook-input" placeholder="..." style="width: 100%; min-height: 80px;" onkeydown="if(event.key === 'Enter' && (event.ctrlKey || event.metaKey)) { event.preventDefault(); event.stopPropagation(); this.closest('.window-content').querySelector('button[data-action=ok]').click(); }"></textarea>
        </div>
      `;
    } else if (type === "npc") {
      title = game.i18n.localize("CLUEBOOK.AppActions.QuickAddTitleNPC");
      content = `
        <div style="display: flex; flex-direction: column; gap: 8px; margin-bottom: 10px;">
          <input type="text" name="name" class="cluebook-input" placeholder="${game.i18n.localize("CLUEBOOK.AppActions.UnknownNPC")}" style="width: 100%;" autofocus onkeydown="if(event.key === 'Enter') { event.preventDefault(); event.stopPropagation(); this.closest('.window-content').querySelector('input[name=location]').focus(); }">
          <input type="text" name="location" class="cluebook-input" placeholder="${game.i18n.localize("CLUEBOOK.AppActions.Location")}" style="width: 100%;" onkeydown="if(event.key === 'Enter') { event.preventDefault(); event.stopPropagation(); this.closest('.window-content').querySelector('input[name=attitude]').focus(); }">
          <input type="text" name="attitude" class="cluebook-input" placeholder="${game.i18n.localize("CLUEBOOK.AppActions.Attitude")}" style="width: 100%;" onkeydown="if(event.key === 'Enter') { event.preventDefault(); event.stopPropagation(); this.closest('.window-content').querySelector('textarea[name=note]').focus(); }">
          <textarea name="note" class="cluebook-input" placeholder="..." style="width: 100%; min-height: 60px;" onkeydown="if(event.key === 'Enter' && (event.ctrlKey || event.metaKey)) { event.preventDefault(); event.stopPropagation(); this.closest('.window-content').querySelector('button[data-action=ok]').click(); }"></textarea>
        </div>
      `;
    } else if (type === "quests") {
      title = game.i18n.localize("CLUEBOOK.AppActions.QuickAddTitleQuest");
      content = `
        <div style="display: flex; flex-direction: column; gap: 8px; margin-bottom: 10px;">
          <select name="status" class="cluebook-input" style="width: 100%;">
            <option value="active">${game.i18n.localize("CLUEBOOK.Quest.Active")}</option>
            <option value="completed">${game.i18n.localize("CLUEBOOK.Quest.Completed")}</option>
            <option value="failed">Failed</option>
          </select>
          <textarea name="text" class="cluebook-input" placeholder="..." style="width: 100%; min-height: 80px;" autofocus onkeydown="if(event.key === 'Enter' && (event.ctrlKey || event.metaKey)) { event.preventDefault(); event.stopPropagation(); this.closest('.window-content').querySelector('button[data-action=ok]').click(); }"></textarea>
        </div>
      `;
    } else if (type === "timeline") {
      title = game.i18n.localize("CLUEBOOK.AppActions.QuickAddTitleTimeline");
      content = `
        <div style="display: flex; flex-direction: column; gap: 8px; margin-bottom: 10px;">
          <textarea name="event" class="cluebook-input" placeholder="..." style="width: 100%; min-height: 80px;" autofocus onkeydown="if(event.key === 'Enter' && (event.ctrlKey || event.metaKey)) { event.preventDefault(); event.stopPropagation(); this.closest('.window-content').querySelector('button[data-action=ok]').click(); }"></textarea>
        </div>
      `;
    } else if (type === "locations") {
      title = game.i18n.localize("CLUEBOOK.AppActions.QuickAddTitleLocation");
      content = `
        <div style="display: flex; flex-direction: column; gap: 8px; margin-bottom: 10px;">
          <input type="text" name="name" class="cluebook-input" placeholder="${game.i18n.localize("CLUEBOOK.EntryDetails.Untitled")}" style="width: 100%;" autofocus onkeydown="if(event.key === 'Enter') { event.preventDefault(); event.stopPropagation(); this.closest('.window-content').querySelector('textarea[name=note]').focus(); }">
          <textarea name="note" class="cluebook-input" placeholder="..." style="width: 100%; min-height: 80px;" onkeydown="if(event.key === 'Enter' && (event.ctrlKey || event.metaKey)) { event.preventDefault(); event.stopPropagation(); this.closest('.window-content').querySelector('button[data-action=ok]').click(); }"></textarea>
        </div>
      `;
    }

    content += `
      <div style="display: flex; flex-direction: column; gap: 5px; margin-top: 10px;">
        <label style="font-size: 12px; color: var(--cb-text-muted);">${game.i18n.localize("CLUEBOOK.AppActions.CardColor")}</label>
        <select name="color" class="cluebook-input" style="width: 100%;">
          <option value="default">${game.i18n.localize("CLUEBOOK.AppActions.DefaultColor")}</option>
          <option value="yellow">${game.i18n.localize("CLUEBOOK.Colors.Yellow")}</option>
          <option value="green">${game.i18n.localize("CLUEBOOK.Colors.Green")}</option>
          <option value="blue">${game.i18n.localize("CLUEBOOK.Colors.Blue")}</option>
          <option value="red">${game.i18n.localize("CLUEBOOK.Colors.Red")}</option>
          <option value="purple">${game.i18n.localize("CLUEBOOK.Colors.Purple")}</option>
        </select>
      </div>
    `;

    const result = await foundry.applications.api.DialogV2.prompt({
      window: { title },
      content: `<form>${content}</form>`,
      ok: {
        label: game.i18n.localize("CLUEBOOK.AppActions.CreateBtn"),
        icon: "fas fa-check",
        callback: (event, button, dialog) => {
          const formElement = event.target.closest('form') || event.target.closest('.window-app').querySelector('form');
          const formData = new FormData(formElement);
          return Object.fromEntries(formData.entries());
        }
      }
    });

    if (!result) return;

    const entryId = foundry.utils.randomID();
    const settings = game.user.getFlag("ClueBook", "settings") || {};
    const defaultColor = settings.defaultColors?.[type] || "yellow";

    let maxSort = 0;
    let targetDoc = game.user;
    if (activeWorkspace !== "personal") {
      targetDoc = game.journal.get(activeWorkspace) || game.user;
    }
    const currentData = targetDoc.getFlag("ClueBook", "data")?.[type] || {};
    Object.values(currentData).forEach(e => {
      if (e && e.sort !== undefined && e.sort > maxSort) maxSort = e.sort;
    });

    const entryData = {
      id: entryId,
      sourceTab: type,
      color: result.color === "default" ? defaultColor : result.color,
      onBoard: false,
      isHidden: false,
      sort: maxSort + 1
    };

    delete result.color;
    Object.assign(entryData, result);

    const flagPath = `flags.ClueBook.data.${type}.${entryId}`;
    
    if (activeWorkspace !== "personal") {
      const journal = game.journal.get(activeWorkspace);
      if (journal) {
        if (journal.isOwner) {
          await journal.update({ [flagPath]: entryData });
        } else {
          game.socket.emit("module.ClueBook", {
            action: "updateBoardData",
            journalId: journal.id,
            updateData: { [flagPath]: entryData }
          });
        }
      } else {
        await game.user.update({ [flagPath]: entryData });
      }
    } else {
      await game.user.update({ [flagPath]: entryData });
    }

    ui.notifications.info(game.i18n.format("CLUEBOOK.AppActions.EntryAddedTo", { title }));
    
    // Auto-refresh the main app if it is open
    const app = Array.from(foundry.applications.instances.values()).find(w => w.constructor.name === "ClueBookApp");
    if (app) app.render({ parts: ["content"] });
  }

  static async _onPickDate(event, target) {
    event.preventDefault();
    const entry = target.closest('.cluebook-entry');
    const entryId = entry.dataset.entryId;
    const tab = entry.dataset.sourceTab;
    const field = target.dataset.field; // "deadlineTimestamp", "startTimestamp", "endTimestamp"
    const app = Array.from(foundry.applications.instances.values()).find(w => w.constructor.name === "ClueBookApp");
    if (!app) return;

    let currentVal = null;
    let dataObj = {};
    if (app.state.activeWorkspace === "personal") {
      dataObj = game.user.getFlag("ClueBook", "data") || {};
    } else {
      const journal = game.journal.get(app.state.activeWorkspace);
      if (journal) dataObj = journal.getFlag("ClueBook", "data") || {};
    }

    if (dataObj[tab] && dataObj[tab][entryId]) {
      currentVal = dataObj[tab][entryId][field];
    }

    const timestamp = await ClueBookDatePicker.prompt(currentVal, "Р’С‹Р±РѕСЂ РґР°С‚С‹ Рё РІСЂРµРјРµРЅРё");
    if (timestamp !== null) {
      const input = entry.querySelector(`input[data-field="${field}"]`);
      if (input) {
        input.value = timestamp;
        input.dispatchEvent(new Event('input', { bubbles: true }));
        await app._saveDataRaw(tab, entryId, field, timestamp);

        // Instant UI update
        if (TimeService.isActive()) {
          const formatted = TimeService.formatTimestamp(timestamp).fullStr;
          
          const pickBtn = entry.querySelector(`button[data-action="pickDate"][data-field="${field}"]`);
          if (pickBtn) {
            let icon = "far fa-calendar-alt";
            let color = "#fff";
            if (field === "startTimestamp") { icon = "fas fa-play"; color = "#4caf50"; }
            if (field === "endTimestamp") { icon = "fas fa-stop"; color = "#ff5252"; }
            pickBtn.innerHTML = `<i class="${icon}" style="color: ${color};"></i> ${formatted}`;
            
            let trashBtn = entry.querySelector(`button[data-action="clearDate"][data-field="${field}"]`);
            if (!trashBtn) {
              trashBtn = document.createElement("button");
              trashBtn.type = "button";
              trashBtn.dataset.action = "clearDate";
              trashBtn.dataset.field = field;
              trashBtn.title = "РЈРґР°Р»РёС‚СЊ РґР°С‚Сѓ";
              trashBtn.style.cssText = "flex: 0 0 30px; padding: 2px; background: rgba(255,0,0,0.2); border: 1px solid rgba(255,0,0,0.5); border-radius: 4px; color: #ff5252;";
              if (field === "deadlineTimestamp") trashBtn.style.height = "30px";
              trashBtn.innerHTML = `<i class="fas fa-trash"></i>`;
              pickBtn.parentElement.appendChild(trashBtn);
            } else {
              trashBtn.style.display = "";
            }
          }
        }
      }
    }
  }

  static async _onClearDate(event, target) {
    event.preventDefault();
    const field = target.dataset.field; 
    const entry = target.closest('.cluebook-entry');
    const entryId = entry.dataset.entryId;
    const tab = entry.dataset.sourceTab;
    const app = Array.from(foundry.applications.instances.values()).find(w => w.constructor.name === "ClueBookApp");
    
    const input = entry ? entry.querySelector(`input[data-field="${field}"]`) : null;
    if (input && app) {
      input.value = "";
      input.dispatchEvent(new Event('input', { bubbles: true }));
      await app._saveDataRaw(tab, entryId, field, null);

      // Instant UI update
      const pickBtn = entry.querySelector(`button[data-action="pickDate"][data-field="${field}"]`);
      if (pickBtn) {
        let defaultText = game.i18n.localize("CLUEBOOK.DatePicker.Date");
        if (field === "deadlineTimestamp") defaultText = game.i18n.localize("CLUEBOOK.DatePicker.Deadline");
        if (field === "startTimestamp") defaultText = game.i18n.localize("CLUEBOOK.DatePicker.Start");
        if (field === "endTimestamp") defaultText = game.i18n.localize("CLUEBOOK.DatePicker.End");
        
        let icon = "far fa-calendar-alt";
        let color = "#fff";
        if (field === "startTimestamp") { icon = "fas fa-play"; color = "#4caf50"; }
        if (field === "endTimestamp") { icon = "fas fa-stop"; color = "#ff5252"; }
        
        pickBtn.innerHTML = `<i class="${icon}" style="color: ${color};"></i> ${defaultText}`;
      }
      
      const trashBtn = entry.querySelector(`button[data-action="clearDate"][data-field="${field}"]`);
      if (trashBtn) trashBtn.style.display = "none";
    }
  }

};





