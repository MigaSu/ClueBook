import { TimeService } from "./services/time-service.js";
import { TextEnrichmentService } from "./services/text-enrichment-service.js";
import { ClueBookDatePicker } from "./date-picker.js";
import { getRandomPhotoTilt } from "./data-models.js";
import { WorkspaceRepository } from "./services/workspace-repository.js";
import { WorkspaceAccessService } from "./services/workspace-access-service.js";
import { MentionAutocompleteController } from "./services/mention-autocomplete.js";
const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class ClueBookEditDialog extends HandlebarsApplicationMixin(ApplicationV2) {
  constructor(options = {}) {
    options.id = `cluebook-edit-${foundry.utils.randomID()}`;
    super(options);
    this.entry = options.entry;
    this.sourceTab = options.sourceTab;
    this.entryId = options.entryId;
    this.workspace = options.workspace || "personal";
    this.onSave = options.onSave;
  }

  static DEFAULT_OPTIONS = {
    id: "cluebook-edit-dialog",
    classes: ["cluebook-window", "cb-edit-dialog"],
    position: { width: 500, height: "auto" },
    window: {
      title: "CLUEBOOK.EditDialog.Title",
      icon: "fas fa-edit",
      resizable: true
    },
    actions: {
      saveDialog: ClueBookEditDialog._onSaveAction
    }
  };

  get title() {
    return game.i18n.localize(this.options.window.title);
  }

  static PARTS = {
    content: {
      template: "modules/ClueBook/templates/edit-dialog.hbs",
      classes: ["window-content"]
    }
  };

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    context.entry = foundry.utils.deepClone(this.entry);
    context.sourceTab = this.sourceTab;
    context.isGallery = this.sourceTab === "gallery";
    context.isMassEdit = this.options.isMassEdit;
    context.entriesCount = this.options.entriesCount;
    context.isSimpleCalendarActive = TimeService.isActive();
    context.isGM = game.user.isGM;

    let fallbackPortrait = "";
    if (context.entry.sceneUuid) {
      const scene = await fromUuid(context.entry.sceneUuid);
      if (scene) {
        context.sceneName = scene.name;
        fallbackPortrait = scene.thumbnail || scene.background?.src || "";
      }
    }
    if (context.entry.actorUuid) {
      const actor = await fromUuid(context.entry.actorUuid);
      if (actor) {
        context.actorName = actor.name;
        const actorImg = actor.img || actor.prototypeToken?.texture?.src || "";
        if (actorImg && actorImg !== CONST.DEFAULT_TOKEN && actorImg !== "icons/svg/mystery-man.svg") {
          fallbackPortrait = actorImg;
        }
      }
    }
    context.fallbackPortrait = fallbackPortrait;
    context.previewImg = context.entry.img || fallbackPortrait;
    const PRESET_COLORS = ["yellow", "red", "green", "blue", "purple", "orange", "teal", "pink", "brown"];
    context.isCustomColor = context.entry.color && !PRESET_COLORS.includes(context.entry.color);

    const TE = foundry.applications?.ux?.TextEditor?.implementation ?? TextEditor;
    if (context.entry.text) context.enrichedText = await TE.enrichHTML(context.entry.text, { async: true });
    if (context.entry.note) context.enrichedNote = await TE.enrichHTML(context.entry.note, { async: true });
    if (context.entry.event) context.enrichedEvent = await TE.enrichHTML(context.entry.event, { async: true });

    // --- Tags System ---
    context.showTags = !(game.user.getFlag("ClueBook", "settings")?.features?.hideTags);
    
    const wsTarget = WorkspaceRepository.resolveTarget(this.workspace);
    const isShared = wsTarget.isShared;
    const wsSettings = WorkspaceRepository.getSettings(this.workspace);
    const userSettings = game.user.getFlag("ClueBook", "settings") || {};
    context.showCardPortraits = Boolean(wsSettings?.features?.showCardPortraits ?? userSettings?.features?.showCardPortraits);
    const rawTags = wsSettings?.tags || {};
    const visibleTags = WorkspaceAccessService.getVisibleTags(rawTags, wsSettings, game.user, isShared);
    context.globalTags = visibleTags;
    
    if (Array.isArray(context.entry.tags)) {
      context.entry.resolvedTags = context.entry.tags
        .filter(id => Boolean(visibleTags[id]))
        .map(id => visibleTags[id] || { id: id, name: id, color: '#333333', isSecret: false });
    } else {
      context.entry.resolvedTags = [];
      context.entry.tags = [];
    }

    // --- Folders System ---
    const foldersData = WorkspaceRepository.getFolders(this.workspace);
    context.availableFolders = Object.entries(foldersData)
      .filter(([fId, f]) => f && f.tab === this.sourceTab && WorkspaceAccessService.isFolderVisible(f, game.user, isShared))
      .map(([fId, f]) => ({
        id: fId,
        name: f.name,
        isSelected: context.entry.folderId === fId
      }));

    if (context.isSimpleCalendarActive) {
      const currentTimestamp = game.time.worldTime;
      const allMonths = TimeService.getMonths();

      const buildDateContext = (timestamp, prefix) => {
        const targetTs = (timestamp !== null && timestamp !== undefined && timestamp !== "") ? timestamp : currentTimestamp;
        const scDate = TimeService.timestampToDate(targetTs) || TimeService.timestampToDate(currentTimestamp);
        
        const monthsData = allMonths.map((m, i) => ({
          index: i,
          name: m.name || m,
          selected: i === scDate.month
        }));

        return {
          prefix,
          year: scDate.year,
          month: scDate.month,
          day: scDate.day !== undefined ? scDate.day + 1 : 1,
          hour: scDate.hour,
          minute: scDate.minute,
          months: monthsData
        };
      };

      const renderTpl = foundry.applications?.handlebars?.renderTemplate ?? renderTemplate;
      if (this.sourceTab === "quests") {
        const deadlineData = buildDateContext(this.entry.deadlineTimestamp, "deadline");
        context.deadlineDateHTML = await renderTpl("modules/ClueBook/templates/date-fields.hbs", deadlineData);
      } else if (this.sourceTab === "timeline") {
        const startData = buildDateContext(this.entry.startTimestamp, "start");
        context.startDateHTML = await renderTpl("modules/ClueBook/templates/date-fields.hbs", startData);

        const endData = buildDateContext(this.entry.endTimestamp, "end");
        context.endDateHTML = await renderTpl("modules/ClueBook/templates/date-fields.hbs", endData);

        // Calculate duration and endMode
        let endMode = "none";
        let duration = { days: 0, hours: 0, minutes: 0 };
        
        if (this.entry.endTimestamp) {
          endMode = "time"; // Default to time if it exists
          if (this.entry.startTimestamp) {
             const diff = this.entry.endTimestamp - this.entry.startTimestamp;
             if (diff > 0) {
               duration.days = Math.floor(diff / 86400);
               duration.hours = Math.floor((diff % 86400) / 3600);
               duration.minutes = Math.floor((diff % 3600) / 60);
             }
          }
        }
        context.endMode = endMode;
        context.duration = duration;
      }
    }

    return context;
  }

  _onClose(options) {
    super._onClose(options);
    if (this._mentionController) {
      this._mentionController.destroy();
      this._mentionController = null;
    }
    if (this._tagAutocompleteClickOutside) {
      document.removeEventListener('click', this._tagAutocompleteClickOutside);
      this._tagAutocompleteClickOutside = null;
    }
  }

  _onRender(context, options) {
    super._onRender(context, options);
    
    const html = this.element;

    html.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter" && (ev.ctrlKey || ev.metaKey)) {
        ev.preventDefault();
        ev.stopPropagation();
        html.querySelector('button[data-action="saveDialog"]')?.click();
      }
    }, { capture: true });

    // Time input mode switch listener
    html.querySelectorAll('input[name="timeInputType"]').forEach(radio => {
      radio.addEventListener('change', (e) => {
        const isText = e.target.value === 'text';
        const calPane = html.querySelector('.cb-time-calendar-pane');
        const textPane = html.querySelector('.cb-time-text-pane');
        if (calPane) calPane.style.display = isText ? 'none' : 'block';
        if (textPane) textPane.style.display = isText ? 'block' : 'none';
      });
    });

    // Icon Picker handler for Pins
    html.querySelectorAll('.cb-icon-option').forEach(option => {
      option.addEventListener('click', () => {
        html.querySelectorAll('.cb-icon-option').forEach(o => o.classList.remove('active'));
        option.classList.add('active');
        const radio = option.querySelector('input[type="radio"]');
        if (radio) radio.checked = true;
      });
    });

    // --- Tags System ---
    const tagInput = html.querySelector('.cb-tag-input');
    const tagsWrapper = html.querySelector('.cb-tags-wrapper');
    const hiddenTagsInput = html.querySelector('input[name="tags"]');
    const autocompleteDropdown = html.querySelector('.cb-tags-autocomplete');

    let currentTags = Array.isArray(this.entry.tags) ? [...this.entry.tags] : [];
    if (hiddenTagsInput) hiddenTagsInput.value = currentTags.join(',');

    // Gather all existing tags from settings
    let availableTagsObj = context.globalTags || {};

    const renderTags = () => {
      // Remove all existing tag spans before input
      Array.from(tagsWrapper.children).forEach(c => {
        if (c.classList.contains('cb-tag')) c.remove();
      });
      
      currentTags.forEach(id => {
        const tag = availableTagsObj[id] || { id: id, name: id, color: '#333333', isSecret: false };
        if (tag) {
          const span = document.createElement('span');
          span.className = `cb-tag ${tag.isSecret ? 'cb-tag-secret' : ''}`;
          span.style.background = tag.color || '#7b61ff';
          span.dataset.tagId = tag.id;
          span.textContent = tag.name + ' ';
          const i = document.createElement('i');
          i.className = 'fas fa-times cb-tag-remove';
          span.appendChild(i);
          tagsWrapper.insertBefore(span, tagInput);
        }
      });
      hiddenTagsInput.value = currentTags.join(',');
    };

    const addTag = async (tagName) => {
      tagName = tagName.trim();
      if (!tagName) return;

      // Find if exists
      let tagId = Object.keys(availableTagsObj).find(id => availableTagsObj[id].name.toLowerCase() === tagName.toLowerCase());
      
      // If not, create a new tag in the workspace settings
      if (!tagId) {
        tagId = foundry.utils.randomID();
        const newTag = {
          id: tagId,
          name: tagName,
          color: '#7b61ff',
          isSecret: false
        };
        availableTagsObj[tagId] = newTag;
        
        await WorkspaceRepository.updatePaths(this.workspace, {
          [`flags.ClueBook.settings.tags.${tagId}`]: newTag
        });
      }

      if (!currentTags.includes(tagId)) {
        currentTags.push(tagId);
        renderTags();
      }
      tagInput.value = '';
      autocompleteDropdown.style.display = 'none';
    };

    if (tagInput && tagsWrapper) {
      tagInput.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter') {
          ev.preventDefault();
          ev.stopPropagation();
          addTag(tagInput.value);
        } else if (ev.key === 'Backspace' && tagInput.value === '' && currentTags.length > 0) {
          currentTags.pop();
          renderTags();
        }
      });

      tagInput.addEventListener('input', (ev) => {
        const val = tagInput.value.toLowerCase().trim();
        if (!val) {
          autocompleteDropdown.style.display = 'none';
          return;
        }

        const matches = Object.values(availableTagsObj).filter(t => t.name.toLowerCase().includes(val) && !currentTags.includes(t.id));
        if (matches.length > 0) {
          autocompleteDropdown.replaceChildren();
          for (const t of matches) {
            const div = document.createElement('div');
            div.className = 'cb-tag-autocomplete-item';
            div.dataset.id = t.id;
            div.style.cssText = 'padding: 5px 10px; cursor: pointer; color: #fff;';
            div.textContent = t.name;
            autocompleteDropdown.appendChild(div);
          }
          autocompleteDropdown.style.display = 'block';
        } else {
          autocompleteDropdown.style.display = 'none';
        }
      });

      // Remove tag click
      tagsWrapper.addEventListener('click', (ev) => {
        if (ev.target.classList.contains('cb-tag-remove')) {
          const tagId = ev.target.closest('.cb-tag').dataset.tagId;
          currentTags = currentTags.filter(id => id !== tagId);
          renderTags();
        }
      });

      autocompleteDropdown.addEventListener('click', (ev) => {
        const item = ev.target.closest('.cb-tag-autocomplete-item');
        if (item) {
          const tagId = item.dataset.id;
          if (!currentTags.includes(tagId)) {
            currentTags.push(tagId);
            renderTags();
          }
          tagInput.value = '';
          autocompleteDropdown.style.display = 'none';
        }
      });

      // Focus input when clicking wrapper
      tagsWrapper.addEventListener('click', (ev) => {
        if (ev.target === tagsWrapper) tagInput.focus();
      });
      
      if (!this._tagAutocompleteClickOutside) {
        this._tagAutocompleteClickOutside = (ev) => {
          if (this.element) {
             const tagInput = this.element.querySelector('.cb-tag-input');
             const autocompleteDropdown = this.element.querySelector('.cb-tags-autocomplete');
             if (autocompleteDropdown && tagInput) {
                 if (!autocompleteDropdown.contains(ev.target) && ev.target !== tagInput) {
                   autocompleteDropdown.style.display = 'none';
                 }
             }
          }
        };
        document.addEventListener('click', this._tagAutocompleteClickOutside);
      }
    }

    // Color Swatch Selection Visually
    const swatches = html.querySelectorAll('.color-swatch');
    const updateSwatches = () => {
      swatches.forEach(s => {
        const input = s.querySelector('input');
        if (input && input.checked) {
          s.style.boxShadow = '0 0 0 2px #fff, 0 0 0 4px var(--cb-accent)';
          s.style.transform = 'scale(1.15)';
        } else {
          s.style.boxShadow = 'none';
          s.style.transform = 'scale(1)';
        }
      });
    };
    swatches.forEach(s => s.addEventListener('change', updateSwatches));
    updateSwatches();

    // Custom Color Input Visual Sync
    const customColorInput = html.querySelector('input[name="customColorHex"]');
    if (customColorInput) {
      customColorInput.addEventListener('input', (e) => {
        const bg = html.querySelector('.custom-color-bg');
        if (bg) bg.style.background = e.target.value;
        const radio = html.querySelector('input[name="color"][value="custom"]');
        if (radio) {
          radio.checked = true;
          updateSwatches();
        }
      });
    }

    // Bind checkbox toggles
    const deadlineCheck = html.querySelector('[name="hasDeadline"]');
    if (deadlineCheck) {
      deadlineCheck.addEventListener('change', (e) => {
        html.querySelector('.deadline-fields').style.display = e.target.checked ? 'block' : 'none';
      });
    }

    // Toggle Completed Time fieldset when status changes to 'completed'
    const statusSelect = html.querySelector('select[name="status"]');
    const completedFieldset = html.querySelector('.cb-completed-time-fieldset');
    const completedCheck = html.querySelector('[name="hasCompletedTime"]');
    const completedInputGroup = html.querySelector('.cb-completed-time-input');

    if (statusSelect && completedFieldset) {
      statusSelect.addEventListener('change', (e) => {
        completedFieldset.style.display = e.target.value === 'completed' ? 'block' : 'none';
      });
    }

    if (completedCheck && completedInputGroup) {
      completedCheck.addEventListener('change', (e) => {
        completedInputGroup.style.display = e.target.checked ? 'block' : 'none';
      });
    }

    const endRadios = html.querySelectorAll('input[name="endMode"]');
    if (endRadios.length) {
      endRadios.forEach(r => {
        r.addEventListener('change', (e) => {
          const mode = e.target.value;
          html.querySelector('.end-time-fields').style.display = mode === 'time' ? 'block' : 'none';
          html.querySelector('.end-duration-fields').style.display = mode === 'duration' ? 'block' : 'none';
        });
      });
    }

    // Toggle Label Background Color Picker dynamically when style changes
    const labelBgStyleSelect = html.querySelector('select[name="bgStyle"]');
    const labelBgGroup = html.querySelector('.cb-label-bg-group');
    if (labelBgStyleSelect && labelBgGroup) {
      labelBgStyleSelect.addEventListener('change', (e) => {
        labelBgGroup.style.display = e.target.value === 'transparent' ? 'none' : 'flex';
      });
    }

    // Entity Dropzone for Scene/Actor linking
    const dropzone = html.querySelector('.cb-entity-dropzone');
    let dragCounter = 0;

    if (dropzone) {
      const checkVisibility = () => {
        if (!dropzone.querySelector('.cb-badge') && dragCounter <= 0) {
          dropzone.style.display = 'none';
        } else {
          dropzone.style.display = 'block';
        }
      };
      checkVisibility();

      html.addEventListener('dragenter', (ev) => {
        ev.preventDefault();
        dragCounter++;
        checkVisibility();
      });
      html.addEventListener('dragleave', (ev) => {
        dragCounter--;
        if (dragCounter < 0) dragCounter = 0;
        checkVisibility();
      });
      html.addEventListener('dragover', (ev) => ev.preventDefault());
      html.addEventListener('drop', (ev) => {
        dragCounter = 0;
        checkVisibility();
      });

      dropzone.addEventListener('dragenter', (ev) => {
        ev.preventDefault();
        dropzone.style.borderColor = 'rgba(76, 175, 80, 0.8)';
        dropzone.style.background = 'rgba(76, 175, 80, 0.1)';
      });
      dropzone.addEventListener('dragleave', (ev) => {
        dropzone.style.borderColor = 'rgba(255, 255, 255, 0.2)';
        dropzone.style.background = 'transparent';
      });
      dropzone.addEventListener('dragover', (ev) => ev.preventDefault());
      dropzone.addEventListener('drop', async (ev) => {
        dropzone.style.borderColor = 'rgba(255, 255, 255, 0.2)';
        dropzone.style.background = 'transparent';
        try {
          const data = JSON.parse(ev.dataTransfer.getData('text/plain'));
          if (data && data.uuid) {
            const isNPC = this.sourceTab === 'npc';
            const isLocation = this.sourceTab === 'locations' || this.sourceTab === 'notes';
            const badgesContainer = dropzone;
            const placeholder = dropzone.querySelector('.cb-drop-placeholder');

            if (isNPC) {
               if (data.type !== 'Actor') {
                 ui.notifications.error(game.i18n.localize("CLUEBOOK.EditDialog.DropActorError"));
                 return;
               }
               ev.preventDefault();
               let input = html.querySelector('input[name="actorUuid"]');
               if (input) { 
                 input.value = data.uuid;
                 let badge = badgesContainer ? badgesContainer.querySelector('.cb-badge-actor') : null;
                 const name = data.name || (await fromUuid(data.uuid))?.name || "Actor";
                 
                 if (placeholder) placeholder.style.display = 'none';
                 if (badgesContainer && !badge) {
                   badge = document.createElement('div');
                   badge.className = 'cb-badge cb-badge-actor';
                   badge.dataset.action = 'remove-link';
                   badge.dataset.type = 'actorUuid';
                   badge.title = game.i18n.localize("CLUEBOOK.Entry.RemoveLink");
                   badge.style.display = 'inline-flex';
                   badge.onclick = () => { input.value = ""; badge.remove(); if (placeholder) placeholder.style.display = 'inline'; };
                   badgesContainer.appendChild(badge);
                 }
                 if (badge) {
                   badge.replaceChildren();
                   const icon1 = document.createElement('i');
                   icon1.className = 'fas fa-user-ninja';
                   badge.appendChild(icon1);
                   badge.appendChild(document.createTextNode(' ' + name + ' '));
                   const icon2 = document.createElement('i');
                   icon2.className = 'fas fa-times';
                   badge.appendChild(icon2);
                 }
                 
                 ui.notifications.info(game.i18n.format("CLUEBOOK.EditDialog.DropActorSuccess", { name })); 
               }
            } else if (isLocation) {
               if (data.type !== 'Scene') {
                 ui.notifications.error(game.i18n.localize("CLUEBOOK.EditDialog.DropSceneError"));
                 return;
               }
               ev.preventDefault();
               let input = html.querySelector('input[name="sceneUuid"]');
               if (input) { 
                 input.value = data.uuid;
                 let badge = badgesContainer ? badgesContainer.querySelector('.cb-badge-scene') : null;
                 const name = data.name || (await fromUuid(data.uuid))?.name || "Scene";
                 
                 if (placeholder) placeholder.style.display = 'none';
                 if (badgesContainer && !badge) {
                   badge = document.createElement('div');
                   badge.className = 'cb-badge cb-badge-scene';
                   badge.dataset.action = 'remove-link';
                   badge.dataset.type = 'sceneUuid';
                   badge.title = game.i18n.localize("CLUEBOOK.Entry.RemoveLink");
                   badge.style.display = 'inline-flex';
                   badge.onclick = () => { input.value = ""; badge.remove(); if (placeholder) placeholder.style.display = 'inline'; };
                   badgesContainer.appendChild(badge);
                 }
                 if (badge) {
                   badge.replaceChildren();
                   const icon1 = document.createElement('i');
                   icon1.className = 'fas fa-map';
                   badge.appendChild(icon1);
                   badge.appendChild(document.createTextNode(' ' + name + ' '));
                   const icon2 = document.createElement('i');
                   icon2.className = 'fas fa-times';
                   badge.appendChild(icon2);
                 }
                 
                 ui.notifications.info(game.i18n.format("CLUEBOOK.EditDialog.DropSceneSuccess", { name })); 
               }
            }
          }
        } catch(e) {}
      });
    }

    // Tabs switching
    const tabHeaders = html.querySelectorAll('.cb-tab-header');
    tabHeaders.forEach(header => {
      header.addEventListener('click', (e) => {
        const targetTab = header.dataset.tab;
        html.querySelectorAll('.cb-tab-header').forEach(h => h.classList.remove('active'));
        html.querySelectorAll('.cb-tab-content').forEach(c => c.classList.remove('active'));
        header.classList.add('active');
        const content = html.querySelector(`.cb-tab-content[data-tab="${targetTab}"]`);
        if (content) content.classList.add('active');
      });
    });

    // Remove links via event delegation (works for both initial and newly dropped badges)
    html.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-action="remove-link"]');
      if (!btn) return;
      e.preventDefault();
      e.stopPropagation();
      const type = btn.dataset.type; // sceneUuid or actorUuid
      let input = html.querySelector(`input[name="${type}"]`);
      if (input) input.value = "";
      btn.remove(); // hide badge
      const placeholder = html.querySelector('.cb-drop-placeholder');
      if (placeholder) placeholder.style.display = 'inline';
      const dropzone = html.querySelector('.cb-entity-dropzone');
      if (dropzone) dropzone.style.display = 'flex';
    });

    // Initialize Mention Autocomplete
    this._mentionController = MentionAutocompleteController.attach(html, {
      getWorkspaceId: () => this.workspace,
      excludeEntryId: () => this.entryId,
      isShared: () => WorkspaceRepository.resolveTarget(this.workspace).isShared
    });

    // Auto-resize and UUID drag-drop for textareas
    html.querySelectorAll('textarea.cluebook-input').forEach(ta => {
      ta.addEventListener('drop', async (ev) => {
        let data = null;
        try {
          data = JSON.parse(ev.dataTransfer.getData('text/plain'));
        } catch (e) {
          return;
        }
        
        if (data && data.uuid) {
          ev.preventDefault();
          ev.stopPropagation();
          const doc = await fromUuid(data.uuid);
          if (!doc) return;
          
          const linkText = `@UUID[${data.uuid}]{${doc.name}}`;
          
          const start = ta.selectionStart;
          const end = ta.selectionEnd;
          const val = ta.value;
          
          ta.value = val.substring(0, start) + linkText + val.substring(end);
          ta.selectionStart = ta.selectionEnd = start + linkText.length;
          ta.focus();
        }
      });

      const autoResize = () => {
        ta.style.height = 'auto';
        ta.style.height = (ta.scrollHeight) + 'px';
      };
      ta.addEventListener('input', autoResize);
      setTimeout(autoResize, 10);
    });

    // FilePicker click handler
    html.querySelectorAll('.btn-file-picker').forEach(btn => {
      btn.addEventListener('click', (ev) => {
        ev.preventDefault();
        const targetInputName = ev.currentTarget.dataset.target || "img";
        const input = html.querySelector(`input[name="${targetInputName}"]`);
        const currentPath = input ? input.value : "";
        
        const FilePickerClass = foundry.applications?.apps?.FilePicker?.implementation ?? FilePicker;
        new FilePickerClass({
          type: "image",
          current: currentPath,
          callback: (path) => {
            if (input) {
              input.value = path;
              input.dispatchEvent(new Event('input', { bubbles: true }));
              input.dispatchEvent(new Event('change', { bubbles: true }));
            }
            this._updateImagePreview(html, path);
          }
        }).render(true);
      });
    });

    // Remove image button
    html.querySelectorAll('.btn-remove-image').forEach(btn => {
      btn.addEventListener('click', (ev) => {
        ev.preventDefault();
        const input = html.querySelector('input[name="img"]');
        if (input) {
          input.value = "";
          input.dispatchEvent(new Event('input', { bubbles: true }));
          input.dispatchEvent(new Event('change', { bubbles: true }));
        }
        this._updateImagePreview(html, "");
      });
    });

    const imgInput = html.querySelector('input[name="img"]');
    if (imgInput) {
      imgInput.addEventListener('input', () => {
        this._updateImagePreview(html, imgInput.value);
      });
    }

    const cropModeSelect = html.querySelector('select[name="cropMode"]');
    const cropZoomInput = html.querySelector('input[name="cropZoom"]');
    const cropOffsetYInput = html.querySelector('input[name="cropOffsetY"]');
    const cropAdvancedWrap = html.querySelector('.cb-crop-advanced-controls');

    const syncPreviewCrop = () => {
      const mode = cropModeSelect?.value || "contain";
      const isCover = mode === "cover";
      if (cropAdvancedWrap) {
        cropAdvancedWrap.style.display = isCover ? "flex" : "none";
      }

      const zoom = Math.min(300, Math.max(10, Number(cropZoomInput?.value) || 100));
      const offsetY = (cropOffsetYInput?.value !== undefined && cropOffsetYInput?.value !== "")
        ? Math.min(100, Math.max(0, Number(cropOffsetYInput.value)))
        : (this.sourceTab === "npc" ? 15 : 50);

      const zoomBadge = html.querySelector('.cb-crop-zoom-val');
      const offsetYBadge = html.querySelector('.cb-crop-offsety-val');
      if (zoomBadge) zoomBadge.textContent = `${zoom}%`;
      if (offsetYBadge) offsetYBadge.textContent = `${offsetY}%`;

      const previewImg = html.querySelector('.cb-img-preview');
      if (previewImg) {
        previewImg.style.width = "100%";
        previewImg.style.height = "100%";
        previewImg.style.objectFit = mode;
        if (isCover) {
          previewImg.style.objectPosition = `50% ${offsetY}%`;
          previewImg.style.transform = `scale(${(zoom / 100).toFixed(2)})`;
          previewImg.style.transformOrigin = `50% ${offsetY}%`;
        } else {
          previewImg.style.objectPosition = "center center";
          previewImg.style.transform = "";
          previewImg.style.transformOrigin = "";
        }
      }
    };

    cropModeSelect?.addEventListener('change', syncPreviewCrop);
    cropZoomInput?.addEventListener('input', syncPreviewCrop);
    cropOffsetYInput?.addEventListener('input', syncPreviewCrop);
    syncPreviewCrop();
  }

  _updateImagePreview(html, src) {
    const previewContainer = html.querySelector('.cb-img-preview-container');
    const previewImg = html.querySelector('.cb-img-preview');
    if (!previewContainer || !previewImg) return;

    const effectiveSrc = (src && src.trim() !== "") ? src.trim() : (previewImg.dataset.fallbackSrc || "");
    if (effectiveSrc) {
      previewImg.src = effectiveSrc;
      previewContainer.style.display = "flex";
    } else {
      previewImg.src = "";
      previewContainer.style.display = "none";
    }
  }

  static async _onSaveAction(event, target) {
    // Target is the button. The application form data can be found by querying inputs in this.element
    const html = this.element;
    const rawData = {};
    
    // Gather all inputs
    html.querySelectorAll('input, select, textarea').forEach(el => {
      if (el.name) {
        if (el.type === 'checkbox') {
          rawData[el.name] = el.checked;
        } else if (el.type === 'radio') {
          if (el.checked) rawData[el.name] = el.value;
        } else {
          rawData[el.name] = el.value;
        }
      }
    });

    const data = foundry.utils.expandObject(rawData);
    
    const instance = this;
    const updateData = {};
    if (data.color) {
      if (data.color === "custom" && data.customColorHex) {
        updateData.color = data.customColorHex;
      } else {
        updateData.color = data.color;
      }
    }
    if (data.textColor) {
      updateData.textColor = data.textColor;
    }
    if (data.gmNotes !== undefined) updateData.gmNotes = data.gmNotes;
    if (data.folderId !== undefined) updateData.folderId = data.folderId;
    
    // Process Tags
    if (data.tags !== undefined) {
      let savedTags = data.tags.split(',').map(s => s.trim()).filter(s => s);
      if (!game.user.isGM && Array.isArray(instance.entry?.tags)) {
        const rawSettings = WorkspaceRepository.getSettings(instance.workspace);
        const allTags = rawSettings?.tags || {};
        const preservedSecretTags = instance.entry.tags.filter(tId => allTags[tId]?.isSecret);
        for (const secId of preservedSecretTags) {
          if (!savedTags.includes(secId)) {
            savedTags.push(secId);
          }
        }
      }
      updateData.tags = savedTags;
    }

    const extractCrop = (targetObj) => {
      if (data.cropMode) targetObj.cropMode = data.cropMode;
      if (data.cropZoom !== undefined && data.cropZoom !== "") {
        targetObj.cropZoom = Math.min(300, Math.max(10, Number(data.cropZoom) || 100));
      }
      if (data.cropOffsetY !== undefined && data.cropOffsetY !== "") {
        targetObj.cropOffsetY = Math.min(100, Math.max(0, Math.round(Number(data.cropOffsetY))));
      }
      if (data.cropOffsetX !== undefined && data.cropOffsetX !== "") {
        targetObj.cropOffsetX = Math.min(100, Math.max(0, Math.round(Number(data.cropOffsetX))));
      }
    };

    if (instance.sourceTab === "notes") {
      updateData.name = data.name;
      updateData.text = data.text;
      updateData.sceneUuid = (!game.user.isGM && !data.sceneUuid) ? (instance.entry?.sceneUuid || "") : (data.sceneUuid || "");
    } else if (instance.sourceTab === "npc") {
      updateData.name = data.name;
      updateData.location = data.location;
      updateData.attitude = data.attitude;
      updateData.note = data.note;
      updateData.lifeStatus = data.lifeStatus;
      updateData.actorUuid = (!game.user.isGM && !data.actorUuid) ? (instance.entry?.actorUuid || "") : (data.actorUuid || "");
      if (data.img !== undefined) updateData.img = data.img ? data.img.trim() : "";
      extractCrop(updateData);
      // Backward compatibility
      updateData.isDead = data.lifeStatus === "dead";
    } else if (instance.sourceTab === "quests") {
      updateData.status = data.status;
      updateData.text = data.text;
      const isTextTime = data.timeInputType === "text";
      updateData.useTextTime = isTextTime;
      updateData.timeMode = (isTextTime ? data.textTimeMode : data.timeMode) || "by";
      updateData.completedTime = (data.status === "completed" && data.hasCompletedTime) ? (data.completedTime || "") : "";

      if (isTextTime) {
        updateData.deadline = data.deadline || "";
        updateData.deadlineTimestamp = null;
      } else {
        if (data.hasDeadline) {
          updateData.deadlineTimestamp = TimeService.dateToTimestamp({
            year: Number(data.deadline_year) || 0,
            month: Number(data.deadline_month) || 0,
            day: Math.max(0, (Number(data.deadline_day) || 1) - 1),
            hour: Number(data.deadline_hour) || 0,
            minute: Number(data.deadline_minute) || 0
          });
        } else {
          updateData.deadlineTimestamp = null;
        }
      }
    } else if (instance.sourceTab === "locations") {
      updateData.name = data.name;
      updateData.subtitle = data.subtitle;
      updateData.owner = data.owner;
      updateData.sceneUuid = (!game.user.isGM && !data.sceneUuid) ? (instance.entry?.sceneUuid || "") : (data.sceneUuid || "");
      updateData.note = data.note;
      if (data.img !== undefined) updateData.img = data.img ? data.img.trim() : "";
      extractCrop(updateData);
    } else if (instance.sourceTab === "gallery") {
      updateData.name = data.name;
      updateData.caption = data.caption || "";
      updateData.img = data.img ? data.img.trim() : "";
      updateData.frameStyle = data.frameStyle || "polaroid";
      extractCrop(updateData);
      updateData.text = data.text;
      if (instance.entry?.rotation !== undefined && instance.entry.rotation !== null) {
        updateData.rotation = instance.entry.rotation;
      } else if (instance.entry?.onBoard) {
        updateData.rotation = getRandomPhotoTilt();
      }
    } else if (instance.sourceTab === "labels") {
      updateData.name = data.name;
      updateData.textColor = data.textColor || "#ffffff";
      updateData.color = data.customColorHex || data.color || "#ffffff";
      updateData.fontSize = Number(data.fontSize) || 28;
      updateData.fontFamily = data.fontFamily || "caveat";
      updateData.bgStyle = data.bgStyle || "glass";
      updateData.isToc = Boolean(data.isToc);
    } else if (instance.sourceTab === "pins") {
      updateData.name = data.name;
      updateData.icon = data.icon || "fa-thumbtack";
      updateData.color = data.customColorHex || data.color || "#ff5252";
      updateData.bgStyle = data.bgStyle || "transparent";
      updateData.note = data.note;
    } else if (instance.sourceTab === "timeline") {
      updateData.event = data.event;
      
      const isTextTime = data.timeInputType === "text";
      updateData.useTextTime = isTextTime;

      if (isTextTime) {
        updateData.time = data.time || "";
        updateData.startTimestamp = null;
        updateData.endTimestamp = null;
      } else {
        updateData.startTimestamp = TimeService.dateToTimestamp({
          year: Number(data.start_year) || 0,
          month: Number(data.start_month) || 0,
          day: Math.max(0, (Number(data.start_day) || 1) - 1),
          hour: Number(data.start_hour) || 0,
          minute: Number(data.start_minute) || 0
        });

        if (data.endMode === "time") {
          updateData.endTimestamp = TimeService.dateToTimestamp({
            year: Number(data.end_year) || 0,
            month: Number(data.end_month) || 0,
            day: Math.max(0, (Number(data.end_day) || 1) - 1),
            hour: Number(data.end_hour) || 0,
            minute: Number(data.end_minute) || 0
          });
        } else if (data.endMode === "duration") {
          const durationSec = (Number(data.duration_days) || 0) * 86400 +
                              (Number(data.duration_hours) || 0) * 3600 +
                              (Number(data.duration_minutes) || 0) * 60;
          updateData.endTimestamp = updateData.startTimestamp + durationSec;
        } else {
          updateData.endTimestamp = null;
        }
      }
    }

    if (instance.onSave) {
      await instance.onSave(updateData);
    }
    
    const closeOnSave = target.dataset.close === "true";

    if (closeOnSave) {
      instance.close();
    } else {
      // Visual feedback
      const originalChildren = Array.from(target.childNodes);
      target.replaceChildren();
      const checkIcon = document.createElement('i');
      checkIcon.className = 'fas fa-check';
      target.appendChild(checkIcon);
      target.appendChild(document.createTextNode(' ' + game.i18n.localize("CLUEBOOK.EditDialog.Saved")));
      target.style.background = "#4caf50";
      target.style.borderColor = "#4caf50";
      setTimeout(() => {
        target.replaceChildren(...originalChildren);
        target.style.background = "rgba(255,255,255,0.1)";
        target.style.borderColor = "var(--cb-accent)";
      }, 1500);
    }
  }
}

