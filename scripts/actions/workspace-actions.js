import { ClueBookEditDialog } from "../edit-dialog.js";
import { ClueBookSocket } from "../socket.js";
import { ClueBookTagManager } from "../tag-manager.js";
import { getForcedDeletion } from "../data-models.js";
import { TimeService } from "../services/time-service.js";
import { TextEnrichmentService } from "../services/text-enrichment-service.js";
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
        userCheckboxes += `
          <label style="display:flex; align-items:center; gap:8px; margin-bottom:6px; cursor:pointer; font-size:13px; color:#fff;">
            <input type="checkbox" name="user_${u.id}" ${hasAccess ? 'checked' : ''} style="margin:0; width:16px; height:16px; cursor:pointer;">
            <span>${u.name}</span>
          </label>
        `;
      });

      accessHTML = `
            <div class="form-group" style="margin-top: 12px;">
              <label style="font-size: 13px; font-weight: 500; margin-bottom: 6px; display: block; color: var(--cb-text);">${game.i18n.localize("CLUEBOOK.AppActions.WhoHasAccess")}</label>
              <div style="max-height: 140px; overflow-y: auto; background: rgba(0,0,0,0.35); border: 1px solid rgba(255,255,255,0.12); padding: 10px; border-radius: 6px; font-size: 13px;">
                ${userCheckboxes || `<span style="opacity:0.6; color:#cbd5e1;">${game.i18n.localize("CLUEBOOK.AppActions.NoOtherPlayers")}</span>`}
              </div>
            </div>
            <div class="setting-row flex-checkbox" style="margin-top: 14px;">
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
            <div class="setting-row">
              <label>${game.i18n.localize("CLUEBOOK.Tabs.Gallery")}</label>
              <select name="dc_gallery" class="setting-input cluebook-input">
                ${["yellow","green","blue","red","purple","orange","teal","pink","brown"].map(c => `<option value="${c}" ${(settingsObj.defaultColors?.gallery === c || (!settingsObj.defaultColors?.gallery && c === "teal")) ? 'selected' : ''}>${game.i18n.localize("CLUEBOOK.Colors." + c.charAt(0).toUpperCase() + c.slice(1))}</option>`).join('')}
              </select>
            </div>
          </div>
        </div>
      </form>
    `;

    new foundry.applications.api.DialogV2({
      classes: ["cluebook-window", "cluebook-board-settings-dialog"],
      window: { 
        title: game.i18n.localize("CLUEBOOK.AppActions.BoardSettings"),
        icon: "fas fa-cog",
        resizable: true
      },
      position: { width: 620, height: 680 },
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
            const hideEditBtn = !(form.elements.showBtnEdit?.checked ?? true);
            const hideSendToBoardBtn = !(form.elements.showBtnBoard?.checked ?? true);
            const hideTrackerBtn = !(form.elements.showBtnTrack?.checked ?? true);
            const hideActorBtn = !(form.elements.showBtnActor?.checked ?? true);
            const hideSceneBtn = !(form.elements.showBtnScene?.checked ?? true);
            const hideGMVisibilityBtn = !(form.elements.showBtnVisibility?.checked ?? true);
            const hideGMOverlayBtn = !(form.elements.showBtnOverlay?.checked ?? true);
            const hideDeleteBtn = !(form.elements.showBtnDelete?.checked ?? true);
            
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
                  search: !(form.elements.tab_search?.checked ?? true),
                  notes: !(form.elements.tab_notes?.checked ?? true),
                  npc: !(form.elements.tab_npc?.checked ?? true),
                  locations: !(form.elements.tab_locations?.checked ?? true),
                  quests: !(form.elements.tab_quests?.checked ?? true),
                  timeline: !(form.elements.tab_timeline?.checked ?? true),
                  gallery: !(form.elements.tab_gallery?.checked ?? true),
                  board: !(form.elements.tab_board?.checked ?? true)
                },
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
                  timeline: form.elements.dc_timeline?.value || "red",
                  gallery: form.elements.dc_gallery?.value || "teal"
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

            // Update FAB menu if widget exists
            const widget = document.getElementById("cluebook-widget");
            if (widget && widget._buildMenu) {
              const currentSettings = this.getSettings();
              const menu = widget.querySelector(".cb-fab-menu");
              if (menu) widget._buildMenu(currentSettings, menu);
            }

            this.render({ parts: ["tabs", "content"] });
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
          for (const tabKey of ["notes", "npc", "locations", "quests", "timeline", "gallery", "labels", "pins"]) {
            if (data[tabKey]?.[tempId]) {
              existingTab = tabKey;
              existingEntry = data[tabKey][tempId];
              break;
            }
          }
        }

        const del = getForcedDeletion();
        if (existingEntry) {
          if (action === "delete" || action === "remove") {
            // Delete the card
            updateData[`flags.ClueBook.data.${existingTab}.${tempId}`] = del;
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
              updateData[`flags.ClueBook.data.${existingTab}.${tempId}`] = del;
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
      const isDeleted = (v) => v === null || (v && typeof v === "object" && (v instanceof (foundry.data?.operators?.ForcedDeletion ?? Object) || v.__$OPERATOR$__ === "ForcedDeletion"));
      const allTabs = ["notes", "npc", "locations", "quests", "timeline", "gallery", "labels", "pins"];
      for (const [key, l] of Object.entries(links)) {
        const sourceDeleted = allTabs.some(t => isDeleted(updateData[`flags.ClueBook.data.${t}.${l.source}`]));
        const targetDeleted = allTabs.some(t => isDeleted(updateData[`flags.ClueBook.data.${t}.${l.target}`]));
        if (sourceDeleted || targetDeleted) {
          updateData[`flags.ClueBook.data.links.${key}`] = getForcedDeletion();
        }
      }

      // Second pass: Replace internal links in text fields with new IDs
      for (const [key, entry] of Object.entries(updateData)) {
        if (entry && !key.startsWith('flags.ClueBook.data.links.')) {
          ['text', 'note', 'event', 'gmNotes', 'subtitle', 'owner', 'location', 'attitude'].forEach(field => {
            if (entry[field] && typeof entry[field] === 'string') {
              entry[field] = TextEnrichmentService.remapMentionIds(entry[field], idMap);
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
