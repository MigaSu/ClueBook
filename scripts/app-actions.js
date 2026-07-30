import { ClueBookEditDialog } from "./edit-dialog.js";
import { ClueBookSocket } from "./socket.js";
import { ClueBookTagManager } from "./tag-manager.js";

export const ClueBookActionsMixin = (Base) => class extends Base {
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
    const entryElement = target.closest('.cluebook-entry');
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
    const entry = target.closest('.cluebook-entry');
    const entryId = entry.dataset.entryId;
    const sourceTab = entry.dataset.sourceTab || this.state.activeTab;
    
    let data = this._getWorkspaceData();
    
    const currentEntry = data[sourceTab]?.[entryId];
    if (!currentEntry) return;
    
    await this._saveDataRaw(sourceTab, entryId, "isHidden", !currentEntry.isHidden);
    this.render({ parts: ["content"] });
  }

  static async _onShareOverlay(event, target) {
    event.stopPropagation();
    const entryElement = target.closest('.cluebook-entry');
    const entryId = entryElement.dataset.entryId;
    const sourceTab = entryElement.dataset.sourceTab || this.state.activeTab;
    
    let data = this._getWorkspaceData();
    
    const entry = data[sourceTab]?.[entryId];
    if (!entry) return;
    
    // Check if players have observer access to the board
    let canPlayersSee = false;
    if (this.state.activeWorkspace !== "personal" && !this.state.activeWorkspace.startsWith("personal_")) {
      const journal = this._getWorkspaceJournal();
      if (journal && journal.ownership.default >= CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER) {
        canPlayersSee = true;
      }
    }
    
    // Automatically make it public if it was hidden and players have access
    if (entry.isHidden && canPlayersSee) {
      await this._saveDataRaw(sourceTab, entryId, "isHidden", false);
      entry.isHidden = false;
      this.render({ parts: ["content"] });
    }
    
    // Process text for chat (enrich UUID links)
    const TE = foundry.applications?.ux?.TextEditor?.implementation ?? TextEditor;
    const processUUIDs = (text) => {
      if (!text) return text;
      const uuidRegex = /(?<!@UUID\[)\b(?:Actor|Item|JournalEntry|JournalEntryPage|Scene|RollTable|Cards|Macro|Playlist|User)(?:\.[a-zA-Z0-9_-]+)+\b/g;
      let newText = text.replace(uuidRegex, match => `@UUID[${match}]`);
      const compendiumRegex = /(?<!@UUID\[)\bCompendium\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+(?:\.[a-zA-Z0-9_-]+)+\b/g;
      newText = newText.replace(compendiumRegex, match => `@UUID[${match}]`);
      // Parse qnmention
      newText = newText.replace(/\[\[qnmention:([^:]+):([^\]]+)\]\](?:\{([^}]*)\})?/g, (match, id, name, customText) => {
        const displayText = customText || name;
        return `<a class="content-link cb-mention-link" data-mention-id="${id}"><i class="fas fa-book"></i> ${displayText}</a>`;
      });
      return newText;
    };
    
    const enrich = async (t) => await TE.enrichHTML(processUUIDs(t), { async: true });
    
    let contentHTML = `<div class="cb-overlay-inner color-${entry.color || 'yellow'}">`;
    
    if (sourceTab === "notes") {
      contentHTML += `<div class="cb-overlay-body">${await enrich(entry.text)}</div>`;
    } else if (sourceTab === "npc") {
      const npcIcon = entry.isDead ? "fa-skull" : "fa-user";
      contentHTML += `<h3 class="cb-overlay-title"><i class="fas ${npcIcon}"></i> ${entry.name ? processUUIDs(entry.name) : game.i18n.localize("CLUEBOOK.AppActions.UnknownNPC")}</h3>`;
      if (entry.isDead) contentHTML += `<p><strong><i class="fas fa-skull" style="color:#ff5252;"></i> ${game.i18n.localize("CLUEBOOK.AppActions.Status")}:</strong> ${game.i18n.localize("CLUEBOOK.AppActions.Dead")}</p>`;
      if (entry.location) contentHTML += `<p><strong>${game.i18n.localize("CLUEBOOK.AppActions.Location")}:</strong> ${await enrich(entry.location)}</p>`;
      if (entry.attitude) contentHTML += `<p><strong>${game.i18n.localize("CLUEBOOK.AppActions.Attitude")}:</strong> ${await enrich(entry.attitude)}</p>`;
      if (entry.note) contentHTML += `<div class="cb-overlay-body">${await enrich(entry.note)}</div>`;
    } else if (sourceTab === "locations") {
      contentHTML += `<h3 class="cb-overlay-title"><i class="fas fa-map-marked-alt"></i> ${entry.name ? processUUIDs(entry.name) : game.i18n.localize("CLUEBOOK.AppActions.UnknownLocation")}</h3>`;
      if (entry.subtitle) contentHTML += `<p><strong><i class="fas fa-map"></i> ${game.i18n.localize("CLUEBOOK.AppActions.Subtitle")}:</strong> ${await enrich(entry.subtitle)}</p>`;
      if (entry.owner) contentHTML += `<p><strong><i class="fas fa-crown"></i> ${game.i18n.localize("CLUEBOOK.AppActions.Owner")}:</strong> ${await enrich(entry.owner)}</p>`;
      if (entry.note) contentHTML += `<div class="cb-overlay-body">${await enrich(entry.note)}</div>`;
    } else if (sourceTab === "quests") {
      const statusIcon = entry.status === "completed" ? "fa-check-circle" : (entry.status === "failed" ? "fa-times-circle" : "fa-clock");
      contentHTML += `<h3 class="cb-overlay-title"><i class="fas fa-scroll"></i> ${game.i18n.localize("CLUEBOOK.AppActions.Quest")} <i class="fas ${statusIcon} cb-status-${entry.status}"></i></h3>`;
      
      if (entry.deadlineTimestamp && window.SimpleCalendar?.api) {
        const scApi = window.SimpleCalendar.api;
        const dt = scApi.timestampToDate(entry.deadlineTimestamp);
        const formatted = scApi.formatDateTime(dt).date + " " + scApi.formatDateTime(dt).time;
        if (entry.timeMode === "at") contentHTML += `<p><strong><i class="fas fa-clock"></i> ${game.i18n.localize("CLUEBOOK.AppActions.StrictlyAt")}:</strong> ${formatted}</p>`;
        else contentHTML += `<p><strong><i class="fas fa-hourglass-end"></i> ${game.i18n.localize("CLUEBOOK.AppActions.DoBy")}:</strong> ${formatted}</p>`;
      } else if (entry.deadline) {
        if (entry.timeMode === "at") contentHTML += `<p><strong><i class="fas fa-clock"></i> ${game.i18n.localize("CLUEBOOK.AppActions.StrictlyAt")}:</strong> ${entry.deadline}</p>`;
        else contentHTML += `<p><strong><i class="fas fa-hourglass-end"></i> ${game.i18n.localize("CLUEBOOK.AppActions.DoBy")}:</strong> ${entry.deadline}</p>`;
      }

      contentHTML += `<div class="cb-overlay-body">${await enrich(entry.text)}</div>`;
    } else if (sourceTab === "timeline") {
      contentHTML += `<h3 class="cb-overlay-title"><i class="fas fa-hourglass-half"></i> ${entry.time || game.i18n.localize("CLUEBOOK.AppActions.UnknownTime")}</h3>`;
      contentHTML += `<div class="cb-overlay-body">${await enrich(entry.event)}</div>`;
    }
    
    contentHTML += `</div>`;
    
    // Broadcast via socket to all players (and self)
    game.socket.emit("module.ClueBook", {
      action: "showOverlay",
      content: contentHTML,
      entry: entry,
      sourceTab: sourceTab
    });
    
    // Show to GM as well
    if (window.ClueBookOverlay) {
      window.ClueBookOverlay.show(contentHTML, entry, sourceTab);
    }
    
    ui.notifications.info(game.i18n.localize("CLUEBOOK.AppActions.SentToOverlay"));
  }

  static async _onActivateScene(event, target) {
    event.stopPropagation();
    event.preventDefault();
    
    if (!game.user.isGM) return;

    const sceneUuid = target.dataset.sceneId;
    if (!sceneUuid) return;

    const scene = await fromUuid(sceneUuid);
    if (!scene) {
      ui.notifications.warn("Scene not found.");
      return;
    }

    if (event.shiftKey) {
      // Activate for everyone
      await scene.activate();
      ui.notifications.info(game.i18n.format("CLUEBOOK.AppActions.SceneActivatedAll", { name: scene.name }));
    } else {
      // Just view
      await scene.view();
      ui.notifications.info(game.i18n.format("CLUEBOOK.AppActions.ScenePreview", { name: scene.name }));
    }
  }

  static async _onOpenActor(event, target) {
    event.stopPropagation();
    event.preventDefault();
    
    if (!game.user.isGM) return;

    const actorUuid = target.dataset.actorId;
    if (!actorUuid) return;

    const actor = await fromUuid(actorUuid);
    if (!actor) {
      ui.notifications.warn("Actor not found.");
      return;
    }

    const gp = window.GinzzzuPortraits;
    const isGinzzuActive = game.modules.get("ginzzzu-portraits")?.active && gp && typeof gp.togglePortrait === "function";

    if (!isGinzzuActive) {
      actor.sheet.render(true);
      return;
    }

    const existingMenu = document.querySelector('.cb-context-menu');
    if (existingMenu) existingMenu.remove();

    const menu = document.createElement('div');
    menu.className = 'cb-context-menu';
    menu.innerHTML = `
      <div class="cb-menu-item" data-action="open-sheet"><i class="fas fa-id-card"></i> ${game.i18n.localize("CLUEBOOK.AppActions.OpenActorSheet")}</div>
      <div class="cb-menu-item" data-action="show-portrait"><i class="fas fa-user-circle"></i> ${game.i18n.localize("CLUEBOOK.AppActions.ShowPortraitGinzzu")}</div>
    `;

    document.body.appendChild(menu);
    menu.style.left = `${event.clientX}px`;
    menu.style.top = `${event.clientY}px`;

    menu.querySelector('[data-action="open-sheet"]').onclick = () => {
      actor.sheet.render(true);
      closeMenu();
    };

    menu.querySelector('[data-action="show-portrait"]').onclick = () => {
      try { gp.togglePortrait(actor); } catch(e) { console.error(e); }
      closeMenu();
    };

    const closeMenu = (e) => {
      if (e && menu.contains(e.target)) return;
      menu.remove();
      document.removeEventListener('click', closeMenu);
      document.removeEventListener('contextmenu', closeMenu);
    };

    setTimeout(() => {
      document.addEventListener('click', closeMenu);
      document.addEventListener('contextmenu', closeMenu);
    }, 0);
  }

  static async _onExportJSON(event, target) {
    let data = {};
    let settingsObj = {};
    const workspaceName = this.state.activeWorkspace !== "personal" 
      ? game.journal.get(this.state.activeWorkspace)?.name || "shared_board"
      : "personal_board";

    if (this.state.activeWorkspace !== "personal") {
      const journal = this._getWorkspaceJournal();
      if (journal) {
        data = journal.getFlag("ClueBook", "data") || {};
        settingsObj = journal.getFlag("ClueBook", "settings") || {};
      }
    } else {
      data = game.user.getFlag("ClueBook", "data") || {};
      settingsObj = game.user.getFlag("ClueBook", "settings") || {};
    }

    const exportData = {
      entries: [],
      links: Object.values(data.links || {}),
      tags: Object.values(settingsObj.tags || {})
    };

    // Flatten entries across tabs
    for (const [tabKey, tabData] of Object.entries(data)) {
      if (tabKey === "links" || tabKey === "board" || tabKey === "search") continue;
      for (const [id, entry] of Object.entries(tabData || {})) {
        if (!entry) continue;
        exportData.entries.push({
          id,
          tab: tabKey,
          ...entry
        });
      }
    }

    const jsonStr = JSON.stringify(exportData, null, 2);
    
    const content = `
      <p>${game.i18n.localize("CLUEBOOK.AppActions.ExportPrompt")}</p>
      <textarea id="cb-export-textarea" readonly style="width: 100%; height: 250px; font-family: monospace;">${jsonStr}</textarea>
    `;

    new foundry.applications.api.DialogV2({
      window: { title: game.i18n.localize("CLUEBOOK.AppActions.ExportTitle") },
      content: content,
      buttons: [
        {
          action: "download",
          label: game.i18n.localize("CLUEBOOK.AppActions.DownloadFile"),
          icon: "fas fa-download",
          callback: () => {
            saveDataToFile(jsonStr, "application/json", `cluebook_${workspaceName.replace(/\s+/g, '_')}.json`);
            ui.notifications.info(game.i18n.localize("CLUEBOOK.AppActions.BoardExported"));
          }
        },
        {
          action: "clipboard",
          label: game.i18n.localize("CLUEBOOK.AppActions.CopyToClipboard"),
          icon: "fas fa-clipboard",
          callback: () => {
            game.clipboard.copyPlainText(jsonStr);
            ui.notifications.info(game.i18n.localize("CLUEBOOK.AppActions.CopiedToClipboard"));
          }
        }
      ]
    }).render(true);
  }

  static async _onEditWorkspace(event, target) {
    const isPersonal = this.state.activeWorkspace === "personal" || this.state.activeWorkspace.startsWith("personal_");
    
    let currentName;
    let settingsObj = {};
    let isOwner = false;
    let journal = null;

    if (isPersonal) {
      if (this.state.activeWorkspace.startsWith("personal_")) {
        ui.notifications.warn(game.i18n.localize("CLUEBOOK.AppActions.CannotRenameOthers"));
        return;
      }
      currentName = game.user.getFlag("ClueBook", "personalWorkspaceName") || game.i18n.localize("CLUEBOOK.Workspace.Personal");
      settingsObj = game.user.getFlag("ClueBook", "settings") || {};
      isOwner = true;
    } else {
      journal = game.journal.get(this.state.activeWorkspace);
      if (!journal) return;
      isOwner = journal.isOwner;
      if (!isOwner) {
        ui.notifications.warn(game.i18n.localize("CLUEBOOK.AppActions.OnlyOwnerCanEditSettings"));
        return;
      }
      currentName = journal.name || "shared_board";
      settingsObj = journal.getFlag("ClueBook", "settings") || {};
    }

    let accessHTML = '';
    if (!isPersonal) {
      const currentOwnership = journal.ownership || {};
      let userCheckboxes = '';
      game.users.forEach(u => {
        if (u.id === game.user.id || u.isGM) return; // Self and GM always have access
        const hasAccess = currentOwnership[u.id] === 3;
        userCheckboxes += `<label style="display:block; margin-bottom: 5px;"><input type="checkbox" name="user_${u.id}" ${hasAccess ? 'checked' : ''}> ${u.name}</label>`;
      });

      accessHTML = `
            <div class="form-group" style="margin-top: 10px;">
              <label>${game.i18n.localize("CLUEBOOK.AppActions.WhoHasAccess")}</label>
              <div style="max-height: 120px; overflow-y: auto; background: rgba(0,0,0,0.2); padding: 5px; border-radius: 5px; margin-top: 5px; font-size: 13px;">
                ${userCheckboxes || game.i18n.localize("CLUEBOOK.AppActions.NoOtherPlayers")}
              </div>
            </div>
            <div class="setting-row flex-checkbox" style="margin-top: 15px;">
              <label for="cb-edit-ws-readonly">${game.i18n.localize("CLUEBOOK.AppActions.ReadOnlyForPlayers")}</label>
              <div class="cb-toggle">
                <input type="checkbox" name="readOnly" id="cb-edit-ws-readonly" ${settingsObj.readOnly ? 'checked' : ''}>
                <label for="cb-edit-ws-readonly"></label>
              </div>
            </div>
      `;
    }

    const content = `
      <form class="cluebook-board-settings-form">
        <div class="settings-grid" style="grid-template-columns: 1fr; max-height: 50vh; overflow-y: auto;">
          <!-- Access & General -->
          <div class="settings-card">
            <h3><i class="fas fa-lock"></i> ${game.i18n.localize("CLUEBOOK.Settings.CategoryAccess")}</h3>
            <div class="setting-row">
              <label>${game.i18n.localize("CLUEBOOK.AppActions.BoardName")}</label>
              <input type="text" name="workspaceName" value="${currentName}" required autofocus class="setting-input cluebook-input" style="flex: 0 0 auto; max-width: 60%;">
            </div>
            ${accessHTML}
            <div class="setting-row flex-checkbox" style="margin-top: 15px;">
              <label for="cb-edit-ws-gm-vis">${game.i18n.localize("CLUEBOOK.Settings.HideGMVisibilityBtn")}</label>
              <div class="cb-toggle">
                <input type="checkbox" name="hideGMVisibilityBtn" id="cb-edit-ws-gm-vis" ${(settingsObj.hideGMVisibilityBtn === true) ? 'checked' : ''}>
                <label for="cb-edit-ws-gm-vis"></label>
              </div>
            </div>
            <div class="setting-row flex-checkbox">
              <label for="cb-edit-ws-gm-over">${game.i18n.localize("CLUEBOOK.Settings.HideGMOverlayBtn")}</label>
              <div class="cb-toggle">
                <input type="checkbox" name="hideGMOverlayBtn" id="cb-edit-ws-gm-over" ${(settingsObj.hideGMOverlayBtn === true) ? 'checked' : ''}>
                <label for="cb-edit-ws-gm-over"></label>
              </div>
            </div>
            <div class="setting-row flex-checkbox">
              <label for="cb-edit-ws-gm-send">${game.i18n.localize("CLUEBOOK.Settings.HideSendToBoardBtn")}</label>
              <div class="cb-toggle">
                <input type="checkbox" name="hideSendToBoardBtn" id="cb-edit-ws-gm-send" ${(settingsObj.hideSendToBoardBtn === true) ? 'checked' : ''}>
                <label for="cb-edit-ws-gm-send"></label>
              </div>
            </div>
          </div>

          <!-- Board Appearance -->
          <div class="settings-card">
            <h3><i class="fas fa-project-diagram"></i> ${game.i18n.localize("CLUEBOOK.Settings.CategoryBoardAppearance")}</h3>
            
            <div class="setting-row">
              <label>${game.i18n.localize("CLUEBOOK.Settings.LinkColor")}</label>
              <input type="color" name="theme_linkColor" value="${settingsObj.theme?.linkColor || '#ff5252'}" style="height: 30px; cursor: pointer;" class="setting-input">
            </div>
            
            <div class="setting-row">
              <label>${game.i18n.localize("CLUEBOOK.Settings.LinkStyle")}</label>
              <select name="theme_linkStyle" class="setting-input cluebook-input">
                <option value="solid" ${(settingsObj.theme?.linkStyle === "solid") ? 'selected' : ''}>${game.i18n.localize("CLUEBOOK.Settings.LinkStyleSolid")}</option>
                <option value="6,4" ${(!settingsObj.theme?.linkStyle || settingsObj.theme?.linkStyle === "6,4") ? 'selected' : ''}>${game.i18n.localize("CLUEBOOK.Settings.LinkStyleDashed")}</option>
                <option value="2,4" ${(settingsObj.theme?.linkStyle === "2,4") ? 'selected' : ''}>${game.i18n.localize("CLUEBOOK.Settings.LinkStyleDotted")}</option>
              </select>
            </div>
            
            <div class="setting-row flex-checkbox">
              <label for="cb-sw-grid">${game.i18n.localize("CLUEBOOK.Settings.SnapToGrid")}</label>
              <div class="cb-toggle">
                <input type="checkbox" name="theme_snapToGrid" id="cb-sw-grid" ${settingsObj.theme?.snapToGrid ? 'checked' : ''}>
                <label for="cb-sw-grid"></label>
              </div>
            </div>
          </div>

          <!-- Interaction -->
          <div class="settings-card">
            <h3><i class="fas fa-mouse-pointer"></i> ${game.i18n.localize("CLUEBOOK.Settings.CategoryInteraction")}</h3>
            <div class="setting-row flex-checkbox">
              <label for="cb-sw-hover">${game.i18n.localize("CLUEBOOK.Settings.HoverHighlight")}</label>
              <div class="cb-toggle">
                <input type="checkbox" name="theme_hoverHighlight" id="cb-sw-hover" ${(settingsObj.theme?.hoverHighlight !== false) ? 'checked' : ''}>
                <label for="cb-sw-hover"></label>
              </div>
            </div>
            
            <div class="setting-row">
              <label>${game.i18n.localize("CLUEBOOK.Settings.HoverDelay")}</label>
              <input type="number" name="theme_hoverDelay" value="${settingsObj.theme?.hoverDelay ?? 1000}" min="100" max="3000" step="100" class="setting-input cluebook-input" style="width:80px;">
            </div>
            
            <div class="setting-row">
              <label>${game.i18n.localize("CLUEBOOK.Settings.HighlightDuration")}</label>
              <input type="number" name="theme_highlightDuration" value="${settingsObj.theme?.highlightDuration ?? 2}" min="1" max="10" step="1" class="setting-input cluebook-input" style="width:80px;">
            </div>
          </div>

          <!-- Data / Colors -->
          <div class="settings-card">
            <h3><i class="fas fa-database"></i> ${game.i18n.localize("CLUEBOOK.Settings.CategoryData")}</h3>
            
            <h4 style="margin: 0 0 5px 0; font-size: 13px; color: var(--cb-text-muted); border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom:3px;">${game.i18n.localize("CLUEBOOK.Settings.DefaultColors")}</h4>
            
            <div class="setting-row">
              <label>${game.i18n.localize("CLUEBOOK.Settings.Notes")}</label>
              <select name="dc_notes" class="setting-input cluebook-input">
                ${["yellow","green","blue","red","purple","orange","teal","pink","brown"].map(c => `<option value="${c}" ${(settingsObj.defaultColors?.notes === c || (!settingsObj.defaultColors?.notes && c === "yellow")) ? 'selected' : ''}>${game.i18n.localize("CLUEBOOK.Colors." + c.charAt(0).toUpperCase() + c.slice(1))}</option>`).join('')}
              </select>
            </div>
            <div class="setting-row">
              <label>${game.i18n.localize("CLUEBOOK.Settings.Characters")}</label>
              <select name="dc_npc" class="setting-input cluebook-input">
                ${["yellow","green","blue","red","purple","orange","teal","pink","brown"].map(c => `<option value="${c}" ${(settingsObj.defaultColors?.npc === c || (!settingsObj.defaultColors?.npc && c === "green")) ? 'selected' : ''}>${game.i18n.localize("CLUEBOOK.Colors." + c.charAt(0).toUpperCase() + c.slice(1))}</option>`).join('')}
              </select>
            </div>
            <div class="setting-row">
              <label>${game.i18n.localize("CLUEBOOK.Settings.Locations")}</label>
              <select name="dc_locations" class="setting-input cluebook-input">
                ${["yellow","green","blue","red","purple","orange","teal","pink","brown"].map(c => `<option value="${c}" ${(settingsObj.defaultColors?.locations === c || (!settingsObj.defaultColors?.locations && c === "blue")) ? 'selected' : ''}>${game.i18n.localize("CLUEBOOK.Colors." + c.charAt(0).toUpperCase() + c.slice(1))}</option>`).join('')}
              </select>
            </div>
            <div class="setting-row">
              <label>${game.i18n.localize("CLUEBOOK.Settings.Quests")}</label>
              <select name="dc_quests" class="setting-input cluebook-input">
                ${["yellow","green","blue","red","purple","orange","teal","pink","brown"].map(c => `<option value="${c}" ${(settingsObj.defaultColors?.quests === c || (!settingsObj.defaultColors?.quests && c === "purple")) ? 'selected' : ''}>${game.i18n.localize("CLUEBOOK.Colors." + c.charAt(0).toUpperCase() + c.slice(1))}</option>`).join('')}
              </select>
            </div>
            <div class="setting-row">
              <label>${game.i18n.localize("CLUEBOOK.Settings.Timeline")}</label>
              <select name="dc_timeline" class="setting-input cluebook-input">
                ${["yellow","green","blue","red","purple","orange","teal","pink","brown"].map(c => `<option value="${c}" ${(settingsObj.defaultColors?.timeline === c || (!settingsObj.defaultColors?.timeline && c === "red")) ? 'selected' : ''}>${game.i18n.localize("CLUEBOOK.Colors." + c.charAt(0).toUpperCase() + c.slice(1))}</option>`).join('')}
              </select>
            </div>
          </div>
        </div>
      </form>
    `;

    new foundry.applications.api.DialogV2({
      window: { title: game.i18n.localize("CLUEBOOK.AppActions.BoardSettings") },
      content: content,
      buttons: [
        {
          action: "save",
          label: game.i18n.localize("CLUEBOOK.AppActions.Save"),
          icon: "fas fa-save",
          default: true,
          callback: async (event, button, dialog) => {
            const form = button.form;
            const newName = form.elements.workspaceName?.value?.trim();
            if (!newName) return;

            const isReadOnly = form.elements.readOnly?.checked ?? false;
            const hideGMVisibilityBtn = form.elements.hideGMVisibilityBtn?.checked ?? false;
            const hideGMOverlayBtn = form.elements.hideGMOverlayBtn?.checked ?? false;
            const hideSendToBoardBtn = form.elements.hideSendToBoardBtn?.checked ?? false;
            
            const updatedSettings = {
                ...settingsObj,
                readOnly: isReadOnly,
                hideGMVisibilityBtn: hideGMVisibilityBtn,
                hideGMOverlayBtn: hideGMOverlayBtn,
                hideSendToBoardBtn: hideSendToBoardBtn,
                theme: {
                  ...(settingsObj.theme || {}),
                  linkColor: form.elements.theme_linkColor?.value || '#ff5252',
                  linkStyle: form.elements.theme_linkStyle?.value || '6,4',
                  snapToGrid: form.elements.theme_snapToGrid?.checked ?? false,
                  hoverHighlight: form.elements.theme_hoverHighlight?.checked ?? true,
                  hoverDelay: parseInt(form.elements.theme_hoverDelay?.value) || 1000,
                  highlightDuration: parseInt(form.elements.theme_highlightDuration?.value) || 2
                },
                defaultColors: {
                  ...(settingsObj.defaultColors || {}),
                  notes: form.elements.dc_notes?.value || "yellow",
                  npc: form.elements.dc_npc?.value || "green",
                  locations: form.elements.dc_locations?.value || "blue",
                  quests: form.elements.dc_quests?.value || "purple",
                  timeline: form.elements.dc_timeline?.value || "red"
                }
            };

            if (isPersonal) {
              await game.user.setFlag("ClueBook", "personalWorkspaceName", newName);
              await game.user.setFlag("ClueBook", "settings", updatedSettings);
            } else {
              const ownership = { default: journal.ownership.default || 0 };
              ownership[game.user.id] = 3;
              game.users.filter(u => u.isGM).forEach(gm => ownership[gm.id] = 3);
  
              form.querySelectorAll('input[type="checkbox"]').forEach(input => {
                if (input.name.startsWith("user_")) {
                  const userId = input.name.split('_')[1];
                  if (userId) {
                    ownership[userId] = input.checked ? 3 : 0;
                  }
                }
              });
  
              const updates = { 
                "flags.ClueBook.isWorkspace": true,
                "flags.ClueBook.settings": updatedSettings
              };
              await journal.update(updates);
              ClueBookSocket.updateBoard(journal.id, newName, ownership);
            }

            this.render({ parts: ["content"] });
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

  static async _onDeleteWorkspace(event, target) {
    if (!game.user.isGM) {
      ui.notifications.warn(game.i18n.localize("CLUEBOOK.AppActions.OnlyGMCanDeleteBoards"));
      return;
    }
    if (this.state.activeWorkspace === "personal" || this.state.activeWorkspace.startsWith("personal_")) {
      ui.notifications.warn(game.i18n.localize("CLUEBOOK.AppActions.CannotDeletePersonal"));
      return;
    }

    const journal = this._getWorkspaceJournal();
    if (!journal) return;

    const confirmed = await foundry.applications.api.DialogV2.confirm({
      window: { title: game.i18n.localize("CLUEBOOK.AppActions.DeleteBoardTitle") },
      content: game.i18n.format("CLUEBOOK.AppActions.DeleteBoardPrompt", { name: journal.name }),
      rejectClose: false
    });
    if (!confirmed) return;

    await journal.delete();
    this.state.activeWorkspace = "personal";
    await game.user.setFlag("ClueBook", "lastWorkspace", "personal");
    this.render({ parts: ["content"] });
  }

  static async _onJumpToBoard(event, target) {
    const entry = target.closest('.cluebook-entry');
    const entryId = entry.dataset.entryId;
    const sourceTab = entry.dataset.sourceTab || this.state.activeTab;
    
    let data = this._getWorkspaceData();
    
    const entryData = data[sourceTab]?.[entryId];
    if (!entryData || !entryData.onBoard) return;
    
    const bx = entryData.boardX || 0;
    const by = entryData.boardY || 0;
    
    const zoom = 0.7; // Fixed zoom
    const W = this.position.width;
    const H = this.position.height - 50; // offset for tabs
    
    // Calculate card center dynamically from DOM if card exists
    const cardEl = this.element?.querySelector(`.cluebook-entry[data-entry-id="${entryId}"]`);
    const cardW = cardEl?.offsetWidth || 280;
    const cardH = cardEl?.offsetHeight || 160;
    const cardCenterX = bx + (cardW / 2);
    const cardCenterY = by + (cardH / 2);
    
    const panX = W / 2 - (cardCenterX * zoom);
    const panY = H / 2 - (cardCenterY * zoom);
    
    this.state.camera = { zoom, panX, panY };
    this.state.activeTab = "board";
    this.state.highlightedEntryId = entryId;
    
    // Update DB with new camera
    game.user.update({ "flags.ClueBook.boardCamera": this.state.camera });
    
    this.render({ parts: ["content"] });
    
    const settings = this.getSettings();
    const durationMs = (settings.theme.highlightDuration || 2) * 1000;
    setTimeout(() => {
       if (this.state.highlightedEntryId === entryId) {
          this.state.highlightedEntryId = null;
          const el = this.element.querySelector(`.cluebook-entry[data-entry-id="${entryId}"]`);
          if (el) el.classList.remove('is-highlighted');
       }
    }, durationMs);
  }

  static async _onJumpToLinked(event, target) {
    event.stopPropagation();
    const targetId = target.dataset.targetId;
    if (!targetId) return;

    let data = this._getWorkspaceData();

    let targetEntry = null;
    let targetTab = null;

    for (const [tabKey, tabData] of Object.entries(data)) {
      if (tabKey === "links" || tabKey === "search" || tabKey === "board") continue;
      if (tabData?.[targetId]) {
        targetEntry = tabData[targetId];
        targetTab = tabKey;
        break;
      }
    }

    if (!targetEntry) return;

    // Smart Jump Logic
    if (targetEntry.onBoard) {
      const bx = targetEntry.boardX || 0;
      const by = targetEntry.boardY || 0;
      const zoom = 0.7; 
      const W = this.position.width;
      const H = this.position.height - 50;
      const cardEl = this.element?.querySelector(`.cluebook-entry[data-entry-id="${targetId}"]`);
      const cardW = cardEl?.offsetWidth || 280;
      const cardH = cardEl?.offsetHeight || 160;
      const panX = W / 2 - ((bx + (cardW / 2)) * zoom);
      const panY = H / 2 - ((by + (cardH / 2)) * zoom);
      
      this.state.camera = { zoom, panX, panY };
      this.state.activeTab = "board";
      game.user.update({ "flags.ClueBook.boardCamera": this.state.camera });
    } else {
      this.state.activeTab = targetTab;
    }
    
    await game.user.setFlag("ClueBook", "lastTab", this.state.activeTab);
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
  }

  static async _onJumpToTab(event, target) {
    event.stopPropagation();
    const entry = target.closest('.cluebook-entry');
    if (!entry) return;
    const entryId = entry.dataset.entryId;
    const sourceTab = entry.dataset.sourceTab;
    if (!sourceTab || sourceTab === "board") return;
    
    this.state.activeTab = sourceTab;
    await game.user.setFlag("ClueBook", "lastTab", sourceTab);
    this.state.highlightedEntryId = entryId;
    await this.render();
    
    setTimeout(() => {
      const el = this.element?.querySelector(`.cluebook-entry[data-entry-id="${entryId}"]`);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 80);
    
    const settings = this.getSettings();
    const durationMs = (settings.theme.highlightDuration || 2) * 1000;
    setTimeout(() => {
       if (this.state.highlightedEntryId === entryId) {
          this.state.highlightedEntryId = null;
          const el = this.element?.querySelector(`.cluebook-entry[data-entry-id="${entryId}"]`);
          if (el) el.classList.remove('is-highlighted');
       }
    }, durationMs);
  }

  static async _onDeleteLink(event, target) {
    event.stopPropagation();
    const targetId = target.dataset.targetId;
    const entry = target.closest('.cluebook-entry');
    const sourceId = entry.dataset.entryId;
    if (!targetId || !sourceId) return;

    let links = this._getWorkspaceLinks();
    const [a, b] = [sourceId, targetId].sort();
    const key = `${a}_${b}`;

    if (links[key]) {
      await this._updateWorkspaceData({ [`flags.ClueBook.data.links.-=${key}`]: null });
      ui.notifications.info(game.i18n.localize("CLUEBOOK.AppActions.LinkDeleted"));
      this.render({ parts: ["content"] });
    }
  }



  static async _onImportJSON(event, target) {
    const content = `
      <p>${game.i18n.localize("CLUEBOOK.AppActions.ImportAIPrompt")}</p>
      <div style="margin-bottom: 15px;">
        <input type="file" id="cb-import-file" accept=".json" style="width: 100%;">
      </div>
      <p style="text-align: center; margin-bottom: 5px; font-weight: bold;">${game.i18n.localize("CLUEBOOK.AppActions.Or")}</p>
      <textarea id="cb-import-text" style="width: 100%; height: 200px; font-family: monospace;"></textarea>
    `;

    const jsonStr = await new Promise((resolve) => {
      new foundry.applications.api.DialogV2({
        window: { title: game.i18n.localize("CLUEBOOK.AppActions.ImportAITitle"), resizable: true },
        position: { width: 600, height: "auto" },
        content: content,
        buttons: [
          {
            action: "import",
            label: game.i18n.localize("CLUEBOOK.AppActions.ImportBtn"),
            icon: "fas fa-file-import",
            callback: async (event, button, dialog) => {
              const fileInput = document.getElementById("cb-import-file");
              const textInput = document.getElementById("cb-import-text");
              
              if (fileInput && fileInput.files.length > 0) {
                const file = fileInput.files[0];
                const text = await file.text();
                resolve(text);
              } else if (textInput && textInput.value.trim() !== "") {
                resolve(textInput.value);
              } else {
                resolve(null);
              }
            }
          },
          {
            action: "cancel",
            label: game.i18n.localize("CLUEBOOK.AppActions.Cancel"),
            icon: "fas fa-times",
            callback: () => resolve(null)
          }
        ],
        close: () => resolve(null)
      }).render(true);
    });

    if (!jsonStr) return;

    try {
      const parsed = JSON.parse(jsonStr);
      if (!parsed.entries || !Array.isArray(parsed.entries)) {
        ui.notifications.error(game.i18n.localize("CLUEBOOK.AppActions.ImportAIErrorArray"));
        return;
      }

      const updateData = {};
      const idMap = {};
      
      let data = {};
      let settingsObj = {};
      let targetJournal = null;
      if (this.state.activeWorkspace !== "personal") {
        targetJournal = this._getWorkspaceJournal();
        if (targetJournal) {
          data = targetJournal.getFlag("ClueBook", "data") || {};
          settingsObj = targetJournal.getFlag("ClueBook", "settings") || {};
        }
      } else {
        data = game.user.getFlag("ClueBook", "data") || {};
        settingsObj = game.user.getFlag("ClueBook", "settings") || {};
      }

      // Process and merge tags dictionary from parsed.tags and entry.tags
      const existingTags = { ...(settingsObj.tags || {}) };
      const tagIdMap = {};
      const tagUpdates = {};

      if (parsed.tags) {
        const incomingTags = Array.isArray(parsed.tags) ? parsed.tags : Object.values(parsed.tags);
        for (const t of incomingTags) {
          if (!t) continue;
          const tagName = typeof t === "string" ? t.trim() : (t.name ? t.name.trim() : "");
          if (!tagName) continue;

          let match = Object.values(existingTags).find(ex => ex && ex.name.toLowerCase() === tagName.toLowerCase());
          if (match) {
            if (typeof t === "object" && t.id) tagIdMap[t.id] = match.id;
            tagIdMap[tagName] = match.id;
          } else {
            const newTagId = (typeof t === "object" && t.id) ? t.id : foundry.utils.randomID();
            const tagObj = {
              id: newTagId,
              name: tagName,
              color: (typeof t === "object" && t.color) ? t.color : "#7b61ff",
              isSecret: (typeof t === "object" && t.isSecret) ? Boolean(t.isSecret) : false
            };
            existingTags[newTagId] = tagObj;
            if (typeof t === "object" && t.id) tagIdMap[t.id] = newTagId;
            tagIdMap[tagName] = newTagId;
            tagUpdates[`flags.ClueBook.settings.tags.${newTagId}`] = tagObj;
          }
        }
      }

      // Process entries
      for (const entry of parsed.entries) {
        // Resolve tags on entries (IDs or Names)
        if (entry.tags && Array.isArray(entry.tags)) {
          const resolvedTags = [];
          for (const rawTag of entry.tags) {
            if (!rawTag) continue;
            const tagStr = String(rawTag).trim();
            if (!tagStr) continue;

            if (tagIdMap[tagStr]) {
              resolvedTags.push(tagIdMap[tagStr]);
            } else if (existingTags[tagStr]) {
              resolvedTags.push(tagStr);
            } else {
              let match = Object.values(existingTags).find(ex => ex && ex.name.toLowerCase() === tagStr.toLowerCase());
              if (match) {
                tagIdMap[tagStr] = match.id;
                resolvedTags.push(match.id);
              } else {
                const newTagId = foundry.utils.randomID();
                const colors = ["#7b61ff", "#2196f3", "#4caf50", "#ff9800", "#e91e63", "#00bcd4"];
                const randomColor = colors[Math.floor(Math.random() * colors.length)];
                const tagObj = {
                  id: newTagId,
                  name: tagStr,
                  color: randomColor,
                  isSecret: false
                };
                existingTags[newTagId] = tagObj;
                tagIdMap[tagStr] = newTagId;
                tagUpdates[`flags.ClueBook.settings.tags.${newTagId}`] = tagObj;
                resolvedTags.push(newTagId);
              }
            }
          }
          entry.tags = resolvedTags;
        }

        const tempId = entry.id;
        const action = entry.action || "create"; // create / update / delete

        let existingTab = null;
        let existingEntry = null;

        if (tempId) {
          for (const tabKey of ["notes", "npc", "quests", "timeline"]) {
            if (data[tabKey]?.[tempId]) {
              existingTab = tabKey;
              existingEntry = data[tabKey][tempId];
              break;
            }
          }
        }

        if (existingEntry) {
          if (action === "delete" || action === "remove") {
            // Delete the card
            updateData[`flags.ClueBook.data.${existingTab}.-=${tempId}`] = null;
            // Also clean up state if selected
            if (this.state.selectedEntryId === tempId) this.state.selectedEntryId = null;
            this.state.selectedEntries.delete(tempId);
          } else {
            // Update the card
            const targetTab = entry.tab || existingTab;
            const updatedEntry = {
              ...existingEntry,
              ...entry
            };
            delete updatedEntry.id;
            delete updatedEntry.tab;
            delete updatedEntry.action;

            if (entry.onBoard !== undefined) {
              updatedEntry.onBoard = entry.onBoard;
            } else if (entry.boardX !== undefined && entry.boardY !== undefined) {
              updatedEntry.onBoard = true;
            }

            if (targetTab !== existingTab) {
              updateData[`flags.ClueBook.data.${existingTab}.-=${tempId}`] = null;
            }
            updateData[`flags.ClueBook.data.${targetTab}.${tempId}`] = updatedEntry;
            idMap[tempId] = tempId; // Map to itself
          }
        } else {
          // If the entry doesn't exist in workspace
          if (action === "delete" || action === "remove") {
            continue; // Skip deleting non-existing entry
          }

          // Create new entry
          const realId = foundry.utils.randomID();
          if (tempId) idMap[tempId] = realId;

          const tab = entry.tab || "notes";
          const newEntry = { ...entry };
          delete newEntry.id;
          delete newEntry.tab;
          delete newEntry.action;

          if (entry.onBoard !== undefined) {
            newEntry.onBoard = entry.onBoard;
          } else if (entry.boardX !== undefined && entry.boardY !== undefined) {
            newEntry.onBoard = true;
          } else {
            newEntry.onBoard = false;
          }

          updateData[`flags.ClueBook.data.${tab}.${realId}`] = newEntry;
        }
      }

      // Process links
      if (parsed.links && Array.isArray(parsed.links)) {
        for (const link of parsed.links) {
          const s = idMap[link.source] || link.source;
          const t = idMap[link.target] || link.target;
          if (s && t) {
            const [a, b] = [s, t].sort();
            const linkId = `${a}_${b}`;
            updateData[`flags.ClueBook.data.links.${linkId}`] = { source: s, target: t, label: link.label || "", style: link.style || "solid", color: link.color || "" };
          }
        }
      } else if (parsed.links && typeof parsed.links === "object") {
        for (const link of Object.values(parsed.links)) {
          const s = idMap[link.source] || link.source;
          const t = idMap[link.target] || link.target;
          if (s && t) {
            const [a, b] = [s, t].sort();
            const linkId = `${a}_${b}`;
            updateData[`flags.ClueBook.data.links.${linkId}`] = { source: s, target: t, label: link.label || "", style: link.style || "solid", color: link.color || "" };
          }
        }
      }

      // Clean up links for deleted entries
      let links = this._getWorkspaceLinks();
      for (const [key, l] of Object.entries(links)) {
        const sourceDeleted = updateData[`flags.ClueBook.data.notes.-=${l.source}`] === null ||
                              updateData[`flags.ClueBook.data.npc.-=${l.source}`] === null ||
                              updateData[`flags.ClueBook.data.quests.-=${l.source}`] === null ||
                              updateData[`flags.ClueBook.data.timeline.-=${l.source}`] === null;
        const targetDeleted = updateData[`flags.ClueBook.data.notes.-=${l.target}`] === null ||
                              updateData[`flags.ClueBook.data.npc.-=${l.target}`] === null ||
                              updateData[`flags.ClueBook.data.quests.-=${l.target}`] === null ||
                              updateData[`flags.ClueBook.data.timeline.-=${l.target}`] === null;
        if (sourceDeleted || targetDeleted) {
          updateData[`flags.ClueBook.data.links.-=${key}`] = null;
        }
      }

      // Second pass: Replace internal links in text fields with new IDs
      for (const [key, entry] of Object.entries(updateData)) {
        if (entry && !key.startsWith('flags.ClueBook.data.links.')) {
          ['text', 'note', 'event', 'gmNotes', 'subtitle', 'owner', 'location', 'attitude'].forEach(field => {
            if (entry[field] && typeof entry[field] === 'string') {
              // Regex matches [[qnmention:OLD_ID:Title]] and replaces OLD_ID with realId
              entry[field] = entry[field].replace(/\[\[qnmention:([^:]+):([^\]]+)\]\](?:\{([^}]*)\})?/g, (match, oldId, name, customText) => {
                const newId = idMap[oldId] || oldId; // fallback to oldId if not mapped (e.g. external link)
                const suffix = customText ? `{${customText}}` : '';
                return `[[qnmention:${newId}:${name}]]${suffix}`;
              });
            }
          });
        }
      }

      if (Object.keys(tagUpdates).length > 0) {
        Object.assign(updateData, tagUpdates);
      }

      await this._updateWorkspaceData(updateData);
      ui.notifications.info(game.i18n.format("CLUEBOOK.AppActions.ImportSuccess", { count: parsed.entries.length }));
      this.render({ parts: ["content"] });

    } catch (err) {
      console.error(err);
      ui.notifications.error(game.i18n.localize("CLUEBOOK.AppActions.ImportJSONError"));
    }
  }

  static async _onCopyDataFormat(event, target) {
    let calendarInfo = "";
    if (window.SimpleCalendar?.api) {
      const scApi = window.SimpleCalendar.api;
      const currentTs = game.time.worldTime;
      const dt = scApi.timestampToDate(currentTs);
      const formatted = scApi.formatDateTime(dt);
      calendarInfo = game.i18n.format("CLUEBOOK.AppActions.AIPromptCalendarActive", {
        date: formatted.date,
        time: formatted.time,
        currentTs: currentTs
      });
    } else {
      calendarInfo = game.i18n.localize("CLUEBOOK.AppActions.AIPromptCalendarInactive");
    }

    const gmNotesFieldText = game.user.isGM ? game.i18n.localize("CLUEBOOK.AppActions.AIPromptGMNotes") : '';

    const formatText = game.i18n.format("CLUEBOOK.AppActions.AIPrompt", {
      calendarInfo: calendarInfo,
      gmNotesFieldText: gmNotesFieldText
    });
    try {
      await navigator.clipboard.writeText(formatText);
      ui.notifications.info(game.i18n.localize("CLUEBOOK.AppActions.FormatCopied"));
    } catch (err) {
      console.error(err);
      ui.notifications.error(game.i18n.localize("CLUEBOOK.AppActions.FormatCopyError"));
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
    const document = this._getWorkspaceJournal() || game.user;
    const currentData = document.getFlag("ClueBook", "data")?.[activeTab] || {};
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
    const entryEl = target.closest('.cluebook-entry');
    if (entryEl && entryEl.dataset.pinned === "true") {
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
    let document = game.user;
    if (activeWorkspace !== "personal") {
      document = game.journal.get(activeWorkspace) || game.user;
    }
    const currentData = document.getFlag("ClueBook", "data")?.[type] || {};
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
        const scApi = window.SimpleCalendar?.api;
        if (scApi) {
          const dt = scApi.timestampToDate(timestamp);
          const formatted = scApi.formatDateTime(dt).date + " " + scApi.formatDateTime(dt).time;
          
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

