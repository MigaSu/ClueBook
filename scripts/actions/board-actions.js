import { ClueBookEditDialog } from "../edit-dialog.js";
import { ClueBookSocket } from "../socket.js";
import { ClueBookTagManager } from "../tag-manager.js";
import { getForcedDeletion } from "../data-models.js";

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
    const durationMs = (settings.theme.highlightDuration || 2) * 1000;
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
    if (event?.stopPropagation) event.stopPropagation();
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
    if (event?.stopPropagation) event.stopPropagation();
    const targetId = target.dataset.targetId;
    const entry = target.closest('.cluebook-entry');
    const sourceId = entry.dataset.entryId;
    if (!targetId || !sourceId) return;

    let links = this._getWorkspaceLinks();
    const [a, b] = [sourceId, targetId].sort();
    const key = `${a}_${b}`;

    if (links[key]) {
      await this._updateWorkspaceData({ [`flags.ClueBook.data.links.${key}`]: getForcedDeletion() });
      ui.notifications.info(game.i18n.localize("CLUEBOOK.AppActions.LinkDeleted"));
      this.render({ parts: ["content"] });
    }
  }



}
