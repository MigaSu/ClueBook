/**
 * ClueBook Universal Text Enrichment and Mention Parsing Service.
 * Centralizes all [[qnmention:...]] parsing, HTML stripping, link formatting,
 * and snippet generation across the entire module.
 */
export class TextEnrichmentService {

  /**
   * Matches [[qnmention:ID:Name]] or [[qnmention:ID:Name]]{CustomText}
   */
  static MENTION_REGEX = /\[\[qnmention:([^:]+):([^\]]+)\]\](?:\{([^}]*)\})?/g;

  static BARE_UUID_REGEX = /(?<!@UUID\[)(?<!\.)\b(?:Actor|Item|JournalEntry|JournalEntryPage|Scene|RollTable|Cards|Macro|Playlist|User)(?:\.[a-zA-Z0-9_-]+)+\b/g;
  static COMPENDIUM_UUID_REGEX = /(?<!@UUID\[)(?<!\.)\bCompendium\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+(?:\.[a-zA-Z0-9_-]+)+\b/g;

  /**
   * Wraps bare UUIDs and Compendium links into @UUID[...] syntax.
   * @param {string} text 
   * @returns {string}
   */
  static wrapBareUUIDs(text) {
    if (!text || typeof text !== "string") return text;
    let res = text.replace(this.BARE_UUID_REGEX, match => `@UUID[${match}]`);
    res = res.replace(this.COMPENDIUM_UUID_REGEX, match => `@UUID[${match}]`);
    return res;
  }

  /**
   * Creates a standardized mention string.
   * @param {string} id 
   * @param {string} name 
   * @param {string} [customText=""] 
   * @returns {string}
   */
  static createMention(id, name, customText = "") {
    if (!id || !name) return "";
    return `[[qnmention:${id}:${name}]]${customText ? `{${customText}}` : ""}`;
  }

  /**
   * Converts all [[qnmention:...]] in a string to clickable HTML links.
   * @param {string} text 
   * @returns {string}
   */
  static enrichMentionsToHTML(text) {
    if (!text) return "";
    return String(text).replace(
      this.MENTION_REGEX,
      (match, id, name, customText) => {
        const displayText = (customText && customText.trim()) || name || "";
        const titleHint = game.i18n ? game.i18n.format("CLUEBOOK.App.GoToEntry", { name: name }) : name;
        return `<a class="content-link cb-mention-link" data-mention-id="${id}" title="${titleHint}"><i class="fas fa-link" style="font-size: 9px; opacity: 0.7;"></i>${displayText}</a>`;
      }
    );
  }

  /**
   * Strips all rich tags, mentions, HTML tags, and secrets down to plain clean text.
   * @param {string} str 
   * @returns {string}
   */
  static stripToPlainText(str) {
    if (!str) return "";
    let res = String(str);

    // Remove secret blocks
    res = res.replace(/<section\s+class="secret"[^>]*>[\s\S]*?<\/section>/gi, ' ');
    res = res.replace(/\[\[\/gm\s+[\s\S]*?\]\]/gi, ' ');

    // Convert mentions to plain text (using custom text if present, or target name)
    res = res.replace(this.MENTION_REGEX, (m, id, name, customText) => (customText && customText.trim()) || name || "");

    // Convert Foundry document links: @UUID[...]{Label} or @Actor[...]{Label}
    res = res.replace(/@\w+\[[^\]]*\](?:\{([^}]*)\})?/g, (m, label) => (label && label.trim()) || "");

    // Strip HTML tags
    res = res.replace(/<[^>]*>?/gm, ' ');

    // Clean HTML entities
    res = res.replace(/&nbsp;/g, ' ')
             .replace(/&amp;/g, '&')
             .replace(/&lt;/g, '<')
             .replace(/&gt;/g, '>')
             .replace(/&quot;/g, '"')
             .replace(/&#39;/g, "'");

    // Normalize extra whitespace
    res = res.replace(/\s+/g, ' ').trim();
    return res;
  }

  /**
   * Extracts clean HTML title and snippet with working mention links for lists and table rows.
   * @param {string} name 
   * @param {string} noteText 
   * @param {number} [maxTitleLen=80] 
   * @param {number} [maxSnippetLen=140] 
   * @returns {{ displayTitleHTML: string, snippetHTML: string, plainTitle: string, plainSnippet: string }}
   */
  static extractDisplayAndSnippet(name, noteText, maxTitleLen = 80, maxSnippetLen = 140) {
    const rawName = String(name || "").trim();
    const rawNote = String(noteText || "").trim();

    let titleRaw = rawName;
    let snippetRaw = "";

    if (!titleRaw && rawNote) {
      // Find the first sentence without splitting inside mentions
      // Split on first period, question mark, exclamation, or newline outside of [[...]]
      let splitIdx = -1;
      let insideMention = false;
      for (let i = 0; i < rawNote.length; i++) {
        if (rawNote.startsWith('[[', i)) insideMention = true;
        if (rawNote.startsWith(']]', i)) insideMention = false;
        if (!insideMention && (rawNote[i] === '\n' || (['.', '!', '?'].includes(rawNote[i]) && (i === rawNote.length - 1 || /\s/.test(rawNote[i + 1]))))) {
          splitIdx = i + 1;
          break;
        }
      }

      if (splitIdx !== -1) {
        titleRaw = rawNote.substring(0, splitIdx).trim();
        snippetRaw = rawNote.substring(splitIdx).replace(/^[\n.!?\s]+/, '').trim();
      } else {
        titleRaw = rawNote;
        snippetRaw = "";
      }
    } else if (rawNote) {
      snippetRaw = rawNote;
    }

    const plainTitle = this.stripToPlainText(titleRaw);
    const plainSnippet = this.stripToPlainText(snippetRaw);

    const defaultTitle = game.i18n ? game.i18n.localize("CLUEBOOK.Entry.Untitled") : "(Untitled)";
    
    // Enrich mentions in both title and snippet
    let displayTitleHTML = titleRaw ? this.enrichMentionsToHTML(titleRaw) : defaultTitle;
    let snippetHTML = snippetRaw ? this.enrichMentionsToHTML(snippetRaw) : "";

    return {
      displayTitleHTML,
      snippetHTML,
      plainTitle: plainTitle || defaultTitle,
      plainSnippet
    };
  }

  /**
   * Remaps old IDs to new IDs in mention tags (used for duplicates, workspace migrations, exports).
   * @param {string} text 
   * @param {Record<string, string>} idMap 
   * @returns {string}
   */
  static remapMentionIds(text, idMap) {
    if (!text || typeof text !== "string") return text;
    return text.replace(this.MENTION_REGEX, (match, oldId, name, customText) => {
      const newId = idMap[oldId] || oldId;
      const suffix = customText !== undefined ? `{${customText}}` : "";
      return `[[qnmention:${newId}:${name}]]${suffix}`;
    });
  }

  /**
   * Binds click events to all .cb-mention-link elements inside a container.
   * @param {HTMLElement} container 
   * @param {Function} [onJump] Custom jump callback(targetId, event)
   */
  static bindMentionClicks(container, onJump) {
    if (!container) return;
    container.querySelectorAll('.cb-mention-link').forEach(link => {
      link.addEventListener('click', async (ev) => {
        ev.preventDefault();
        ev.stopPropagation();

        const targetId = link.dataset.mentionId;
        if (!targetId) return;

        if (typeof onJump === 'function') {
          onJump(targetId, ev);
          return;
        }

        // Default behavior: search within current window or open via ClueBook API
        const appWindow = link.closest('.cluebook-window');
        const targetCard = appWindow?.querySelector(`.cluebook-entry[data-entry-id="${targetId}"]`);
        if (targetCard) {
          targetCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
          targetCard.classList.add('is-highlighted');
          setTimeout(() => targetCard.classList.remove('is-highlighted'), 2000);
          return;
        }

        const api = game.modules.get("ClueBook")?.api;
        if (api) {
          await api.openApp({ focusId: targetId });
        }
      });
    });
  }
}
