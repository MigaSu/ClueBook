const ALLOWED_IMAGE_EXT = /\.(png|jpe?g|webp|gif|svg|bmp|avif)$/i;
const MAX_SOCKET_BASE64_LENGTH = 25 * 1024 * 1024; // ~18.7 MB binary image max

/**
 * Service to manage isolated and secure media storage for ClueBook.
 * All files uploaded by players or GM are strictly placed in:
 * worlds/[world-id]/cluebook-gallery/
 */
export class MediaService {
  static get #FilePicker() {
    return foundry.applications?.apps?.FilePicker?.implementation ?? FilePicker;
  }

  static get folderPath() {
    return `worlds/${game.world.id}/cluebook-gallery`;
  }

  /**
   * Ensures that the isolated cluebook-gallery directory exists in the world folder.
   */
  static async ensureDirectory() {
    if (!game.user.isGM) return;
    const FP = MediaService.#FilePicker;
    try {
      const targetDir = MediaService.folderPath;
      try {
        const check = await FP.browse("data", targetDir);
        if (check?.target) return targetDir;
      } catch (e) {
        await FP.createDirectory("data", targetDir, {});
      }
    } catch (err) {
      console.warn("ClueBook | MediaService: Could not verify or create gallery directory:", err);
    }
  }

  /**
   * Uploads a file directly to the isolated gallery folder.
   * @param {File} file
   * @returns {Promise<string|null>} Relative path to the uploaded image.
   */
  static async uploadFile(file) {
    if (!file) return null;
    const targetDir = MediaService.folderPath;
    const FP = MediaService.#FilePicker;

    try {
      if (game.user.isGM) {
        await MediaService.ensureDirectory();
        const response = await FP.upload("data", targetDir, file, {});
        return response?.path || null;
      } else {
        try {
          const response = await FP.upload("data", targetDir, file, {});
          if (response?.path) return response.path;
        } catch (e) {
          return await MediaService.#uploadViaSocket(file);
        }
      }
    } catch (err) {
      console.error("ClueBook | Media upload failed:", err);
      ui.notifications.error(game.i18n.localize("CLUEBOOK.Gallery.UploadError"));
      return null;
    }
  }

  /**
   * Uploads an array or FileList of files to the isolated gallery folder.
   * @param {FileList|File[]} files
   * @returns {Promise<Array<{path: string, name: string}>>}
   */
  static async uploadFiles(files) {
    if (!files || files.length === 0) return [];
    const validFiles = Array.from(files).filter(
      f => f.type?.startsWith("image/") || ALLOWED_IMAGE_EXT.test(f.name || "")
    );
    if (validFiles.length === 0) return [];

    const results = [];
    for (const file of validFiles) {
      try {
        const path = await MediaService.uploadFile(file);
        if (path) {
          const rawName = file.name.replace(/\.[^/.]+$/, "");
          results.push({ path, name: rawName });
        }
      } catch (err) {
        console.warn("ClueBook | Failed to upload file in batch:", file.name, err);
      }
    }
    return results;
  }

  static async #uploadViaSocket(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const base64Data = reader.result;
        const requestId = foundry.utils.randomID();

        const onSocket = (data) => {
          if (data?.action === "mediaUploadComplete" && data.requestId === requestId) {
            clearTimeout(timeout);
            game.socket.off("module.ClueBook", onSocket);
            if (data.path) resolve(data.path);
            else reject(new Error(data.error || "Upload failed"));
          }
        };

        const timeout = setTimeout(() => {
          game.socket.off("module.ClueBook", onSocket);
          reject(new Error("Upload timed out"));
        }, 15000);

        game.socket.on("module.ClueBook", onSocket);

        game.socket.emit("module.ClueBook", {
          action: "uploadMedia",
          senderId: game.user?.id,
          requestId,
          name: file.name,
          type: file.type,
          data: base64Data
        });
      };
      reader.onerror = (err) => reject(err);
      reader.readAsDataURL(file);
    });
  }

  /**
   * Handle GM-side socket request to safely validate and save a player's uploaded image.
   */
  static async handleSocketUpload({ senderId, requestId, name, type, data }) {
    const isActiveGM = game.user?.isGM && (game.users?.activeGM ? game.users.activeGM.isSelf : true);
    if (!isActiveGM || !requestId) return;

    const FP = MediaService.#FilePicker;
    try {
      if (senderId && !game.users.has(senderId)) {
        throw new Error("Invalid uploader user");
      }
      if (typeof data !== "string" || !data.startsWith("data:image/") || data.length > MAX_SOCKET_BASE64_LENGTH) {
        throw new Error("Invalid or oversized image payload");
      }

      let safeName = String(name || `photo_${Date.now()}.png`).replace(/[^a-zA-Z0-9._-]/g, "_").replace(/^\.+/, "");
      if (!ALLOWED_IMAGE_EXT.test(safeName)) {
        safeName = `${safeName || `photo_${Date.now()}`}.png`;
      }

      await MediaService.ensureDirectory();
      const targetDir = MediaService.folderPath;

      const res = await fetch(data);
      const blob = await res.blob();
      const mimeType = (typeof type === "string" && type.startsWith("image/")) ? type : (blob.type || "image/png");
      const file = new File([blob], safeName, { type: mimeType });

      const uploadRes = await FP.upload("data", targetDir, file, {});

      game.socket.emit("module.ClueBook", {
        action: "mediaUploadComplete",
        requestId,
        path: uploadRes?.path || null
      });
    } catch (err) {
      console.error("ClueBook | GM Socket Upload error:", err);
      game.socket.emit("module.ClueBook", {
        action: "mediaUploadComplete",
        requestId,
        path: null,
        error: err.message
      });
    }
  }
}
