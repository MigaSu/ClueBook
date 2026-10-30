import { TimeService } from "../services/time-service.js";
import { TextEnrichmentService } from "../services/text-enrichment-service.js";
import { WorkspaceRepository } from "../services/workspace-repository.js";
import { WorkspaceAccessService } from "../services/workspace-access-service.js";
import { sanitizeEntryForStorage } from "../data-models.js";

export const ClueBookIntegrationActionsMixin = (Base) => class extends Base {
  static async _onShareOverlay(event, target) {
    if (event?.stopPropagation) event.stopPropagation();
    const entryElement = target.closest('.cluebook-entry');
    const entryId = entryElement?.dataset?.entryId;
    const sourceTab = entryElement?.dataset?.sourceTab || this.state.activeTab;
    
    let data = this._getWorkspaceData();
    
    const rawEntry = data[sourceTab]?.[entryId];
    if (!rawEntry || sourceTab === "labels" || sourceTab === "pins") return;
    
    // Process text for chat (enrich UUID links)
    const TE = foundry.applications?.ux?.TextEditor?.implementation ?? TextEditor;
    const processUUIDs = (text) => {
      if (!text) return text;
      let newText = TextEnrichmentService.wrapBareUUIDs(text);
      return TextEnrichmentService.enrichMentionsToHTML(newText);
    };
    
    const enrich = async (t) => await TE.enrichHTML(processUUIDs(t), { async: true });
    
    let contentHTML = `<div class="cb-overlay-inner color-${rawEntry.color || 'yellow'}">`;
    
    const showPortraits = this.getSettings()?.features?.showCardPortraits !== false;
    const portraitSrc = (showPortraits && (sourceTab === "npc" || sourceTab === "locations") && this._resolveCardPortrait)
      ? await this._resolveCardPortrait(rawEntry, sourceTab, true)
      : "";

    if (sourceTab === "notes") {
      contentHTML += `<div class="cb-overlay-body">${await enrich(rawEntry.text)}</div>`;
    } else if (sourceTab === "npc") {
      const npcIcon = rawEntry.isDead ? "fa-skull" : "fa-user";
      contentHTML += `<h3 class="cb-overlay-title"><i class="fas ${npcIcon}"></i> ${rawEntry.name ? processUUIDs(rawEntry.name) : game.i18n.localize("CLUEBOOK.AppActions.UnknownNPC")}</h3>`;
      if (portraitSrc) contentHTML += `<div class="cb-overlay-image" style="margin: 10px 0; text-align: center;"><img src="${portraitSrc}" style="max-height: 280px; max-width: 100%; border-radius: 6px; box-shadow: 0 4px 15px rgba(0,0,0,0.5); object-fit: contain;"></div>`;
      if (rawEntry.isDead) contentHTML += `<p><strong><i class="fas fa-skull" style="color:#ff5252;"></i> ${game.i18n.localize("CLUEBOOK.AppActions.Status")}:</strong> ${game.i18n.localize("CLUEBOOK.AppActions.Dead")}</p>`;
      if (rawEntry.location) contentHTML += `<p><strong>${game.i18n.localize("CLUEBOOK.AppActions.Location")}:</strong> ${await enrich(rawEntry.location)}</p>`;
      if (rawEntry.attitude) contentHTML += `<p><strong>${game.i18n.localize("CLUEBOOK.AppActions.Attitude")}:</strong> ${await enrich(rawEntry.attitude)}</p>`;
      if (rawEntry.note) contentHTML += `<div class="cb-overlay-body">${await enrich(rawEntry.note)}</div>`;
    } else if (sourceTab === "locations") {
      contentHTML += `<h3 class="cb-overlay-title"><i class="fas fa-map-marked-alt"></i> ${rawEntry.name ? processUUIDs(rawEntry.name) : game.i18n.localize("CLUEBOOK.AppActions.UnknownLocation")}</h3>`;
      if (portraitSrc) contentHTML += `<div class="cb-overlay-image" style="margin: 10px 0; text-align: center;"><img src="${portraitSrc}" style="max-height: 280px; max-width: 100%; border-radius: 6px; box-shadow: 0 4px 15px rgba(0,0,0,0.5); object-fit: contain;"></div>`;
      if (rawEntry.subtitle) contentHTML += `<p><strong><i class="fas fa-map"></i> ${game.i18n.localize("CLUEBOOK.AppActions.Subtitle")}:</strong> ${await enrich(rawEntry.subtitle)}</p>`;
      if (rawEntry.owner) contentHTML += `<p><strong><i class="fas fa-crown"></i> ${game.i18n.localize("CLUEBOOK.AppActions.Owner")}:</strong> ${await enrich(rawEntry.owner)}</p>`;
      if (rawEntry.note) contentHTML += `<div class="cb-overlay-body">${await enrich(rawEntry.note)}</div>`;
    } else if (sourceTab === "quests") {
      const statusIcon = rawEntry.status === "completed" ? "fa-check-circle" : (rawEntry.status === "failed" ? "fa-times-circle" : "fa-clock");
      contentHTML += `<h3 class="cb-overlay-title"><i class="fas fa-scroll"></i> ${game.i18n.localize("CLUEBOOK.AppActions.Quest")} <i class="fas ${statusIcon} cb-status-${rawEntry.status}"></i></h3>`;
      
      if (!rawEntry.useTextTime && rawEntry.deadlineTimestamp && TimeService.isActive()) {
        const formatted = TimeService.formatTimestamp(rawEntry.deadlineTimestamp).fullStr;
        if (rawEntry.timeMode === "at") contentHTML += `<p><strong><i class="fas fa-clock"></i> ${game.i18n.localize("CLUEBOOK.AppActions.StrictlyAt")}:</strong> ${formatted}</p>`;
        else contentHTML += `<p><strong><i class="fas fa-hourglass-end"></i> ${game.i18n.localize("CLUEBOOK.AppActions.DoBy")}:</strong> ${formatted}</p>`;
      } else if (rawEntry.deadline) {
        if (rawEntry.timeMode === "at") contentHTML += `<p><strong><i class="fas fa-clock"></i> ${game.i18n.localize("CLUEBOOK.AppActions.StrictlyAt")}:</strong> ${rawEntry.deadline}</p>`;
        else contentHTML += `<p><strong><i class="fas fa-hourglass-end"></i> ${game.i18n.localize("CLUEBOOK.AppActions.DoBy")}:</strong> ${rawEntry.deadline}</p>`;
      }

      contentHTML += `<div class="cb-overlay-body">${await enrich(rawEntry.text)}</div>`;
    } else if (sourceTab === "gallery") {
      contentHTML += `<h3 class="cb-overlay-title"><i class="fas fa-camera-retro"></i> ${rawEntry.name ? processUUIDs(rawEntry.name) : game.i18n.localize("CLUEBOOK.Gallery.Title")}</h3>`;
      if (rawEntry.img) {
        contentHTML += `<div class="cb-overlay-image" style="margin: 10px 0; text-align: center;"><img src="${rawEntry.img}" style="max-height: 400px; max-width: 100%; border-radius: 6px; box-shadow: 0 4px 15px rgba(0,0,0,0.5); object-fit: contain;"></div>`;
      }
      if (rawEntry.caption) {
        contentHTML += `<p class="cb-overlay-caption" style="text-align: center; font-style: italic; opacity: 0.9;">${await enrich(rawEntry.caption)}</p>`;
      }
      if (rawEntry.text) {
        contentHTML += `<div class="cb-overlay-body">${await enrich(rawEntry.text)}</div>`;
      }
    } else if (sourceTab === "timeline") {
      contentHTML += `<h3 class="cb-overlay-title"><i class="fas fa-hourglass-half"></i> ${rawEntry.time || game.i18n.localize("CLUEBOOK.AppActions.UnknownTime")}</h3>`;
      contentHTML += `<div class="cb-overlay-body">${await enrich(rawEntry.event)}</div>`;
    }
    
    contentHTML += `</div>`;

    // Strip any secret elements (.cb-gm-callout, .gm-notes-block, .secret) so GM secrets are NEVER leaked in overlay
    const doc = new DOMParser().parseFromString(contentHTML, "text/html");
    doc.querySelectorAll(".cb-gm-callout, .gm-notes-block, .secret, [data-secret='true']").forEach(el => el.remove());
    const sanitizedHTML = doc.body.innerHTML;

    // Sanitize entry data for players (removes gmNotes, isHidden, visibleTo, secret tags)
    const sanitizedEntry = WorkspaceAccessService.sanitizeEntryForPlayer(rawEntry, this.getSettings(), { isGM: false }, true);
    
    // Broadcast via socket to all players (and self)
    game.socket.emit("module.ClueBook", {
      action: "showOverlay",
      content: sanitizedHTML,
      entry: sanitizedEntry,
      sourceTab: sourceTab
    });
    
    // Show to GM as well
    if (window.ClueBookOverlay) {
      window.ClueBookOverlay.show(sanitizedHTML, sanitizedEntry, sourceTab);
    }
    
    ui.notifications.info(game.i18n.localize("CLUEBOOK.AppActions.SentSuccess") || game.i18n.localize("CLUEBOOK.AppActions.SentToOverlay"));
  }

  static async _onViewImage(event, target) {
    event.stopPropagation();
    const imgSrc = target.dataset.imgSrc;
    const imgTitle = target.dataset.imgTitle || "";
    if (!imgSrc) return;

    const overlay = document.createElement('div');
    overlay.className = 'cb-lightbox-overlay';
    overlay.style.cssText = `
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.88);
      backdrop-filter: blur(8px);
      z-index: 999999;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      cursor: zoom-out;
      opacity: 0;
      transition: opacity 0.2s ease;
    `;

    const img = document.createElement('img');
    img.src = imgSrc;
    img.style.cssText = `
      max-width: 90vw;
      max-height: 85vh;
      object-fit: contain;
      border-radius: 4px;
      box-shadow: 0 10px 40px rgba(0,0,0,0.8);
      cursor: default;
      transition: transform 0.2s ease;
    `;
    img.onclick = (e) => e.stopPropagation();

    if (imgTitle) {
      const title = document.createElement('div');
      title.textContent = imgTitle;
      title.style.cssText = `
        color: #fff;
        margin-top: 15px;
        font-size: 16px;
        font-weight: bold;
        text-shadow: 0 2px 4px rgba(0,0,0,0.8);
        background: rgba(0,0,0,0.5);
        padding: 4px 14px;
        border-radius: 20px;
        pointer-events: none;
      `;
      overlay.appendChild(img);
      overlay.appendChild(title);
    } else {
      overlay.appendChild(img);
    }

    const closeBtn = document.createElement('div');
    const closeIcon = document.createElement('i');
    closeIcon.className = 'fas fa-times';
    closeBtn.appendChild(closeIcon);
    closeBtn.style.cssText = `
      position: absolute;
      top: 20px;
      right: 25px;
      color: white;
      font-size: 24px;
      cursor: pointer;
      opacity: 0.7;
      transition: opacity 0.2s;
    `;
    closeBtn.onmouseenter = () => closeBtn.style.opacity = '1';
    closeBtn.onmouseleave = () => closeBtn.style.opacity = '0.7';
    overlay.appendChild(closeBtn);

    const closeLightbox = () => {
      overlay.style.opacity = '0';
      setTimeout(() => overlay.remove(), 200);
      document.removeEventListener('keydown', onKeyDown);
    };

    const onKeyDown = (e) => {
      if (e.key === 'Escape') closeLightbox();
    };

    overlay.onclick = closeLightbox;
    document.addEventListener('keydown', onKeyDown);
    document.body.appendChild(overlay);

    requestAnimationFrame(() => {
      overlay.style.opacity = '1';
    });
  }  

  static async _onActivateScene(event, target) {
    event.stopPropagation();
    event.preventDefault();
    
    if (!game.user.isGM) return;

    const sceneUuid = target.dataset.sceneId;
    if (!sceneUuid) return;

    const scene = await fromUuid(sceneUuid);
    if (!scene) {
      ui.notifications.warn(game.i18n.localize("CLUEBOOK.Entry.SceneNotFound"));
      return;
    }

    if (event.shiftKey) {
      // Activate for everyone
      await scene.activate();
      ui.notifications.info(game.i18n.format("CLUEBOOK.AppActions.SceneActivatedAll", { name: scene.name }));
    } else {
      // Just view
      await scene.view();
      ui.notifications.info(game.i18n.format("CLUEBOOK.AppActions.ScenePreview", { name: scene.name }));
    }
  }

  static async _onOpenActor(event, target) {
    event.stopPropagation();
    event.preventDefault();
    
    if (!game.user.isGM) return;

    const actorUuid = target.dataset.actorId;
    if (!actorUuid) return;

    const actor = await fromUuid(actorUuid);
    if (!actor) {
      ui.notifications.warn(game.i18n.localize("CLUEBOOK.Entry.ActorNotFound"));
      return;
    }

    const gp = window.GinzzzuPortraits;
    const isGinzzuActive = game.modules.get("ginzzzu-portraits")?.active && gp && typeof gp.togglePortrait === "function";

    if (!isGinzzuActive) {
      actor.sheet.render(true);
      return;
    }

    const existingMenu = document.querySelector('.cb-context-menu');
    if (existingMenu) existingMenu.remove();

    const menu = document.createElement('div');
    menu.className = 'cb-context-menu';
    const rawHTML = `
      <div class="cb-menu-item" data-action="open-sheet"><i class="fas fa-id-card"></i> ${game.i18n.localize("CLUEBOOK.AppActions.OpenActorSheet")}</div>
      <div class="cb-menu-item" data-action="show-portrait"><i class="fas fa-user-circle"></i> ${game.i18n.localize("CLUEBOOK.AppActions.ShowPortraitGinzzu")}</div>
    `;
    menu.replaceChildren(...new DOMParser().parseFromString(rawHTML, "text/html").body.childNodes);

    document.body.appendChild(menu);
    menu.style.left = `${event.clientX}px`;
    menu.style.top = `${event.clientY}px`;

    menu.querySelector('[data-action="open-sheet"]').onclick = () => {
      actor.sheet.render(true);
      closeMenu();
    };

    menu.querySelector('[data-action="show-portrait"]').onclick = () => {
      try { gp.togglePortrait(actor); } catch(e) { console.error(e); }
      closeMenu();
    };

    const closeMenu = (e) => {
      if (e && menu.contains(e.target)) return;
      menu.remove();
      document.removeEventListener('click', closeMenu);
      document.removeEventListener('contextmenu', closeMenu);
    };

    setTimeout(() => {
      document.addEventListener('click', closeMenu);
      document.addEventListener('contextmenu', closeMenu);
    }, 0);
  }

  static async _onUploadBatchGallery(event, target) {
    event.stopPropagation();
    if (this.state.isReadOnly) return;

    const FP = foundry.applications?.apps?.FilePicker?.implementation ?? FilePicker;

    if (event.shiftKey) {
      const { MediaService } = await import("../services/media-service.js");
      new FP({
        type: "image",
        current: MediaService.folderPath,
        callback: async (path) => {
          if (!path || this.state.isReadOnly) return;
          const fileName = path.split("/").pop() || "Image";
          const newEntry = this._getEmptyEntryForTab ? this._getEmptyEntryForTab("gallery") : { type: "gallery" };
          delete newEntry.id;
          newEntry.name = fileName;
          newEntry.img = path;
          newEntry.onBoard = false;
          newEntry.boardX = 100;
          newEntry.boardY = 100;
          newEntry.sort = 9999;
          const id = foundry.utils.randomID();
          await WorkspaceRepository.saveEntry(this.state.activeWorkspace, "gallery", id, newEntry);
          this.render({ parts: ["content"] });
        }
      }).browse();
      return;
    }

    const container = target.closest('.add-entry-btn-container') || target;
    const fileInput = container ? container.querySelector('.cb-batch-file-input') : null;
    if (!fileInput) return;

    fileInput.onchange = async () => {
      if (this.state.isReadOnly) return;
      if (fileInput.files?.length > 0) {
        const { MediaService } = await import("../services/media-service.js");
        const uploaded = await MediaService.uploadFiles(fileInput.files);
        if (uploaded.length > 0) {
          const items = uploaded.map(u => ({ imgPath: u.path, title: u.name }));
          if (this._createQuickMediaBatch) {
            await this._createQuickMediaBatch(items, false, 100, 100);
          } else {
            const updates = {};
            items.forEach((item, index) => {
              const id = foundry.utils.randomID();
              const newEntry = this._getEmptyEntryForTab ? this._getEmptyEntryForTab("gallery") : { type: "gallery" };
              delete newEntry.id;
              newEntry.name = item.title;
              newEntry.img = item.imgPath;
              newEntry.onBoard = false;
              newEntry.boardX = 100;
              newEntry.boardY = 100;
              newEntry.sort = 9999 + index;
              updates[`flags.ClueBook.data.gallery.${id}`] = sanitizeEntryForStorage("gallery", newEntry);
            });
            await WorkspaceRepository.updatePaths(this.state.activeWorkspace, updates);
            this.render({ parts: ["content"] });
          }
          ui.notifications.info(game.i18n.format("CLUEBOOK.Gallery.BatchUploaded", { count: items.length }));
        }
      }
      fileInput.value = "";
    };
    fileInput.click();
  }
};
