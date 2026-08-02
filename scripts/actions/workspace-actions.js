import { ClueBookEditDialog } from "../edit-dialog.js";
import { ClueBookSocket } from "../socket.js";
import { ClueBookTagManager } from "../tag-manager.js";

import { TimeService } from "../services/time-service.js";
export const ClueBookWorkspaceActionsMixin = (Base) => class extends Base {
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
    if (this.state.activeWorkspace === "personal" || this.state.activeWorkspace.startsWith("personal_")) {
      const confirmed = await foundry.applications.api.DialogV2.confirm({
        window: { title: game.i18n.localize("CLUEBOOK.AppActions.DeleteBoardTitle") },
        content: game.i18n.localize("CLUEBOOK.AppActions.DeletePersonalPrompt") || game.i18n.format("CLUEBOOK.AppActions.DeleteBoardPrompt", { name: game.i18n.localize("CLUEBOOK.Workspace.Personal") }),
        rejectClose: false
      });
      if (!confirmed) return;
      
      await game.user.unsetFlag("ClueBook", "data");
      await game.user.unsetFlag("ClueBook", "settings");
      this.state.activeWorkspace = "personal";
      this.render({ parts: ["content"] });
      return;
    }

    if (!game.user.isGM) {
      ui.notifications.warn(game.i18n.localize("CLUEBOOK.AppActions.OnlyGMCanDeleteBoards"));
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

  static async _onImportJSON(event, target) {
    const content = `
      <p>${game.i18n.localize("CLUEBOOK.AppActions.ImportAIPrompt")}</p>
      <div style="margin-bottom: 15px;">
        <input type="file" id="cb-import-file" accept=".json" style="width: 100%;">
      </div>
      <p style="text-align: center; margin-bottom: 5px; font-weight: bold;">${game.i18n.localize("CLUEBOOK.AppActions.Or")}</p>
      <textarea id="cb-import-text" style="width: 100%; height: 200px; font-family: monospace;"></textarea>
    `;

    const jsonStr = await foundry.applications.api.DialogV2.wait({
      window: { title: game.i18n.localize("CLUEBOOK.AppActions.ImportAITitle"), resizable: true },
      position: { width: 600, height: "auto" },
      content: content,
      buttons: [
        {
          action: "import",
          label: game.i18n.localize("CLUEBOOK.AppActions.ImportBtn"),
          icon: "fas fa-file-import",
          callback: async (event, button, dialog) => {
            const fileInput = (dialog.element || document).querySelector("#cb-import-file");
            const textInput = (dialog.element || document).querySelector("#cb-import-text");
            
            if (fileInput && fileInput.files.length > 0) {
              const file = fileInput.files[0];
              const text = await file.text();
              return text;
            } else if (textInput && textInput.value.trim() !== "") {
              return textInput.value;
            } else {
              return null;
            }
          }
        },
        {
          action: "cancel",
          label: game.i18n.localize("CLUEBOOK.AppActions.Cancel"),
          icon: "fas fa-times",
          callback: () => null
        }
      ],
      rejectClose: false
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
            // Overwrite the card completely
            const targetTab = entry.tab || existingTab;
            const updatedEntry = { ...entry };
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

          // Create new entry using imported ID or generate one
          const realId = tempId || foundry.utils.randomID();
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
    if (TimeService.isActive()) {
      const currentTs = game.time.worldTime;
      const fmt = TimeService.formatTimestamp(game.time.worldTime);
      calendarInfo = game.i18n.format("CLUEBOOK.AppActions.AIPromptCalendarActive", {
        date: fmt.date,
        time: fmt.time,
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
      game.clipboard.copyPlainText(formatText);
      ui.notifications.info(game.i18n.localize("CLUEBOOK.AppActions.FormatCopied"));
    } catch (err) {
      console.error(err);
      ui.notifications.error(game.i18n.localize("CLUEBOOK.AppActions.FormatCopyError"));
    }
  }

}
