import { TimeService } from "./time-service.js";

export class TrackerService {

  /**
   * Retrieves and formats all tracked events across all available workspaces.
   * @param {Array<string>} trackedIds - List of event IDs to track
   * @param {boolean} showOverdue - Whether to include overdue events
   * @returns {Promise<Array<Object>>} - Sorted and filtered list of events
   */
  static async getTrackedEvents(trackedIds, showOverdue) {
    if (!trackedIds || !trackedIds.length) return [];

    const currentTs = game.time.worldTime;
    const allEvents = [];

    // Gather from personal workspace
    const personalData = game.user.getFlag("ClueBook", "data") || {};
    await this.#extractTrackedEvents(personalData, trackedIds, "personal", game.i18n.localize("CLUEBOOK.Workspace.Personal"), allEvents, currentTs);

    // Gather from shared journal workspaces
    for (const j of game.journal) {
      if (j.getFlag("ClueBook", "isWorkspace") && j.testUserPermission(game.user, "OBSERVER")) {
        const sharedData = j.getFlag("ClueBook", "data") || {};
        await this.#extractTrackedEvents(sharedData, trackedIds, j.id, j.name, allEvents, currentTs);
      }
    }
    
    // Gather from other players' personal workspaces (if GM)
    if (game.user.isGM) {
      for (const u of game.users) {
        if (u.id !== game.user.id && !u.isGM) {
          const uName = u.getFlag("ClueBook", "personalWorkspaceName") || game.i18n.format("CLUEBOOK.Workspace.PersonalUser", { user: u.name });
          const uData = u.getFlag("ClueBook", "data") || {};
          await this.#extractTrackedEvents(uData, trackedIds, `personal_${u.id}`, uName, allEvents, currentTs);
        }
      }
    }

    // Filter out overdue if not requested
    const filtered = allEvents.filter(e => {
      if (!showOverdue && e.isOverdue) return false;
      return true;
    });

    // Sort by time difference
    filtered.sort((a, b) => {
      if (TimeService.isActive()) {
        if (a.diff === b.diff) return 0;
        if (a.diff === Infinity) return 1;
        if (b.diff === Infinity) return -1;
        return a.diff - b.diff;
      } else {
        const idxA = trackedIds.indexOf(a.id);
        const idxB = trackedIds.indexOf(b.id);
        return idxA - idxB;
      }
    });

    return filtered;
  }

  static async #extractTrackedEvents(data, trackedIds, workspaceId, workspaceName, outputArray, currentTs) {
    if (!data) return;
    
    const TE = foundry.applications?.ux?.TextEditor?.implementation ?? TextEditor;
    const processUUIDs = (text) => {
      if (!text) return text;
      const uuidRegex = /(?<!@UUID\[)(?<!\.)\b(?:Actor|Item|JournalEntry|JournalEntryPage|Scene|RollTable|Cards|Macro|Playlist|User)(?:\.[a-zA-Z0-9_-]+)+\b/g;
      let newText = text.replace(uuidRegex, match => `@UUID[${match}]`);
      const compendiumRegex = /(?<!@UUID\[)(?<!\.)\bCompendium\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+(?:\.[a-zA-Z0-9_-]+)+\b/g;
      newText = newText.replace(compendiumRegex, match => `@UUID[${match}]`);
      return newText;
    };
    
    const enrich = async (text) => {
      if (!text) return game.i18n.localize("CLUEBOOK.EntryDetails.Untitled");
      let newText = await TE.enrichHTML(processUUIDs(text), { async: true });
      newText = newText.replace(
        /\[\[qnmention:([^:]+):([^\]]+)\]\](?:\{([^}]*)\})?/g,
        (_, id, name, customText) => {
          const displayText = customText || name;
          return `<a data-action="jumpToMention" data-mention-id="${id}" data-workspace="${workspaceId}" title="${game.i18n.format("CLUEBOOK.App.GoToEntry", { name: name })}"><i class="fas fa-book"></i> ${displayText}</a>`;
        }
      );
      return newText;
    };

    // Quests
    if (data.quests) {
      for (const [id, q] of Object.entries(data.quests)) {
        if (q && q.status === "active" && trackedIds.includes(id)) {
          let ts = q.deadlineTimestamp;
          let enrichedName = await enrich(q.text);
          this.#pushEvent(outputArray, id, enrichedName, ts, currentTs, workspaceId, workspaceName, "quests", q.color || "purple");
        }
      }
    }
    
    // Timeline
    if (data.timeline) {
      for (const [id, t] of Object.entries(data.timeline)) {
        if (t && trackedIds.includes(id)) {
          let ts = t.startTimestamp;
          let enrichedName = await enrich(t.event);
          this.#pushEvent(outputArray, id, enrichedName, ts, currentTs, workspaceId, workspaceName, "timeline", t.color || "red");
        }
      }
    }
  }

  static #pushEvent(arr, id, name, targetTs, currentTs, workspaceId, workspaceName, tab, colorHex) {
    // Treat 0, null, undefined, or empty string as "No time"
    const hasTime = targetTs !== undefined && targetTs !== null && targetTs !== "" && targetTs !== 0;
    
    const diff = hasTime ? targetTs - currentTs : Infinity;
    const isOverdue = hasTime ? diff < 0 : false;
    
    let timeStr = "";
    if (hasTime) {
      const formatted = TimeService.formatTimestamp(targetTs);
      timeStr = formatted.fullStr !== "—" ? formatted.fullStr : "";
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
      diffStr = "—";
    }

    // Map default colors to actual colors if needed
    const colorMap = {
      "yellow": "#ffeb3b", "green": "#4caf50", "blue": "#2196f3", 
      "red": "#f44336", "purple": "#9c27b0", "orange": "#ff9800",
      "teal": "#009688", "pink": "#e91e63", "brown": "#795548"
    };
    const finalColor = colorMap[colorHex] || colorHex;

    arr.push({
      id,
      name: name,
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
