import { TimeService } from "./time-service.js";
import { TextEnrichmentService } from "./text-enrichment-service.js";
import { WorkspaceAccessService } from "./workspace-access-service.js";

export class TrackerService {

  /**
   * Retrieves and formats all tracked events across all available workspaces.
   * @param {Array<string>} trackedIds - List of event IDs to track
   * @param {boolean} showOverdue - Whether to include overdue events
   * @returns {Promise<Array<Object>>} - Sorted and filtered list of events
   */
  static async getTrackedEvents(trackedIds, showOverdue) {
    if (!trackedIds || !trackedIds.length) return [];
    const uniqueTrackedIds = Array.from(new Set(trackedIds));

    const currentTs = TimeService.isActive() ? game.time.worldTime : 0;
    const allEvents = [];

    // Gather from personal workspace
    const personalData = game.user.getFlag("ClueBook", "data") || {};
    await this.#extractTrackedEvents(personalData, uniqueTrackedIds, "personal", game.i18n.localize("CLUEBOOK.Workspace.Personal"), allEvents, currentTs, false);

    // Gather from shared journal workspaces
    for (const j of game.journal) {
      if (j.getFlag("ClueBook", "isWorkspace") && (game.user.isGM || j.testUserPermission(game.user, "OBSERVER"))) {
        const sharedData = j.getFlag("ClueBook", "data") || {};
        await this.#extractTrackedEvents(sharedData, uniqueTrackedIds, j.id, j.name, allEvents, currentTs, true);
      }
    }

    // Gather from other players' personal workspaces (if GM)
    if (game.user.isGM) {
      for (const u of game.users) {
        if (u.id !== game.user.id && !u.isGM) {
          const uName = u.getFlag("ClueBook", "personalWorkspaceName") || game.i18n.format("CLUEBOOK.Workspace.PersonalUser", { user: u.name });
          const uData = u.getFlag("ClueBook", "data") || {};
          await this.#extractTrackedEvents(uData, uniqueTrackedIds, `personal_${u.id}`, uName, allEvents, currentTs, false);
        }
      }
    }

    // Filter out overdue if not requested
    const filtered = allEvents.filter(e => {
      if (!showOverdue && e.isOverdue) return false;
      return true;
    });

    // Sort timed items chronologically; preserve manual trackedIds order for untimed / text-only items
    filtered.sort((a, b) => {
      if (TimeService.isActive()) {
        if (!a.hasTime && !b.hasTime) {
          return uniqueTrackedIds.indexOf(a.id) - uniqueTrackedIds.indexOf(b.id);
        }
        if (!a.hasTime) return 1;
        if (!b.hasTime) return -1;
        if (a.diff === b.diff) {
          return uniqueTrackedIds.indexOf(a.id) - uniqueTrackedIds.indexOf(b.id);
        }
        return a.diff - b.diff;
      }
      return uniqueTrackedIds.indexOf(a.id) - uniqueTrackedIds.indexOf(b.id);
    });

    return filtered;
  }

  static async #extractTrackedEvents(data, trackedIds, workspaceId, workspaceName, outputArray, currentTs, isShared) {
    if (!data) return;
    const folders = data.folders || {};

    const TE = foundry.applications?.ux?.TextEditor?.implementation ?? TextEditor;
    const enrich = async (text) => {
      if (!text) return game.i18n.localize("CLUEBOOK.EntryDetails.Untitled");
      const newText = await TE.enrichHTML(TextEnrichmentService.wrapBareUUIDs(text), { async: true });
      return TextEnrichmentService.enrichMentionsToHTML(newText);
    };

    // Tasks / Quests
    if (data.quests) {
      for (const [id, q] of Object.entries(data.quests)) {
        if (!q || !trackedIds.includes(id)) continue;
        if (q.status && q.status !== "active") continue;
        if (!WorkspaceAccessService.canUserViewEntry(q, folders, game.user, isShared)) continue;

        const isTextMode = Boolean(q.useTextTime || (!q.deadlineTimestamp && q.deadline));
        const ts = isTextMode ? null : q.deadlineTimestamp;
        const textTime = isTextMode ? TextEnrichmentService.stripToPlainText(q.deadline || "") : "";
        const enrichedName = await enrich(q.text);
        this.#pushEvent(outputArray, id, enrichedName, ts, textTime, currentTs, workspaceId, workspaceName, "quests", q.color || "purple");
      }
    }

    // Timeline
    if (data.timeline) {
      for (const [id, t] of Object.entries(data.timeline)) {
        if (!t || !trackedIds.includes(id)) continue;
        if (!WorkspaceAccessService.canUserViewEntry(t, folders, game.user, isShared)) continue;

        const isTextMode = Boolean(t.useTextTime || (!t.startTimestamp && (t.time || t.date)));
        const ts = isTextMode ? null : t.startTimestamp;
        const textTime = isTextMode ? TextEnrichmentService.stripToPlainText(t.time || t.date || "") : "";
        const enrichedName = await enrich(t.event);
        this.#pushEvent(outputArray, id, enrichedName, ts, textTime, currentTs, workspaceId, workspaceName, "timeline", t.color || "red");
      }
    }
  }

  static #pushEvent(arr, id, name, targetTs, textTime, currentTs, workspaceId, workspaceName, tab, colorHex) {
    if (arr.some(e => e.id === id)) return;

    const hasTime = targetTs !== undefined && targetTs !== null && targetTs !== "" && targetTs !== 0;
    const diff = hasTime ? targetTs - currentTs : Infinity;
    const isOverdue = hasTime ? diff < 0 : false;

    let timeStr = "";
    if (hasTime) {
      const formatted = TimeService.formatTimestamp(targetTs);
      timeStr = formatted.fullStr !== "—" ? formatted.fullStr : "";
    } else if (textTime) {
      timeStr = textTime;
    }

    let diffStr = "";
    if (hasTime) {
      const absDiff = Math.abs(diff);
      const d = Math.floor(absDiff / 86400);
      const h = Math.floor((absDiff % 86400) / 3600);
      const m = Math.floor((absDiff % 3600) / 60);

      if (d > 0) diffStr += d + game.i18n.localize("CLUEBOOK.Time.DaysShort") + " ";
      if (h > 0) diffStr += h + game.i18n.localize("CLUEBOOK.Time.HoursShort") + " ";
      diffStr += m + game.i18n.localize("CLUEBOOK.Time.MinutesShort");
    } else {
      diffStr = textTime || "—";
    }

    const colorMap = {
      yellow: "#ffeb3b", green: "#4caf50", blue: "#2196f3",
      red: "#f44336", purple: "#9c27b0", orange: "#ff9800",
      teal: "#009688", pink: "#e91e63", brown: "#795548"
    };
    const finalColor = colorMap[colorHex] || colorHex;

    arr.push({
      id,
      name,
      hasTime,
      textTime,
      diff,
      isOverdue,
      timeStr,
      diffStr,
      workspaceId,
      workspaceName,
      tab,
      color: finalColor
    });
  }
}
