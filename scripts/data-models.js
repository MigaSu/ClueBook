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
      
      // Специфичные поля для дат (Timeline & Quests)
      deadlineTimestamp: new NumberField({ nullable: true, initial: null }),
      startTimestamp: new NumberField({ nullable: true, initial: null }),
      endTimestamp: new NumberField({ nullable: true, initial: null }),
      timeMode: new StringField({ initial: "by" }), // Для Квестов (by, at)
      endMode: new StringField({ initial: "none" }), // Для Событий (none, time, duration)
      duration: new foundry.data.fields.SchemaField({
        days: new NumberField({ initial: 0 }),
        hours: new NumberField({ initial: 0 }),
        minutes: new NumberField({ initial: 0 })
      })
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

