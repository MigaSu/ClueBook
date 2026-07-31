import { ClueBookEditDialog } from "../edit-dialog.js";
import { ClueBookSocket } from "../socket.js";
import { ClueBookTagManager } from "../tag-manager.js";

export const ClueBookIntegrationActionsMixin = (Base) => class extends Base {
  static async _onShareOverlay(event, target) {
    event.stopPropagation();
    const entryElement = target.closest('.cluebook-entry');
    const entryId = entryElement.dataset.entryId;
    const sourceTab = entryElement.dataset.sourceTab || this.state.activeTab;
    
    let data = this._getWorkspaceData();
    
    const entry = data[sourceTab]?.[entryId];
    if (!entry) return;
    
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
      const uuidRegex = /(?<!@UUID\[)\b(?:Actor|Item|JournalEntry|JournalEntryPage|Scene|RollTable|Cards|Macro|Playlist|User)(?:\.[a-zA-Z0-9_-]+)+\b/g;
      let newText = text.replace(uuidRegex, match => `@UUID[${match}]`);
      const compendiumRegex = /(?<!@UUID\[)\bCompendium\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+(?:\.[a-zA-Z0-9_-]+)+\b/g;
      newText = newText.replace(compendiumRegex, match => `@UUID[${match}]`);
      // Parse qnmention
      newText = newText.replace(/\[\[qnmention:([^:]+):([^\]]+)\]\](?:\{([^}]*)\})?/g, (match, id, name, customText) => {
        const displayText = customText || name;
        return `<a class="content-link cb-mention-link" data-mention-id="${id}"><i class="fas fa-book"></i> ${displayText}</a>`;
      });
      return newText;
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
      
      if (entry.deadlineTimestamp && window.SimpleCalendar?.api) {
        const formatted = this._formatSCTimestamp(entry.deadlineTimestamp).full;
        if (entry.timeMode === "at") contentHTML += `<p><strong><i class="fas fa-clock"></i> ${game.i18n.localize("CLUEBOOK.AppActions.StrictlyAt")}:</strong> ${formatted}</p>`;
        else contentHTML += `<p><strong><i class="fas fa-hourglass-end"></i> ${game.i18n.localize("CLUEBOOK.AppActions.DoBy")}:</strong> ${formatted}</p>`;
      } else if (entry.deadline) {
        if (entry.timeMode === "at") contentHTML += `<p><strong><i class="fas fa-clock"></i> ${game.i18n.localize("CLUEBOOK.AppActions.StrictlyAt")}:</strong> ${entry.deadline}</p>`;
        else contentHTML += `<p><strong><i class="fas fa-hourglass-end"></i> ${game.i18n.localize("CLUEBOOK.AppActions.DoBy")}:</strong> ${entry.deadline}</p>`;
      }

      contentHTML += `<div class="cb-overlay-body">${await enrich(entry.text)}</div>`;
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
    
    ui.notifications.info(game.i18n.localize("CLUEBOOK.AppActions.SentToOverlay"));
  }

  static async _onActivateScene(event, target) {
    event.stopPropagation();
    event.preventDefault();
    
    if (!game.user.isGM) return;

    const sceneUuid = target.dataset.sceneId;
    if (!sceneUuid) return;

    const scene = await fromUuid(sceneUuid);
    if (!scene) {
      ui.notifications.warn("Scene not found.");
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
      ui.notifications.warn("Actor not found.");
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
    menu.innerHTML = `
      <div class="cb-menu-item" data-action="open-sheet"><i class="fas fa-id-card"></i> ${game.i18n.localize("CLUEBOOK.AppActions.OpenActorSheet")}</div>
      <div class="cb-menu-item" data-action="show-portrait"><i class="fas fa-user-circle"></i> ${game.i18n.localize("CLUEBOOK.AppActions.ShowPortraitGinzzu")}</div>
    `;

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

}
