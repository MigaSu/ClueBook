import { TimeService } from "./services/time-service.js";
export class ClueBookSocket {
  static #isWorkspace(journal) {
    return journal && journal.getFlag("ClueBook", "isWorkspace");
  }

  static init() {
    game.socket.on("module.ClueBook", async (data) => {
      if (!data?.action) return;

      // GM-only handlers
      if (game.user.isGM) {
        switch (data.action) {
          case "updateBoard":
            return ClueBookSocket.#handleUpdateBoard(data);
          case "updateBoardData":
            return ClueBookSocket.#handleUpdateBoardData(data);
          case "createBoard":
            return ClueBookSocket.#handleCreateBoard(data);
          case "addSimpleCalendarNote":
            return ClueBookSocket.#handleAddScNote(data);
        }
      }

      // Handlers for targeted user
      if (data.userId === game.user.id) {
        if (data.action === "boardCreated") {
          ui.notifications.info(game.i18n.localize("CLUEBOOK.Socket.BoardCreatedSuccess"));
          const app = Array.from(foundry.applications.instances.values()).find(w => w.constructor.name === "ClueBookApp");
          if (app) {
            app.state.activeWorkspace = data.journalId;
            app.render();
          }
        } else if (data.action === "scNoteCreated") {
          ui.notifications.info(game.i18n.localize("CLUEBOOK.Socket.SentToSimpleCalendar"));
          const journal = game.journal.get(data.journalId);
          if (journal?.sheet) journal.sheet.render(true);
        }
      }
    });
  }

  static async #handleUpdateBoard({ journalId, name, ownership }) {
    try {
      const journal = game.journal.get(journalId);
      if (!ClueBookSocket.#isWorkspace(journal)) return;

      const updates = {};
      if (typeof name === "string" && name.trim()) updates.name = name.trim();
      if (ownership && typeof ownership === "object") updates.ownership = ownership;

      if (Object.keys(updates).length > 0) await journal.update(updates);
    } catch (err) {
      console.error("ClueBook | Error updating board:", err);
    }
  }

  static async #handleUpdateBoardData({ journalId, updateData, unsetPaths }) {
    try {
      const journal = game.journal.get(journalId);
      if (!ClueBookSocket.#isWorkspace(journal)) return;

      // Security: Validate unsetPaths to ensure they only affect ClueBook flags
      if (Array.isArray(unsetPaths)) {
        for (const path of unsetPaths) {
          if (typeof path === "string" && (path.startsWith("data.") || path.startsWith("settings."))) {
            await journal.unsetFlag("ClueBook", path);
          }
        }
      }

      // Security: Validate updateData keys to ensure they only update flags.ClueBook
      if (updateData && typeof updateData === "object") {
        const safeUpdates = {};
        for (const [key, value] of Object.entries(updateData)) {
          if (key.startsWith("flags.ClueBook.data.") || key.startsWith("flags.ClueBook.settings.")) {
            safeUpdates[key] = value;
          }
        }
        if (Object.keys(safeUpdates).length > 0) {
          await journal.update(safeUpdates);
        }
      }
    } catch (err) {
      console.error("ClueBook | Error updating board data via socket:", err);
    }
  }

  static async #handleCreateBoard({ userId, name, ownership }) {
    try {
      const requestingUser = game.users.get(userId);
      if (!requestingUser) return;

      const boardName = (typeof name === "string" && name.trim()) ? name.trim() : "РќРѕРІР°СЏ РґРѕСЃРєР°";
      ui.notifications.info(game.i18n.format("CLUEBOOK.Socket.BoardCreationRequest", { player: requestingUser.name, board: boardName }));

      let folder = game.folders.find(f => f.name === "ClueBook Boards" && f.type === "JournalEntry");
      if (!folder) {
        folder = await Folder.create({ name: "ClueBook Boards", type: "JournalEntry" });
      }

      const safeOwnership = { default: 0 };
      safeOwnership[userId] = 3;
      game.users.filter(u => u.isGM).forEach(gm => safeOwnership[gm.id] = 3);
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
          userId: userId
        });
        ui.notifications.info(game.i18n.format("CLUEBOOK.Socket.BoardCreatedFor", { board: boardName }));
      }
    } catch (err) {
      console.error("ClueBook | Error creating board:", err);
      ui.notifications.error(game.i18n.localize("CLUEBOOK.Socket.BoardCreationError"));
    }
  }

  static async #handleAddScNote({ userId, title, content, startDate, endDate }) {
    try {
      if (!TimeService.isActive()) return;
      
      const ts = startDate ? TimeService.dateToTimestamp(startDate) : game.time.worldTime;
      const scNote = await TimeService.addNote(title, content, ts);

      if (scNote) {
        game.socket.emit("module.ClueBook", {
          action: "scNoteCreated",
          userId: userId,
          journalId: scNote.id || scNote._id
        });
      }
    } catch (err) {
      console.error("ClueBook | Simple Calendar note error:", err);
    }
  }

  static async updateBoard(journalId, name, ownership) {
    if (game.user.isGM) {
      await ClueBookSocket.#handleUpdateBoard({ journalId, name, ownership });
    } else {
      game.socket.emit("module.ClueBook", {
        action: "updateBoard",
        journalId,
        name,
        ownership
      });
    }
  }
}


