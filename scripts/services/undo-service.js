import { assignDeletion, isDeletionValue } from "../data-models.js";

const MAX_UNDO_STEPS = 25;
const COALESCE_WINDOW_MS = 850;

/**
 * Per-workspace surgical Undo service (Ctrl+Z).
 * Records minimal inverse dot-path patches so multiplayer edits on shared boards
 * never overwrite unrelated cards created or edited by other players.
 */
export class UndoService {
  static #stacks = new Map();
  static #listeners = new Set();

  /**
   * Subscribes to undo stack changes (e.g., to show an Undo toast or refresh toolbar state).
   * @param {(event: { type: "push" | "pop" | "clear", workspaceId: string, destructive?: boolean }) => void} fn
   * @returns {() => void} Unsubscribe callback
   */
  static subscribe(fn) {
    this.#listeners.add(fn);
    return () => this.#listeners.delete(fn);
  }

  static #emit(event) {
    for (const fn of this.#listeners) {
      try {
        fn(event);
      } catch (err) {
        console.error("ClueBook | UndoService listener error:", err);
      }
    }
  }

  /**
   * Computes a surgical inverse patch from `currentData` (`flags.ClueBook.data`) before `flatUpdates` is applied,
   * and pushes it onto the workspace undo stack if non-empty.
   * @param {string} workspaceId
   * @param {Object} currentData
   * @param {Record<string, any>} flatUpdates
   */
  static recordBeforeMutation(workspaceId, currentData, flatUpdates) {
    if (!workspaceId || !flatUpdates || typeof flatUpdates !== "object") return;

    const inverseUpdates = {};
    const touchedSignatureKeys = [];
    let destructive = false;
    const safeData = currentData || {};

    for (const [rawKey, nextVal] of Object.entries(flatUpdates)) {
      if (!rawKey.startsWith("flags.ClueBook.data.")) continue;

      const relPath = rawKey.slice("flags.ClueBook.data.".length);
      const segments = relPath.split(".");
      if (segments.length < 2) continue;

      let lastSeg = segments[segments.length - 1];
      let isDel = isDeletionValue(nextVal);
      if (lastSeg.startsWith("-=")) {
        lastSeg = lastSeg.slice(2);
        segments[segments.length - 1] = lastSeg;
        isDel = true;
      }

      const cleanRelPath = segments.join(".");
      const cleanFullKey = `flags.ClueBook.data.${cleanRelPath}`;
      touchedSignatureKeys.push(cleanFullKey);

      if (isDel) {
        const prevVal = foundry.utils.getProperty(safeData, cleanRelPath);
        if (prevVal !== undefined) {
          inverseUpdates[cleanFullKey] = foundry.utils.deepClone(prevVal);
          destructive = true;
        }
        continue;
      }

      if (segments.length === 2) {
        const [collection, entityId] = segments;
        const prevEntity = safeData?.[collection]?.[entityId];
        if (prevEntity === undefined) {
          assignDeletion(inverseUpdates, `flags.ClueBook.data.${collection}`, entityId);
        } else if (JSON.stringify(prevEntity) !== JSON.stringify(nextVal)) {
          inverseUpdates[cleanFullKey] = foundry.utils.deepClone(prevEntity);
        }
        continue;
      }

      // Deep field update: flags.ClueBook.data.<collection>.<entityId>.<field...>
      const [collection, entityId] = segments;
      const prevEntity = safeData?.[collection]?.[entityId];
      if (prevEntity === undefined) {
        assignDeletion(inverseUpdates, `flags.ClueBook.data.${collection}`, entityId);
        continue;
      }

      const prevLeaf = foundry.utils.getProperty(safeData, cleanRelPath);
      if (prevLeaf === nextVal) continue;
      if (prevLeaf && nextVal && typeof prevLeaf === "object" && JSON.stringify(prevLeaf) === JSON.stringify(nextVal)) {
        continue;
      }

      if (segments[segments.length - 1] === "onBoard" && nextVal === false && prevLeaf === true) {
        destructive = true;
      }

      if (prevLeaf === undefined) {
        const parentPath = `flags.ClueBook.data.${segments.slice(0, -1).join(".")}`;
        assignDeletion(inverseUpdates, parentPath, lastSeg);
      } else {
        inverseUpdates[cleanFullKey] = foundry.utils.deepClone(prevLeaf);
      }
    }

    if (Object.keys(inverseUpdates).length === 0) return;

    const wsKey = workspaceId || "personal";
    let stack = this.#stacks.get(wsKey);
    if (!stack) {
      stack = [];
      this.#stacks.set(wsKey, stack);
    }

    const now = Date.now();
    const signature = touchedSignatureKeys.sort().join("|");
    const top = stack[stack.length - 1];

    // Coalesce rapid debounced input edits on the exact same field(s)
    if (top && !destructive && !top.destructive && top.signature === signature && (now - top.timestamp) < COALESCE_WINDOW_MS) {
      top.timestamp = now;
      return;
    }

    stack.push({
      inverseUpdates,
      signature,
      destructive,
      timestamp: now
    });

    if (stack.length > MAX_UNDO_STEPS) {
      stack.shift();
    }

    this.#emit({ type: "push", workspaceId: wsKey, destructive });
  }

  /**
   * Returns true if there is at least one undoable step for the workspace.
   * @param {string} [workspaceId="personal"]
   * @returns {boolean}
   */
  static canUndo(workspaceId = "personal") {
    const stack = this.#stacks.get(workspaceId || "personal");
    return Boolean(stack && stack.length > 0);
  }

  /**
   * Pops the most recent inverse patch for the workspace, or null if empty.
   * @param {string} [workspaceId="personal"]
   * @returns {Record<string, any> | null}
   */
  static popUndoPatch(workspaceId = "personal") {
    const wsKey = workspaceId || "personal";
    const stack = this.#stacks.get(wsKey);
    if (!stack || stack.length === 0) return null;
    const item = stack.pop();
    this.#emit({ type: "pop", workspaceId: wsKey });
    return item.inverseUpdates;
  }

  /**
   * Clears the undo history for a workspace (e.g., when a workspace is deleted/wiped).
   * @param {string} [workspaceId="personal"]
   */
  static clear(workspaceId = "personal") {
    const wsKey = workspaceId || "personal";
    this.#stacks.delete(wsKey);
    this.#emit({ type: "clear", workspaceId: wsKey });
  }
}

