import { ClueBookEditDialog } from "../edit-dialog.js";
import { ClueBookSocket } from "../socket.js";
import { ClueBookTagManager } from "../tag-manager.js";
import { TimeService } from "../services/time-service.js";
import { TextEnrichmentService } from "../services/text-enrichment-service.js";

export const ClueBookIntegrationActionsMixin = (Base) => class extends Base {
  static async _onShareOverlay(event, target) {
    if (event?.stopPropagation) event.stopPropagation();
    const entryElement = target.closest('.cluebook-entry');
    const entryId = entryElement.dataset.entryId;
    const sourceTab = entryElement.dataset.sourceTab || this.state.activeTab;
    
    let data = this._getWorkspaceData();
    
    const entry = data[sourceTab]?.[entryId];
    if (!entry || sourceTab === "labels" || sourceTab === "pins") return;
    
    // Check if players have observer access to the board
    let canPlayersSee = false;
    if (this.state.activeWorkspace !== "personal" && !this.state.activeWorkspace.startsWith("personal_")) {
      const journal = this._getWorkspaceJournal();
      if (journal && journal.ownership.default >= CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER) {
        canPlayersSee = true;
      }
    }
    
    // Automatically make it public if it was hidden and players have access
    if (entry.isHidden && canPlayersSee) {
      await this._saveDataRaw(sourceTab, entryId, "isHidden", false);
      entry.isHidden = false;
      this.render({ parts: ["content"] });
    }
    
    // Process text for chat (enrich UUID links)
    const TE = foundry.applications?.ux?.TextEditor?.implementation ?? TextEditor;
    const processUUIDs = (text) => {
      if (!text) return text;
      let newText = TextEnrichmentService.wrapBareUUIDs(text);
      return TextEnrichmentService.enrichMentionsToHTML(newText);
    };
    
    const enrich = async (t) => await TE.enrichHTML(processUUIDs(t), { async: true });
    
    let contentHTML = `<div class="cb-overlay-inner color-${entry.color || 'yellow'}">`;
    
    if (sourceTab === "notes") {
      contentHTML += `<div class="cb-overlay-body">${await enrich(entry.text)}</div>`;
    } else if (sourceTab === "npc") {
      const npcIcon = entry.isDead ? "fa-skull" : "fa-user";
      contentHTML += `<h3 class="cb-overlay-title"><i class="fas ${npcIcon}"></i> ${entry.name ? processUUIDs(entry.name) : game.i18n.localize("CLUEBOOK.AppActions.UnknownNPC")}</h3>`;
      if (entry.isDead) contentHTML += `<p><strong><i class="fas fa-skull" style="color:#ff5252;"></i> ${game.i18n.localize("CLUEBOOK.AppActions.Status")}:</strong> ${game.i18n.localize("CLUEBOOK.AppActions.Dead")}</p>`;
      if (entry.location) contentHTML += `<p><strong>${game.i18n.localize("CLUEBOOK.AppActions.Location")}:</strong> ${await enrich(entry.location)}</p>`;
      if (entry.attitude) contentHTML += `<p><strong>${game.i18n.localize("CLUEBOOK.AppActions.Attitude")}:</strong> ${await enrich(entry.attitude)}</p>`;
      if (entry.note) contentHTML += `<div class="cb-overlay-body">${await enrich(entry.note)}</div>`;
    } else if (sourceTab === "locations") {
      contentHTML += `<h3 class="cb-overlay-title"><i class="fas fa-map-marked-alt"></i> ${entry.name ? processUUIDs(entry.name) : game.i18n.localize("CLUEBOOK.AppActions.UnknownLocation")}</h3>`;
      if (entry.subtitle) contentHTML += `<p><strong><i class="fas fa-map"></i> ${game.i18n.localize("CLUEBOOK.AppActions.Subtitle")}:</strong> ${await enrich(entry.subtitle)}</p>`;
      if (entry.owner) contentHTML += `<p><strong><i class="fas fa-crown"></i> ${game.i18n.localize("CLUEBOOK.AppActions.Owner")}:</strong> ${await enrich(entry.owner)}</p>`;
      if (entry.note) contentHTML += `<div class="cb-overlay-body">${await enrich(entry.note)}</div>`;
    } else if (sourceTab === "quests") {
      const statusIcon = entry.status === "completed" ? "fa-check-circle" : (entry.status === "failed" ? "fa-times-circle" : "fa-clock");
      contentHTML += `<h3 class="cb-overlay-title"><i class="fas fa-scroll"></i> ${game.i18n.localize("CLUEBOOK.AppActions.Quest")} <i class="fas ${statusIcon} cb-status-${entry.status}"></i></h3>`;
      
      if (entry.deadlineTimestamp && TimeService.isActive()) {
        const formatted = TimeService.formatTimestamp(entry.deadlineTimestamp).fullStr;
        if (entry.timeMode === "at") contentHTML += `<p><strong><i class="fas fa-clock"></i> ${game.i18n.localize("CLUEBOOK.AppActions.StrictlyAt")}:</strong> ${formatted}</p>`;
        else contentHTML += `<p><strong><i class="fas fa-hourglass-end"></i> ${game.i18n.localize("CLUEBOOK.AppActions.DoBy")}:</strong> ${formatted}</p>`;
      } else if (entry.deadline) {
        if (entry.timeMode === "at") contentHTML += `<p><strong><i class="fas fa-clock"></i> ${game.i18n.localize("CLUEBOOK.AppActions.StrictlyAt")}:</strong> ${entry.deadline}</p>`;
        else contentHTML += `<p><strong><i class="fas fa-hourglass-end"></i> ${game.i18n.localize("CLUEBOOK.AppActions.DoBy")}:</strong> ${entry.deadline}</p>`;
      }

      contentHTML += `<div class="cb-overlay-body">${await enrich(entry.text)}</div>`;
    } else if (sourceTab === "gallery") {
      contentHTML += `<h3 class="cb-overlay-title"><i class="fas fa-camera-retro"></i> ${entry.name ? processUUIDs(entry.name) : game.i18n.localize("CLUEBOOK.Gallery.Title")}</h3>`;
      if (entry.img) {
        contentHTML += `<div class="cb-overlay-image" style="margin: 10px 0; text-align: center;"><img src="${entry.img}" style="max-height: 400px; max-width: 100%; border-radius: 6px; box-shadow: 0 4px 15px rgba(0,0,0,0.5); object-fit: contain;"></div>`;
      }
      if (entry.caption) {
        contentHTML += `<p class="cb-overlay-caption" style="text-align: center; font-style: italic; opacity: 0.9;">${await enrich(entry.caption)}</p>`;
      }
      if (entry.text) {
        contentHTML += `<div class="cb-overlay-body">${await enrich(entry.text)}</div>`;
      }
    } else if (sourceTab === "timeline") {
      contentHTML += `<h3 class="cb-overlay-title"><i class="fas fa-hourglass-half"></i> ${entry.time || game.i18n.localize("CLUEBOOK.AppActions.UnknownTime")}</h3>`;
      contentHTML += `<div class="cb-overlay-body">${await enrich(entry.event)}</div>`;
    }
    
    contentHTML += `</div>`;
    
    // Broadcast via socket to all players (and self)
    game.socket.emit("module.ClueBook", {
      action: "showOverlay",
      content: contentHTML,
      entry: entry,
      sourceTab: sourceTab
    });
    
    // Show to GM as well
    if (window.ClueBookOverlay) {
      window.ClueBookOverlay.show(contentHTML, entry, sourceTab);
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
    closeBtn.innerHTML = '<i class="fas fa-times"></i>';
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
    const container = target.closest('.add-entry-btn-container');
    const fileInput = container ? container.querySelector('.cb-batch-file-input') : null;
    if (!fileInput) return;

    fileInput.onchange = async () => {
      if (fileInput.files?.length > 0) {
        const { MediaService } = await import("../services/media-service.js");
        const uploaded = await MediaService.uploadFiles(fileInput.files);
        if (uploaded.length > 0) {
          const items = uploaded.map(u => ({ imgPath: u.path, title: u.name }));
          const app = Array.from(foundry.applications.instances.values()).find(w => w.constructor.name === "ClueBookApp");
          if (app) {
            await app._createQuickMediaBatch(items, false, 100, 100);
            ui.notifications.info(game.i18n.format("CLUEBOOK.Gallery.BatchUploaded", { count: items.length }));
          }
        }
      }
      fileInput.value = "";
    };
    fileInput.click();
  }
}
