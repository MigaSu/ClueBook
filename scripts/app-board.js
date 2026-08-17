import { ClueBookEditDialog } from "./edit-dialog.js";
import { getForcedDeletion, getRandomPhotoTilt } from "./data-models.js";

export const ClueBookBoardMixin = (Base) => class extends Base {
  _setupBoardInteractivity(html) {
    const board = html.querySelector('.board-canvas');
    if (!board) return;
    
    const entriesList = board.querySelector('.entries-list');
    if (!entriesList) return;

    // --- Fast In-Memory Index Structures (Zero-Reflow Engine) ---
    const cardMap = new Map();       // cardId -> { id, el, tab, x, y, w, h, isPinned }
    const linkRecords = [];          // array of LinkRecords
    const linksByCard = new Map();   // cardId -> Set<LinkRecord>

    if (!this._topGalleryZIndex) this._topGalleryZIndex = 4;
    if (!this._topNoteZIndex) this._topNoteZIndex = 10;

    // 1. Index Cards & Pre-calculate Dimensions (Batched Read)
    const cardElements = board.querySelectorAll('.cluebook-entry');
    cardElements.forEach(el => {
      const id = el.dataset.entryId;
      if (!id) return;
      const x = parseInt(el.style.left) || 0;
      const y = parseInt(el.style.top) || 0;
      const w = el.offsetWidth || 300;
      const h = el.offsetHeight || 180;
      cardMap.set(id, {
        id,
        el,
        tab: el.dataset.sourceTab,
        x,
        y,
        w,
        h,
        isPinned: el.dataset.pinned === "true"
      });
    });

    // 2. Index Links & Labels (O(1) Linking Graph)
    const linkGroups = board.querySelectorAll('.board-link');
    linkGroups.forEach(g => {
      const sourceId = g.dataset.source;
      const targetId = g.dataset.target;
      if (!sourceId || !targetId) return;

      const lines = Array.from(g.querySelectorAll('line'));
      const labelEl = board.querySelector(`.board-link-label[data-source="${sourceId}"][data-target="${targetId}"]`);
      const record = { g, sourceId, targetId, lines, labelEl };
      linkRecords.push(record);

      if (!linksByCard.has(sourceId)) linksByCard.set(sourceId, new Set());
      if (!linksByCard.has(targetId)) linksByCard.set(targetId, new Set());
      linksByCard.get(sourceId).add(record);
      linksByCard.get(targetId).add(record);
    });

    // 3. Fast Line Rendering Primitives (Zero DOM Queries during animation)
    const updateLinkRecord = (record) => {
      const s = cardMap.get(record.sourceId);
      const t = cardMap.get(record.targetId);
      if (s && t) {
        const sX = Math.round(s.x + (s.w / 2));
        const sY = Math.round(s.y + (s.h / 2));
        const tX = Math.round(t.x + (t.w / 2));
        const tY = Math.round(t.y + (t.h / 2));
        if (record.g) record.g.style.display = "";
        for (let i = 0; i < record.lines.length; i++) {
          const line = record.lines[i];
          line.setAttribute('x1', sX);
          line.setAttribute('y1', sY);
          line.setAttribute('x2', tX);
          line.setAttribute('y2', tY);
          line.setAttribute('opacity', '1');
        }
        if (record.labelEl) {
          record.labelEl.style.display = "";
          record.labelEl.style.left = `${(sX + tX) / 2}px`;
          record.labelEl.style.top = `${(sY + tY) / 2}px`;
        }
      } else {
        if (record.g) record.g.style.display = "none";
        for (let i = 0; i < record.lines.length; i++) {
          record.lines[i].setAttribute('opacity', '0');
        }
        if (record.labelEl) {
          record.labelEl.style.display = "none";
        }
      }
    };

    const updateAllLines = () => {
      for (let i = 0; i < linkRecords.length; i++) {
        updateLinkRecord(linkRecords[i]);
      }
    };

    const updateLinesForCards = (cardIds) => {
      const affectedLinks = new Set();
      for (let i = 0; i < cardIds.length; i++) {
        const set = linksByCard.get(cardIds[i]);
        if (set) {
          set.forEach(l => affectedLinks.add(l));
        }
      }
      affectedLinks.forEach(updateLinkRecord);
    };

    // Initial line positioning
    updateAllLines();

    // Store references for external helper calls
    this._boardIndex = { cardMap, linkRecords, linksByCard, updateAllLines, updateLinkRecord };

    // --- Pan & Zoom State ---
    let currentZoom = 1;
    let currentPanX = 0;
    let currentPanY = 0;
    let isPanning = false;
    let panStartX = 0, panStartY = 0;
    let rAF_frame = null;
    let wheelInteractionTimeout = null;

    if (!this.state.camera) {
      this.state.camera = game.user.getFlag("ClueBook", "boardCamera") || { zoom: 1, panX: 0, panY: 0 };
    }
    currentZoom = Number(this.state.camera.zoom) || 1;
    currentPanX = Math.round(Number(this.state.camera.panX) || 0);
    currentPanY = Math.round(Number(this.state.camera.panY) || 0);

    const syncCameraToState = () => {
      this.state.camera = { zoom: currentZoom, panX: currentPanX, panY: currentPanY };
    };
    syncCameraToState();

    const applyTransform = () => {
      entriesList.style.transformOrigin = "0 0";
      entriesList.style.transform = `translate(${Math.round(currentPanX)}px, ${Math.round(currentPanY)}px) scale(${currentZoom})`;
    };
    applyTransform();

    const persistCameraState = foundry.utils.debounce(() => {
      if (this.state.camera) {
        game.user.update({ "flags.ClueBook.boardCamera": this.state.camera });
      }
    }, 600);

    // Zoom (Wheel) with smooth geometric scaling and live-sync deferral
    board.addEventListener('wheel', (ev) => {
      ev.preventDefault();
      const direction = ev.deltaY < 0 ? 1 : -1;
      const zoomFactor = direction > 0 ? 1.1 : 0.90909;
      let newZoom = Math.min(3.0, Math.max(0.1, Number((currentZoom * zoomFactor).toFixed(4))));

      if (Math.abs(newZoom - currentZoom) > 0.0001) {
        const rect = board.getBoundingClientRect();
        const mouseX = ev.clientX - rect.left;
        const mouseY = ev.clientY - rect.top;

        const scaleRatio = newZoom / currentZoom;
        currentPanX = Math.round(mouseX - (mouseX - currentPanX) * scaleRatio);
        currentPanY = Math.round(mouseY - (mouseY - currentPanY) * scaleRatio);
        currentZoom = newZoom;

        syncCameraToState();
        applyTransform();
        persistCameraState();

        this.state.isBoardInteracting = true;
        clearTimeout(wheelInteractionTimeout);
        wheelInteractionTimeout = setTimeout(() => {
          this.state.isBoardInteracting = false;
          if (this.state.pendingRender) {
            this.state.pendingRender = false;
            this.render({ parts: ["content"] });
          }
        }, 500);
      }
    }, { passive: false });

    let rightClickStartX = 0;
    let rightClickStartY = 0;

    // Context menu on empty board or on single gallery image (e.g. map)
    board.addEventListener('contextmenu', ev => {
      const clickedEntry = ev.target.closest('.cluebook-entry');
      if (clickedEntry) {
        // If a group of entries is selected (>1), let the card mass-selection context menu handle it
        if (this.state.selectedEntries.size > 1 && this.state.selectedEntries.has(clickedEntry.dataset.entryId)) {
          return;
        }
        // If clicked on gallery card (image / map), allow opening the creation context menu!
        if (clickedEntry.dataset.sourceTab !== "gallery") {
          return;
        }
      }
      ev.preventDefault();
      if (Math.abs(ev.clientX - rightClickStartX) > 5 || Math.abs(ev.clientY - rightClickStartY) > 5) return;
      this._showBoardCreateContextMenu(ev, currentZoom, currentPanX, currentPanY);
    });

    // Pan Start & Deselect
    board.addEventListener('mousedown', (ev) => {
      if (ev.button === 2) {
        rightClickStartX = ev.clientX;
        rightClickStartY = ev.clientY;
      }
      
      if (ev.button === 2 || ev.button === 1) {
        isPanning = true;
        this.state.isBoardInteracting = true;
        panStartX = ev.clientX - currentPanX;
        panStartY = ev.clientY - currentPanY;
        ev.preventDefault();
      }
      
      // Alt + Left Click -> Instant Pin Drop!
      if (ev.button === 0 && ev.altKey) {
        const clickedCard = ev.target.closest('.cluebook-entry');
        if (!clickedCard || clickedCard.dataset.sourceTab === "gallery") {
          ev.preventDefault();
          ev.stopPropagation();
          if (this.state.isReadOnly) return;

          const rect = entriesList.getBoundingClientRect();
          const boardX = Math.round((ev.clientX - rect.left) / currentZoom);
          const boardY = Math.round((ev.clientY - rect.top) / currentZoom);

          const id = foundry.utils.randomID();
          const newEntry = this._getEmptyEntryForTab("pins");
          newEntry.id = id;
          newEntry.name = "";
          newEntry.onBoard = true;
          newEntry.boardX = boardX;
          newEntry.boardY = boardY;

          this._updateWorkspaceData({
            [`flags.ClueBook.data.pins.${id}`]: newEntry
          }).then(() => {
            this.render({ parts: ["content"] });
            new ClueBookEditDialog({
              entry: newEntry,
              sourceTab: "pins",
              entryId: id,
              workspace: this.state.activeWorkspace,
              onSave: async (updated) => {
                await this._updateWorkspaceData({ [`flags.ClueBook.data.pins.${id}`]: updated });
                this.render({ parts: ["content"] });
              }
            }).render(true);
          });
          return;
        }
      }

      // Left click on empty board -> deselect or lasso, and close pin popovers
      if (ev.button === 0 && ev.target.closest('.cluebook-entry') === null && ev.target.closest('.entry-controls') === null) {
        board.querySelectorAll('.is-pin-card.is-popover-open').forEach(el => el.classList.remove('is-popover-open'));
        if (!ev.shiftKey) {
          this.state.selectedEntries.clear();
          html.querySelectorAll('.cluebook-entry.is-selected').forEach(el => el.classList.remove('is-selected'));
        }
        
        const rect = entriesList.getBoundingClientRect();
        this.isLasso = true;
        this.state.isBoardInteracting = true;
        this.lassoStartX = (ev.clientX - rect.left) / currentZoom;
        this.lassoStartY = (ev.clientY - rect.top) / currentZoom;
        
        this.lassoBox = document.createElement('div');
        this.lassoBox.className = 'cb-lasso-box';
        entriesList.appendChild(this.lassoBox);
        ev.preventDefault();
      }
    });

    // Board Drag & Drop for Image Files and Actors/Items
    board.addEventListener('dragover', (ev) => {
      ev.preventDefault();
      if (ev.dataTransfer) ev.dataTransfer.dropEffect = "copy";
    });

    board.addEventListener('drop', async (ev) => {
      if (this.state.isReadOnly) return;
      ev.preventDefault();
      ev.stopPropagation();

      const rect = entriesList.getBoundingClientRect();
      const boardX = Math.round((ev.clientX - rect.left) / currentZoom);
      const boardY = Math.round((ev.clientY - rect.top) / currentZoom);

      // 1. Files dropped from desktop (single or multiple)
      if (ev.dataTransfer?.files?.length > 0) {
        const { MediaService } = await import("./services/media-service.js");
        const uploaded = await MediaService.uploadFiles(ev.dataTransfer.files);
        if (uploaded.length > 0) {
          const items = uploaded.map(u => ({ imgPath: u.path, title: u.name }));
          await this._createQuickMediaBatch(items, true, boardX, boardY);
          ui.notifications.info(game.i18n.format("CLUEBOOK.Gallery.BatchUploaded", { count: items.length }));
        }
        return;
      }

      // 2. Foundry documents (Actor / Item)
      try {
        const TE = foundry.applications?.ux?.TextEditor?.implementation ?? TextEditor;
        const data = TE.getDragEventData ? TE.getDragEventData(ev) : JSON.parse(ev.dataTransfer.getData('text/plain') || '{}');
        if (data?.uuid) {
          const doc = await fromUuid(data.uuid);
          if (doc?.img && doc.img !== CONST.DEFAULT_TOKEN) {
            await this._createQuickMediaEntry(doc.img, doc.name || "Entity", true, boardX, boardY);
          }
        }
      } catch (e) {}
    });

    // Recenter Button
    const recenterBtn = this.element.querySelector('[data-action="recenterBoard"]');
    if (recenterBtn) {
      recenterBtn.addEventListener('click', (ev) => {
        ev.preventDefault();
        if (cardMap.size > 0) {
          let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
          cardMap.forEach(item => {
            if (item.x < minX) minX = item.x;
            if (item.y < minY) minY = item.y;
            if (item.x + item.w > maxX) maxX = item.x + item.w;
            if (item.y + item.h > maxY) maxY = item.y + item.h;
          });
          if (minX !== Infinity) {
            const centerX = minX + (maxX - minX) / 2;
            const centerY = minY + (maxY - minY) / 2;
            currentZoom = 0.5;
            currentPanX = Math.round((board.offsetWidth / 2) - (centerX * currentZoom));
            currentPanY = Math.round((board.offsetHeight / 2) - (centerY * currentZoom));
          }
        } else {
          currentPanX = 0;
          currentPanY = 0;
          currentZoom = 1;
        }
        syncCameraToState();
        applyTransform();
        persistCameraState();
      });
    }

    // --- Interactive Linking State ---
    let linkingSource = null;
    let tempLine = null;

    board.querySelectorAll('.btn-link').forEach(btn => {
      btn.addEventListener('click', (ev) => {
        ev.stopPropagation();
        const entry = ev.currentTarget.closest('.cluebook-entry');
        if (linkingSource === entry) {
          linkingSource.classList.remove('linking-source');
          linkingSource = null;
          this.state.isBoardInteracting = false;
          return;
        }
        if (!linkingSource) {
          linkingSource = entry;
          this.state.isBoardInteracting = true;
          entry.classList.add('linking-source');
        } else {
          const targetId = entry.dataset.entryId;
          const sourceId = linkingSource.dataset.entryId;
          linkingSource.classList.remove('linking-source');
          linkingSource = null;
          this.state.isBoardInteracting = false;
          if (sourceId !== targetId) {
            this._createLink(sourceId, targetId);
          }
        }
      });
    });

    board.querySelectorAll('.board-link').forEach(link => {
      link.addEventListener('dblclick', async (ev) => {
        if (this.state.isReadOnly) return;
        ev.preventDefault();
        ev.stopPropagation();
        await this._editConnectionSettings(link.dataset.source, link.dataset.target);
      });
    });

    board.querySelectorAll('.board-link-label').forEach(lbl => {
      lbl.addEventListener('dblclick', async (ev) => {
        if (this.state.isReadOnly) return;
        ev.preventDefault();
        ev.stopPropagation();
        await this._editConnectionSettings(lbl.dataset.source, lbl.dataset.target);
      });
    });

    board.querySelectorAll('.entry-controls').forEach(ctrl => {
      ctrl.addEventListener('mousedown', (ev) => ev.stopPropagation());
    });

    // Content Resize Observer / Mouseup
    board.querySelectorAll('.entry-content').forEach(content => {
      content.addEventListener('mouseup', (ev) => {
        if (this.state.isReadOnly) return;
        if (content.style.width || content.style.height) {
          const entry = content.closest('.cluebook-entry');
          const w = content.style.width ? parseInt(content.style.width) : null;
          const h = content.style.height ? parseInt(content.style.height) : null;
          const t = entry.dataset.sourceTab;
          if (t === "labels" || t === "pins") return;
          const id = entry.dataset.entryId;
          if (w && w !== parseInt(entry.dataset.lastW)) {
            this._saveDataRaw(t, id, "boardW", w);
            entry.dataset.lastW = w;
            const item = cardMap.get(id);
            if (item) { item.w = w; updateLinesForCards([id]); }
          }
          if (h && h !== parseInt(entry.dataset.lastH)) {
            this._saveDataRaw(t, id, "boardH", h);
            entry.dataset.lastH = h;
            const item = cardMap.get(id);
            if (item) { item.h = h; updateLinesForCards([id]); }
          }
        }
      });
    });

    // --- Card Dragging & Interaction ---
    let draggedEntry = null;
    let startX = 0, startY = 0;
    let activeDragItems = null;
    let movingCardIds = null;

    cardElements.forEach(entry => {
      const entryId = entry.dataset.entryId;

      entry.addEventListener('contextmenu', (ev) => {
        if (this.state.isReadOnly) return;
        if (this.state.selectedEntries.has(entryId) && this.state.selectedEntries.size > 1) {
          ev.preventDefault();
          ev.stopPropagation();
          this._showBoardContextMenu(ev, entry);
        }
      });

      entry.addEventListener('dblclick', (ev) => {
        if (this.state.isReadOnly) return;
        if (ev.target.closest('.cb-quest-status-wrapper, .cb-clickable-badge, [data-action="toggleQuestStatusMenu"]')) {
          ev.preventDefault();
          ev.stopPropagation();
          return;
        }
        ev.stopPropagation();
        const sourceTab = entry.dataset.sourceTab;
        const data = this._getWorkspaceData()?.[sourceTab]?.[entryId];
        if (!data) return;

        new ClueBookEditDialog({
          entry: data,
          sourceTab: sourceTab,
          entryId: entryId,
          onSave: async (savedData) => {
            const flagUpdates = {};
            for (const [key, value] of Object.entries(savedData)) {
              flagUpdates[`flags.ClueBook.data.${sourceTab}.${entryId}.${key}`] = value;
            }
            await this._updateWorkspaceData(flagUpdates);
            this.render({ parts: ["content"] });
          }
        }).render(true);
      });

      // --- Pin-specific Interactions (Hover Grace Delay & Clickable Links) ---
      if (entry.classList.contains('is-pin-card')) {
        let pinHideTimeout = null;
        entry.addEventListener('mouseenter', () => {
          if (draggedEntry || isPanning || this.isLasso) return;
          if (pinHideTimeout) {
            clearTimeout(pinHideTimeout);
            pinHideTimeout = null;
          }
          entry.classList.add('is-popover-hover');
        });

        entry.addEventListener('mouseleave', () => {
          if (pinHideTimeout) clearTimeout(pinHideTimeout);
          pinHideTimeout = setTimeout(() => {
            entry.classList.remove('is-popover-hover');
          }, 1000);
        });

        const badge = entry.querySelector('.cb-pin-badge');
        badge?.addEventListener('click', (ev) => {
          if (draggedEntry || this.state.isBoardInteracting) return;
          entry.classList.toggle('is-popover-open');
        });

        const popover = entry.querySelector('.cb-pin-popover');
        if (popover) {
          popover.addEventListener('mousedown', (ev) => ev.stopPropagation());
          popover.addEventListener('click', async (ev) => {
            const link = ev.target.closest('a.content-link, .cb-mention-link, [data-uuid]');
            if (!link) return;
            ev.stopPropagation();
            const uuid = link.dataset.uuid;
            if (uuid) {
              const doc = await fromUuid(uuid);
              doc?.sheet?.render(true);
            } else if (link.dataset.mentionId) {
              this._jumpToEntryOnBoard(link.dataset.mentionId);
            }
          });
        }
      }

      entry.addEventListener('mouseenter', () => {
        if (!this.getSettings().theme.hoverHighlight) return;
        if (draggedEntry || isPanning || this.isLasso || linkingSource) return;
        
        if (this._hoverTimer) clearTimeout(this._hoverTimer);
        if (this._hoverHideTimer) clearTimeout(this._hoverHideTimer);
        
        this._hoverTimer = setTimeout(() => {
          if (draggedEntry || isPanning || this.isLasso || linkingSource) return;
          this._highlightConnections(entryId);
        }, this.getSettings().theme.hoverDelay || 1000);
      });

      entry.addEventListener('mouseleave', () => {
        if (this._hoverTimer) clearTimeout(this._hoverTimer);
        if (board.classList.contains('is-dimmed')) {
          this._hoverHideTimer = setTimeout(() => {
            this._resetHighlight();
          }, 100);
        }
      });

      entry.addEventListener('mousedown', (ev) => {
        if (this.state.isReadOnly) return;
        if (ev.button !== 0) return;
        if (ev.target.closest('.entry-controls') || ev.target.closest('.edit-mode') || ev.target.closest('.cb-pin-popover')) {
          ev.stopPropagation();
          return;
        }
        if (entry.classList.contains('is-editing')) return;
        
        if (this._hoverTimer) clearTimeout(this._hoverTimer);
        this._resetHighlight();
        
        // Ctrl+Click: Quick thread creation
        if (ev.ctrlKey || ev.metaKey) {
          if (linkingSource) return;
          linkingSource = entry;
          this.state.isBoardInteracting = true;
          entry.classList.add('linking-source');
          
          tempLine = document.createElementNS("http://www.w3.org/2000/svg", "line");
          tempLine.setAttribute("stroke", this.getSettings().theme.linkColor || "white");
          tempLine.setAttribute("stroke-width", "3");
          tempLine.setAttribute("stroke-dasharray", "5,5");
          tempLine.style.pointerEvents = "none";
          
          const sItem = cardMap.get(entryId) || { x: parseInt(entry.style.left) || 0, y: parseInt(entry.style.top) || 0, w: 300, h: 180 };
          const sX = Math.round(sItem.x + (sItem.w / 2));
          const sY = Math.round(sItem.y + (sItem.h / 2));
          tempLine.setAttribute("x1", sX);
          tempLine.setAttribute("y1", sY);
          tempLine.setAttribute("x2", sX);
          tempLine.setAttribute("y2", sY);
          
          const svg = board.querySelector('.board-svg');
          if (svg) svg.appendChild(tempLine);
          
          ev.preventDefault();
          return;
        }

        // Shift+Click: Multi-select
        if (ev.shiftKey) {
          if (this.state.selectedEntries.has(entryId)) {
            this.state.selectedEntries.delete(entryId);
            entry.classList.remove('is-selected');
          } else {
            this.state.selectedEntries.add(entryId);
            entry.classList.add('is-selected');
          }
          ev.preventDefault();
          return;
        }

        if (linkingSource) return;
        if (entry.dataset.pinned === "true") return;
        
        // Check resize handle exclusion
        const content = entry.querySelector('.entry-content');
        if (content) {
          const rect = content.getBoundingClientRect();
          const handleSize = 40 * currentZoom;
          if (ev.clientX > rect.right - handleSize && ev.clientY > rect.bottom - handleSize) {
            return;
          }
        }
        
        if (!this.state.selectedEntries.has(entryId)) {
          this.state.selectedEntries.clear();
          board.querySelectorAll('.cluebook-entry.is-selected').forEach(el => el.classList.remove('is-selected'));
          this.state.selectedEntries.add(entryId);
          entry.classList.add('is-selected');
        }

        // Bring to front on select (only for unpinned cards)
        if (entry.dataset.pinned !== "true") {
          const galleryBelow = this.getSettings()?.features?.galleryAlwaysBelow;
          if (galleryBelow) {
            const isGallery = entry.dataset.sourceTab === "gallery";
            const newZ = isGallery ? (++this._topGalleryZIndex) : (++this._topNoteZIndex);
            entry.style.zIndex = String(newZ);
          } else {
            if (!this._topGlobalZIndex) this._topGlobalZIndex = 20;
            entry.style.zIndex = String(++this._topGlobalZIndex);
          }
        }

        // Build active drag items from cache (Zero Reflows during drag!)
        activeDragItems = [];
        this.state.selectedEntries.forEach(sId => {
          const item = cardMap.get(sId);
          if (item && !item.isPinned) {
            activeDragItems.push({
              item,
              initialLeft: item.x,
              initialTop: item.y
            });
          }
        });

        movingCardIds = activeDragItems.map(d => d.item.id);
        draggedEntry = entry;
        this.state.isBoardInteracting = true;
        startX = ev.clientX;
        startY = ev.clientY;
        
        ev.preventDefault();
      });

      // Click to toggle sticky popover for interactive pins
      entry.addEventListener('click', (ev) => {
        const pinBadge = ev.target.closest('.cb-pin-badge');
        if (pinBadge) {
          ev.stopPropagation();
          entry.classList.toggle('is-popover-open');
        }
      });
    });

    if (this._boardMoveHandler) document.removeEventListener('mousemove', this._boardMoveHandler);
    if (this._boardUpHandler) document.removeEventListener('mouseup', this._boardUpHandler);

    this._boardMoveHandler = (ev) => {
      if (rAF_frame) return;

      rAF_frame = requestAnimationFrame(() => {
        rAF_frame = null;

        if (isPanning) {
          currentPanX = ev.clientX - panStartX;
          currentPanY = ev.clientY - panStartY;
          syncCameraToState();
          applyTransform();
          persistCameraState();
        } else if (this.isLasso) {
          const rect = entriesList.getBoundingClientRect();
          const endX = (ev.clientX - rect.left) / currentZoom;
          const endY = (ev.clientY - rect.top) / currentZoom;
          
          const left = Math.min(this.lassoStartX, endX);
          const top = Math.min(this.lassoStartY, endY);
          const width = Math.abs(endX - this.lassoStartX);
          const height = Math.abs(endY - this.lassoStartY);
          const right = left + width;
          const bottom = top + height;
          
          if (this.lassoBox) {
            this.lassoBox.style.left = `${left}px`;
            this.lassoBox.style.top = `${top}px`;
            this.lassoBox.style.width = `${width}px`;
            this.lassoBox.style.height = `${height}px`;
          }

          // High-Performance In-Memory AABB Intersection Test (<0.1ms for 1000 cards)
          cardMap.forEach(card => {
            if (card.x < right && card.x + card.w > left && card.y < bottom && card.y + card.h > top) {
              if (!this.state.selectedEntries.has(card.id)) {
                this.state.selectedEntries.add(card.id);
                card.el.classList.add('is-selected');
              }
            } else {
              if (this.state.selectedEntries.has(card.id)) {
                this.state.selectedEntries.delete(card.id);
                card.el.classList.remove('is-selected');
              }
            }
          });

        } else if (draggedEntry && activeDragItems && activeDragItems.length > 0) {
          const dx = (ev.clientX - startX) / currentZoom;
          const dy = (ev.clientY - startY) / currentZoom;
          const snap = ev.shiftKey || this.getSettings().theme.snapToGrid;
          
          for (let i = 0; i < activeDragItems.length; i++) {
            const dragInfo = activeDragItems[i];
            let newX = dragInfo.initialLeft + dx;
            let newY = dragInfo.initialTop + dy;
            
            if (snap) {
              newX = Math.round(newX / 20) * 20;
              newY = Math.round(newY / 20) * 20;
            }
            
            dragInfo.item.x = newX;
            dragInfo.item.y = newY;
            dragInfo.item.el.style.left = `${newX}px`;
            dragInfo.item.el.style.top = `${newY}px`;
          }

          // Incremental update: update ONLY lines connected to moving cards!
          updateLinesForCards(movingCardIds);

        } else if (linkingSource && tempLine) {
          const rect = entriesList.getBoundingClientRect();
          const x = Math.round((ev.clientX - rect.left) / currentZoom);
          const y = Math.round((ev.clientY - rect.top) / currentZoom);
          tempLine.setAttribute("x2", x);
          tempLine.setAttribute("y2", y);
        }
      });
    };

    this._boardUpHandler = async (ev) => {
      if (isPanning) {
        isPanning = false;
        currentPanX = ev.clientX - panStartX;
        currentPanY = ev.clientY - panStartY;
        syncCameraToState();
        persistCameraState();
      }

      if (linkingSource) {
        if (tempLine) {
          tempLine.remove();
          tempLine = null;
        }
        linkingSource.classList.remove('linking-source');
        
        const targetEntry = document.elementFromPoint(ev.clientX, ev.clientY)?.closest('.cluebook-entry');
        if (targetEntry && targetEntry !== linkingSource) {
          const sourceId = linkingSource.dataset.entryId;
          const targetId = targetEntry.dataset.entryId;
          this._createLink(sourceId, targetId);
        }
        linkingSource = null;
      }

      if (this.isLasso) {
        this.isLasso = false;
        if (this.lassoBox) {
          this.lassoBox.remove();
          this.lassoBox = null;
        }
      }

      if (draggedEntry && activeDragItems && activeDragItems.length > 0) {
        const updates = {};
        const snap = ev.shiftKey || this.getSettings().theme.snapToGrid;

        for (let i = 0; i < activeDragItems.length; i++) {
          const dragInfo = activeDragItems[i];
          let newX = Math.round(dragInfo.item.x);
          let newY = Math.round(dragInfo.item.y);

          if (snap) {
            newX = Math.round(newX / 20) * 20;
            newY = Math.round(newY / 20) * 20;
          }
          dragInfo.item.x = newX;
          dragInfo.item.y = newY;
          dragInfo.item.el.style.left = `${newX}px`;
          dragInfo.item.el.style.top = `${newY}px`;

          if (!dragInfo.item.isPinned) {
            updates[`flags.ClueBook.data.${dragInfo.item.tab}.${dragInfo.item.id}.sort`] = Date.now();
          }
          updates[`flags.ClueBook.data.${dragInfo.item.tab}.${dragInfo.item.id}.boardX`] = newX;
          updates[`flags.ClueBook.data.${dragInfo.item.tab}.${dragInfo.item.id}.boardY`] = newY;
        }

        updateLinesForCards(movingCardIds);
        activeDragItems = null;
        movingCardIds = null;
        draggedEntry = null;

        if (Object.keys(updates).length > 0) {
          await this._updateWorkspaceData(updates);
        }
      }

      this.state.isBoardInteracting = false;
      if (this.state.pendingRender) {
        this.state.pendingRender = false;
        this.render({ parts: ["content"] });
      }
    };

    document.addEventListener('mousemove', this._boardMoveHandler);
    document.addEventListener('mouseup', this._boardUpHandler);
  }

  _highlightConnections(entryId) {
    const board = this.element?.querySelector('.board-canvas');
    if (!board || !this._boardIndex) return;

    const connectedLinks = this._boardIndex.linksByCard.get(entryId);
    if (!connectedLinks || connectedLinks.size === 0) return;

    board.classList.add('is-dimmed');
    const sourceCard = this._boardIndex.cardMap.get(entryId);
    if (sourceCard) sourceCard.el.classList.add('is-highlighted-node');

    connectedLinks.forEach(record => {
      record.lines.forEach(l => l.classList.add('is-highlighted-link'));
      if (record.labelEl) record.labelEl.classList.add('is-highlighted-link');
      const otherId = record.sourceId === entryId ? record.targetId : record.sourceId;
      const otherCard = this._boardIndex.cardMap.get(otherId);
      if (otherCard) otherCard.el.classList.add('is-highlighted-node');
    });
  }

  _resetHighlight() {
    const board = this.element?.querySelector('.board-canvas');
    if (!board) return;
    
    board.classList.remove('is-dimmed');
    board.querySelectorAll('.is-highlighted-node').forEach(el => el.classList.remove('is-highlighted-node'));
    board.querySelectorAll('.is-highlighted-link').forEach(el => el.classList.remove('is-highlighted-link'));
  }

  _showBoardContextMenu(ev, clickedEntry) {
    const existingMenu = document.querySelector('.cb-context-menu');
    if (existingMenu) existingMenu.remove();

    const menu = document.createElement('div');
    menu.className = 'cb-context-menu';
    const rawHTML = `
      <div class="cb-menu-item" data-action="align-left"><i class="fas fa-align-left"></i> ${game.i18n.localize("CLUEBOOK.Board.AlignLeft")}</div>
      <div class="cb-menu-item" data-action="align-center"><i class="fas fa-align-center"></i> ${game.i18n.localize("CLUEBOOK.Board.AlignCenter")}</div>
      <div class="cb-menu-item" data-action="align-right"><i class="fas fa-align-right"></i> ${game.i18n.localize("CLUEBOOK.Board.AlignRight")}</div>
      <div class="cb-menu-separator"></div>
      <div class="cb-menu-item" data-action="distribute-vertical"><i class="fas fa-arrows-alt-v"></i> ${game.i18n.localize("CLUEBOOK.Board.DistributeVertical")}</div>
      <div class="cb-menu-separator"></div>
      <div class="cb-menu-item" data-action="pin-group"><i class="fas fa-thumbtack"></i> ${game.i18n.localize("CLUEBOOK.Board.PinGroup")}</div>
      <div class="cb-menu-item" data-action="unpin-group"><i class="fas fa-unlock"></i> ${game.i18n.localize("CLUEBOOK.Board.UnpinGroup")}</div>
      <div class="cb-menu-separator"></div>
      <div class="cb-menu-item danger" data-action="remove-board"><i class="fas fa-times"></i> ${game.i18n.localize("CLUEBOOK.Entry.RemoveFromBoard")}</div>
    `;
    menu.replaceChildren(...new DOMParser().parseFromString(rawHTML, "text/html").body.childNodes);

    document.body.appendChild(menu);

    menu.style.left = `${ev.clientX}px`;
    menu.style.top = `${ev.clientY}px`;

    const closeMenu = () => {
      menu.remove();
      document.removeEventListener('click', closeMenu);
      document.removeEventListener('contextmenu', closeMenu);
    };

    setTimeout(() => {
      document.addEventListener('click', closeMenu);
      document.addEventListener('contextmenu', closeMenu);
    }, 10);

    menu.addEventListener('click', async (menuEv) => {
      menuEv.stopPropagation();
      const actionEl = menuEv.target.closest('.cb-menu-item');
      if (!actionEl) return;
      
      const action = actionEl.dataset.action;
      await this._executeBoardContextMenuAction(action);
      closeMenu();
    });
  }

  async _executeBoardContextMenuAction(action) {
    const board = this.element.querySelector('.board-canvas');
    if (!board || !this._boardIndex) return;

    const selectedIds = Array.from(this.state.selectedEntries);
    const elements = selectedIds.map(id => this._boardIndex.cardMap.get(id)).filter(item => item);
    if (elements.length < 2) return;

    const updates = {};
    const gap = 20;

    if (action === 'align-left') {
      const minX = Math.min(...elements.map(item => item.x));
      elements.forEach(item => {
        item.x = minX;
        item.el.style.left = `${minX}px`;
        updates[`flags.ClueBook.data.${item.tab}.${item.id}.boardX`] = minX;
      });
    } else if (action === 'align-right') {
      const maxX = Math.max(...elements.map(item => item.x + item.w));
      elements.forEach(item => {
        const newX = maxX - item.w;
        item.x = newX;
        item.el.style.left = `${newX}px`;
        updates[`flags.ClueBook.data.${item.tab}.${item.id}.boardX`] = newX;
      });
    } else if (action === 'align-center') {
      let minX = Infinity, maxX = -Infinity;
      elements.forEach(item => {
        if (item.x < minX) minX = item.x;
        if (item.x + item.w > maxX) maxX = item.x + item.w;
      });
      const centerX = minX + (maxX - minX) / 2;
      elements.forEach(item => {
        const newX = Math.round(centerX - item.w / 2);
        item.x = newX;
        item.el.style.left = `${newX}px`;
        updates[`flags.ClueBook.data.${item.tab}.${item.id}.boardX`] = newX;
      });
    } else if (action === 'distribute-vertical') {
      const sorted = [...elements].sort((a, b) => a.y - b.y);
      let currentY = sorted[0].y;
      sorted.forEach(item => {
        item.y = currentY;
        item.el.style.top = `${currentY}px`;
        updates[`flags.ClueBook.data.${item.tab}.${item.id}.boardY`] = currentY;
        currentY += item.h + gap;
      });
    } else if (action === 'pin-group') {
      elements.forEach(item => {
        item.isPinned = true;
        updates[`flags.ClueBook.data.${item.tab}.${item.id}.pinned`] = true;
      });
    } else if (action === 'unpin-group') {
      elements.forEach(item => {
        item.isPinned = false;
        updates[`flags.ClueBook.data.${item.tab}.${item.id}.pinned`] = false;
      });
    } else if (action === 'remove-board') {
      const nonPinnedElements = elements.filter(item => !item.isPinned);
      if (nonPinnedElements.length === 0) {
        ui.notifications.warn(game.i18n.localize("CLUEBOOK.Board.AllPinnedWarn"));
        return;
      }

      const proceed = await foundry.applications.api.DialogV2.confirm({
        window: { title: game.i18n.localize("CLUEBOOK.Entry.RemoveFromBoard") },
        content: game.i18n.format("CLUEBOOK.Board.RemoveGroupPrompt", { count: nonPinnedElements.length }),
        rejectClose: false
      });
      if (!proceed) return;

      nonPinnedElements.forEach(item => {
        updates[`flags.ClueBook.data.${item.tab}.${item.id}.onBoard`] = false;
      });
      this.state.selectedEntries.clear();
    }

    if (this._boardIndex) {
      this._boardIndex.updateAllLines();
    }

    if (Object.keys(updates).length > 0) {
      await this._updateWorkspaceData(updates);
      this.render({ parts: ["content"] });
    }
  }

  _showBoardCreateContextMenu(ev, currentZoom, currentPanX, currentPanY) {
    if (this.state.isReadOnly) return;

    const existingMenu = document.querySelector('.cb-context-menu');
    if (existingMenu) existingMenu.remove();

    const menu = document.createElement('div');
    menu.className = 'cb-context-menu';
    const rawHTML = `
      <div class="cb-menu-item" data-tab="notes"><i class="fas fa-sticky-note"></i> ${game.i18n.localize("CLUEBOOK.Board.CreateNote")}</div>
      <div class="cb-menu-item" data-tab="npc"><i class="fas fa-user"></i> ${game.i18n.localize("CLUEBOOK.Board.CreateNPC")}</div>
      <div class="cb-menu-item" data-tab="locations"><i class="fas fa-map-marker-alt"></i> ${game.i18n.localize("CLUEBOOK.Board.CreateLocation")}</div>
      <div class="cb-menu-item" data-tab="quests"><i class="fas fa-tasks"></i> ${game.i18n.localize("CLUEBOOK.Board.CreateQuest")}</div>
      <div class="cb-menu-item" data-tab="timeline"><i class="fas fa-history"></i> ${game.i18n.localize("CLUEBOOK.Board.CreateTimeline")}</div>
      <div class="cb-menu-item" data-tab="gallery"><i class="fas fa-camera-retro"></i> ${game.i18n.localize("CLUEBOOK.Board.CreateGallery")}</div>
      <div class="cb-menu-item" data-tab="labels"><i class="fas fa-heading"></i> ${game.i18n.localize("CLUEBOOK.Board.CreateLabel")}</div>
      <div class="cb-menu-item" data-tab="pins"><i class="fas fa-thumbtack"></i> ${game.i18n.localize("CLUEBOOK.Board.CreatePin")}</div>
    `;
    menu.replaceChildren(...new DOMParser().parseFromString(rawHTML, "text/html").body.childNodes);

    document.body.appendChild(menu);

    menu.style.left = `${ev.clientX}px`;
    menu.style.top = `${ev.clientY}px`;

    const closeMenu = () => {
      menu.remove();
      document.removeEventListener('click', closeMenu);
      document.removeEventListener('contextmenu', closeMenu);
    };

    setTimeout(() => {
      document.addEventListener('click', closeMenu);
      document.addEventListener('contextmenu', closeMenu);
    }, 10);

    const board = this.element.querySelector('.board-canvas');
    const entriesList = board.querySelector('.entries-list');
    const rect = entriesList.getBoundingClientRect();
    const boardX = Math.round((ev.clientX - rect.left) / currentZoom);
    const boardY = Math.round((ev.clientY - rect.top) / currentZoom);

    menu.addEventListener('click', async (menuEv) => {
      menuEv.stopPropagation();
      const actionEl = menuEv.target.closest('.cb-menu-item');
      if (!actionEl) return;
      
      const targetTab = actionEl.dataset.tab;
      closeMenu();
      
      const id = foundry.utils.randomID();
      const newEntry = this._getEmptyEntryForTab(targetTab);
      newEntry.id = id;
      newEntry.sort = 9999;
      newEntry.onBoard = true;
      newEntry.boardX = boardX;
      newEntry.boardY = boardY;
      if (targetTab === "gallery") {
        newEntry.rotation = getRandomPhotoTilt();
      }
      
      const flagPath = `flags.ClueBook.data.${targetTab}.${id}`;
      const updateData = { [flagPath]: newEntry };
      await this._updateWorkspaceData(updateData);
      this.render({ parts: ["content"] });
      
      const data = this._getWorkspaceData()?.[targetTab]?.[id] || newEntry;
      
      new ClueBookEditDialog({
        entry: data,
        sourceTab: targetTab,
        entryId: id,
        onSave: async (savedData) => {
          const flagUpdates = {};
          for (const [key, value] of Object.entries(savedData)) {
            flagUpdates[`flags.ClueBook.data.${targetTab}.${id}.${key}`] = value;
          }
          await this._updateWorkspaceData(flagUpdates);
          this.render({ parts: ["content"] });
        }
      }).render(true);
    });
  }

  async _createLink(sourceId, targetId) {
    let links = this._getWorkspaceLinks();
    const [a, b] = [sourceId, targetId].sort();
    const key = `${a}_${b}`;
    
    if (links[key]) return;

    const newLink = { source: sourceId, target: targetId, label: "", style: "solid", color: "" };
    await this._updateWorkspaceData({ [`flags.ClueBook.data.links.${key}`]: newLink });
    
    this.render();
  }

  async _deleteLink(s, t) {
    const proceed = await foundry.applications.api.DialogV2.confirm({
      window: { title: game.i18n.localize("CLUEBOOK.Board.DeleteLinkTitle") },
      content: `<p>${game.i18n.localize("CLUEBOOK.Board.DeleteLinkConfirm")}</p>`,
      rejectClose: false
    });

    if (!proceed) return;

    let links = this._getWorkspaceLinks();
    let key = null;
    const [a, b] = [String(s), String(t)].sort();
    const sortedKey = `${a}_${b}`;
    
    if (links[sortedKey]) {
      key = sortedKey;
    } else {
      for (let k in links) {
        const l = links[k];
        if ((String(l.source) === String(s) && String(l.target) === String(t)) || 
            (String(l.source) === String(t) && String(l.target) === String(s))) {
          key = k;
          break;
        }
      }
    }

    if (!key) return;
    
    await this._updateWorkspaceData({ [`flags.ClueBook.data.links.${key}`]: getForcedDeletion() });
    this.render({ parts: ["content"] });
  }

  async _editConnectionSettings(s, t) {
    let links = this._getWorkspaceLinks();
    let link = null;
    let key = null;
    const [a, b] = [String(s), String(t)].sort();
    const sortedKey = `${a}_${b}`;
    
    if (links[sortedKey]) {
      key = sortedKey;
      link = links[sortedKey];
    } else {
      for (let k in links) {
        const l = links[k];
        if ((String(l.source) === String(s) && String(l.target) === String(t)) || 
            (String(l.source) === String(t) && String(l.target) === String(s))) {
          key = k;
          link = l;
          break;
        }
      }
    }
    
    if (!link) return;

    const currentLabel = link.label || "";
    const currentColor = link.color || "";
    const currentStyle = link.style || "solid";
    
    const html = `
      <style>
        .cb-link-setting { margin-bottom: 10px; }
        .cb-link-setting label { display: block; font-weight: bold; margin-bottom: 4px; }
        .cb-link-setting input[type="text"], .cb-link-setting select { width: 100%; padding: 6px; border: 1px solid rgba(0,0,0,0.2); border-radius: 4px; box-sizing: border-box; }
        .cb-link-setting input[type="color"] { width: 100%; height: 35px; border: none; cursor: pointer; padding: 0; box-sizing: border-box; }
        .cb-color-presets { display: flex; gap: 8px; margin-bottom: 6px; justify-content: space-between; }
        .cb-color-preset { width: 26px; height: 26px; border-radius: 50%; cursor: pointer; border: 2px solid rgba(0,0,0,0.2); transition: transform 0.1s; flex-shrink: 0; }
        .cb-color-preset:hover { transform: scale(1.15); box-shadow: 0 2px 4px rgba(0,0,0,0.2); }
      </style>
      <div class="cb-link-setting">
        <label>${game.i18n.localize("CLUEBOOK.Board.LinkLabel")}</label>
        <input type="text" name="label" value="${currentLabel}">
      </div>
      <div class="cb-link-setting">
        <label>${game.i18n.localize("CLUEBOOK.Board.LinkStyleLabel")}</label>
        <select name="style">
          <option value="solid" ${currentStyle === 'solid' ? 'selected' : ''}>${game.i18n.localize("CLUEBOOK.Settings.LinkStyleSolid")}</option>
          <option value="dashed" ${currentStyle === 'dashed' ? 'selected' : ''}>${game.i18n.localize("CLUEBOOK.Settings.LinkStyleDashed")}</option>
          <option value="dotted" ${currentStyle === 'dotted' ? 'selected' : ''}>${game.i18n.localize("CLUEBOOK.Settings.LinkStyleDotted")}</option>
        </select>
      </div>
      <div class="cb-link-setting">
        <label>${game.i18n.localize("CLUEBOOK.Board.LinkColorLabel")}</label>
        <div class="cb-color-presets">
           <div class="cb-color-preset" style="background: #ffffff;" data-c="#ffffff" title="${game.i18n.localize("CLUEBOOK.Board.ColorPresetDefault")}" onclick="this.closest('.cb-link-setting').querySelector('input[type=color]').value = this.dataset.c"></div>
           <div class="cb-color-preset" style="background: #f44336;" data-c="#f44336" title="${game.i18n.localize("CLUEBOOK.Board.ColorPresetHostile")}" onclick="this.closest('.cb-link-setting').querySelector('input[type=color]').value = this.dataset.c"></div>
           <div class="cb-color-preset" style="background: #4caf50;" data-c="#4caf50" title="${game.i18n.localize("CLUEBOOK.Board.ColorPresetFriendly")}" onclick="this.closest('.cb-link-setting').querySelector('input[type=color]').value = this.dataset.c"></div>
           <div class="cb-color-preset" style="background: #2196f3;" data-c="#2196f3" onclick="this.closest('.cb-link-setting').querySelector('input[type=color]').value = this.dataset.c"></div>
           <div class="cb-color-preset" style="background: #ff9800;" data-c="#ff9800" onclick="this.closest('.cb-link-setting').querySelector('input[type=color]').value = this.dataset.c"></div>
           <div class="cb-color-preset" style="background: #9c27b0;" data-c="#9c27b0" onclick="this.closest('.cb-link-setting').querySelector('input[type=color]').value = this.dataset.c"></div>
           <div class="cb-color-preset" style="background: #9e9e9e;" data-c="#9e9e9e" onclick="this.closest('.cb-link-setting').querySelector('input[type=color]').value = this.dataset.c"></div>
        </div>
        <input type="color" name="color" value="${currentColor || '#ffffff'}">
      </div>
    `;

    const result = await foundry.applications.api.DialogV2.wait({
      window: { title: game.i18n.localize("CLUEBOOK.Board.LinkSettingsTitle") },
      content: html,
      buttons: [
        {
          action: "save",
          icon: "fas fa-save",
          label: game.i18n.localize("CLUEBOOK.AppActions.Save"),
          default: true,
          callback: (event, button, dialog) => {
            return {
              action: "save",
              label: button.form.elements.label.value,
              style: button.form.elements.style.value,
              color: button.form.elements.color.value
            };
          }
        },
        {
          action: "delete",
          icon: "fas fa-trash",
          label: game.i18n.localize("CLUEBOOK.Board.DeleteLink"),
          callback: () => ({ action: "delete" })
        }
      ],
      rejectClose: false
    });

    if (!result) return;

    if (result.action === "delete") {
      await this._updateWorkspaceData({ [`flags.ClueBook.data.links.${key}`]: getForcedDeletion() });
    } else {
      const updateData = {};
      updateData[`flags.ClueBook.data.links.${key}.label`] = result.label.trim() === "" ? null : result.label.trim();
      updateData[`flags.ClueBook.data.links.${key}.style`] = result.style;
      updateData[`flags.ClueBook.data.links.${key}.color`] = (result.color === "#ffffff") ? "" : result.color;
      await this._updateWorkspaceData(updateData);
    }

    this.render({ parts: ["content"] });
  }
};
