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
      time: new StringField({ initial: "" }), // Для Событий (timeline)
      event: new HTMLField({ initial: "" }), // Для Событий
      subtitle: new HTMLField({ initial: "" }), // Для Локаций
      sceneUuid: new StringField({ initial: "" }), // Для Локаций (привязанная сцена)
      owner: new StringField({ initial: "" }), // Для Локаций (владелец/актер)
      gmNotes: new HTMLField({ initial: "" }), // Секретные заметки мастера (для всех типов)
      
      // Мультимедиа и изображения (Галерея)
      img: new StringField({ initial: "" }),
      caption: new StringField({ initial: "" }),
      frameStyle: new StringField({ initial: "polaroid" }), // "polaroid" | "frameless"
      cropMode: new StringField({ initial: "contain" }), // "contain" | "cover"
      cropPosition: new StringField({ initial: "center" }), // "top" | "center" | "bottom"
      rotation: new NumberField({ initial: 0 }), // Realistic tilt angle (-5.0 to +5.0 deg)

      // Надписи (Labels) и Пины (Pins) на доске
      fontSize: new NumberField({ initial: 28 }), // Font size in px
      fontFamily: new StringField({ initial: "caveat" }), // "caveat", "inter", "courier", "cinzel"
      bgStyle: new StringField({ initial: "glass" }), // "glass", "transparent", "solid"
      icon: new StringField({ initial: "fa-thumbtack" }), // "fa-thumbtack", "fa-map-marker-alt", "fa-skull", etc.

      // Специфичные поля для дат (Timeline & Quests)
      year: new NumberField({ nullable: true, initial: null }),
      month: new NumberField({ nullable: true, initial: null }),
      day: new NumberField({ nullable: true, initial: null }),
      hour: new NumberField({ nullable: true, initial: null }),
      minute: new NumberField({ nullable: true, initial: null }),
      timeMode: new StringField({ initial: "by" }), // "by" (к сроку) | "duration" (длительность)
      deadlineTimestamp: new NumberField({ nullable: true, initial: null }), // Для календаря в миллисекундах / секундах
      endTimestamp: new NumberField({ nullable: true, initial: null }), // Для диапазона времени
      isTracked: new BooleanField({ initial: false }) // Для трекера активных задач
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
 * Returns Foundry v14 ForcedDeletion operator instance for database updates.
 */
export function getForcedDeletion() {
  if (typeof foundry !== "undefined" && foundry.data?.operators?.ForcedDeletion) {
    return new foundry.data.operators.ForcedDeletion();
  }
  return null;
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
