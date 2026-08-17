/**
 * Service to manage isolated and secure media storage for ClueBook.
 * All files uploaded by players or GM are strictly placed in:
 * worlds/[world-id]/cluebook-gallery/
 */
export class MediaService {
  static get folderPath() {
    return `worlds/${game.world.id}/cluebook-gallery`;
  }

  /**
   * Ensures that the isolated cluebook-gallery directory exists in the world folder.
   */
  static async ensureDirectory() {
    if (!game.user.isGM) return;
    try {
      const parent = `worlds/${game.world.id}`;
      const folderName = "cluebook-gallery";
      
      // Check if folder already exists
      const targetDir = `${parent}/${folderName}`;
      try {
        const check = await FilePicker.browse("data", targetDir);
        if (check?.target) return targetDir;
      } catch (e) {
        // Directory does not exist, create it
        await FilePicker.createDirectory("data", targetDir, {});
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

    try {
      if (game.user.isGM) {
        await MediaService.ensureDirectory();
        const response = await FilePicker.upload("data", targetDir, file, {});
        return response?.path || null;
      } else {
        // Player upload: Try direct upload if user has permission
        try {
          const response = await FilePicker.upload("data", targetDir, file, {});
          if (response?.path) return response.path;
        } catch (e) {
          // If player has no direct FS write permissions, request GM via socket
          return await MediaService.#uploadViaSocket(file);
        }
      }
    } catch (err) {
      console.error("ClueBook | Media upload failed:", err);
      ui.notifications.error(game.i18n.localize("CLUEBOOK.Gallery.UploadError") || "Upload failed");
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
    const validFiles = Array.from(files).filter(f => f.type.startsWith('image/') || /\.(png|jpe?g|webp|gif|svg|bmp|avif)$/i.test(f.name));
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

  /**
   * Socket upload fallback for players without direct FilePicker permissions
   */
  static async #uploadViaSocket(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const base64Data = reader.result;
        const requestId = foundry.utils.randomID();

        const timeout = setTimeout(() => {
          reject(new Error("Upload timed out"));
        }, 15000);

        const onSocket = (data) => {
          if (data?.action === "mediaUploadComplete" && data.requestId === requestId) {
            clearTimeout(timeout);
            game.socket.off("module.ClueBook", onSocket);
            if (data.path) resolve(data.path);
            else reject(new Error(data.error || "Upload failed"));
          }
        };

        game.socket.on("module.ClueBook", onSocket);

        game.socket.emit("module.ClueBook", {
          action: "uploadMedia",
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
   * Handle GM-side socket request to safely save player's uploaded file
   */
  static async handleSocketUpload({ requestId, name, type, data }) {
    if (!game.user.isGM) return;
    try {
      await MediaService.ensureDirectory();
      const targetDir = MediaService.folderPath;

      // Clean safe filename
      const safeName = (name || `photo_${Date.now()}.png`).replace(/[^a-zA-Z0-9._-]/g, "_");
      
      // Convert DataURL to Blob/File
      const res = await fetch(data);
      const blob = await res.blob();
      const file = new File([blob], safeName, { type: type || "image/png" });

      const uploadRes = await FilePicker.upload("data", targetDir, file, {});
      
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
