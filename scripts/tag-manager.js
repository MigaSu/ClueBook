import { assignDeletion, ENTRY_TABS } from "./data-models.js";
import { WorkspaceRepository } from "./services/workspace-repository.js";
import { WorkspaceAccessService } from "./services/workspace-access-service.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class ClueBookTagManager extends HandlebarsApplicationMixin(ApplicationV2) {
  constructor(options = {}) {
    super(options);
    this.workspace = options.workspace || "personal";
    this.journal = options.journal || null;
  }

  static DEFAULT_OPTIONS = {
    id: "cluebook-tag-manager",
    classes: ["cluebook-window", "cb-tag-manager"],
    position: { width: 400, height: 500 },
    window: {
      title: "CLUEBOOK.Tags.Title",
      icon: "fas fa-tags",
      resizable: true
    },
    actions: {
      saveTags: ClueBookTagManager._onSaveTags,
      addTag: ClueBookTagManager._onAddTag
    }
  };

  get title() {
    return game.i18n.localize(this.options.window.title);
  }

  static PARTS = {
    content: {
      template: "modules/ClueBook/templates/tag-manager.hbs",
      classes: ["cluebook-content"]
    }
  };

  async _prepareContext(options) {
    const wsId = this.workspace || "personal";
    const settings = WorkspaceRepository.getSettings(wsId) || {};
    const target = WorkspaceRepository.resolveTarget(wsId);
    const visibleTags = WorkspaceAccessService.getVisibleTags(settings.tags || {}, settings, game.user, target.isShared);
    const tags = Object.values(visibleTags).sort((a, b) => (a.name || "").localeCompare(b.name || ""));

    return {
      tags: tags,
      hasTags: tags.length > 0,
      isGM: Boolean(game.user?.isGM)
    };
  }

  _onRender(context, options) {
    super._onRender(context, options);
    const html = this.element;

    // Delegate row events
    html.addEventListener('click', ev => {
      const deleteBtn = ev.target.closest('.cb-tm-delete');
      if (deleteBtn) {
        deleteBtn.closest('.cb-tm-row').remove();
        if (html.querySelectorAll('.cb-tm-row').length === 0) {
          const list = html.querySelector('.cb-tm-list');
          if (list) {
            list.replaceChildren();
            const p = document.createElement("p");
            p.className = "cb-tm-empty";
            p.textContent = game.i18n.localize("CLUEBOOK.Tags.NoTags");
            list.appendChild(p);
          }
        }
      }
    });

    html.addEventListener('change', ev => {
      const secretCb = ev.target.closest('.cb-tm-secret-cb');
      if (secretCb) {
        const icon = secretCb.previousElementSibling;
        if (icon) {
          if (secretCb.checked) {
            icon.classList.remove('fa-eye');
            icon.classList.add('fa-eye-slash');
          } else {
            icon.classList.remove('fa-eye-slash');
            icon.classList.add('fa-eye');
          }
        }
      }
    });
    
    // Wire up Add Tag button
    const addBtn = html.querySelector('#cb-tm-add');
    if (addBtn) {
      addBtn.addEventListener('click', (ev) => {
        ev.preventDefault();
        ClueBookTagManager._onAddTag.call(this, ev, addBtn);
      });
    }

    // Form submission
    const form = html.querySelector('form');
    if (form) {
      form.addEventListener('submit', (ev) => {
        ev.preventDefault();
        ClueBookTagManager._onSaveTags.call(this, ev, form);
      });
    }
  }

  static _onAddTag(event, target) {
    const list = this.element.querySelector('.cb-tm-list');
    if (!list) return;
    const emptyMsg = list.querySelector('.cb-tm-empty');
    if (emptyMsg) emptyMsg.remove();

    const newId = foundry.utils.randomID();
    const defaultColor = "#7b61ff";
    
    const row = document.createElement("div");
    row.className = "cb-tm-row";
    row.dataset.tagId = newId;

    const colorInput = document.createElement("input");
    colorInput.type = "color";
    colorInput.className = "cb-tm-color";
    colorInput.value = defaultColor;
    colorInput.title = game.i18n.localize('CLUEBOOK.Tags.Color');
    row.appendChild(colorInput);

    const nameInput = document.createElement("input");
    nameInput.type = "text";
    nameInput.className = "cb-tm-name cluebook-input";
    nameInput.value = "";
    nameInput.placeholder = game.i18n.localize('CLUEBOOK.Tags.TagName');
    nameInput.autofocus = true;
    row.appendChild(nameInput);

    const label = document.createElement("label");
    label.className = "cb-tm-secret";
    label.title = game.i18n.localize('CLUEBOOK.Tags.SecretHint');
    if (!game.user?.isGM) {
      label.style.display = "none";
    }
    const eyeIcon = document.createElement("i");
    eyeIcon.className = "fas fa-eye";
    label.appendChild(eyeIcon);
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.className = "cb-tm-secret-cb";
    cb.style.display = "none";
    label.appendChild(cb);
    row.appendChild(label);

    const delBtn = document.createElement("button");
    delBtn.type = "button";
    delBtn.className = "cb-tm-delete";
    delBtn.title = game.i18n.localize('CLUEBOOK.Tags.Delete');
    const delIcon = document.createElement("i");
    delIcon.className = "fas fa-trash";
    delBtn.appendChild(delIcon);
    row.appendChild(delBtn);

    list.appendChild(row);
    nameInput.focus();
  }

  static async _onSaveTags(event, target) {
    if (event?.preventDefault) event.preventDefault();
    const wsId = this.workspace || "personal";
    const targetInfo = WorkspaceRepository.resolveTarget(wsId);
    if (targetInfo.isReadOnly) {
      ui.notifications.warn(game.i18n.localize("CLUEBOOK.AppActions.ReadOnlyBoard") || "Board is read-only");
      this.close();
      return;
    }

    const rows = this.element.querySelectorAll('.cb-tm-row');
    const newTags = {};
    const validIds = new Set();
    const isGM = Boolean(game.user?.isGM);

    rows.forEach(row => {
      const id = row.dataset.tagId;
      const name = row.querySelector('.cb-tm-name')?.value?.trim();
      const color = row.querySelector('.cb-tm-color')?.value || "#7b61ff";
      const isSecretCb = row.querySelector('.cb-tm-secret-cb');
      const isSecret = isGM ? Boolean(isSecretCb?.checked) : false;

      if (name && id) {
        newTags[id] = { id, name, color, isSecret };
        validIds.add(id);
      }
    });

    const currentSettings = WorkspaceRepository.getSettings(wsId) || {};
    const oldTags = currentSettings.tags || {};
    const dataObj = WorkspaceRepository.getData(wsId) || {};

    // Determine deleted tags
    const deletedTagIds = [];
    for (const [id, oldTag] of Object.entries(oldTags)) {
      if (!validIds.has(id)) {
        // If non-GM, they are not allowed to delete secret tags (they couldn't even see them)
        if (!isGM && oldTag?.isSecret) {
          continue;
        }
        deletedTagIds.push(id);
      }
    }

    const combinedUpdates = {};

    // 1. Tag creations / modifications
    for (const [id, tag] of Object.entries(newTags)) {
      const oldTag = oldTags[id];
      if (!isGM && oldTag?.isSecret) {
        continue;
      }
      combinedUpdates[`flags.ClueBook.settings.tags.${id}`] = tag;
    }

    // 2. Tag deletions
    for (const id of deletedTagIds) {
      assignDeletion(combinedUpdates, "flags.ClueBook.settings.tags", id);
    }

    // 3. Clean up deleted tags from entries across ALL ENTRY_TABS
    if (deletedTagIds.length > 0) {
      for (const tab of ENTRY_TABS) {
        const tabEntries = dataObj[tab];
        if (!tabEntries || typeof tabEntries !== "object") continue;
        for (const [entryId, entry] of Object.entries(tabEntries)) {
          if (entry && Array.isArray(entry.tags) && entry.tags.length > 0) {
            const initialLen = entry.tags.length;
            const filteredTags = entry.tags.filter(tId => !deletedTagIds.includes(tId));
            if (filteredTags.length !== initialLen) {
              combinedUpdates[`flags.ClueBook.data.${tab}.${entryId}.tags`] = filteredTags;
            }
          }
        }
      }
    }

    if (Object.keys(combinedUpdates).length > 0) {
      await WorkspaceRepository.updatePaths(wsId, combinedUpdates);
    }

    ui.notifications.info(game.i18n.localize("CLUEBOOK.AppActions.Save"));

    // Re-render main app if it exists
    if (foundry.applications?.instances) {
      for (const app of foundry.applications.instances.values()) {
        if (app.constructor.name === "ClueBookApp") {
          app.render({ parts: ["content"] });
        }
      }
    }

    this.close();
  }
}
