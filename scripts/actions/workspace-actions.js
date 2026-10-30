import { ENTRY_TABS, isEntryTab, sanitizeEntryForStorage } from "../data-models.js";
import { WorkspaceRepository } from "../services/workspace-repository.js";
import { WorkspaceAccessService } from "../services/workspace-access-service.js";
import { TimeService } from "../services/time-service.js";
import { TextEnrichmentService } from "../services/text-enrichment-service.js";

export const ClueBookWorkspaceActionsMixin = (Base) => class extends Base {
  static async _onExportJSON(event, target) {
    const wsId = this.state.activeWorkspace || "personal";
    const targetInfo = WorkspaceRepository.resolveTarget(wsId);
    if (!targetInfo.canRead) return;

    let wsName = "personal_board";
    if (targetInfo.kind === "shared" && targetInfo.journal) {
      wsName = targetInfo.journal.name || "shared_board";
    } else if (targetInfo.kind === "playerPersonal" && targetInfo.doc) {
      wsName = targetInfo.doc.getFlag("ClueBook", "personalWorkspaceName") || `${targetInfo.doc.name}_personal_board`;
    } else if (targetInfo.kind === "personal") {
      wsName = game.user.getFlag("ClueBook", "personalWorkspaceName") || "personal_board";
    }

    const data = WorkspaceRepository.getData(wsId);
    const settings = WorkspaceRepository.getSettings(wsId);

    const filtered = WorkspaceAccessService.filterWorkspaceExport(
      data,
      settings,
      game.user,
      Boolean(targetInfo.isShared)
    );

    const exportPayload = {
      version: "2.1",
      workspace: wsName,
      entries: filtered.entries,
      folders: filtered.folders,
      links: filtered.links,
      tags: filtered.tags
    };

    const jsonStr = JSON.stringify(exportPayload, null, 2);
    const filename = `cluebook_${wsName.replace(/\s+/g, '_')}.json`;
    
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
            const saveFn = foundry.utils?.saveDataToFile ?? saveDataToFile;
            saveFn(jsonStr, "application/json", filename);
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
    const wsId = this.state.activeWorkspace || "personal";
    const targetInfo = WorkspaceRepository.resolveTarget(wsId);
    if (!targetInfo.canRead || targetInfo.isReadOnly) {
      ui.notifications.warn(game.i18n.localize("CLUEBOOK.AppActions.OnlyOwnerCanEditSettings"));
      return;
    }

    let currentName = "";
    let settingsObj = WorkspaceRepository.getSettings(wsId) || {};
    let isOwner = false;
    let journal = targetInfo.journal;

    if (targetInfo.kind === "playerPersonal") {
      if (!game.user.isGM) {
        ui.notifications.warn(game.i18n.localize("CLUEBOOK.AppActions.CannotRenameOthers"));
        return;
      }
      currentName = targetInfo.doc?.getFlag("ClueBook", "personalWorkspaceName") || targetInfo.doc?.name || "Player Personal";
      isOwner = true;
    } else if (targetInfo.kind === "personal") {
      currentName = game.user.getFlag("ClueBook", "personalWorkspaceName") || game.i18n.localize("CLUEBOOK.Workspace.Personal");
      isOwner = true;
    } else if (targetInfo.kind === "shared") {
      journal = targetInfo.journal;
      if (!journal) return;
      isOwner = Boolean(journal.isOwner || game.user.isGM);
      if (!isOwner) {
        ui.notifications.warn(game.i18n.localize("CLUEBOOK.AppActions.OnlyOwnerCanEditSettings"));
        return;
      }
      currentName = journal.name || "shared_board";
    }

    const isPersonal = targetInfo.kind === "personal" || targetInfo.kind === "playerPersonal";

    let accessHTML = '';
    if (!isPersonal && journal) {
      const currentOwnership = journal.ownership || {};
      let userCheckboxes = '';
      game.users.forEach(u => {
        if (u.id === game.user.id || u.isGM) return; // Self and GM always have access
        const hasAccess = currentOwnership[u.id] === 3;
        userCheckboxes += `
          <label style="display:flex; align-items:center; gap:8px; margin-bottom:6px; cursor:pointer; font-size:13px; color:#fff;">
            <input type="checkbox" name="user_${u.id}" ${hasAccess ? 'checked' : ''} style="margin:0; width:16px; height:16px; cursor:pointer;">
            <span>${u.name}</span>
          </label>
        `;
      });

      const readOnlyHTML = game.user.isGM ? `
            <div class="setting-row flex-checkbox" style="margin-top: 14px;">
              <label for="cb-edit-ws-readonly">${game.i18n.localize("CLUEBOOK.AppActions.ReadOnlyForPlayers")}</label>
              <div class="cb-toggle">
                <input type="checkbox" name="readOnly" id="cb-edit-ws-readonly" ${settingsObj.readOnly ? 'checked' : ''}>
                <label for="cb-edit-ws-readonly"></label>
              </div>
            </div>
      ` : '';

      accessHTML = `
            <div class="form-group" style="margin-top: 12px;">
              <label style="font-size: 13px; font-weight: 500; margin-bottom: 6px; display: block; color: var(--cb-text);">${game.i18n.localize("CLUEBOOK.AppActions.WhoHasAccess")}</label>
              <div style="max-height: 140px; overflow-y: auto; background: rgba(0,0,0,0.35); border: 1px solid rgba(255,255,255,0.12); padding: 10px; border-radius: 6px; font-size: 13px;">
                ${userCheckboxes || `<span style="opacity:0.6; color:#cbd5e1;">${game.i18n.localize("CLUEBOOK.AppActions.NoOtherPlayers")}</span>`}
              </div>
            </div>
            ${readOnlyHTML}
      `;
    }

    const content = `
      <div class="cluebook-board-settings-form">
        <div class="settings-grid cluebook-custom-scrollbar" style="grid-template-columns: 1fr; padding: 4px;">
          <!-- Access & General -->
          <div class="settings-card">
            <h3><i class="fas fa-lock"></i> ${game.i18n.localize("CLUEBOOK.Settings.CategoryAccess")}</h3>
            <div class="setting-row">
              <label>${game.i18n.localize("CLUEBOOK.AppActions.BoardName")}</label>
              <input type="text" name="workspaceName" value="${currentName}" required autofocus class="setting-input cluebook-input" style="flex: 0 0 auto; max-width: 60%;">
            </div>
            ${accessHTML}
          </div>

          <!-- Card Action Buttons Customization -->
          <div class="settings-card">
            <h3><i class="fas fa-toggle-on"></i> ${game.i18n.localize("CLUEBOOK.Settings.CategoryCardButtons")}</h3>
            <p style="font-size:12px; color:var(--cb-text-muted); margin:0 0 10px 0;">${game.i18n.localize("CLUEBOOK.Settings.CardButtonsHint")}</p>
            
            <div class="setting-row flex-checkbox">
              <label for="cb-btn-edit">${game.i18n.localize("CLUEBOOK.Settings.BtnEdit")}</label>
              <div class="cb-toggle">
                <input type="checkbox" name="showBtnEdit" id="cb-btn-edit" ${(!settingsObj.hideEditBtn) ? 'checked' : ''}>
                <label for="cb-btn-edit"></label>
              </div>
            </div>

            <div class="setting-row flex-checkbox">
              <label for="cb-btn-board">${game.i18n.localize("CLUEBOOK.Settings.BtnBoard")}</label>
              <div class="cb-toggle">
                <input type="checkbox" name="showBtnBoard" id="cb-btn-board" ${(!settingsObj.hideSendToBoardBtn) ? 'checked' : ''}>
                <label for="cb-btn-board"></label>
              </div>
            </div>

            <div class="setting-row flex-checkbox">
              <label for="cb-btn-track">${game.i18n.localize("CLUEBOOK.Settings.BtnTrack")}</label>
              <div class="cb-toggle">
                <input type="checkbox" name="showBtnTrack" id="cb-btn-track" ${(!settingsObj.hideTrackerBtn) ? 'checked' : ''}>
                <label for="cb-btn-track"></label>
              </div>
            </div>

            <div class="setting-row flex-checkbox">
              <label for="cb-btn-actor">${game.i18n.localize("CLUEBOOK.Settings.BtnActor")}</label>
              <div class="cb-toggle">
                <input type="checkbox" name="showBtnActor" id="cb-btn-actor" ${(!settingsObj.hideActorBtn) ? 'checked' : ''}>
                <label for="cb-btn-actor"></label>
              </div>
            </div>

            <div class="setting-row flex-checkbox">
              <label for="cb-btn-scene">${game.i18n.localize("CLUEBOOK.Settings.BtnScene")}</label>
              <div class="cb-toggle">
                <input type="checkbox" name="showBtnScene" id="cb-btn-scene" ${(!settingsObj.hideSceneBtn) ? 'checked' : ''}>
                <label for="cb-btn-scene"></label>
              </div>
            </div>

            <div class="setting-row flex-checkbox">
              <label for="cb-btn-gm-vis">${game.i18n.localize("CLUEBOOK.Settings.BtnVisibility")}</label>
              <div class="cb-toggle">
                <input type="checkbox" name="showBtnVisibility" id="cb-btn-gm-vis" ${(!settingsObj.hideGMVisibilityBtn) ? 'checked' : ''}>
                <label for="cb-btn-gm-vis"></label>
              </div>
            </div>

            <div class="setting-row flex-checkbox">
              <label for="cb-btn-gm-over">${game.i18n.localize("CLUEBOOK.Settings.BtnOverlay")}</label>
              <div class="cb-toggle">
                <input type="checkbox" name="showBtnOverlay" id="cb-btn-gm-over" ${(!settingsObj.hideGMOverlayBtn) ? 'checked' : ''}>
                <label for="cb-btn-gm-over"></label>
              </div>
            </div>

            <div class="setting-row flex-checkbox">
              <label for="cb-btn-delete">${game.i18n.localize("CLUEBOOK.Settings.BtnDelete")}</label>
              <div class="cb-toggle">
                <input type="checkbox" name="showBtnDelete" id="cb-btn-delete" ${(!settingsObj.hideDeleteBtn) ? 'checked' : ''}>
                <label for="cb-btn-delete"></label>
              </div>
            </div>
          </div>

          <!-- Tab Visibility -->
          <div class="settings-card">
            <h3><i class="fas fa-eye"></i> ${game.i18n.localize("CLUEBOOK.Settings.CategoryTabs")}</h3>
            <p style="font-size: 11px; opacity: 0.7; margin: 0 0 10px 0;">${game.i18n.localize("CLUEBOOK.Settings.CategoryTabsHint")}</p>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; width: 100%;">
              <div class="setting-row flex-checkbox" style="padding: 0;">
                <label style="font-size: 11px;"><i class="fas fa-search"></i> ${game.i18n.localize("CLUEBOOK.Tabs.Search")}</label>
                <div class="cb-toggle cb-toggle-small">
                  <input type="checkbox" name="tab_search" id="cb-ws-tab-search" ${(!settingsObj.hiddenTabs?.search) ? 'checked' : ''}>
                  <label for="cb-ws-tab-search"></label>
                </div>
              </div>
              <div class="setting-row flex-checkbox" style="padding: 0;">
                <label style="font-size: 11px;"><i class="fas fa-sticky-note"></i> ${game.i18n.localize("CLUEBOOK.Tabs.Notes")}</label>
                <div class="cb-toggle cb-toggle-small">
                  <input type="checkbox" name="tab_notes" id="cb-ws-tab-notes" ${(!settingsObj.hiddenTabs?.notes) ? 'checked' : ''}>
                  <label for="cb-ws-tab-notes"></label>
                </div>
              </div>
              <div class="setting-row flex-checkbox" style="padding: 0;">
                <label style="font-size: 11px;"><i class="fas fa-user"></i> ${game.i18n.localize("CLUEBOOK.Tabs.NPC")}</label>
                <div class="cb-toggle cb-toggle-small">
                  <input type="checkbox" name="tab_npc" id="cb-ws-tab-npc" ${(!settingsObj.hiddenTabs?.npc) ? 'checked' : ''}>
                  <label for="cb-ws-tab-npc"></label>
                </div>
              </div>
              <div class="setting-row flex-checkbox" style="padding: 0;">
                <label style="font-size: 11px;"><i class="fas fa-map-marked-alt"></i> ${game.i18n.localize("CLUEBOOK.Tabs.Locations")}</label>
                <div class="cb-toggle cb-toggle-small">
                  <input type="checkbox" name="tab_locations" id="cb-ws-tab-locations" ${(!settingsObj.hiddenTabs?.locations) ? 'checked' : ''}>
                  <label for="cb-ws-tab-locations"></label>
                </div>
              </div>
              <div class="setting-row flex-checkbox" style="padding: 0;">
                <label style="font-size: 11px;"><i class="fas fa-scroll"></i> ${game.i18n.localize("CLUEBOOK.Tabs.Quests")}</label>
                <div class="cb-toggle cb-toggle-small">
                  <input type="checkbox" name="tab_quests" id="cb-ws-tab-quests" ${(!settingsObj.hiddenTabs?.quests) ? 'checked' : ''}>
                  <label for="cb-ws-tab-quests"></label>
                </div>
              </div>
              <div class="setting-row flex-checkbox" style="padding: 0;">
                <label style="font-size: 11px;"><i class="fas fa-clock"></i> ${game.i18n.localize("CLUEBOOK.Tabs.Timeline")}</label>
                <div class="cb-toggle cb-toggle-small">
                  <input type="checkbox" name="tab_timeline" id="cb-ws-tab-timeline" ${(!settingsObj.hiddenTabs?.timeline) ? 'checked' : ''}>
                  <label for="cb-ws-tab-timeline"></label>
                </div>
              </div>
              <div class="setting-row flex-checkbox" style="padding: 0;">
                <label style="font-size: 11px;"><i class="fas fa-camera-retro"></i> ${game.i18n.localize("CLUEBOOK.Tabs.Gallery")}</label>
                <div class="cb-toggle cb-toggle-small">
                  <input type="checkbox" name="tab_gallery" id="cb-ws-tab-gallery" ${(!settingsObj.hiddenTabs?.gallery) ? 'checked' : ''}>
                  <label for="cb-ws-tab-gallery"></label>
                </div>
              </div>
              <div class="setting-row flex-checkbox" style="padding: 0;">
                <label style="font-size: 11px;"><i class="fas fa-project-diagram"></i> ${game.i18n.localize("CLUEBOOK.Tabs.Board")}</label>
                <div class="cb-toggle cb-toggle-small">
                  <input type="checkbox" name="tab_board" id="cb-ws-tab-board" ${(!settingsObj.hiddenTabs?.board) ? 'checked' : ''}>
                  <label for="cb-ws-tab-board"></label>
                </div>
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
        </div>
      </div>
    `;

    new foundry.applications.api.DialogV2({
      classes: ["cluebook-window", "cluebook-board-settings-dialog"],
      window: { 
        title: game.i18n.localize("CLUEBOOK.AppActions.BoardSettings"),
        icon: "fas fa-cog",
        resizable: true
      },
      position: { width: 620, height: 620 },
      content: content,
      buttons: [
        {
          action: "save",
          label: game.i18n.localize("CLUEBOOK.AppActions.Save"),
          icon: "fas fa-save",
          default: true,
          callback: (event, button, dialog) => {
            const form = button.form || dialog.element;
            const newName = form.querySelector('input[name="workspaceName"]')?.value?.trim();
            if (!newName) return;

            const isReadOnly = game.user.isGM ? (form.querySelector('input[name="readOnly"]')?.checked ?? false) : (settingsObj.readOnly ?? false);
            const hideEditBtn = !(form.querySelector('input[name="showBtnEdit"]')?.checked ?? true);
            const hideSendToBoardBtn = !(form.querySelector('input[name="showBtnBoard"]')?.checked ?? true);
            const hideTrackerBtn = !(form.querySelector('input[name="showBtnTrack"]')?.checked ?? true);
            const hideActorBtn = !(form.querySelector('input[name="showBtnActor"]')?.checked ?? true);
            const hideSceneBtn = !(form.querySelector('input[name="showBtnScene"]')?.checked ?? true);
            const hideGMVisibilityBtn = !(form.querySelector('input[name="showBtnVisibility"]')?.checked ?? true);
            const hideGMOverlayBtn = !(form.querySelector('input[name="showBtnOverlay"]')?.checked ?? true);
            const hideDeleteBtn = !(form.querySelector('input[name="showBtnDelete"]')?.checked ?? true);
            
            const updatedSettings = {
                ...settingsObj,
                readOnly: isReadOnly,
                hideEditBtn: hideEditBtn,
                hideSendToBoardBtn: hideSendToBoardBtn,
                hideTrackerBtn: hideTrackerBtn,
                hideActorBtn: hideActorBtn,
                hideSceneBtn: hideSceneBtn,
                hideGMVisibilityBtn: hideGMVisibilityBtn,
                hideGMOverlayBtn: hideGMOverlayBtn,
                hideDeleteBtn: hideDeleteBtn,
                hiddenTabs: {
                  search: !(form.querySelector('input[name="tab_search"]')?.checked ?? true),
                  notes: !(form.querySelector('input[name="tab_notes"]')?.checked ?? true),
                  npc: !(form.querySelector('input[name="tab_npc"]')?.checked ?? true),
                  locations: !(form.querySelector('input[name="tab_locations"]')?.checked ?? true),
                  quests: !(form.querySelector('input[name="tab_quests"]')?.checked ?? true),
                  timeline: !(form.querySelector('input[name="tab_timeline"]')?.checked ?? true),
                  gallery: !(form.querySelector('input[name="tab_gallery"]')?.checked ?? true),
                  board: !(form.querySelector('input[name="tab_board"]')?.checked ?? true)
                },
                theme: {
                  ...(settingsObj.theme || {}),
                  hoverHighlight: form.querySelector('input[name="theme_hoverHighlight"]')?.checked ?? (settingsObj.theme?.hoverHighlight ?? true),
                  hoverDelay: parseInt(form.querySelector('input[name="theme_hoverDelay"]')?.value) || (settingsObj.theme?.hoverDelay ?? 1000),
                  highlightDuration: parseInt(form.querySelector('input[name="theme_highlightDuration"]')?.value) || (settingsObj.theme?.highlightDuration ?? 2)
                },
                defaultColors: {
                  ...(settingsObj.defaultColors || {})
                }
            };

            let ownership = null;
            if (!isPersonal && journal) {
              ownership = { default: journal.ownership.default || 0, [game.user.id]: 3 };
              game.users.filter(u => u.isGM).forEach(gm => ownership[gm.id] = 3);
  
              form.querySelectorAll('input[type="checkbox"]').forEach(input => {
                if (input.name.startsWith("user_")) {
                  const userId = input.name.split('_')[1];
                  if (userId) {
                    ownership[userId] = input.checked ? 3 : 0;
                  }
                }
              });
            }

            // Perform async DB/Socket updates in background without delaying modal close
            (async () => {
              try {
                if (targetInfo.kind === "playerPersonal") {
                  if (targetInfo.doc) {
                    await targetInfo.doc.setFlag("ClueBook", "personalWorkspaceName", newName);
                  }
                  await WorkspaceRepository.updatePaths(wsId, { "flags.ClueBook.settings": updatedSettings });
                } else if (targetInfo.kind === "personal") {
                  await game.user.setFlag("ClueBook", "personalWorkspaceName", newName);
                  await WorkspaceRepository.updatePaths(wsId, { "flags.ClueBook.settings": updatedSettings });
                } else if (targetInfo.kind === "shared" && journal) {
                  await WorkspaceRepository.updatePaths(wsId, { "flags.ClueBook.settings": updatedSettings });
                  if (game.user.isGM) {
                    const journalUpdates = { name: newName };
                    if (ownership) journalUpdates.ownership = ownership;
                    await journal.update(journalUpdates);
                  } else {
                    game.socket.emit("module.ClueBook", {
                      action: "updateBoard",
                      senderId: game.user.id,
                      journalId: journal.id,
                      name: newName,
                      ownership
                    });
                  }
                }

                // Update FAB menu if widget exists
                const widget = document.getElementById("cluebook-widget");
                if (widget && widget._buildMenu) {
                  const currentSettings = this.getSettings();
                  const menu = widget.querySelector(".cb-fab-menu");
                  if (menu) widget._buildMenu(currentSettings, menu);
                }

                this.render({ parts: ["tabs", "content"] });
              } catch(err) {
                console.error("ClueBook | Error saving board settings:", err);
              }
            })();
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
    const wsId = this.state.activeWorkspace || "personal";
    const targetInfo = WorkspaceRepository.resolveTarget(wsId);
    if (!targetInfo.canRead) return;

    if (targetInfo.kind === "playerPersonal") {
      if (!game.user.isGM) {
        ui.notifications.warn(game.i18n.localize("CLUEBOOK.AppActions.OnlyGMCanDeleteBoards"));
        return;
      }
      const confirmed = await foundry.applications.api.DialogV2.confirm({
        window: { title: game.i18n.localize("CLUEBOOK.AppActions.DeleteBoardTitle") },
        content: game.i18n.format("CLUEBOOK.AppActions.DeleteBoardPrompt", { name: targetInfo.doc?.name || wsId }),
        rejectClose: false
      });
      if (!confirmed) return;

      await WorkspaceRepository.clearOrDeleteWorkspace(wsId);
      if (wsId === this.state.activeWorkspace) {
        this.state.activeWorkspace = "personal";
        this.state.camera = null;
        await game.user.setFlag("ClueBook", "lastWorkspace", "personal");
      }
      this.render({ parts: ["content"] });
      return;
    }

    if (targetInfo.kind === "personal") {
      const confirmed = await foundry.applications.api.DialogV2.confirm({
        window: { title: game.i18n.localize("CLUEBOOK.AppActions.DeleteBoardTitle") },
        content: game.i18n.localize("CLUEBOOK.AppActions.DeletePersonalPrompt") || game.i18n.format("CLUEBOOK.AppActions.DeleteBoardPrompt", { name: game.i18n.localize("CLUEBOOK.Workspace.Personal") }),
        rejectClose: false
      });
      if (!confirmed) return;
      
      await WorkspaceRepository.clearOrDeleteWorkspace(wsId);
      this.state.activeWorkspace = "personal";
      this.state.camera = null;
      await game.user.setFlag("ClueBook", "lastWorkspace", "personal");
      this.render({ parts: ["content"] });
      return;
    }

    if (targetInfo.kind === "shared") {
      if (!game.user.isGM && !targetInfo.journal?.isOwner) {
        ui.notifications.warn(game.i18n.localize("CLUEBOOK.AppActions.OnlyGMCanDeleteBoards"));
        return;
      }

      const confirmed = await foundry.applications.api.DialogV2.confirm({
        window: { title: game.i18n.localize("CLUEBOOK.AppActions.DeleteBoardTitle") },
        content: game.i18n.format("CLUEBOOK.AppActions.DeleteBoardPrompt", { name: targetInfo.journal?.name || "Shared Board" }),
        rejectClose: false
      });
      if (!confirmed) return;

      await WorkspaceRepository.clearOrDeleteWorkspace(wsId);
      this.state.activeWorkspace = "personal";
      this.state.camera = null;
      await game.user.setFlag("ClueBook", "lastWorkspace", "personal");
      this.render({ parts: ["content"] });
    }
  }

  static async _onImportJSON(event, target) {
    if (this.state.isReadOnly) return;

    const content = `
      <div class="cb-import-json-dialog" style="display: flex; flex-direction: column; gap: 10px;">
        <p>${game.i18n.localize("CLUEBOOK.AppActions.ImportAIPrompt")}</p>
        <div style="margin-bottom: 5px;">
          <input type="file" id="cb-import-file" accept=".json" style="width: 100%;">
        </div>
        <p style="text-align: center; margin: 0; font-weight: bold;">${game.i18n.localize("CLUEBOOK.AppActions.Or")}</p>
        <textarea id="cb-import-text" style="width: 100%; height: 200px; font-family: monospace;"></textarea>
      </div>
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
            const root = dialog.element || document;
            const fileInput = root.querySelector("#cb-import-file");
            const textInput = root.querySelector("#cb-import-text");
            
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
      if (!parsed || (!parsed.entries && !parsed.folders)) {
        ui.notifications.error(game.i18n.localize("CLUEBOOK.AppActions.ImportAIErrorArray"));
        return;
      }

      const isGM = Boolean(game.user?.isGM);
      const wsId = this.state.activeWorkspace || "personal";
      const existingSettings = WorkspaceRepository.getSettings(wsId) || {};
      const existingTags = { ...(existingSettings.tags || {}) };

      const updates = {};
      const idMap = {}; // oldEntryId -> newEntryId
      const folderIdMap = {}; // oldFolderId -> newFolderId
      const tagIdMap = {};

      // 1. Process Folders
      if (parsed.folders) {
        const incomingFolders = Array.isArray(parsed.folders) ? parsed.folders : Object.values(parsed.folders);
        for (const rawFolder of incomingFolders) {
          if (!rawFolder || typeof rawFolder !== "object") continue;
          const oldFolderId = rawFolder.id || foundry.utils.randomID();
          const newFolderId = foundry.utils.randomID();
          folderIdMap[oldFolderId] = newFolderId;

          const fClean = foundry.utils.deepClone(rawFolder);
          delete fClean.id;
          if (!isGM) {
            fClean.isHidden = false;
            fClean.visibleTo = [];
          }
          updates[`flags.ClueBook.data.folders.${newFolderId}`] = fClean;
        }
      }

      // 2. Process Tags
      if (parsed.tags) {
        const incomingTags = Array.isArray(parsed.tags) ? parsed.tags : Object.values(parsed.tags);
        for (const t of incomingTags) {
          if (!t) continue;
          const tagName = typeof t === "string" ? t.trim() : (t.name ? t.name.trim() : "");
          if (!tagName) continue;

          let match = Object.values(existingTags).find(ex => ex && ex.name?.toLowerCase() === tagName.toLowerCase());
          if (match) {
            if (typeof t === "object" && t.id) tagIdMap[t.id] = match.id;
            tagIdMap[tagName] = match.id;
          } else {
            const newTagId = (typeof t === "object" && t.id) ? t.id : foundry.utils.randomID();
            const tagObj = {
              id: newTagId,
              name: tagName,
              color: (typeof t === "object" && t.color) ? t.color : "#7b61ff",
              isSecret: isGM && typeof t === "object" && t.isSecret ? true : false
            };
            existingTags[newTagId] = tagObj;
            if (typeof t === "object" && t.id) tagIdMap[t.id] = newTagId;
            tagIdMap[tagName] = newTagId;
            updates[`flags.ClueBook.settings.tags.${newTagId}`] = tagObj;
          }
        }
      }

      // 3. Process Entries
      const entriesList = Array.isArray(parsed.entries) ? parsed.entries : Object.values(parsed.entries || {});
      for (const entry of entriesList) {
        if (!entry || typeof entry !== "object") continue;
        const tab = entry.tab || entry.type || "notes";
        if (!isEntryTab(tab)) continue;

        const tempId = entry.id;
        const newEntryId = foundry.utils.randomID();
        if (tempId) idMap[tempId] = newEntryId;

        // Resolve tags on entries
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
              let match = Object.values(existingTags).find(ex => ex && ex.name?.toLowerCase() === tagStr.toLowerCase());
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
                updates[`flags.ClueBook.settings.tags.${newTagId}`] = tagObj;
                resolvedTags.push(newTagId);
              }
            }
          }
          entry.tags = resolvedTags;
        }

        // Remap folderId if folder was imported
        if (entry.folderId && folderIdMap[entry.folderId]) {
          entry.folderId = folderIdMap[entry.folderId];
        }

        // Strip GM secrets if player
        if (!isGM) {
          entry.gmNotes = "";
          entry.isHidden = false;
          entry.visibleTo = [];
        }

        const sanitized = sanitizeEntryForStorage(tab, entry);
        updates[`flags.ClueBook.data.${tab}.${newEntryId}`] = sanitized;
      }

      // 4. Process Links
      const incomingLinks = Array.isArray(parsed.links) ? parsed.links : Object.values(parsed.links || {});
      for (const link of incomingLinks) {
        if (!link?.source || !link?.target) continue;
        const s = idMap[link.source] || link.source;
        const t = idMap[link.target] || link.target;
        if (s && t) {
          const [a, b] = [s, t].sort();
          const linkId = `${a}_${b}`;
          updates[`flags.ClueBook.data.links.${linkId}`] = {
            source: s,
            target: t,
            label: link.label || "",
            style: link.style || "solid",
            color: link.color || ""
          };
        }
      }

      // 5. Remap internal @mention UUIDs / IDs in text fields
      for (const [key, entryVal] of Object.entries(updates)) {
        if (entryVal && typeof entryVal === "object" && key.startsWith("flags.ClueBook.data.") && !key.startsWith("flags.ClueBook.data.links.") && !key.startsWith("flags.ClueBook.data.folders.")) {
          ['text', 'note', 'event', 'gmNotes', 'subtitle', 'owner', 'location', 'attitude'].forEach(field => {
            if (entryVal[field] && typeof entryVal[field] === 'string') {
              entryVal[field] = TextEnrichmentService.remapMentionIds(entryVal[field], idMap);
            }
          });
        }
      }

      // 6. Single batched update
      await WorkspaceRepository.updatePaths(this.state.activeWorkspace, updates);
      ui.notifications.info(game.i18n.format("CLUEBOOK.AppActions.ImportSuccess", { count: entriesList.length }));
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
};
