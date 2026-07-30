const { StringField, BooleanField, NumberField, HTMLField, ArrayField } = foundry.data.fields;

/**
 * Data Model for a single ClueBook entry (card).
 * This replaces raw objects and provides automatic validation and default values.
 */
export class ClueBookEntryModel extends foundry.abstract.DataModel {
  static defineSchema() {
    return {
      // РћР±С‰РёРµ РїРѕР»СЏ
      type: new StringField({ initial: "notes" }),
      color: new StringField({ initial: "yellow" }),
      textColor: new StringField({ initial: "dark" }),
      tags: new ArrayField(new StringField(), { initial: [] }),
      sort: new NumberField({ initial: 0 }),
      pinned: new BooleanField({ initial: false }),
      
      // РџРѕР»СЏ РґР»СЏ РґРѕСЃРєРё (Board)
      onBoard: new BooleanField({ initial: false }),
      boardX: new NumberField({ initial: 100 }),
      boardY: new NumberField({ initial: 100 }),
      boardW: new NumberField({ nullable: true, initial: null }),
      boardH: new NumberField({ nullable: true, initial: null }),

      // Скрытие
      isHidden: new BooleanField({ initial: false }),

      // РЎРїРµС†РёС„РёС‡РЅС‹Рµ С‚РµРєСЃС‚РѕРІС‹Рµ Рё HTML РїРѕР»СЏ
      text: new HTMLField({ initial: "" }), // Р”Р»СЏ Р—Р°РјРµС‚РѕРє (notes) Рё РљРІРµСЃС‚РѕРІ (quests)
      name: new StringField({ initial: "" }), // Р”Р»СЏ NPC Рё Р›РѕРєР°С†РёР№
      location: new StringField({ initial: "" }), // Для NPC
      attitude: new StringField({ initial: "" }), // Для NPC
      note: new HTMLField({ initial: "" }), // Для NPC и Локаций
      actorUuid: new StringField({ initial: "" }), // Для NPC
      lifeStatus: new StringField({ initial: "" }), // Для NPC
      isDead: new BooleanField({ initial: false }), // Для NPC (совместимость)
      status: new StringField({ initial: "active" }), // Р”Р»СЏ РљРІРµСЃС‚РѕРІ (active, completed, failed)
      deadline: new StringField({ initial: "" }), // Р”Р»СЏ РљРІРµСЃС‚РѕРІ
      time: new StringField({ initial: "" }), // Р”Р»СЏ РЎРѕР±С‹С‚РёР№ (timeline)
      event: new HTMLField({ initial: "" }), // Р”Р»СЏ РЎРѕР±С‹С‚РёР№
      subtitle: new HTMLField({ initial: "" }), // Р”Р»СЏ Р›РѕРєР°С†РёР№
      sceneUuid: new StringField({ initial: "" }), // Р”Р»СЏ Р›РѕРєР°С†РёР№ (РїСЂРёРІСЏР·Р°РЅРЅР°СЏ СЃС†РµРЅР°)
      owner: new StringField({ initial: "" }), // Р”Р»СЏ Р›РѕРєР°С†РёР№ (РІР»Р°РґРµР»РµС†/Р°РєС‚РµСЂ)
      gmNotes: new HTMLField({ initial: "" }), // РЎРµРєСЂРµС‚РЅС‹Рµ Р·Р°РјРµС‚РєРё РјР°СЃС‚РµСЂР° (РґР»СЏ РІСЃРµС… С‚РёРїРѕРІ)
      
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
      color: new StringField({ initial: "" }) // РџСѓСЃС‚Р°СЏ СЃС‚СЂРѕРєР° РѕР·РЅР°С‡Р°РµС‚ РёСЃРїРѕР»СЊР·РѕРІР°РЅРёРµ С†РІРµС‚Р° РїРѕ СѓРјРѕР»С‡Р°РЅРёСЋ
    };
  }
}

