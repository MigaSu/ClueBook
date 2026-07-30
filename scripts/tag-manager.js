const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class ClueBookTagManager extends HandlebarsApplicationMixin(ApplicationV2) {
  constructor(options = {}) {
    super(options);
    this.workspace = options.workspace || "personal";
    this.journal = options.journal; // Might be null if personal
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
    let tagsObj = {};
    if (this.workspace === "personal") {
      tagsObj = game.user.getFlag("ClueBook", "settings")?.tags || {};
    } else if (this.journal) {
      tagsObj = this.journal.getFlag("ClueBook", "settings")?.tags || {};
    }

    const tags = Object.values(tagsObj).sort((a, b) => a.name.localeCompare(b.name));

    return {
      tags: tags,
      hasTags: tags.length > 0
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
          list.innerHTML = `<p class="cb-tm-empty">${game.i18n.localize("CLUEBOOK.Tags.NoTags")}</p>`;
        }
      }
    });

    html.addEventListener('change', ev => {
      const secretCb = ev.target.closest('.cb-tm-secret-cb');
      if (secretCb) {
        const icon = secretCb.previousElementSibling;
        if (secretCb.checked) {
          icon.classList.remove('fa-eye');
          icon.classList.add('fa-eye-slash');
        } else {
          icon.classList.remove('fa-eye-slash');
          icon.classList.add('fa-eye');
        }
      }
    });
    
    // Wire up Add Tag button (ApplicationV2 actions sometimes have issues with non-button elements, so we also bind manually just in case)
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
    const emptyMsg = list.querySelector('.cb-tm-empty');
    if (emptyMsg) emptyMsg.remove();

    const newId = foundry.utils.randomID();
    const defaultColor = "#7b61ff";
    
    const rowHtml = `
      <div class="cb-tm-row" data-tag-id="${newId}">
        <input type="color" class="cb-tm-color" value="${defaultColor}" title="${game.i18n.localize('CLUEBOOK.Tags.Color')}">
        <input type="text" class="cb-tm-name cluebook-input" value="" placeholder="${game.i18n.localize('CLUEBOOK.Tags.TagName')}" autofocus>
        <label class="cb-tm-secret" title="${game.i18n.localize('CLUEBOOK.Tags.SecretHint')}">
          <i class="fas fa-eye"></i>
          <input type="checkbox" class="cb-tm-secret-cb" style="display:none;">
        </label>
        <button type="button" class="cb-tm-delete" title="${game.i18n.localize('CLUEBOOK.Tags.Delete')}"><i class="fas fa-trash"></i></button>
      </div>
    `;
    
    list.insertAdjacentHTML('beforeend', rowHtml);
    const newRow = list.lastElementChild;
    newRow.querySelector('.cb-tm-name').focus();
  }

  static async _onSaveTags(event, target) {
    const rows = this.element.querySelectorAll('.cb-tm-row');
    const newTags = {};
    const validIds = new Set();
    
    rows.forEach(row => {
      const id = row.dataset.tagId;
      const name = row.querySelector('.cb-tm-name').value.trim();
      const color = row.querySelector('.cb-tm-color').value;
      const isSecret = row.querySelector('.cb-tm-secret-cb').checked;
      
      if (name) {
        newTags[id] = { id, name, color, isSecret };
        validIds.add(id);
      }
    });

    // We need to fetch existing tags to see if any were deleted
    let currentSettings = {};
    let dataObj = {}; // To clean up tags from entries
    
    if (this.workspace === "personal") {
      currentSettings = game.user.getFlag("ClueBook", "settings") || {};
      dataObj = game.user.getFlag("ClueBook", "data") || {};
    } else if (this.journal) {
      currentSettings = this.journal.getFlag("ClueBook", "settings") || {};
      dataObj = this.journal.getFlag("ClueBook", "data") || {};
    }
    
    const oldTags = currentSettings.tags || {};
    const deletedTagIds = Object.keys(oldTags).filter(id => !validIds.has(id));
    
    // Prepare flag updates for tags
    let settingsUpdates = {};
    for (const [id, tag] of Object.entries(newTags)) {
      settingsUpdates[`flags.ClueBook.settings.tags.${id}`] = tag;
    }
    for (const id of deletedTagIds) {
      if (this.workspace === "personal") {
        await game.user.unsetFlag("ClueBook", `settings.tags.${id}`);
      } else if (this.journal) {
        await this.journal.unsetFlag("ClueBook", `settings.tags.${id}`);
      }
    }
    
    if (this.workspace === "personal") {
      await game.user.update(settingsUpdates);
    } else if (this.journal) {
      await this.journal.update(settingsUpdates);
    }

    // Clean up deleted tags from all entries
    if (deletedTagIds.length > 0) {
      let dataUpdates = {};
      let needsDataUpdate = false;
      const tabs = ["notes", "npc", "quests", "timeline", "locations"];
      
      for (const tab of tabs) {
        if (!dataObj[tab]) continue;
        for (const [entryId, entry] of Object.entries(dataObj[tab])) {
          if (entry.tags && Array.isArray(entry.tags)) {
            const initialLen = entry.tags.length;
            const filteredTags = entry.tags.filter(t => !deletedTagIds.includes(t));
            if (filteredTags.length !== initialLen) {
              dataUpdates[`flags.ClueBook.data.${tab}.${entryId}.tags`] = filteredTags;
              needsDataUpdate = true;
            }
          }
        }
      }
      
      if (needsDataUpdate) {
        if (this.workspace === "personal") {
          await game.user.update(dataUpdates);
        } else if (this.journal) {
          await this.journal.update(dataUpdates);
        }
      }
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

