import { isEntryTab } from "../data-models.js";
import { WorkspaceAccessService } from "../services/workspace-access-service.js";

export const ClueBookBoardActionsMixin = (Base) => class extends Base {
  static async _onJumpToBoard(event, target) {
    const entry = target.closest('.cluebook-entry');
    const entryId = entry?.dataset?.entryId;
    const sourceTab = entry?.dataset?.sourceTab || this.state.activeTab;
    if (!entryId) return;
    
    let data = this._getWorkspaceData();
    const entryData = data[sourceTab]?.[entryId];
    if (!entryData || !entryData.onBoard) return;
    
    const bx = entryData.boardX || 0;
    const by = entryData.boardY || 0;
    const cardW = entryData.boardW || 280;
    const cardH = entryData.boardH || 160;
    
    const zoom = Math.max(0.6, this.state.camera?.zoom || 0.7);
    const W = this.position.width || 900;
    const H = (this.position.height || 650) - 50; // offset for tabs
    
    const cardCenterX = bx + (cardW / 2);
    const cardCenterY = by + (cardH / 2);
    
    const panX = Math.round((W / 2) - (cardCenterX * zoom));
    const panY = Math.round((H / 2) - (cardCenterY * zoom));
    
    this.state.camera = { zoom, panX, panY };
    this.state.activeTab = "board";
    this.state.highlightedEntryId = entryId;
    
    // Update DB with new camera and lastTab for active workspace
    const ws = this.state.activeWorkspace || "personal";
    const allCameras = { ...(game.user.getFlag("ClueBook", "boardCameras") || {}), [ws]: this.state.camera };
    await game.user.update({ 
      "flags.ClueBook.boardCameras": allCameras,
      "flags.ClueBook.boardCamera": this.state.camera,
      "flags.ClueBook.lastTab": "board"
    });
    
    await this.render();
    
    const settings = this.getSettings();
    const durationMs = (settings?.theme?.highlightDuration || 2) * 1000;
    setTimeout(() => {
       if (this.state.highlightedEntryId === entryId) {
          this.state.highlightedEntryId = null;
          const el = this.element?.querySelector(`.cluebook-entry[data-entry-id="${entryId}"]`);
          if (el) el.classList.remove('is-highlighted');
       }
    }, durationMs);
  }

  static async _onJumpToLinked(event, target) {
    if (event?.stopPropagation) event.stopPropagation();
    const targetId = target.dataset.targetId;
    if (!targetId) return;

    const data = this._getWorkspaceData();
    const isShared = Boolean(this.state.isShared);

    let targetEntry = null;
    let targetTab = null;

    for (const [tabKey, tabData] of Object.entries(data)) {
      if (!isEntryTab(tabKey)) continue;
      if (tabData?.[targetId]) {
        const candidate = tabData[targetId];
        if (WorkspaceAccessService.canUserViewEntry(candidate, data.folders, game.user, isShared)) {
          targetEntry = candidate;
          targetTab = tabKey;
          break;
        }
      }
    }

    if (!targetEntry) return;

    // Navigate directly to the entry's tab
    this.state.activeTab = targetTab;
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
    const durationMs = (settings?.theme?.highlightDuration || 2) * 1000;
    setTimeout(() => {
       if (this.state.highlightedEntryId === targetId) {
          this.state.highlightedEntryId = null;
          const el = this.element?.querySelector(`.cluebook-entry[data-entry-id="${targetId}"]`);
          if (el) el.classList.remove('is-highlighted');
       }
    }, durationMs);
  }

  static async _onJumpToTab(event, target) {
    if (event?.stopPropagation) event.stopPropagation();
    const entry = target.closest('.cluebook-entry');
    if (!entry) return;
    const entryId = entry.dataset.entryId;
    const sourceTab = entry.dataset.sourceTab;
    if (!sourceTab || sourceTab === "board" || !isEntryTab(sourceTab)) return;

    const data = this._getWorkspaceData();
    const isShared = Boolean(this.state.isShared);
    const entryData = data[sourceTab]?.[entryId];
    if (!entryData || !WorkspaceAccessService.canUserViewEntry(entryData, data.folders, game.user, isShared)) {
      return;
    }
    
    this.state.activeTab = sourceTab;
    await game.user.setFlag("ClueBook", "lastTab", sourceTab);
    this.state.highlightedEntryId = entryId;
    await this.render();
    
    setTimeout(() => {
      const el = this.element?.querySelector(`.cluebook-entry[data-entry-id="${entryId}"]`);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 80);
    
    const settings = this.getSettings();
    const durationMs = (settings?.theme?.highlightDuration || 2) * 1000;
    setTimeout(() => {
       if (this.state.highlightedEntryId === entryId) {
          this.state.highlightedEntryId = null;
          const el = this.element?.querySelector(`.cluebook-entry[data-entry-id="${entryId}"]`);
          if (el) el.classList.remove('is-highlighted');
       }
    }, durationMs);
  }

  static async _onRecenterBoard(event, target) {
    if (event?.preventDefault) event.preventDefault();
    this.state.camera = { zoom: 1.0, panX: 0, panY: 0 };
    const ws = this.state.activeWorkspace || "personal";
    const allCameras = { ...(game.user.getFlag("ClueBook", "boardCameras") || {}), [ws]: this.state.camera };
    await game.user.update({
      "flags.ClueBook.boardCameras": allCameras,
      "flags.ClueBook.boardCamera": this.state.camera
    });
    await this.render();
  }

  async panToBoardCard(entryId) {
    let data = this._getWorkspaceData();
    let entryData = null;
    for (const [tabKey, tabData] of Object.entries(data)) {
      if (!isEntryTab(tabKey)) continue;
      if (tabData?.[entryId]) {
        entryData = tabData[entryId];
        break;
      }
    }
    if (!entryData) return;

    const bx = entryData.boardX || 0;
    const by = entryData.boardY || 0;
    const cardW = entryData.boardW || 280;
    const cardH = entryData.boardH || 60;
    
    const zoom = Math.max(0.7, this.state.camera?.zoom || 1.0);
    const W = this.position.width || 900;
    const H = (this.position.height || 650) - 50;
    
    const cardCenterX = bx + (cardW / 2);
    const cardCenterY = by + (cardH / 2);
    
    const panX = Math.round((W / 2) - (cardCenterX * zoom));
    const panY = Math.round((H / 2) - (cardCenterY * zoom));
    
    this.state.camera = { zoom, panX, panY };
    this.state.highlightedEntryId = entryId;
    
    const ws = this.state.activeWorkspace || "personal";
    const allCameras = { ...(game.user.getFlag("ClueBook", "boardCameras") || {}), [ws]: this.state.camera };
    await game.user.update({ 
      "flags.ClueBook.boardCameras": allCameras,
      "flags.ClueBook.boardCamera": this.state.camera
    });
    
    await this.render();
    
    const settings = this.getSettings();
    const durationMs = (settings?.theme?.highlightDuration || 2) * 1000;
    setTimeout(() => {
       if (this.state.highlightedEntryId === entryId) {
          this.state.highlightedEntryId = null;
          const el = this.element?.querySelector(`.cluebook-entry[data-entry-id="${entryId}"]`);
          if (el) el.classList.remove('is-highlighted');
       }
    }, durationMs);
  }

  static async _onOpenBoardToc(event, target) {
    if (event?.stopPropagation) event.stopPropagation();
    
    const existing = this.element?.querySelector(".cb-board-toc-popover");
    if (existing) {
      existing.remove();
      return;
    }

    const data = this._getWorkspaceData();
    const labelsData = data.labels || {};
    const isShared = Boolean(this.state.isShared);
    const tocItems = Object.entries(labelsData)
      .filter(([id, e]) => e && e.onBoard && e.isToc && e.name && WorkspaceAccessService.canUserViewEntry(e, data.folders, game.user, isShared))
      .map(([id, e]) => ({ id, name: e.name, x: e.boardX || 0, y: e.boardY || 0 }))
      .sort((a, b) => a.name.localeCompare(b.name));

    if (tocItems.length === 0) {
      ui.notifications.info(game.i18n.localize("CLUEBOOK.Board.NoTocItems"));
      return;
    }

    const popover = document.createElement("div");
    popover.className = "cb-board-toc-popover";
    
    const header = document.createElement("div");
    header.className = "cb-board-toc-header";
    header.innerHTML = `<i class="fas fa-list-ol"></i> <span>${game.i18n.localize("CLUEBOOK.Board.TocTitle")}</span>`;
    popover.appendChild(header);

    for (const item of tocItems) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "cb-board-toc-item";
      btn.innerHTML = `<i class="fas fa-heading" style="opacity: 0.6; font-size: 11px;"></i> <span>${Handlebars.escapeExpression(item.name)}</span>`;
      btn.addEventListener("click", async (ev) => {
        ev.stopPropagation();
        popover.remove();
        await this.panToBoardCard(item.id);
      });
      popover.appendChild(btn);
    }

    const onOutsideClick = (ev) => {
      if (!popover.contains(ev.target) && ev.target !== target && !target.contains(ev.target)) {
        popover.remove();
        document.removeEventListener("pointerdown", onOutsideClick);
      }
    };
    setTimeout(() => document.addEventListener("pointerdown", onOutsideClick), 50);

    const boardCanvas = this.element?.querySelector(".board-canvas") || this.element;
    boardCanvas.appendChild(popover);
  }
};
