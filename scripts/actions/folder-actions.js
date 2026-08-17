import { getForcedDeletion } from "../data-models.js";
import { ClueBookEditDialog } from "../edit-dialog.js";

export const ClueBookFolderActionsMixin = (Base) => class extends Base {
  static async _onCreateFolder(event, target) {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    if (this.state.isReadOnly) return;

    const PRESET_COLORS = ["purple", "blue", "teal", "green", "yellow", "orange", "red", "pink", "brown"];

    const colorOptionsHTML = `
      <div class="color-palette" style="display: flex; gap: 8px; flex-wrap: wrap; margin-top: 4px;">
        ${PRESET_COLORS.map(c => `
          <label class="color-swatch color-${c}" style="cursor: pointer; position: relative;">
            <input type="radio" name="folderColor" value="${c}" ${c === "purple" ? "checked" : ""} style="display:none;">
          </label>
        `).join("")}
      </div>
    `;

    const content = `
      <form class="cb-folder-form" style="display:flex; flex-direction:column; gap:12px;">
        <div class="form-group">
          <label style="font-weight:600; margin-bottom:4px; display:block;">${game.i18n.localize("CLUEBOOK.Folder.NameLabel")}:</label>
          <input type="text" name="folderName" value="${game.i18n.localize("CLUEBOOK.Folder.DefaultName")}" autofocus style="width:100%; padding:6px; border-radius:4px; background:rgba(0,0,0,0.3); border:1px solid rgba(255,255,255,0.2); color:#fff;" />
        </div>
        <div class="form-group">
          <label style="font-weight:600; margin-bottom:4px; display:block;">${game.i18n.localize("CLUEBOOK.Folder.PositionLabel")}:</label>
          <div style="display:flex; gap:16px;">
            <label style="display:inline-flex; align-items:center; gap:6px; cursor:pointer;">
              <input type="radio" name="folderPosition" value="top" checked>
              <span>⬆️ ${game.i18n.localize("CLUEBOOK.Folder.PositionTop")}</span>
            </label>
            <label style="display:inline-flex; align-items:center; gap:6px; cursor:pointer;">
              <input type="radio" name="folderPosition" value="bottom">
              <span>⬇️ ${game.i18n.localize("CLUEBOOK.Folder.PositionBottom")}</span>
            </label>
          </div>
        </div>
        <div class="form-group">
          <label style="font-weight:600; margin-bottom:4px; display:block;">${game.i18n.localize("CLUEBOOK.Folder.ColorLabel")}:</label>
          ${colorOptionsHTML}
        </div>
      </form>
    `;

    const result = await foundry.applications.api.DialogV2.wait({
      window: { title: game.i18n.localize("CLUEBOOK.Folder.CreateTitle") },
      content: content,
      buttons: [
        {
          action: "create",
          label: game.i18n.localize("CLUEBOOK.Folder.CreateBtn"),
          icon: "fas fa-folder-plus",
          default: true,
          callback: (event, button, dialog) => {
            const form = dialog.element.querySelector("form");
            const name = form.querySelector('input[name="folderName"]')?.value?.trim() || game.i18n.localize("CLUEBOOK.Folder.DefaultName");
            const color = form.querySelector('input[name="folderColor"]:checked')?.value || "purple";
            const position = form.querySelector('input[name="folderPosition"]:checked')?.value || "top";
            return { name, color, position };
          }
        },
        {
          action: "cancel",
          label: game.i18n.localize("CLUEBOOK.Folder.CancelBtn"),
          icon: "fas fa-times"
        }
      ]
    });

    if (!result || !result.name) return;

    const folderId = foundry.utils.randomID();
    const tab = this.state.activeTab;
    const folders = this._getWorkspaceData()?.folders || {};
    const tabFolders = Object.values(folders).filter(f => f && f.tab === tab && (f.position || "top") === result.position);
    const nextSort = tabFolders.length > 0 ? Math.max(...tabFolders.map(f => f.sort || 0)) + 1 : 0;

    await this._updateWorkspaceData({
      [`flags.ClueBook.data.folders.${folderId}`]: {
        name: result.name,
        tab: tab,
        color: result.color,
        position: result.position,
        sort: nextSort,
        isCollapsed: false
      }
    });

    this.render({ parts: ["content"] });
  }

  static async _onEditFolder(event, target) {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    if (this.state.isReadOnly) return;

    const folderEl = target.closest('.cb-folder-section');
    const folderId = target.dataset.folderId || folderEl?.dataset.folderId;
    if (!folderId) return;

    const data = this._getWorkspaceData();
    const folder = data?.folders?.[folderId];
    if (!folder) return;

    const PRESET_COLORS = ["purple", "blue", "teal", "green", "yellow", "orange", "red", "pink", "brown"];
    const currentColor = folder.color || "purple";
    const currentPosition = folder.position || "top";

    const colorOptionsHTML = `
      <div class="color-palette" style="display: flex; gap: 8px; flex-wrap: wrap; margin-top: 4px;">
        ${PRESET_COLORS.map(c => `
          <label class="color-swatch color-${c}" style="cursor: pointer; position: relative;">
            <input type="radio" name="folderColor" value="${c}" ${c === currentColor ? "checked" : ""} style="display:none;">
          </label>
        `).join("")}
      </div>
    `;

    const content = `
      <form class="cb-folder-form" style="display:flex; flex-direction:column; gap:12px;">
        <div class="form-group">
          <label style="font-weight:600; margin-bottom:4px; display:block;">${game.i18n.localize("CLUEBOOK.Folder.NameLabel")}:</label>
          <input type="text" name="folderName" value="${folder.name || ""}" autofocus style="width:100%; padding:6px; border-radius:4px; background:rgba(0,0,0,0.3); border:1px solid rgba(255,255,255,0.2); color:#fff;" />
        </div>
        <div class="form-group">
          <label style="font-weight:600; margin-bottom:4px; display:block;">${game.i18n.localize("CLUEBOOK.Folder.PositionLabel")}:</label>
          <div style="display:flex; gap:16px;">
            <label style="display:inline-flex; align-items:center; gap:6px; cursor:pointer;">
              <input type="radio" name="folderPosition" value="top" ${currentPosition === "top" ? "checked" : ""}>
              <span>⬆️ ${game.i18n.localize("CLUEBOOK.Folder.PositionTop")}</span>
            </label>
            <label style="display:inline-flex; align-items:center; gap:6px; cursor:pointer;">
              <input type="radio" name="folderPosition" value="bottom" ${currentPosition === "bottom" ? "checked" : ""}>
              <span>⬇️ ${game.i18n.localize("CLUEBOOK.Folder.PositionBottom")}</span>
            </label>
          </div>
        </div>
        <div class="form-group">
          <label style="font-weight:600; margin-bottom:4px; display:block;">${game.i18n.localize("CLUEBOOK.Folder.ColorLabel")}:</label>
          ${colorOptionsHTML}
        </div>
      </form>
    `;

    const result = await foundry.applications.api.DialogV2.wait({
      window: { title: game.i18n.localize("CLUEBOOK.Folder.EditTitle") },
      content: content,
      buttons: [
        {
          action: "save",
          label: game.i18n.localize("CLUEBOOK.Folder.SaveBtn"),
          icon: "fas fa-save",
          default: true,
          callback: (event, button, dialog) => {
            const form = dialog.element.querySelector("form");
            const name = form.querySelector('input[name="folderName"]')?.value?.trim() || folder.name;
            const color = form.querySelector('input[name="folderColor"]:checked')?.value || folder.color;
            const position = form.querySelector('input[name="folderPosition"]:checked')?.value || "top";
            return { name, color, position };
          }
        },
        {
          action: "cancel",
          label: game.i18n.localize("CLUEBOOK.Folder.CancelBtn"),
          icon: "fas fa-times"
        }
      ]
    });

    if (!result || !result.name) return;

    await this._updateWorkspaceData({
      [`flags.ClueBook.data.folders.${folderId}.name`]: result.name,
      [`flags.ClueBook.data.folders.${folderId}.color`]: result.color,
      [`flags.ClueBook.data.folders.${folderId}.position`]: result.position
    });

    this.render({ parts: ["content"] });
  }

  static async _onToggleFolderPosition(event, target) {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    if (this.state.isReadOnly) return;

    const folderId = target.dataset.folderId;
    if (!folderId) return;

    const data = this._getWorkspaceData();
    const folder = data?.folders?.[folderId];
    if (!folder) return;

    const currentPos = folder.position || "top";
    const nextPos = currentPos === "top" ? "bottom" : "top";

    await this._updateWorkspaceData({
      [`flags.ClueBook.data.folders.${folderId}.position`]: nextPos
    });

    this.render({ parts: ["content"] });
  }

  static async _onDeleteFolder(event, target) {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    if (this.state.isReadOnly) return;

    const folderEl = target.closest('.cb-folder-section');
    const folderId = target.dataset.folderId || folderEl?.dataset.folderId;
    if (!folderId) return;

    const data = this._getWorkspaceData();
    const folder = data?.folders?.[folderId];
    if (!folder) return;

    const proceed = await foundry.applications.api.DialogV2.confirm({
      window: { title: game.i18n.localize("CLUEBOOK.Folder.DeleteTitle") },
      content: `<p>${game.i18n.format("CLUEBOOK.Folder.DeletePrompt", { name: folder.name })}</p>`,
      yes: { icon: "fas fa-trash", label: game.i18n.localize("CLUEBOOK.Folder.DeleteBtn") }
    });

    if (!proceed) return;

    const updates = {};
    const deletion = getForcedDeletion();
    if (deletion) {
      updates[`flags.ClueBook.data.folders.${folderId}`] = deletion;
    } else {
      updates[`flags.ClueBook.data.folders.-=${folderId}`] = null;
    }

    // Release all entries inside this folder back to root
    const tab = folder.tab || this.state.activeTab;
    const tabEntries = data[tab] || {};
    for (const [entryId, entry] of Object.entries(tabEntries)) {
      if (entry && entry.folderId === folderId) {
        updates[`flags.ClueBook.data.${tab}.${entryId}.folderId`] = "";
      }
    }

    await this._updateWorkspaceData(updates);
    this.render({ parts: ["content"] });
  }

  static async _onToggleFolderCollapse(event, target) {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    const folderEl = target.closest('.cb-folder-section');
    const folderId = target.dataset.folderId || folderEl?.dataset.folderId;
    if (!folderId) return;

    const data = this._getWorkspaceData();
    const folder = data?.folders?.[folderId];
    if (!folder) return;

    const isCollapsed = folder.isCollapsed ?? false;
    await this._updateWorkspaceData({
      [`flags.ClueBook.data.folders.${folderId}.isCollapsed`]: !isCollapsed
    });

    this.render({ parts: ["content"] });
  }

  static async _onAddEntryToFolder(event, target) {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    if (this.state.isReadOnly) return;

    const folderId = target.dataset.folderId;
    if (!folderId) return;

    const sourceTab = this.state.activeTab;
    const newEntryId = foundry.utils.randomID();
    const defaultColor = this.getSettings()?.theme?.defaultColor || "yellow";

    const newEntry = {
      type: sourceTab,
      color: defaultColor,
      textColor: "dark",
      sort: Date.now(),
      onBoard: false,
      folderId: folderId
    };

    const flagUpdates = {
      [`flags.ClueBook.data.${sourceTab}.${newEntryId}`]: newEntry
    };

    await this._updateWorkspaceData(flagUpdates);

    // Open edit dialog immediately for the newly created entry
    new ClueBookEditDialog({
      entry: newEntry,
      sourceTab: sourceTab,
      entryId: newEntryId,
      workspace: this.state.activeWorkspace,
      onSave: async (savedData) => {
        const saveUpdates = {};
        for (const [key, value] of Object.entries(savedData)) {
          saveUpdates[`flags.ClueBook.data.${sourceTab}.${newEntryId}.${key}`] = value;
        }
        await this._updateWorkspaceData(saveUpdates);
        this.render({ parts: ["content"] });
      }
    }).render(true);

    this.render({ parts: ["content"] });
  }

  static async _onSendFolderToBoard(event, target) {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    if (this.state.isReadOnly) return;

    const folderId = target.dataset.folderId;
    if (!folderId) return;

    const data = this._getWorkspaceData();
    const tab = this.state.activeTab;
    const tabEntries = data[tab] || {};
    const updates = {};
    let count = 0;

    let x = 100;
    let y = 100;

    for (const [entryId, entry] of Object.entries(tabEntries)) {
      if (entry && entry.folderId === folderId && !entry.onBoard) {
        updates[`flags.ClueBook.data.${tab}.${entryId}.onBoard`] = true;
        updates[`flags.ClueBook.data.${tab}.${entryId}.boardX`] = x;
        updates[`flags.ClueBook.data.${tab}.${entryId}.boardY`] = y;
        x += 40;
        y += 40;
        count++;
      }
    }

    if (count > 0) {
      await this._updateWorkspaceData(updates);
      ui.notifications.info(game.i18n.format("CLUEBOOK.Folder.SentToBoardSuccess", { count }));
      this.render({ parts: ["content"] });
    }
  }
};
