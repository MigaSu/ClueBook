import { MediaService } from "../services/media-service.js";
import { getRandomPhotoTilt } from "../data-models.js";

export const ClueBookDragDropMixin = (Base) => class extends Base {
  _setupListDragDrop(html) {
    let draggedEntry = null;
    let draggedFolder = null;
    const listContainer = html.querySelector('.entries-list');
    if (!listContainer) return;

    listContainer.addEventListener('dragover', ev => {
      ev.preventDefault();
      if (ev.dataTransfer) ev.dataTransfer.dropEffect = "move";
    });

    listContainer.addEventListener('drop', async (ev) => {
      if (this.state.isReadOnly) return;
      if (draggedEntry || draggedFolder) return;

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

    // 1. Cards Drag & Drop (into folders, root, or re-sorting)
    html.querySelectorAll('.entries-list .cluebook-entry').forEach(entry => {
      entry.addEventListener('dragstart', (ev) => {
        if (ev.target.closest('.entry-controls') || ev.target.closest('.edit-mode')) {
          ev.preventDefault();
          return;
        }
        draggedEntry = entry;
        ev.dataTransfer.setData('text/plain', entry.dataset.entryId);
        ev.dataTransfer.effectAllowed = 'move';
        listContainer.classList.add('is-dragging-list');
        setTimeout(() => entry.classList.add('is-dragging'), 0);
      });

      entry.addEventListener('dragover', (ev) => {
        if (draggedEntry && draggedEntry !== entry) {
          ev.preventDefault();
          if (ev.dataTransfer) ev.dataTransfer.dropEffect = 'move';
        }
      });

      entry.addEventListener('dragenter', (ev) => {
        if (!draggedEntry || draggedEntry === entry || this.state.isReadOnly) return;
        ev.preventDefault();

        const container = entry.parentNode;
        if (!container) return;

        const siblings = Array.from(container.children).filter(c => c.classList?.contains('cluebook-entry'));
        const draggedIndex = siblings.indexOf(draggedEntry);
        const targetIndex = siblings.indexOf(entry);

        if (draggedIndex !== -1 && targetIndex !== -1) {
          if (draggedIndex < targetIndex) {
            container.insertBefore(draggedEntry, entry.nextSibling);
          } else {
            container.insertBefore(draggedEntry, entry);
          }
        } else {
          container.insertBefore(draggedEntry, entry);
        }
      });

      entry.addEventListener('dragend', async () => {
        if (!draggedEntry) return;
        listContainer.classList.remove('is-dragging-list');
        draggedEntry.classList.remove('is-dragging');
        html.querySelectorAll('.cb-folder-section').forEach(f => f.classList.remove('is-dragover'));

        if (this.state.isReadOnly) {
          draggedEntry = null;
          return;
        }

        // Switch active sort to manual if in quests or timeline
        if (this.state.activeTab === "quests" && this.state.questSortMode !== "manual") {
          this.state.questSortMode = "manual";
        }
        if (this.state.activeTab === "timeline" && this.state.timelineSortMode !== "manual") {
          this.state.timelineSortMode = "manual";
        }

        // Save new order and folder assignment across all cards in the tab
        const allCardElements = Array.from(listContainer.querySelectorAll('.cluebook-entry'));
        const sourceTab = this.state.activeTab;
        const updates = {};

        allCardElements.forEach((el, index) => {
          const entryId = el.dataset.entryId;
          if (!entryId) return;

          const folderSection = el.closest('.cb-folder-section');
          const targetFolderId = folderSection ? (folderSection.dataset.folderId || "") : "";

          updates[`flags.ClueBook.data.${sourceTab}.${entryId}.sort`] = index;
          updates[`flags.ClueBook.data.${sourceTab}.${entryId}.folderId`] = targetFolderId;
        });

        draggedEntry = null;
        await this._updateWorkspaceData(updates);
        this.render({ parts: ["content"] });
      });
    });

    // 2. Folder Dropzones (Drop card into folder)
    html.querySelectorAll('.cb-folder-section').forEach(folderEl => {
      const folderId = folderEl.dataset.folderId;

      folderEl.addEventListener('dragover', (ev) => {
        if (draggedEntry) {
          ev.preventDefault();
          ev.stopPropagation();
          folderEl.classList.add('is-dragover');
          if (ev.dataTransfer) ev.dataTransfer.dropEffect = 'move';
        }
      });

      folderEl.addEventListener('dragleave', (ev) => {
        if (!folderEl.contains(ev.relatedTarget)) {
          folderEl.classList.remove('is-dragover');
        }
      });

      folderEl.addEventListener('drop', async (ev) => {
        if (!draggedEntry || this.state.isReadOnly) return;
        ev.preventDefault();
        ev.stopPropagation();
        folderEl.classList.remove('is-dragover');

        const entryId = draggedEntry.dataset.entryId;
        const sourceTab = draggedEntry.dataset.sourceTab || this.state.activeTab;
        if (!entryId) return;

        const entriesContainer = folderEl.querySelector('.cb-folder-entries');
        if (entriesContainer && draggedEntry.parentNode !== entriesContainer) {
          entriesContainer.appendChild(draggedEntry);
        }

        await this._saveDataRaw(sourceTab, entryId, "folderId", folderId);
        this.render({ parts: ["content"] });
      });
    });

    // 3. Root Dropzone (Drop card out of folder back to root)
    const rootContainer = html.querySelector('.cb-root-entries');
    if (rootContainer) {
      rootContainer.addEventListener('dragover', (ev) => {
        if (draggedEntry) {
          ev.preventDefault();
          if (ev.dataTransfer) ev.dataTransfer.dropEffect = 'move';
        }
      });

      rootContainer.addEventListener('drop', async (ev) => {
        if (!draggedEntry || this.state.isReadOnly) return;
        ev.preventDefault();
        ev.stopPropagation();
        const entryId = draggedEntry.dataset.entryId;
        const sourceTab = draggedEntry.dataset.sourceTab || this.state.activeTab;

        if (entryId) {
          if (draggedEntry.parentNode !== rootContainer) {
            rootContainer.appendChild(draggedEntry);
          }
          await this._saveDataRaw(sourceTab, entryId, "folderId", "");
          this.render({ parts: ["content"] });
        }
      });
    }

    // 4. Folder Header Drag & Drop (Reordering folders)
    html.querySelectorAll('.cb-folder-header[draggable="true"]').forEach(header => {
      const folderSection = header.closest('.cb-folder-section');

      header.addEventListener('dragstart', (ev) => {
        if (ev.target.closest('.cb-folder-controls')) {
          ev.preventDefault();
          return;
        }
        draggedFolder = folderSection;
        ev.dataTransfer.effectAllowed = 'move';
        setTimeout(() => folderSection.classList.add('is-folder-dragging'), 0);
      });

      header.addEventListener('dragend', async () => {
        if (!draggedFolder) return;
        draggedFolder.classList.remove('is-folder-dragging');
        html.querySelectorAll('.cb-folder-section').forEach(f => f.classList.remove('is-folder-dragover'));
        draggedFolder = null;
      });

      header.addEventListener('dragover', (ev) => {
        if (draggedFolder && draggedFolder !== folderSection) {
          ev.preventDefault();
          ev.stopPropagation();
          folderSection.classList.add('is-folder-dragover');
        }
      });

      header.addEventListener('dragleave', () => {
        folderSection.classList.remove('is-folder-dragover');
      });

      header.addEventListener('drop', async (ev) => {
        if (!draggedFolder || draggedFolder === folderSection || this.state.isReadOnly) return;
        ev.preventDefault();
        ev.stopPropagation();
        folderSection.classList.remove('is-folder-dragover');

        const parent = folderSection.parentNode;
        const allFolders = Array.from(parent.querySelectorAll('.cb-folder-section'));
        const rootContainer = parent.querySelector('.cb-root-entries');

        const draggedIdx = allFolders.indexOf(draggedFolder);
        const targetIdx = allFolders.indexOf(folderSection);

        if (draggedIdx < targetIdx) {
          parent.insertBefore(draggedFolder, folderSection.nextSibling);
        } else {
          parent.insertBefore(draggedFolder, folderSection);
        }

        // Save new folder sort order and position relative to root container
        const updatedAllChildren = Array.from(parent.children);
        const currentRootIndex = rootContainer ? updatedAllChildren.indexOf(rootContainer) : -1;

        const updatedFolders = Array.from(parent.querySelectorAll('.cb-folder-section'));
        const updates = {};
        updatedFolders.forEach((el, index) => {
          const fId = el.dataset.folderId;
          if (fId) {
            const childIndex = updatedAllChildren.indexOf(el);
            const position = (currentRootIndex !== -1 && childIndex > currentRootIndex) ? "bottom" : "top";
            updates[`flags.ClueBook.data.folders.${fId}.sort`] = index;
            updates[`flags.ClueBook.data.folders.${fId}.position`] = position;
          }
        });
        await this._updateWorkspaceData(updates);
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
