import { TimeService } from "./services/time-service.js";
import { MediaService } from "./services/media-service.js";
import { WorkspaceRepository } from "./services/workspace-repository.js";

export class ClueBookSocket {
  static #isWorkspace(journal) {
    return Boolean(journal && journal.getFlag("ClueBook", "isWorkspace"));
  }

  static #isActiveGM() {
    if (!game.user?.isGM) return false;
    return game.users?.activeGM ? game.users.activeGM.isSelf : true;
  }

  static init() {
    game.socket.on("module.ClueBook", async (data) => {
      try {
        if (!data?.action) return;

        // Proxy mutations execute ONLY on the single active GM to prevent duplicate boards/files/writes
        if (ClueBookSocket.#isActiveGM()) {
          switch (data.action) {
            case "updateBoard":
              return await ClueBookSocket.#handleUpdateBoard(data);
            case "updateBoardData":
              return await ClueBookSocket.#handleUpdateBoardData(data);
            case "createBoard":
              return await ClueBookSocket.#handleCreateBoard(data);
            case "addSimpleCalendarNote":
              return await ClueBookSocket.#handleAddScNote(data);
            case "uploadMedia":
              return await MediaService.handleSocketUpload(data);
          }
        }

        // Handlers for targeted user
        if (data.userId === game.user.id) {
          if (data.action === "boardCreated") {
            ui.notifications.info(game.i18n.localize("CLUEBOOK.Socket.BoardCreatedSuccess"));
            const app = Array.from(foundry.applications.instances.values()).find(w => w.constructor.name === "ClueBookApp");
            if (app) {
              app.state.activeWorkspace = data.journalId;
              app.state.camera = null;
              app.render();
            }
          } else if (data.action === "scNoteCreated") {
            ui.notifications.info(game.i18n.localize("CLUEBOOK.Socket.SentToSimpleCalendar"));
            const journal = game.journal.get(data.journalId);
            if (journal?.sheet) journal.sheet.render(true);
          }
        }
      } catch (err) {
        console.error("ClueBook | Socket dispatch error:", err);
      }
    });
  }

  static async #handleUpdateBoard({ senderId, userId, journalId, name, ownership }) {
    try {
      const journal = game.journal.get(journalId);
      if (!ClueBookSocket.#isWorkspace(journal)) return;

      const actorUser = game.users.get(senderId || userId);
      if (!actorUser || (!actorUser.isGM && !journal.testUserPermission(actorUser, "OWNER"))) {
        console.warn("ClueBook | Blocked unauthorized updateBoard request from:", senderId || userId);
        return;
      }

      const updates = {};
      if (typeof name === "string" && name.trim()) updates.name = name.trim();
      if (ownership && typeof ownership === "object") {
        const safeOwnership = { ...journal.ownership };
        for (const [uId, lvl] of Object.entries(ownership)) {
          if ((uId === "default" || game.users.has(uId)) && [0, 1, 2, 3].includes(lvl)) {
            safeOwnership[uId] = lvl;
          }
        }
        game.users.filter(u => u.isGM).forEach(gm => { safeOwnership[gm.id] = 3; });
        updates.ownership = safeOwnership;
      }

      if (Object.keys(updates).length > 0) {
        await journal.update(updates, { cluebookProxy: true });
      }
    } catch (err) {
      console.error("ClueBook | Error updating board:", err);
    }
  }

  static async #handleUpdateBoardData({ senderId, userId, journalId, updateData, unsetPaths }) {
    try {
      const journal = game.journal.get(journalId);
      if (!ClueBookSocket.#isWorkspace(journal)) return;

      const actorUser = game.users.get(senderId || userId);
      if (!actorUser || (!actorUser.isGM && !journal.testUserPermission(actorUser, "OBSERVER"))) {
        console.warn("ClueBook | Blocked unauthorized updateBoardData request from:", senderId || userId);
        return;
      }

      const boardSettings = journal.getFlag("ClueBook", "settings") || {};
      if (!actorUser.isGM && boardSettings.readOnly) {
        console.warn("ClueBook | Blocked socket write to read-only board from:", actorUser.name);
        return;
      }

      const isOwnerOrGM = Boolean(actorUser.isGM || journal.testUserPermission(actorUser, "OWNER"));
      const safeUpdates = {};
      const safeUnsets = [];

      if (Array.isArray(unsetPaths)) {
        for (const path of unsetPaths) {
          if (typeof path !== "string") continue;
          if (path.startsWith("data.")) {
            safeUnsets.push(path);
          } else if (path.startsWith("settings.") && isOwnerOrGM) {
            safeUnsets.push(path);
          }
        }
      }

      if (updateData && typeof updateData === "object") {
        for (const [key, value] of Object.entries(updateData)) {
          if (key.startsWith("flags.ClueBook.data.")) {
            safeUpdates[key] = value;
          } else if (key.startsWith("flags.ClueBook.settings.")) {
            if (isOwnerOrGM) {
              safeUpdates[key] = value;
            } else if (key.startsWith("flags.ClueBook.settings.tags.") && boardSettings.showTagsToPlayers !== false) {
              if (value && typeof value === "object") {
                safeUpdates[key] = { ...value, isSecret: false };
              }
            }
          }
        }
      }

      if (Object.keys(safeUpdates).length > 0 || safeUnsets.length > 0) {
        await WorkspaceRepository.applySocketMutation(journal, {
          updateData: safeUpdates,
          unsetPaths: safeUnsets
        });
      }
    } catch (err) {
      console.error("ClueBook | Error updating board data via socket:", err);
    }
  }

  static async #handleCreateBoard({ userId, senderId, name, ownership }) {
    try {
      const targetUserId = userId || senderId;
      const requestingUser = game.users.get(targetUserId);
      if (!requestingUser) return;

      const boardName = (typeof name === "string" && name.trim())
        ? name.trim()
        : game.i18n.localize("CLUEBOOK.Workspaces.DefaultBoardName");
      ui.notifications.info(game.i18n.format("CLUEBOOK.Socket.BoardCreationRequest", { player: requestingUser.name, board: boardName }));

      let folder = game.folders.find(f => f.name === "ClueBook Boards" && f.type === "JournalEntry");
      if (!folder) {
        folder = await Folder.create({ name: "ClueBook Boards", type: "JournalEntry" });
      }

      const safeOwnership = { default: 0 };
      safeOwnership[targetUserId] = 3;
      game.users.filter(u => u.isGM).forEach(gm => { safeOwnership[gm.id] = 3; });
      if (ownership && typeof ownership === "object") {
        for (const [uId, lvl] of Object.entries(ownership)) {
          if (game.users.has(uId) && [0, 1, 2, 3].includes(lvl)) safeOwnership[uId] = lvl;
        }
      }

      const journal = await JournalEntry.create({
        name: boardName,
        folder: folder ? folder.id : null,
        ownership: safeOwnership,
        flags: { ClueBook: { isWorkspace: true, data: {} } }
      });

      if (journal) {
        game.socket.emit("module.ClueBook", {
          action: "boardCreated",
          journalId: journal.id,
          userId: targetUserId
        });
        ui.notifications.info(game.i18n.format("CLUEBOOK.Socket.BoardCreatedFor", { board: boardName }));
      }
    } catch (err) {
      console.error("ClueBook | Error creating board:", err);
      ui.notifications.error(game.i18n.localize("CLUEBOOK.Socket.BoardCreatedError"));
    }
  }

  static async #handleAddScNote({ userId, senderId, title, content, startDate }) {
    try {
      const targetUserId = userId || senderId;
      if (!TimeService.isActive()) return;

      const ts = startDate ? TimeService.dateToTimestamp(startDate) : game.time.worldTime;
      const scNote = await TimeService.addNote(title, content, ts);

      if (scNote && targetUserId) {
        game.socket.emit("module.ClueBook", {
          action: "scNoteCreated",
          userId: targetUserId,
          journalId: scNote.id || scNote._id
        });
      }
    } catch (err) {
      console.error("ClueBook | Simple Calendar note error:", err);
    }
  }

  static async updateBoard(journalId, name, ownership) {
    if (game.user.isGM) {
      await ClueBookSocket.#handleUpdateBoard({ senderId: game.user.id, journalId, name, ownership });
    } else {
      game.socket.emit("module.ClueBook", {
        action: "updateBoard",
        senderId: game.user.id,
        journalId,
        name,
        ownership
      });
    }
  }
}
