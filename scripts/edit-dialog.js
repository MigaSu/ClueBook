import { TimeService } from "./services/time-service.js";
import { ClueBookDatePicker } from "./date-picker.js";
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
    context.isMassEdit = this.options.isMassEdit;
    context.entriesCount = this.options.entriesCount;
    context.isSimpleCalendarActive = TimeService.isActive();
    context.isGM = game.user.isGM;

    if (context.entry.sceneUuid) {
      const scene = await fromUuid(context.entry.sceneUuid);
      if (scene) context.sceneName = scene.name;
    }
    if (context.entry.actorUuid) {
      const actor = await fromUuid(context.entry.actorUuid);
      if (actor) context.actorName = actor.name;
    }
    const PRESET_COLORS = ["yellow", "red", "green", "blue", "purple", "orange", "teal", "pink", "brown"];
    context.isCustomColor = context.entry.color && !PRESET_COLORS.includes(context.entry.color);

    const TE = foundry.applications?.ux?.TextEditor?.implementation ?? TextEditor;
    if (context.entry.text) context.enrichedText = await TE.enrichHTML(context.entry.text, { async: true });
    if (context.entry.note) context.enrichedNote = await TE.enrichHTML(context.entry.note, { async: true });
    if (context.entry.event) context.enrichedEvent = await TE.enrichHTML(context.entry.event, { async: true });

    // --- Tags System ---
    context.showTags = !(game.user.getFlag("ClueBook", "settings")?.features?.hideTags);
    
    let globalTags = {};
    if (this.workspace === "personal") {
      globalTags = game.user.getFlag("ClueBook", "settings")?.tags || {};
    } else {
      const journal = game.journal.get(this.workspace);
      if (journal) {
        globalTags = journal.getFlag("ClueBook", "settings")?.tags || {};
      }
    }
    context.globalTags = globalTags;
    
    if (Array.isArray(context.entry.tags)) {
      context.entry.resolvedTags = context.entry.tags.map(id => {
         return globalTags[id] || { id: id, name: id, color: '#333333', isSecret: false };
      });
    } else {
      context.entry.resolvedTags = [];
      context.entry.tags = [];
    }

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

      if (this.sourceTab === "quests") {
        const deadlineData = buildDateContext(this.entry.deadlineTimestamp, "deadline");
        context.deadlineDateHTML = await foundry.applications.handlebars.renderTemplate("modules/ClueBook/templates/date-fields.hbs", deadlineData);
      } else if (this.sourceTab === "timeline") {
        const startData = buildDateContext(this.entry.startTimestamp, "start");
        context.startDateHTML = await foundry.applications.handlebars.renderTemplate("modules/ClueBook/templates/date-fields.hbs", startData);

        const endData = buildDateContext(this.entry.endTimestamp, "end");
        context.endDateHTML = await foundry.applications.handlebars.renderTemplate("modules/ClueBook/templates/date-fields.hbs", endData);

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
          span.innerHTML = `${tag.name} <i class="fas fa-times cb-tag-remove"></i>`;
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
        
        // Save to workspace
        let currentSettings = {};
        if (this.workspace === "personal") {
          currentSettings = game.user.getFlag("ClueBook", "settings") || {};
          currentSettings.tags = currentSettings.tags || {};
          currentSettings.tags[tagId] = newTag;
          await game.user.setFlag("ClueBook", "settings", currentSettings);
        } else {
          const journal = game.journal.get(this.workspace);
          if (journal) {
            currentSettings = journal.getFlag("ClueBook", "settings") || {};
            currentSettings.tags = currentSettings.tags || {};
            currentSettings.tags[tagId] = newTag;
            await journal.setFlag("ClueBook", "settings", currentSettings);
          }
        }
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
          autocompleteDropdown.innerHTML = matches.map(t => `<div class="cb-tag-autocomplete-item" data-id="${t.id}" style="padding: 5px 10px; cursor: pointer; color: #fff;">${t.name}</div>`).join('');
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
                   badge.title = 'Remove link';
                   badge.style.display = 'inline-flex';
                   badge.onclick = () => { input.value = ""; badge.remove(); if (placeholder) placeholder.style.display = 'inline'; };
                   badgesContainer.appendChild(badge);
                 }
                 if (badge) badge.innerHTML = `<i class="fas fa-user-ninja"></i> ${name} <i class="fas fa-times"></i>`;
                 
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
                   badge.title = 'Remove link';
                   badge.style.display = 'inline-flex';
                   badge.onclick = () => { input.value = ""; badge.remove(); if (placeholder) placeholder.style.display = 'inline'; };
                   badgesContainer.appendChild(badge);
                 }
                 if (badge) badge.innerHTML = `<i class="fas fa-map"></i> ${name} <i class="fas fa-times"></i>`;
                 
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

    // Remove links
    const removeLinks = html.querySelectorAll('[data-action="remove-link"]');
    removeLinks.forEach(btn => {
      btn.addEventListener('click', (e) => {
        const type = btn.dataset.type; // sceneUuid or actorUuid
        let input = html.querySelector(`input[name="${type}"]`);
        if (input) input.value = "";
        btn.remove(); // hide badge
        const placeholder = html.querySelector('.cb-drop-placeholder');
        if (placeholder) placeholder.style.display = 'inline';
        const dropzone = html.querySelector('.cb-entity-dropzone');
        if (dropzone) dropzone.style.display = 'none';
      });
    });

    const textareas = html.querySelectorAll('textarea.cluebook-input, input[name="owner"], input[name="subtitle"], input[name="location"]');
    let autocompleteBox = null;
    let autocompleteIndex = 0;
    let currentMatches = [];

    const closeAutocomplete = () => {
      if (autocompleteBox) {
        autocompleteBox.remove();
        autocompleteBox = null;
      }
    };

    const insertSelected = () => {
      if (!currentMatches[autocompleteIndex]) return;
      const target = currentMatches[autocompleteIndex];
      const ta = document.activeElement;
      if (!ta || (ta.tagName !== 'TEXTAREA' && ta.tagName !== 'INPUT')) return;
      
      const val = ta.value;
      const cursor = ta.selectionStart;
      const textBeforeCursor = val.substring(0, cursor);
      const match = textBeforeCursor.match(/@([a-zA-Zа-яА-ЯёЁ0-9_ -]*)$/);
      
      if (match) {
        const replaceString = `[[qnmention:${target.id}:${target.name}]] `;
        ta.value = val.substring(0, match.index) + replaceString + val.substring(cursor);
        ta.selectionStart = ta.selectionEnd = match.index + replaceString.length;
      }
      closeAutocomplete();
    };

    const renderAutocompleteItems = () => {
      if (!autocompleteBox) return;
      autocompleteBox.innerHTML = '';
      currentMatches.forEach((match, idx) => {
        const item = document.createElement('div');
        item.style.cssText = `padding: 5px 8px; cursor: pointer; border-radius: 4px; font-size: 13px; display: flex; align-items: flex-start; gap: 8px; transition: background 0.1s; background: ${idx === autocompleteIndex ? 'var(--cb-accent)' : 'transparent'};`;
        item.innerHTML = `<i class="fas fa-file-alt" style="opacity:0.5; margin-top: 2px; flex-shrink: 0;"></i> <span style="white-space: normal; line-height: 1.2; word-wrap: break-word;">${match.name}</span>`;
        item.onmousedown = (e) => {
           e.preventDefault(); // prevent blur
           autocompleteIndex = idx;
           insertSelected();
        };
        autocompleteBox.appendChild(item);
      });
      
      const activeEl = autocompleteBox.children[autocompleteIndex];
      if (activeEl) activeEl.scrollIntoView({ block: 'nearest' });
    };

    const getCaretCoordinates = (element, position) => {
      const div = document.createElement('div');
      const style = window.getComputedStyle(element);
      for (const prop of style) {
        div.style[prop] = style[prop];
      }
      div.style.position = 'absolute';
      div.style.visibility = 'hidden';
      div.style.whiteSpace = 'pre-wrap';
      div.style.wordWrap = 'break-word';
      div.style.overflow = 'hidden';
      
      div.textContent = element.value.substring(0, position);
      
      const span = document.createElement('span');
      span.textContent = element.value.substring(position) || '.';
      div.appendChild(span);
      
      document.body.appendChild(div);
      const coordinates = {
        top: span.offsetTop - element.scrollTop,
        left: span.offsetLeft - element.scrollLeft,
        height: parseInt(style.lineHeight) || parseInt(style.fontSize) || 20
      };
      document.body.removeChild(div);
      return coordinates;
    };

    const showAutocomplete = (ta, query) => {
      const app = Array.from(foundry.applications.instances.values()).find(w => w.constructor.name === "ClueBookApp");
      if (!app) return;
      
      let dataObj = {};
      if (app.state.activeWorkspace === "personal") {
        dataObj = game.user.getFlag("ClueBook", "data") || {};
      } else {
        const journal = game.journal.get(app.state.activeWorkspace);
        if (journal) dataObj = journal.getFlag("ClueBook", "data") || {};
      }
      
      const entries = [];
      for (const [tab, tabData] of Object.entries(dataObj)) {
        if (tab === 'links') continue;
        for (const [id, entry] of Object.entries(tabData)) {
          let name = entry.name;
          if (!name && entry.text) {
             const div = document.createElement('div');
             div.innerHTML = entry.text;
             name = div.textContent.substring(0, 30).trim() || game.i18n.localize("CLUEBOOK.EntryDetails.Untitled");
          }
          if (!name) name = entry.event || game.i18n.localize("CLUEBOOK.EntryDetails.DefaultEntry");
          
          if (id !== this.entryId && name.toLowerCase().includes(query)) {
            entries.push({ id, name, tab });
          }
        }
      }
      
      currentMatches = entries.slice(0, 10);
      if (currentMatches.length === 0) {
        closeAutocomplete();
        return;
      }
      
      if (!autocompleteBox) {
        autocompleteBox = document.createElement('div');
        autocompleteBox.style.cssText = "position: fixed; background: rgba(20,20,30,0.95); border: 1px solid var(--cb-accent); border-radius: 6px; box-shadow: 0 4px 15px rgba(0,0,0,0.5); z-index: 1000000; width: max-content; min-width: 250px; max-width: 400px; max-height: 200px; overflow-y: auto; padding: 5px; color: white; display: flex; flex-direction: column; gap: 2px;";
        document.body.appendChild(autocompleteBox);
      }
      
      const rect = ta.getBoundingClientRect();
      const caret = getCaretCoordinates(ta, ta.selectionStart);
      
      autocompleteBox.style.top = (rect.top + caret.top + caret.height + 5) + "px";
      autocompleteBox.style.left = (rect.left + caret.left) + "px";
      
      autocompleteIndex = 0;
      renderAutocompleteItems();
    };

    textareas.forEach(ta => {
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

      ta.addEventListener('input', (ev) => {
        const val = ta.value;
        const cursor = ta.selectionStart;
        const textBeforeCursor = val.substring(0, cursor);
        const match = textBeforeCursor.match(/@([a-zA-Zа-яА-ЯёЁ0-9_ -]*)$/);
        
        if (match) {
          const query = match[1].toLowerCase();
          showAutocomplete(ta, query);
        } else {
          closeAutocomplete();
        }
      });
      
      ta.addEventListener('keydown', (ev) => {
        if (autocompleteBox) {
          if (ev.key === 'ArrowDown') {
            ev.preventDefault();
            autocompleteIndex = (autocompleteIndex + 1) % currentMatches.length;
            renderAutocompleteItems();
            return;
          } else if (ev.key === 'ArrowUp') {
            ev.preventDefault();
            autocompleteIndex = (autocompleteIndex - 1 + currentMatches.length) % currentMatches.length;
            renderAutocompleteItems();
            return;
          } else if (ev.key === 'Enter') {
            ev.preventDefault();
            ev.stopPropagation();
            insertSelected();
            return;
          } else if (ev.key === 'Escape') {
            ev.preventDefault();
            closeAutocomplete();
            return;
          }
        }
      });
      
      ta.addEventListener('blur', () => {
        setTimeout(closeAutocomplete, 150);
      });

      // Auto-resize logic
      if (ta.tagName === 'TEXTAREA') {
        const autoResize = () => {
          ta.style.height = 'auto';
          ta.style.height = (ta.scrollHeight) + 'px';
        };
        ta.addEventListener('input', autoResize);
        setTimeout(autoResize, 10); // Initial resize
      }
    });
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
    
    // Process Tags
    if (data.tags !== undefined) {
      updateData.tags = data.tags.split(',').map(s => s.trim()).filter(s => s);
    }

    if (instance.sourceTab === "notes") {
      updateData.name = data.name;
      updateData.text = data.text;
      updateData.sceneUuid = data.sceneUuid;
    } else if (instance.sourceTab === "npc") {
      updateData.name = data.name;
      updateData.location = data.location;
      updateData.attitude = data.attitude;
      updateData.note = data.note;
      updateData.lifeStatus = data.lifeStatus;
      updateData.actorUuid = data.actorUuid;
      // Backward compatibility
      updateData.isDead = data.lifeStatus === "dead";
    } else if (instance.sourceTab === "quests") {
      updateData.status = data.status;
      updateData.text = data.text;
      updateData.timeMode = data.timeMode || "by";
      
      if (TimeService.isActive()) {
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
      } else {
        updateData.deadline = data.deadline;
      }
    } else if (instance.sourceTab === "locations") {
      updateData.name = data.name;
      updateData.subtitle = data.subtitle;
      updateData.owner = data.owner;
      updateData.sceneUuid = data.sceneUuid;
      updateData.note = data.note;
    } else if (instance.sourceTab === "timeline") {
      updateData.event = data.event;
      
      if (TimeService.isActive()) {
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
      } else {
        updateData.time = data.time;
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
      const originalText = target.innerHTML;
      target.innerHTML = `<i class="fas fa-check"></i> ${game.i18n.localize("CLUEBOOK.EditDialog.Saved")}`;
      target.style.background = "#4caf50";
      target.style.borderColor = "#4caf50";
      setTimeout(() => {
        target.innerHTML = originalText;
        target.style.background = "rgba(255,255,255,0.1)";
        target.style.borderColor = "var(--cb-accent)";
      }, 1500);
    }
  }
}

