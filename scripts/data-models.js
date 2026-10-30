const { StringField, BooleanField, NumberField, HTMLField, ArrayField } = foundry.data.fields;

/**
 * Data Model for a single ClueBook entry (card).
 * This replaces raw objects and provides automatic validation and default values.
 */
export class ClueBookEntryModel extends foundry.abstract.DataModel {
  static defineSchema() {
    return {
      // Общие поля
      type: new StringField({ initial: "notes" }),
      color: new StringField({ initial: "yellow" }),
      textColor: new StringField({ initial: "dark" }),
      tags: new ArrayField(new StringField(), { initial: [] }),
      sort: new NumberField({ initial: 0 }),
      pinned: new BooleanField({ initial: false }),
      folderId: new StringField({ initial: "" }),
      
      // Поля для доски (Board)
      onBoard: new BooleanField({ initial: false }),
      boardX: new NumberField({ initial: 100 }),
      boardY: new NumberField({ initial: 100 }),
      boardW: new NumberField({ nullable: true, initial: null }),
      boardH: new NumberField({ nullable: true, initial: null }),

      // Скрытие и Видимость
      isHidden: new BooleanField({ initial: false }),
      visibleTo: new ArrayField(new StringField(), { initial: [] }),

      // Специфичные текстовые и HTML поля
      text: new HTMLField({ initial: "" }), // Для Заметок (notes) и Квестов (quests)
      name: new StringField({ initial: "" }), // Для NPC и Локаций
      location: new StringField({ initial: "" }), // Для NPC
      attitude: new StringField({ initial: "" }), // Для NPC
      note: new HTMLField({ initial: "" }), // Для NPC и Локаций
      actorUuid: new StringField({ initial: "" }), // Для NPC
      lifeStatus: new StringField({ initial: "" }), // Для NPC
      isDead: new BooleanField({ initial: false }), // Для NPC (совместимость)
      status: new StringField({ initial: "active" }), // Для Квестов (active, completed, failed)
      deadline: new StringField({ initial: "" }), // Для Квестов
      completedTime: new StringField({ initial: "" }), // Для Квестов (фактическое время выполнения)
      time: new StringField({ initial: "" }), // Для Событий (timeline)
      event: new HTMLField({ initial: "" }), // Для Событий
      subtitle: new HTMLField({ initial: "" }), // Для Локаций
      sceneUuid: new StringField({ initial: "" }), // Для Локаций (привязанная сцена)
      owner: new StringField({ initial: "" }), // Для Локаций (владелец/актер)
      gmNotes: new HTMLField({ initial: "" }), // Секретные заметки мастера (для всех типов)
      
      // Мультимедиа и изображения (Галерея, Портреты NPC и Локаций)
      img: new StringField({ initial: "" }),
      caption: new StringField({ initial: "" }),
      frameStyle: new StringField({ initial: "polaroid" }), // "polaroid" | "frameless" | "backdrop"
      cropMode: new StringField({ initial: "contain" }), // "contain" | "cover"
      cropPosition: new StringField({ initial: "center" }), // Legacy fallback: "top" | "center" | "bottom"
      cropZoom: new NumberField({ initial: 100, min: 10, max: 300 }), // Smooth scale in % for "cover" mode (10% to 300%)
      cropOffsetX: new NumberField({ nullable: true, initial: null, min: 0, max: 100 }), // Horizontal pan 0..100%
      cropOffsetY: new NumberField({ nullable: true, initial: null, min: 0, max: 100 }), // Vertical pan 0..100%
      rotation: new NumberField({ initial: 0 }), // Realistic tilt angle (-5.0 to +5.0 deg)

      // Надписи (Labels) и Пины (Pins) на доске
      fontSize: new NumberField({ initial: 28 }), // Font size in px
      fontFamily: new StringField({ initial: "caveat" }), // "caveat", "inter", "courier", "cinzel"
      bgStyle: new StringField({ initial: "glass" }), // "glass", "transparent", "solid"
      isToc: new BooleanField({ initial: false }), // Include Label in Board Table of Contents
      icon: new StringField({ initial: "fa-thumbtack" }), // "fa-thumbtack", "fa-map-marker-alt", "fa-skull", etc.

      // Специфичные поля для дат (Timeline & Quests)
      year: new NumberField({ nullable: true, initial: null }),
      month: new NumberField({ nullable: true, initial: null }),
      day: new NumberField({ nullable: true, initial: null }),
      hour: new NumberField({ nullable: true, initial: null }),
      minute: new NumberField({ nullable: true, initial: null }),
      timeMode: new StringField({ initial: "by" }), // "by" (к сроку) | "at" (в момент)
      useTextTime: new BooleanField({ initial: false }), // true = произвольный текст без таймера (deadline / time)
      startTimestamp: new NumberField({ nullable: true, initial: null }), // Начало события хронологии (в секундах)
      deadlineTimestamp: new NumberField({ nullable: true, initial: null }), // Дедлайн задачи (в секундах)
      endTimestamp: new NumberField({ nullable: true, initial: null }), // Конец диапазона времени (в секундах)
      isTracked: new BooleanField({ initial: false }) // Legacy-флаг трекера активных задач
    };
  }
}

