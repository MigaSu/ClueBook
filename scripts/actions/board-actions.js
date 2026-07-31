import { ClueBookEditDialog } from "../edit-dialog.js";
import { ClueBookSocket } from "../socket.js";
import { ClueBookTagManager } from "../tag-manager.js";

export const ClueBookBoardActionsMixin = (Base) => class extends Base {
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



}
