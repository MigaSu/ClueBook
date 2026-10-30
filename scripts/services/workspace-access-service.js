import { ENTRY_TABS, sanitizeEntryForStorage } from "../data-models.js";
import { TextEnrichmentService } from "./text-enrichment-service.js";

/**
 * Pure domain service for ClueBook access control, visibility checks,
 * and player-safe sanitization of entries, folders, tags, overlays, and exports.
 */
export class WorkspaceAccessService {

  /**
   * Checks whether a folder is visible to the given user.
   * @param {Object|null} folder
   * @param {User} [user=game.user]
   * @param {boolean} [isShared=true]
   * @returns {boolean}
   */
  static isFolderVisible(folder, user = game.user, isShared = true) {
    if (!isShared || !folder || user?.isGM) return true;
    if (folder.isHidden) return false;
    if (Array.isArray(folder.visibleTo) && folder.visibleTo.length > 0 && !folder.visibleTo.includes(user?.id)) {
      return false;
    }
    return true;
  }

  /**
   * Checks whether an entry is visible to the given user (accounting for folder visibility).
   * @param {Object|null} entry
   * @param {Record<string, Object>} [folders={}]
   * @param {User} [user=game.user]
   * @param {boolean} [isShared=true]
   * @returns {boolean}
   */
  static canUserViewEntry(entry, folders = {}, user = game.user, isShared = true) {
    if (!entry || typeof entry !== "object") return false;
    if (!isShared || user?.isGM) return true;
    if (entry.isHidden) return false;
    if (Array.isArray(entry.visibleTo) && entry.visibleTo.length > 0 && !entry.visibleTo.includes(user?.id)) {
      return false;
    }
    if (entry.folderId && folders?.[entry.folderId] && !this.isFolderVisible(folders[entry.folderId], user, isShared)) {
      return false;
    }
    return true;
  }

  /**
   * Returns a filtered dictionary of tags visible to the user.
   * @param {Record<string, Object>} [tagsDict={}]
   * @param {Object} [settings={}]
   * @param {User} [user=game.user]
   * @param {boolean} [isShared=false]
   * @returns {Record<string, Object>}
   */
  static getVisibleTags(tagsDict = {}, settings = {}, user = game.user, isShared = false) {
    if (!tagsDict || typeof tagsDict !== "object") return {};
    if (user?.isGM) return foundry.utils.deepClone(tagsDict);
    if (isShared && settings?.showTagsToPlayers === false) return {};

    const result = {};
    for (const [id, tag] of Object.entries(tagsDict)) {
      if (tag && !tag.isSecret) {
        result[id] = foundry.utils.deepClone(tag);
      }
    }
    return result;
  }

  /**
   * Sanitizes a single entry for broadcast/export to non-GM players,
   * removing GM notes, visibility ACLs, and secret tags.
   * @param {Object} entry
   * @param {Object} [settings={}]
   * @param {User} [user=game.user]
   * @param {boolean} [isShared=true]
   * @returns {Object}
   */
  static sanitizeEntryForPlayer(entry, settings = {}, user = game.user, isShared = true) {
    const clean = foundry.utils.deepClone(entry || {});
    if (user?.isGM) return clean;

    clean.gmNotes = "";
    clean.isHidden = false;
    clean.visibleTo = [];

    const visibleTags = this.getVisibleTags(settings?.tags || {}, settings, user, isShared);
    if (Array.isArray(clean.tags)) {
      clean.tags = clean.tags.filter(tId => Boolean(visibleTags[tId]));
    } else {
      clean.tags = [];
    }
    return clean;
  }

  /**
   * Produces a clean, independent ClueBookEntryModel payload when copying a clue from ClueBookOverlay.
   * Resets board coordinates, folder links, hidden flags, GM notes, and workspace-local tags.
   * @param {string} tab
   * @param {Object} entryData
   * @param {number} [sortOrder=1]
   * @returns {Object}
   */
  static sanitizeClueCopy(tab, entryData, sortOrder = 1) {
    const copy = foundry.utils.deepClone(entryData || {});
    copy.onBoard = false;
    copy.pinned = false;
    copy.folderId = "";
    copy.isHidden = false;
    copy.visibleTo = [];
    copy.gmNotes = "";
    copy.tags = [];
    copy.isTracked = false;
    copy.sort = sortOrder;

    const textFields = ["text", "event", "note", "name", "subtitle", "owner", "location", "attitude"];
    for (const field of textFields) {
      if (copy[field]) {
        copy[field] = TextEnrichmentService.stripToPlainText(copy[field]);
      }
    }

    return sanitizeEntryForStorage(tab, copy);
  }

  /**
   * Filters workspace data, folders, links, and tags for safe JSON export.
   * Prevents leaking hidden entries, GM notes, secret folders, or secret tags to players.
   * @param {Object} [data={}]
   * @param {Object} [settings={}]
   * @param {User} [user=game.user]
   * @param {boolean} [isShared=false]
   * @returns {{ entries: Array<Object>, folders: Array<Object>, links: Array<Object>, tags: Array<Object> }}
   */
  static filterWorkspaceExport(data = {}, settings = {}, user = game.user, isShared = false) {
    const isGM = Boolean(user?.isGM);
    const allFolders = data?.folders || {};
    const visibleFolderIds = new Set();
    const exportedFolders = [];

    for (const [fId, folder] of Object.entries(allFolders)) {
      if (!folder || typeof folder !== "object") continue;
      if (!this.isFolderVisible(folder, user, isShared)) continue;
      visibleFolderIds.add(fId);
      const fClean = foundry.utils.deepClone(folder);
      if (!isGM) {
        fClean.isHidden = false;
        fClean.visibleTo = [];
      }
      exportedFolders.push({ id: fId, ...fClean });
    }

    const visibleTags = this.getVisibleTags(settings?.tags || {}, settings, user, isShared);
    const exportedTags = Object.values(visibleTags);

    const visibleEntryIds = new Set();
    const exportedEntries = [];

    for (const tabKey of ENTRY_TABS) {
      const tabData = data?.[tabKey];
      if (!tabData || typeof tabData !== "object") continue;

      for (const [entryId, rawEntry] of Object.entries(tabData)) {
        if (!this.canUserViewEntry(rawEntry, allFolders, user, isShared)) continue;
        visibleEntryIds.add(entryId);

        let entryOut = foundry.utils.deepClone(rawEntry);
        if (!isGM) {
          entryOut = this.sanitizeEntryForPlayer(entryOut, settings, user, isShared);
        }
        if (entryOut.folderId && !visibleFolderIds.has(entryOut.folderId)) {
          entryOut.folderId = "";
        }
        exportedEntries.push({
          id: entryId,
          tab: tabKey,
          ...entryOut
        });
      }
    }

    const exportedLinks = [];
    for (const link of Object.values(data?.links || {})) {
      if (!link?.source || !link?.target) continue;
      if (!visibleEntryIds.has(link.source) || !visibleEntryIds.has(link.target)) continue;
      exportedLinks.push({
        source: link.source,
        target: link.target,
        label: link.label || "",
        style: link.style || "solid",
        color: link.color || ""
      });
    }

    return {
      entries: exportedEntries,
      folders: exportedFolders,
      links: exportedLinks,
      tags: exportedTags
    };
  }
}