/**
 * Data Model for a link between two entries on the board.
 */
export class ClueBookLinkModel extends foundry.abstract.DataModel {
  static defineSchema() {
    return {
      source: new StringField({ required: true, blank: false }),
      target: new StringField({ required: true, blank: false }),
      label: new StringField({ initial: "" }),
      style: new StringField({ initial: "solid" }), // solid, dashed, dotted
      color: new StringField({ initial: "" }) // Пустая строка означает использование цвета по умолчанию
    };
  }
}

/**
 * Data Model for a Folder / Section in ClueBook.
 */
export class ClueBookFolderModel extends foundry.abstract.DataModel {
  static defineSchema() {
    return {
      name: new StringField({ required: true, initial: "" }),
      tab: new StringField({ required: true, initial: "notes" }),
      color: new StringField({ initial: "purple" }),
      position: new StringField({ initial: "top" }), // "top" | "bottom"
      sort: new NumberField({ initial: 0 }),
      isCollapsed: new BooleanField({ initial: false }),
      isHidden: new BooleanField({ initial: false }),
      visibleTo: new ArrayField(new StringField(), { initial: [] })
    };
  }
}

export const ENTRY_TABS = Object.freeze(["notes", "npc", "locations", "quests", "timeline", "gallery", "labels", "pins"]);
export const NON_ENTRY_KEYS = new Set(["folders", "links", "board", "search"]);

export function isEntryTab(key) {
  return ENTRY_TABS.includes(key);
}

export const DELETE_MARKER = Object.freeze({ __cbDelete: true });

export function isDeletionValue(value) {
  if (!value || typeof value !== "object") return false;
  if (value.__cbDelete === true || value.__$OPERATOR$__ === "ForcedDeletion") return true;
  if (typeof foundry !== "undefined" && foundry.data?.operators?.ForcedDeletion) {
    return value instanceof foundry.data.operators.ForcedDeletion;
  }
  return false;
}

/**
 * Returns Foundry v14 ForcedDeletion operator instance, or a serializable DELETE_MARKER on v13.
 */
export function getForcedDeletion() {
  if (typeof foundry !== "undefined" && foundry.data?.operators?.ForcedDeletion) {
    return new foundry.data.operators.ForcedDeletion();
  }
  return DELETE_MARKER;
}

/**
 * Assigns a v13/v14-safe property deletion into an update dictionary.
 */
export function assignDeletion(updates, parentPath, key) {
  if (typeof foundry !== "undefined" && foundry.data?.operators?.ForcedDeletion) {
    updates[`${parentPath}.${key}`] = new foundry.data.operators.ForcedDeletion();
  } else {
    updates[`${parentPath}.-=${key}`] = null;
  }
}

