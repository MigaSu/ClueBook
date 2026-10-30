import { isDeletionValue, isEntryTab, sanitizeEntryForStorage } from "../data-models.js";
import { UndoService } from "./undo-service.js";

/**
 * Centralized repository for all ClueBook workspace flag reads and mutations.
 * Guarantees:
 * - Uniform resolution of "personal", "personal_<userId>", and shared JournalEntry workspaces.
 * - Per-document async write serialization (eliminates race conditions between sanitization, edits, and batch ops).
 * - Full preservation of sibling entries/categories across Foundry VTT v13 and v14 (including build 365+).
 * - v13/v14-safe property deletions (ForcedDeletion on v14, -=key: null on v13) and transparent socket proxying.
 */
export class WorkspaceRepository {
  static #writeQueues = new Map();

  static #enqueue(docKey, taskFn) {
    const prev = this.#writeQueues.get(docKey) || Promise.resolve();
    const next = prev.then(taskFn, taskFn);
    this.#writeQueues.set(docKey, next.catch(() => {}));
    return next;
  }

  /**
   * Resolves a workspace identifier into its backing Foundry Document and permission capabilities.
   * @param {string} [workspaceId="personal"]
   * @returns {{
   *   kind: "personal" | "playerPersonal" | "shared" | "invalid",
   *   id: string,
   *   userId?: string,
   *   doc: Document|null,
   *   journal: JournalEntry|null,
   *   canRead: boolean,
   *   canWriteDirect: boolean,
   *   canWriteSocket: boolean,
   *   isShared: boolean,
   *   isReadOnly: boolean
   * }}
   */
  static resolveTarget(workspaceId = "personal") {
    const wsId = workspaceId || "personal";

    if (wsId === "personal") {
      const doc = game.user || null;
      return {
        kind: "personal",
        id: "personal",
        doc,
        journal: null,
        canRead: Boolean(doc),
        canWriteDirect: Boolean(doc),
        canWriteSocket: false,
        isShared: false,
        isReadOnly: false
      };
    }

    if (wsId.startsWith("personal_")) {
      const targetUserId = wsId.slice("personal_".length);
      const targetUser = game.users?.get(targetUserId) || null;
      const allowed = Boolean(game.user?.isGM && targetUser);
      return {
        kind: "playerPersonal",
        id: wsId,
        userId: targetUserId,
        doc: allowed ? targetUser : null,
        journal: null,
        canRead: allowed,
        canWriteDirect: allowed,
        canWriteSocket: false,
        isShared: false,
        isReadOnly: !allowed
      };
    }

    const journal = game.journal?.get(wsId) || null;
    const isWs = Boolean(journal && journal.getFlag("ClueBook", "isWorkspace"));
    if (!isWs) {
      return {
        kind: "invalid",
        id: wsId,
        doc: null,
        journal: null,
        canRead: false,
        canWriteDirect: false,
        canWriteSocket: false,
        isShared: false,
        isReadOnly: true
      };
    }

    const canRead = Boolean(game.user?.isGM || journal.testUserPermission(game.user, "OBSERVER"));
    const settings = journal.getFlag("ClueBook", "settings") || {};
    const isReadOnly = Boolean(!game.user?.isGM && settings.readOnly);
    const isOwner = Boolean(journal.isOwner);

    return {
      kind: "shared",
      id: wsId,
      doc: canRead ? journal : null,
      journal: canRead ? journal : null,
      canRead,
      canWriteDirect: canRead && !isReadOnly && isOwner,
      canWriteSocket: canRead && !isReadOnly && !isOwner,
      isShared: true,
      isReadOnly
    };
  }

  /**
   * Reads raw workspace data (`flags.ClueBook.data`).
   * @param {string} [workspaceId="personal"]
   * @returns {Object}
   */
  static getData(workspaceId = "personal") {
    const target = this.resolveTarget(workspaceId);
    if (!target.canRead || !target.doc) return {};
    return target.doc.getFlag("ClueBook", "data") || {};
  }

  /**
   * Reads workspace links dictionary (`flags.ClueBook.data.links`).
   * @param {string} [workspaceId="personal"]
   * @returns {Record<string, Object>}
   */
  static getLinks(workspaceId = "personal") {
    return this.getData(workspaceId)?.links || {};
  }

  /**
   * Reads workspace folders dictionary (`flags.ClueBook.data.folders`).
   * @param {string} [workspaceId="personal"]
   * @returns {Record<string, Object>}
   */
  static getFolders(workspaceId = "personal") {
    return this.getData(workspaceId)?.folders || {};
  }

  /**
   * Reads workspace settings (`flags.ClueBook.settings`).
   * @param {string} [workspaceId="personal"]
   * @returns {Object}
   */
  static getSettings(workspaceId = "personal") {
    const target = this.resolveTarget(workspaceId);
    if (!target.canRead || !target.doc) return {};
    return target.doc.getFlag("ClueBook", "settings") || {};
  }

  /**
   * Returns the shared JournalEntry if workspaceId is an accessible shared board, else null.
   * @param {string} [workspaceId="personal"]
   * @returns {JournalEntry|null}
   */
  static getJournal(workspaceId = "personal") {
    return this.resolveTarget(workspaceId).journal;
  }

  /**
   * Saves a full card entry into a category tab with DataModel sanitization.
   * @param {string} workspaceId
   * @param {string} tab
   * @param {string} entryId
   * @param {Object} entryData
   */
  static async saveEntry(workspaceId, tab, entryId, entryData) {
    if (!tab || !entryId) return;
    const sanitized = sanitizeEntryForStorage(tab, entryData);
    await this.updatePaths(workspaceId, {
      [`flags.ClueBook.data.${tab}.${entryId}`]: sanitized
    });
  }

  /**
   * Applies a dictionary of `flags.ClueBook.*` dot-path updates and deletions to a workspace.
   * Automatically routes through the local write queue or socket proxy for non-owner shared boards.
   * @param {string} workspaceId
   * @param {Record<string, any>} flatUpdates
   * @param {Object} [options={}]
   */
  static async updatePaths(workspaceId, flatUpdates, options = {}) {
    if (!flatUpdates || typeof flatUpdates !== "object" || Object.keys(flatUpdates).length === 0) return;

    const target = this.resolveTarget(workspaceId);
    if (!target.canRead) return;

    if (!options?.skipUndo && (target.canWriteDirect || target.canWriteSocket)) {
      const currentData = target.doc?.getFlag("ClueBook", "data") || {};
      UndoService.recordBeforeMutation(workspaceId, currentData, flatUpdates);
    }

    const { skipUndo, ...docOptions } = options || {};

    if (target.canWriteDirect && target.doc) {
      await this.#applyMutationsToDocument(target.doc, flatUpdates, docOptions);
      return;
    }

    if (target.canWriteSocket && target.journal) {
      const { wireUpdates, unsetPaths } = this.#serializeForSocket(flatUpdates);
      if (Object.keys(wireUpdates).length === 0 && unsetPaths.length === 0) return;

      game.socket.emit("module.ClueBook", {
        action: "updateBoardData",
        senderId: game.user?.id,
        journalId: target.journal.id,
        updateData: wireUpdates,
        unsetPaths
      });
    }
  }

  /**
   * Executes a validated socket mutation on the active GM client with `{ cluebookProxy: true }`.
   * @param {JournalEntry} journal
   * @param {{ updateData?: Record<string, any>, unsetPaths?: string[] }} payload
   */
  static async applySocketMutation(journal, { updateData = {}, unsetPaths = [] } = {}) {
    if (!journal) return;
    const combined = {};

    if (Array.isArray(unsetPaths)) {
      for (const relPath of unsetPaths) {
        if (typeof relPath === "string" && (relPath.startsWith("data.") || relPath.startsWith("settings."))) {
          combined[`flags.ClueBook.${relPath}`] = { __cbDelete: true };
        }
      }
    }

    if (updateData && typeof updateData === "object") {
      for (const [k, v] of Object.entries(updateData)) {
        if (k.startsWith("flags.ClueBook.data.") || k.startsWith("flags.ClueBook.settings.")) {
          combined[k] = v;
        }
      }
    }

    if (Object.keys(combined).length === 0) return;
    await this.#applyMutationsToDocument(journal, combined, { cluebookProxy: true });
  }

  /**
   * Safely deletes a shared workspace journal or clears a personal/player workspace
   * without ever accidentally wiping the GM's own personal ClueBook when inspecting `personal_<userId>`.
   * @param {string} workspaceId
   * @returns {Promise<"deleted" | "cleared" | "forbidden">}
   */
  static async clearOrDeleteWorkspace(workspaceId) {
    const target = this.resolveTarget(workspaceId);
    if (!target.canRead || !target.doc) return "forbidden";

    if (target.kind === "shared") {
      if (!target.journal?.isOwner && !game.user?.isGM) return "forbidden";
      UndoService.clear(workspaceId);
      await target.journal.delete();
      return "deleted";
    }

    if (target.kind === "playerPersonal") {
      if (!game.user?.isGM) return "forbidden";
      UndoService.clear(workspaceId);
      await this.#enqueue(target.doc.uuid || `User.${target.userId}`, async () => {
        await target.doc.unsetFlag("ClueBook", "data");
        await target.doc.unsetFlag("ClueBook", "settings");
      });
      return "cleared";
    }

    if (target.kind === "personal") {
      UndoService.clear(workspaceId);
      await this.#enqueue(target.doc.uuid || `User.${game.user.id}`, async () => {
        await target.doc.unsetFlag("ClueBook", "data");
        await target.doc.unsetFlag("ClueBook", "settings");
      });
      return "cleared";
    }

    return "forbidden";
  }

  static #serializeForSocket(flatUpdates) {
    const wireUpdates = {};
    const unsetPaths = [];

    for (const [rawKey, val] of Object.entries(flatUpdates)) {
      if (!rawKey.startsWith("flags.ClueBook.")) continue;
      const subPath = rawKey.slice("flags.ClueBook.".length);
      const parts = subPath.split(".");
      const last = parts[parts.length - 1];

      if (last.startsWith("-=")) {
        const cleanLast = last.slice(2);
        unsetPaths.push([...parts.slice(0, -1), cleanLast].join("."));
      } else if (isDeletionValue(val)) {
        unsetPaths.push(subPath);
      } else {
        wireUpdates[rawKey] = val;
      }
    }

    return { wireUpdates, unsetPaths };
  }

  static async #applyMutationsToDocument(doc, flatUpdates, options = {}) {
    const queueKey = doc.uuid || `${doc.documentName}.${doc.id}`;
    return this.#enqueue(queueKey, async () => {
      const hasV14ForcedDeletion = Boolean(typeof foundry !== "undefined" && foundry.data?.operators?.ForcedDeletion);

      let touchedData = false;
      let touchedSettings = false;
      const nextData = foundry.utils.deepClone(doc.getFlag("ClueBook", "data") || {});
      const nextSettings = foundry.utils.deepClone(doc.getFlag("ClueBook", "settings") || {});
      const directOtherUpdates = {};

      const applyRelativePath = (rootObj, segments, value) => {
        if (!segments.length) return;
        let cursor = rootObj;
        for (let i = 0; i < segments.length - 1; i++) {
          const seg = segments[i];
          if (!cursor[seg] || typeof cursor[seg] !== "object" || Array.isArray(cursor[seg])) {
            cursor[seg] = {};
          }
          cursor = cursor[seg];
        }

        let leaf = segments[segments.length - 1];
        let isDel = isDeletionValue(value);
        if (leaf.startsWith("-=")) {
          leaf = leaf.slice(2);
          isDel = true;
        }

        if (isDel) {
          delete cursor[leaf];
          if (hasV14ForcedDeletion) {
            cursor[leaf] = new foundry.data.operators.ForcedDeletion();
          } else {
            cursor[`-=${leaf}`] = null;
          }
          return;
        }

        let cleanVal = foundry.utils.deepClone(value);
        if (segments.length === 2 && isEntryTab(segments[0]) && cleanVal && typeof cleanVal === "object") {
          cleanVal = sanitizeEntryForStorage(segments[0], cleanVal);
        }
        cursor[leaf] = cleanVal;
      };

      for (const [key, val] of Object.entries(flatUpdates)) {
        if (key === "flags.ClueBook.data" && val && typeof val === "object" && !isDeletionValue(val)) {
          Object.assign(nextData, foundry.utils.deepClone(val));
          touchedData = true;
        } else if (key.startsWith("flags.ClueBook.data.")) {
          const rel = key.slice("flags.ClueBook.data.".length).split(".");
          applyRelativePath(nextData, rel, val);
          touchedData = true;
        } else if (key === "flags.ClueBook.settings" && val && typeof val === "object" && !isDeletionValue(val)) {
          Object.assign(nextSettings, foundry.utils.deepClone(val));
          touchedSettings = true;
        } else if (key.startsWith("flags.ClueBook.settings.")) {
          const rel = key.slice("flags.ClueBook.settings.".length).split(".");
          applyRelativePath(nextSettings, rel, val);
          touchedSettings = true;
        } else {
          if (isDeletionValue(val)) {
            const parts = key.split(".");
            const leaf = parts.pop();
            if (hasV14ForcedDeletion) {
              directOtherUpdates[key] = new foundry.data.operators.ForcedDeletion();
            } else {
              directOtherUpdates[`${parts.join(".")}.-=${leaf}`] = null;
            }
          } else {
            directOtherUpdates[key] = val;
          }
        }
      }

      const payload = { ...directOtherUpdates };
      if (touchedData) payload["flags.ClueBook.data"] = nextData;
      if (touchedSettings) payload["flags.ClueBook.settings"] = nextSettings;

      if (Object.keys(payload).length > 0) {
        await doc.update(payload, options);
      }
    });
  }
}

