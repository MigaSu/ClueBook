import {
  ClueBookLinkModel,
  ClueBookFolderModel,
  ENTRY_TABS,
  assignDeletion,
  sanitizeEntryForStorage
} from "./data-models.js";
import { TextEnrichmentService } from "./services/text-enrichment-service.js";
import { WorkspaceRepository } from "./services/workspace-repository.js";

export const ClueBookDataMixin = (Base) => class extends Base {
  _getWorkspaceData() {
    return WorkspaceRepository.getData(this.state.activeWorkspace);
  }

  async _sanitizeData(data) {
    let requiresUpdate = false;
    const updates = {};
    const newData = foundry.utils.deepClone(data || {});

    // 1. Migrate legacy Links Array to Object (Dictionary)
    if (Array.isArray(newData.links)) {
      const newLinks = {};
      newData.links.forEach(l => {
        if (!l?.source || !l?.target) return;
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

    // 2. Ensure basic data structure exists and sanitize folders
    if (!newData.links || typeof newData.links !== "object") newData.links = {};
    if (!newData.folders || typeof newData.folders !== "object") newData.folders = {};

    for (const [fId, folder] of Object.entries(newData.folders)) {
      if (!folder || typeof folder !== "object") {
        delete newData.folders[fId];
        assignDeletion(updates, "flags.ClueBook.data.folders", fId);
        requiresUpdate = true;
        continue;
      }
      const fModel = new ClueBookFolderModel(folder);
      const sanitizedFolder = fModel.toObject();
      if (JSON.stringify(folder) !== JSON.stringify(sanitizedFolder)) {
        newData.folders[fId] = sanitizedFolder;
        updates[`flags.ClueBook.data.folders.${fId}`] = sanitizedFolder;
        requiresUpdate = true;
      }
    }

    const existingIds = new Set();

    ENTRY_TABS.forEach(tab => {
      if (!newData[tab] || typeof newData[tab] !== "object") newData[tab] = {};

      for (const [id, entry] of Object.entries(newData[tab])) {
        // Self-heal null or corrupted entries (e.g. from legacy v13 ForcedDeletion=null writes)
        if (!entry || typeof entry !== "object") {
          delete newData[tab][id];
          assignDeletion(updates, `flags.ClueBook.data.${tab}`, id);
          requiresUpdate = true;
          continue;
        }

        const sanitized = sanitizeEntryForStorage(tab, entry);
        if (JSON.stringify(entry) !== JSON.stringify(sanitized)) {
          newData[tab][id] = sanitized;
          updates[`flags.ClueBook.data.${tab}.${id}`] = sanitized;
          requiresUpdate = true;
        }

        existingIds.add(id);
      }
    });

    // 3. Clean orphan links & migrate old links
    for (const [key, link] of Object.entries(newData.links)) {
      if (!link || typeof link !== "object") {
        delete newData.links[key];
        assignDeletion(updates, "flags.ClueBook.data.links", key);
        requiresUpdate = true;
        continue;
      }
      try {
        const linkModel = new ClueBookLinkModel(link);
        const linkData = linkModel.toObject();

        if (!existingIds.has(linkData.source) || !existingIds.has(linkData.target)) {
          delete newData.links[key];
          assignDeletion(updates, "flags.ClueBook.data.links", key);
          requiresUpdate = true;
        } else if (JSON.stringify(link) !== JSON.stringify(linkData)) {
          newData.links[key] = linkData;
          updates[`flags.ClueBook.data.links.${key}`] = linkData;
          requiresUpdate = true;
        }
      } catch (e) {
        delete newData.links[key];
        assignDeletion(updates, "flags.ClueBook.data.links", key);
        requiresUpdate = true;
      }
    }

    const target = WorkspaceRepository.resolveTarget(this.state.activeWorkspace);
    if (requiresUpdate && !this.state.isReadOnly && !target.isReadOnly && (target.canWriteDirect || target.canWriteSocket)) {
      try {
        await WorkspaceRepository.updatePaths(this.state.activeWorkspace, updates, { skipUndo: true });
      } catch (e) {
        console.warn("ClueBook | Could not update sanitized data:", e);
      }
    }

    return newData;
  }

  async _enrichEntry(entry, entryId = null) {
    const enriched = {};
    const TE = foundry.applications?.ux?.TextEditor?.implementation ?? TextEditor;
    const resolvedId = entryId || entry?.id || "anon";

    if (!this._enrichCache) this._enrichCache = new Map();

    const processUUIDs = (text) => {
      if (!text) return text;
      const newText = TextEnrichmentService.wrapBareUUIDs(text);
      return TextEnrichmentService.enrichMentionsToHTML(newText);
    };

    const enrichField = async (text, fieldName) => {
      if (!text) return "";
      let textHash = 0;
      for (let i = 0; i < text.length; i++) {
        textHash = ((textHash << 5) - textHash) + text.charCodeAt(i);
        textHash |= 0;
      }
      const cacheKey = `${resolvedId}_${fieldName}_${textHash}`;

      if (this._enrichCache.has(cacheKey)) {
        return this._enrichCache.get(cacheKey);
      }

      const result = await TE.enrichHTML(processUUIDs(text), { async: true });
      this._enrichCache.set(cacheKey, result);
      return result;
    };

    if (entry.text) enriched.text = await enrichField(entry.text, "text");
    if (entry.note) enriched.note = await enrichField(entry.note, "note");
    if (entry.event) enriched.event = await enrichField(entry.event, "event");
    if (entry.owner) enriched.owner = await enrichField(entry.owner, "owner");
    if (entry.subtitle) enriched.subtitle = await enrichField(entry.subtitle, "subtitle");
    if (entry.location) enriched.location = await enrichField(entry.location, "location");
    if (entry.caption) enriched.caption = await enrichField(entry.caption, "caption");
    if (entry.gmNotes && game.user.isGM) enriched.gmNotes = await enrichField(entry.gmNotes, "gmNotes");

    return enriched;
  }

  _getEmptyEntryForTab(tab) {
    const settings = this.getSettings();
    const defaultColor = settings.defaultColors[tab] || "yellow";
    const base = { color: defaultColor, onBoard: false, boardX: 100, boardY: 100 };
    switch (tab) {
      case "notes": return { ...base, text: "" };
      case "npc": return { ...base, name: "", location: "", attitude: "", note: "", img: "", cropMode: "contain", cropPosition: "top", cropZoom: 100, cropOffsetX: 50, cropOffsetY: 15 };
      case "quests": return { ...base, text: "", status: "active", deadline: "", useTextTime: false };
      case "timeline": return { ...base, time: "", event: "", useTextTime: false };
      case "locations": return { ...base, name: "", subtitle: "", sceneUuid: "", owner: "", note: "", img: "", cropMode: "contain", cropPosition: "center", cropZoom: 100, cropOffsetX: 50, cropOffsetY: 50 };
      case "gallery": return { ...base, name: "", img: "", caption: "", frameStyle: "polaroid", cropMode: "contain", cropPosition: "center", cropZoom: 100, cropOffsetX: 50, cropOffsetY: 50, text: "" };
      case "labels": return { ...base, name: "", fontSize: 28, fontFamily: "caveat", bgStyle: "glass", textColor: "#ffffff", color: "#ffffff", isToc: false, onBoard: true };
      case "pins": return { ...base, name: "", note: "", icon: "fa-thumbtack", color: "#ff5252", bgStyle: "transparent", onBoard: true };
      default: return { ...base };
    }
  }

  _getWorkspaceJournal() {
    return WorkspaceRepository.getJournal(this.state.activeWorkspace);
  }

  async _updateWorkspaceData(updateData) {
    await WorkspaceRepository.updatePaths(this.state.activeWorkspace, updateData);
  }

  _getWorkspaceLinks() {
    return WorkspaceRepository.getLinks(this.state.activeWorkspace);
  }
};