const TRANSIENT_ENTRY_KEYS = [
  "id", "sourceTab", "tab", "isCustomColor", "action", "_deleted",
  "enriched", "resolvedTags", "explicitLinks", "backlinks", "cropStyle",
  "displayTitle", "displayTitleHTML", "snippet", "snippetHTML", "displayOwner",
  "displaySubtitle", "cardPortraitImg"
];

/**
 * Resolves normalized crop parameters (zoom, offsetX, offsetY) with backward-compatible fallback to cropPosition.
 * @param {Object} entry
 * @param {string} [sourceTab=""]
 * @returns {{ zoom: number, offsetX: number, offsetY: number, style: string }}
 */
export function resolveCropParams(entry, sourceTab = "") {
  const zoom = Math.min(300, Math.max(10, Number(entry?.cropZoom) || 100));
  const rawX = entry?.cropOffsetX;
  const offsetX = (rawX !== null && rawX !== undefined && rawX !== "" && !Number.isNaN(Number(rawX)))
    ? Math.min(100, Math.max(0, Math.round(Number(rawX))))
    : 50;

  const fallbackY = entry?.cropPosition === "top"
    ? 15
    : (entry?.cropPosition === "bottom" ? 85 : (sourceTab === "npc" ? 15 : 50));
  const rawY = entry?.cropOffsetY;
  const offsetY = (rawY !== null && rawY !== undefined && rawY !== "" && !Number.isNaN(Number(rawY)))
    ? Math.min(100, Math.max(0, Math.round(Number(rawY))))
    : fallbackY;

  const style = entry?.cropMode === "cover"
    ? `--cb-crop-x: ${offsetX}%; --cb-crop-y: ${offsetY}%; --cb-crop-scale: ${(zoom / 100).toFixed(2)};`
    : "";

  return { zoom, offsetX, offsetY, style };
}

/**
 * Sanitizes an entry object through ClueBookEntryModel for clean database storage.
 */
export function sanitizeEntryForStorage(tab, rawEntry) {
  const cleaned = foundry.utils.deepClone(rawEntry || {});
  for (const k of TRANSIENT_ENTRY_KEYS) {
    delete cleaned[k];
  }
  if (!cleaned.type) cleaned.type = tab;
  return new ClueBookEntryModel(cleaned).toObject();
}

// Internal state for balanced alternating photo tilts
let _tiltSign = Math.random() > 0.5 ? 1 : -1;
let _tiltStep = 0;
const TILT_POOL = [-3.2, 2.6, -1.8, 3.7, -2.7, 1.9, -3.8, 3.1, -1.5, 2.4, -3.5, 3.9];

/**
 * Generates a realistic subtle tilt between -4.0 and +4.0 degrees for gallery photos on the board.
 * Uses a balanced alternating algorithm to prevent clustering in the same direction.
 * @param {number|null} [index=null] Optional index for deterministic distribution across batch imports
 * @returns {number} Angle in degrees (-4.0 to +4.0)
 */
export function getRandomPhotoTilt(index = null) {
  if (typeof index === 'number') {
    const baseAngle = TILT_POOL[Math.abs(index) % TILT_POOL.length];
    const jitter = Number(((Math.random() * 0.6) - 0.3).toFixed(1));
    const angle = Number((baseAngle + jitter).toFixed(1));
    return Math.max(-4.0, Math.min(4.0, angle));
  }

  _tiltSign = -_tiltSign; // Always alternate between left and right tilt
  _tiltStep = (_tiltStep + 1) % 4;

  const magnitudes = [1.8, 3.4, 2.3, 3.8];
  const baseMag = magnitudes[_tiltStep];
  const jitter = Number(((Math.random() * 0.6) - 0.3).toFixed(1));
  const angle = Number((_tiltSign * (baseMag + jitter)).toFixed(1));
  
  return Math.max(-4.0, Math.min(4.0, angle));
}
