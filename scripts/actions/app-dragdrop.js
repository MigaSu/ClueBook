import { MediaService } from "../services/media-service.js";
import { getRandomPhotoTilt } from "../data-models.js";

export const ClueBookDragDropMixin = (Base) => class extends Base {
  _setupListDragDrop(html) {
    let draggedItem = null;
    const listContainer = html.querySelector('.entries-list');
    if (!listContainer) return;

    listContainer.addEventListener('dragover', ev => {
      ev.preventDefault();
      if (ev.dataTransfer) ev.dataTransfer.dropEffect = "copy";
    });

    listContainer.addEventListener('drop', async (ev) => {
      // If we are dragging an internal entry for re-sorting, let the entry drop handler handle it
      if (draggedItem) return;
      if (this.state.isReadOnly) return;

      ev.preventDefault();
      ev.stopPropagation();

      // 1. Check for dropped image files from desktop (single or multiple)
      if (ev.dataTransfer?.files?.length > 0) {
        const uploaded = await MediaService.uploadFiles(ev.dataTransfer.files);
        if (uploaded.length > 0) {
          const items = uploaded.map(u => ({ imgPath: u.path, title: u.name }));
          await this._createQuickMediaBatch(items, false, 100, 100);
          ui.notifications.info(game.i18n.format("CLUEBOOK.Gallery.BatchUploaded", { count: items.length }));
        }
        return;
      }

      // 2. Check for dropped Foundry document (Actor / Item)
      try {
        const TE = foundry.applications?.ux?.TextEditor?.implementation ?? TextEditor;
        const data = TE.getDragEventData ? TE.getDragEventData(ev) : JSON.parse(ev.dataTransfer.getData('text/plain') || '{}');
        if (data?.uuid) {
          const doc = await fromUuid(data.uuid);
          if (doc?.img && doc.img !== CONST.DEFAULT_TOKEN) {
            await this._createQuickMediaBatch([{ imgPath: doc.img, title: doc.name || "Entity" }], false, 100, 100);
          }
        }
      } catch (e) {}
    });

    html.querySelectorAll('.entries-list .cluebook-entry').forEach(entry => {
      entry.addEventListener('dragstart', (ev) => {
        if (ev.target.closest('.entry-controls') || ev.target.closest('.edit-mode')) {
          ev.preventDefault();
          return;
        }
        draggedItem = entry;

        listContainer.classList.add('is-dragging-list');
        setTimeout(() => entry.classList.add('is-dragging'), 0);
      });

      entry.addEventListener('dragend', async () => {
        if (!draggedItem) return;
        listContainer.classList.remove('is-dragging-list');
        draggedItem.classList.remove('is-dragging');
        draggedItem = null;

        // Save the new sort order
        const allEntries = Array.from(listContainer.querySelectorAll('.cluebook-entry'));
        const updates = {};
        
        allEntries.forEach((el, index) => {
          const id = el.dataset.entryId;
          const flagPath = `flags.ClueBook.data.${this.state.activeTab}.${id}.sort`;
          updates[flagPath] = index;
        });

        await this._updateWorkspaceData(updates);
      });

      entry.addEventListener('dragenter', (ev) => {
        ev.preventDefault();
        if (!draggedItem || draggedItem === entry) return;

        const allEntries = Array.from(listContainer.children);
        const draggedIndex = allEntries.indexOf(draggedItem);
        const targetIndex = allEntries.indexOf(entry);

        if (draggedIndex < targetIndex) {
          listContainer.insertBefore(draggedItem, entry.nextSibling);
        } else {
          listContainer.insertBefore(draggedItem, entry);
        }
      });
    });
  }

  /**
   * Helper to create multiple gallery entries in a single batched atomic update
   * @param {Array<{imgPath: string, title: string}>} items 
   * @param {boolean} onBoard 
   * @param {number} startX 
   * @param {number} startY 
   */
  async _createQuickMediaBatch(items, onBoard = false, startX = 100, startY = 100) {
    if (!items || items.length === 0) return;

    const updates = {};
    const cols = Math.min(4, Math.ceil(Math.sqrt(items.length)));
    const cardStep = 240;

    items.forEach((item, index) => {
      const id = foundry.utils.randomID();
      const newEntry = this._getEmptyEntryForTab("gallery");
      newEntry.id = id;
      newEntry.name = item.title;
      newEntry.img = item.imgPath;
      newEntry.onBoard = onBoard;
      
      if (onBoard) {
        const col = index % cols;
        const row = Math.floor(index / cols);
        newEntry.boardX = startX + (col * cardStep);
        newEntry.boardY = startY + (row * cardStep);
        newEntry.rotation = getRandomPhotoTilt(index);
      } else {
        newEntry.boardX = 100;
        newEntry.boardY = 100;
      }
      
      newEntry.sort = 9999 + index;
      updates[`flags.ClueBook.data.gallery.${id}`] = newEntry;
    });

    await this._updateWorkspaceData(updates);
    this.render({ parts: ["content"] });
  }

  /**
   * Global clipboard paste listener (Ctrl+V / Paste images from clipboard)
   */
  _setupClipboardPaste(html) {
    if (this._clipboardPasteBound) return;
    this._clipboardPasteBound = true;

    html.addEventListener('mousemove', (ev) => {
      this._lastMouseX = ev.clientX;
      this._lastMouseY = ev.clientY;
    });

    html.addEventListener('paste', async (ev) => {
      const target = ev.target;
      const isInput = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);
      if (isInput) return;

      if (this.state.isReadOnly || this._isPasting) return;

      // Extract unique image file(s) from clipboard
      let files = [];
      if (ev.clipboardData?.files?.length > 0) {
        files = Array.from(ev.clipboardData.files).filter(f => f.type && f.type.startsWith('image/'));
      }
      
      // If no files from files list, check items (take only 1st image representation to avoid duplicates from multi-MIME payloads)
      if (files.length === 0 && ev.clipboardData?.items?.length > 0) {
        const imageItem = Array.from(ev.clipboardData.items).find(item => item.type && item.type.startsWith('image/'));
        if (imageItem) {
          const file = imageItem.getAsFile();
          if (file) files.push(file);
        }
      }

      if (files.length === 0) return;

      ev.preventDefault();
      ev.stopPropagation();
      this._isPasting = true;

      try {
        const { MediaService } = await import("../services/media-service.js");
        const uploaded = await MediaService.uploadFiles(files);
        if (!uploaded.length) return;

        const defaultTitle = game.i18n.localize("CLUEBOOK.Gallery.PastedImage") || "Photo";
        const cardItems = uploaded.map(u => ({ imgPath: u.path, title: u.name || defaultTitle }));

        if (this.state.activeTab === "board" && !this.state.searchQuery) {
          let boardX = 200;
          let boardY = 200;
          const board = this.element?.querySelector('.board-canvas');
          const entriesList = board?.querySelector('.entries-list');
          if (entriesList && this._lastMouseX !== undefined && this._lastMouseY !== undefined) {
            const rect = entriesList.getBoundingClientRect();
            const currentZoom = this.state.camera?.zoom || 1;
            boardX = Math.round((this._lastMouseX - rect.left) / currentZoom);
            boardY = Math.round((this._lastMouseY - rect.top) / currentZoom);
          }
          await this._createQuickMediaBatch(cardItems, true, boardX, boardY);
        } else {
          await this._createQuickMediaBatch(cardItems, false, 100, 100);
        }

        ui.notifications.info(game.i18n.format("CLUEBOOK.Gallery.BatchUploaded", { count: cardItems.length }));
      } finally {
        this._isPasting = false;
      }
    });
  }

  /**
   * Legacy single entry helper (calls batch)
   */
  async _createQuickMediaEntry(imgPath, title, onBoard = false, boardX = 100, boardY = 100) {
    return this._createQuickMediaBatch([{ imgPath, title }], onBoard, boardX, boardY);
  }
};
