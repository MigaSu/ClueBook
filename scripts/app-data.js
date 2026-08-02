import { ClueBookEntryModel, ClueBookLinkModel } from "./data-models.js";

export const ClueBookDataMixin = (Base) => class extends Base {
  _getWorkspaceData() {
    let data = {};
    const ws = this.state.activeWorkspace;
    if (ws !== "personal" && !ws.startsWith("personal_")) {
      const journal = this._getWorkspaceJournal();
      if (journal) data = journal.getFlag("ClueBook", "data") || {};
    } else if (ws.startsWith("personal_")) {
      const uId = ws.split("_")[1];
      const u = game.users.get(uId);
      if (u) data = u.getFlag("ClueBook", "data") || {};
    } else {
      data = game.user.getFlag("ClueBook", "data") || {};
    }
    return data;
  }

  async _sanitizeData(data) {
    let requiresUpdate = false;
    const updates = {};
    const newData = foundry.utils.deepClone(data);

    // 1. Migrate Links Array to Object (Dictionary)
    if (Array.isArray(newData.links)) {
      const newLinks = {};
      newData.links.forEach(l => {
        if (!l.source || !l.target) return;
        const [a, b] = [l.source, l.target].sort();
        const key = `${a}_${b}`;
        const model = new ClueBookLinkModel({
          source: l.source, target: l.target, label: l.label, style: l.style, color: l.color
        });
        newLinks[key] = model.toObject();
      });
      newData.links = newLinks;
      updates["flags.ClueBook.data.links"] = newLinks;
      requiresUpdate = true;
    }

    // 2. Ensure basic data structure exists and gather existing entry IDs
    if (!newData.links || typeof newData.links !== 'object') newData.links = {};
    const tabs = ["notes", "npc", "locations", "quests", "timeline"];
    const existingIds = new Set();

    tabs.forEach(tab => {
      if (!newData[tab]) newData[tab] = {};
      
      for (const [id, entry] of Object.entries(newData[tab])) {
        // РњРёРіСЂР°С†РёСЏ СЃС‚Р°СЂС‹С… РґР°РЅРЅС‹С… С‡РµСЂРµР· Data Model V14
        if (!entry.type) entry.type = tab;
        const model = new ClueBookEntryModel(entry);
        const sanitized = model.toObject();
        
        // Р•СЃР»Рё DataModel РґРѕР±Р°РІРёР»Р° РЅРµРґРѕСЃС‚Р°СЋС‰РёРµ РїРѕР»СЏ, СЃРѕС…СЂР°РЅСЏРµРј РѕР±РЅРѕРІР»РµРЅРёРµ
        if (JSON.stringify(entry) !== JSON.stringify(sanitized)) {
          newData[tab][id] = sanitized;
          updates[`flags.ClueBook.data.${tab}.${id}`] = sanitized;
          requiresUpdate = true;
        }
        
        existingIds.add(id);
      }
    });

    // 3. Clean orphan links & Migrate old links
    for (const [key, link] of Object.entries(newData.links)) {
      try {
        const linkModel = new ClueBookLinkModel(link);
        const linkData = linkModel.toObject();
        
        if (!existingIds.has(linkData.source) || !existingIds.has(linkData.target)) {
          delete newData.links[key];
          updates[`flags.ClueBook.data.links.-=${key}`] = null;
          requiresUpdate = true;
        } else if (JSON.stringify(link) !== JSON.stringify(linkData)) {
           newData.links[key] = linkData;
           updates[`flags.ClueBook.data.links.${key}`] = linkData;
           requiresUpdate = true;
        }
      } catch (e) {
        delete newData.links[key];
        updates[`flags.ClueBook.data.links.-=${key}`] = null;
        requiresUpdate = true;
      }
    }

    // Save if migration or orphan cleanup occurred
    if (requiresUpdate && !this.state.isReadOnly) {
      try {
        await this._updateWorkspaceData(updates);
      } catch (e) {
        console.warn("ClueBook | Could not update sanitized links:", e);
      }
    }

    return newData;
  }
  async _enrichEntry(entry) {
    const enriched = {};
    const TE = foundry.applications?.ux?.TextEditor?.implementation ?? TextEditor;
    
    // РРЅРёС†РёР°Р»РёР·РёСЂСѓРµРј РєСЌС€ РµСЃР»Рё РµРіРѕ РЅРµС‚ (С‡С‚РѕР±С‹ РЅРµ РїРµСЂРµСЃС‡РёС‚С‹РІР°С‚СЊ HTML РїСЂРё РєР°Р¶РґРѕРј СЂРµРЅРґРµСЂРµ)
    if (!this._enrichCache) this._enrichCache = new Map();

    const processUUIDs = (text) => {
      if (!text) return text;
      const uuidRegex = /(?<!@UUID\[)(?<!\.)\b(?:Actor|Item|JournalEntry|JournalEntryPage|Scene|RollTable|Cards|Macro|Playlist|User)(?:\.[a-zA-Z0-9_-]+)+\b/g;
      let newText = text.replace(uuidRegex, match => `@UUID[${match}]`);
      const compendiumRegex = /(?<!@UUID\[)(?<!\.)\bCompendium\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+(?:\.[a-zA-Z0-9_-]+)+\b/g;
      newText = newText.replace(compendiumRegex, match => `@UUID[${match}]`);
      return newText;
    };

    const enrichField = async (text, fieldName) => {
      if (!text) return "";
      // Простой хэш для проверки изменения текста
      let textHash = 0;
      for (let i = 0; i < text.length; i++) {
        textHash = ((textHash << 5) - textHash) + text.charCodeAt(i);
        textHash |= 0; // Convert to 32bit integer
      }
      const cacheKey = `${entry.id}_${fieldName}_${textHash}`;
      
      if (this._enrichCache.has(cacheKey)) {
        return this._enrichCache.get(cacheKey);
      }
      
      const result = await TE.enrichHTML(processUUIDs(text), { async: true });
      this._enrichCache.set(cacheKey, result);
      return result;
    };

    if (entry.text) enriched.text = await enrichField(entry.text, 'text');
    if (entry.note) enriched.note = await enrichField(entry.note, 'note');
    if (entry.event) enriched.event = await enrichField(entry.event, 'event');
    if (entry.owner) enriched.owner = await enrichField(entry.owner, 'owner');
    if (entry.subtitle) enriched.subtitle = await enrichField(entry.subtitle, 'subtitle');
    if (entry.location) enriched.location = await enrichField(entry.location, 'location');
    if (entry.gmNotes && game.user.isGM) enriched.gmNotes = await enrichField(entry.gmNotes, 'gmNotes');
    
    return enriched;
  }
  _getEmptyEntryForTab(tab) {
    const settings = this.getSettings();
    const defaultColor = settings.defaultColors[tab] || "yellow";
    const base = { color: defaultColor, onBoard: false, boardX: 100, boardY: 100 };
    switch (tab) {
      case "notes": return { ...base, text: "" };
      case "npc": return { ...base, name: "", location: "", attitude: "", note: "" };
      case "quests": return { ...base, text: "", status: "active", deadline: "" };
      case "timeline": return { ...base, time: "", event: "" };
      case "locations": return { ...base, name: "", subtitle: "", sceneUuid: "", owner: "", note: "" };
      default: return { ...base };
    }
  }
  _getWorkspaceJournal() {
    if (this.state.activeWorkspace === "personal" || this.state.activeWorkspace.startsWith("personal_")) return null;
    return game.journal.get(this.state.activeWorkspace);
  }

  async _updateWorkspaceData(updateData) {
    let finalData = { ...updateData };
    let unsetPaths = [];

    for (const key of Object.keys(finalData)) {
      if (key.includes(".-=")) {
        const path = key.replace("flags.ClueBook.", "").replace(".-=", ".");
        unsetPaths.push(path);
        delete finalData[key];
      }
    }

    const journal = this._getWorkspaceJournal();
    if (journal) {
      if (journal.isOwner) {
        for (const path of unsetPaths) await journal.unsetFlag("ClueBook", path);
        if (Object.keys(finalData).length > 0) await journal.update(finalData);
      } else {
        game.socket.emit("module.ClueBook", {
          action: "updateBoardData",
          journalId: journal.id,
          updateData: finalData,
          unsetPaths: unsetPaths
        });
      }
    } else if (this.state.activeWorkspace.startsWith("personal_")) {
      const uId = this.state.activeWorkspace.split("_")[1];
      const u = game.users.get(uId);
      if (u && game.user.isGM) {
        for (const path of unsetPaths) await u.unsetFlag("ClueBook", path);
        if (Object.keys(finalData).length > 0) await u.update(finalData);
      }
    } else {
      for (const path of unsetPaths) await game.user.unsetFlag("ClueBook", path);
      if (Object.keys(finalData).length > 0) await game.user.update(finalData);
    }
  }

  _getWorkspaceLinks() {
    const journal = this._getWorkspaceJournal();
    if (journal) return journal.getFlag("ClueBook", "data.links") || {};
    if (this.state.activeWorkspace.startsWith("personal_")) {
      const uId = this.state.activeWorkspace.split("_")[1];
      const u = game.users.get(uId);
      if (u && game.user.isGM) return u.getFlag("ClueBook", "data.links") || {};
    }
    return game.user.getFlag("ClueBook", "data.links") || {};
  }
};

