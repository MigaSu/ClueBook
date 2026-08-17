/**
 * ClueBook Universal UI & Interaction Service.
 * Centralizes floating dropdown menus, color conversions, and common UI helpers.
 */
export class UIService {

  /**
   * Available card color presets across ClueBook.
   */
  static PRESET_COLORS = [
    "yellow",
    "red",
    "green",
    "blue",
    "purple",
    "orange",
    "teal",
    "pink",
    "brown"
  ];

  /**
   * Parses hex color into RGB object.
   * @param {string} hex 
   * @returns {{ r: number, g: number, b: number }}
   */
  static hexToRgb(hex) {
    if (!hex) return { r: 123, g: 97, b: 255 };
    const cleaned = hex.replace("#", "");
    const r = parseInt(cleaned.substring(0, 2), 16);
    const g = parseInt(cleaned.substring(2, 4), 16);
    const b = parseInt(cleaned.substring(4, 6), 16);
    return {
      r: isNaN(r) ? 123 : r,
      g: isNaN(g) ? 97 : g,
      b: isNaN(b) ? 255 : b
    };
  }

  /**
   * Converts a hex color into rgba string.
   * @param {string} hex 
   * @param {number} alpha 
   * @returns {string}
   */
  static hexToRgba(hex, alpha = 1) {
    const { r, g, b } = this.hexToRgb(hex);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  /**
   * Shows a floating dropdown menu anchored to a target element.
   * Handles positioning, boundary detection, active item styling, and outside click cleanup.
   * 
   * @param {Object} options
   * @param {HTMLElement} options.target - Anchor button or element
   * @param {Array<{ id: string, label: string, icon?: string, iconText?: string, active?: boolean }>} options.items
   * @param {string} [options.currentId] - Currently selected item ID
   * @param {Function} options.onSelect - Callback(item, event) when an option is clicked
   * @param {string} [options.className] - Additional class name
   * @param {number} [options.minWidth=150] - Minimum width in px
   * @returns {HTMLElement} The created menu element
   */
  static showFloatingMenu({ target, items, currentId, onSelect, className = "", minWidth = 150 }) {
    if (!target) return null;

    // Remove any existing floating menus
    const existing = document.querySelector('.cb-quest-floating-menu');
    if (existing) {
      const wasSame = existing.dataset.anchorTarget === target.dataset.action || existing.dataset.anchorId === (target.dataset.entryId || target.dataset.tab);
      existing.remove();
      if (wasSame && existing.dataset.anchorTarget) return null; // Toggle closed
    }

    const menu = document.createElement('div');
    menu.className = `cb-quest-floating-menu ${className}`.trim();
    menu.dataset.anchorTarget = target.dataset.action || "";
    menu.dataset.anchorId = target.dataset.entryId || target.dataset.tab || "";

    const list = document.createElement('div');
    list.className = 'cb-quest-status-list';

    items.forEach(item => {
      const opt = document.createElement('div');
      const isSelected = item.active !== undefined ? item.active : item.id === currentId;
      opt.className = `cb-quest-status-option ${isSelected ? 'active' : ''}`.trim();
      opt.dataset.id = item.id;

      let iconHtml = '';
      if (item.iconText) {
        iconHtml = `<span style="font-size: 14px; margin-right: 6px;">${item.iconText}</span>`;
      } else if (item.icon) {
        iconHtml = `<i class="${item.icon.startsWith('fa') ? item.icon : 'fas ' + item.icon}"></i>`;
      }

      opt.innerHTML = `
        ${iconHtml}
        <span class="cb-status-label">${item.label}</span>
        ${isSelected ? '<i class="fas fa-check cb-status-check"></i>' : ''}
      `;

      opt.addEventListener('click', (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        menu.remove();
        if (typeof onSelect === 'function') {
          onSelect(item, ev);
        }
      });

      list.appendChild(opt);
    });

    menu.appendChild(list);
    document.body.appendChild(menu);

    // Position menu relative to target with boundary clamping
    const rect = target.getBoundingClientRect();
    let left = rect.left;
    let top = rect.bottom + 4;
    const menuWidth = Math.max(rect.width, minWidth);

    if (left + menuWidth > window.innerWidth - 10) {
      left = Math.max(10, window.innerWidth - menuWidth - 10);
    }
    if (top + 200 > window.innerHeight - 10) {
      top = Math.max(10, rect.top - 200);
    }

    menu.style.position = 'fixed';
    menu.style.left = `${left}px`;
    menu.style.top = `${top}px`;
    menu.style.minWidth = `${menuWidth}px`;
    menu.style.zIndex = '99999';

    // Auto-close on click outside or contextmenu
    const closeListener = (ev) => {
      if (!menu.contains(ev.target) && !target.contains(ev.target)) {
        menu.remove();
        document.removeEventListener('click', closeListener);
        document.removeEventListener('contextmenu', closeListener);
      }
    };
    setTimeout(() => {
      document.addEventListener('click', closeListener);
      document.addEventListener('contextmenu', closeListener);
    }, 10);

    return menu;
  }
}
