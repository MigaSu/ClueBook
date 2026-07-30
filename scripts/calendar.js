const WEATHER_PRESETS = {
  "clear":  { nameKey: "CLUEBOOK.Weather.Clear",    icon: "fa-sun" },
  "cloudy": { nameKey: "CLUEBOOK.Weather.Cloudy", icon: "fa-cloud" },
  "rain":   { nameKey: "CLUEBOOK.Weather.Rain",   icon: "fa-cloud-rain" },
  "storm":  { nameKey: "CLUEBOOK.Weather.Storm",   icon: "fa-bolt" },
  "fog":    { nameKey: "CLUEBOOK.Weather.Fog",   icon: "fa-smog" },
  "snow":   { nameKey: "CLUEBOOK.Weather.Snow",    icon: "fa-snowflake" }
};

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class CalendarWidget extends HandlebarsApplicationMixin(ApplicationV2) {

  static DEFAULT_OPTIONS = {
    id: "cb-calendar-widget",
    classes: ["cb-calendar-widget"],
    tag: "div",
    window: {
      frame: false,
      positioned: true
    },
    position: {
      width: "auto",
      height: "auto"
    },
    actions: {
      edit: CalendarWidget.#onEdit,
      adjustTime: CalendarWidget.#onAdjustTime,
      openSimpleCalendar: CalendarWidget.#onOpenSimpleCalendar
    }
  };

  static PARTS = {
    widget: {
      template: "modules/ClueBook/templates/calendar-widget.hbs"
    }
  };

  // РІвЂќР‚РІвЂќР‚РІвЂќР‚ Helpers РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚

  /** Read current date+time from Simple Calendar if present, returns { date, time } */
  static #getScDateTime() {
    try {
      const api = window.SimpleCalendar?.api;
      if (!api) return null;

      // timestampToDate returns an object with numeric fields
      const d = api.timestampToDate(game.time.worldTime);
      if (!d) return null;

      // Build HH:MM time string from numeric fields
      const h  = String(d.hour   ?? 0).padStart(2, "0");
      const m  = String(d.minute ?? 0).padStart(2, "0");
      const timeStr = `${h}:${m}`;

      // Build date string. Prefer display.date if it exists.
      const dateStr = d.display?.date
        ?? `${d.day} ${d.monthName ?? d.month}, ${d.year}`;

      const weekdayStr = d.weekday || d.display?.weekday || "";

      return { date: dateStr, time: timeStr, weekday: weekdayStr };
    } catch (err) {
      console.error("ClueBook | SimpleCalendar read error:", err);
      return null;
    }
  }

  static #getWeather() {
    const saved = game.settings.get("ClueBook", "calendarData") || {};
    return {
      weatherId:   saved.weatherId   ?? "fog",
      temperature: saved.temperature ?? 13
    };
  }

  // РІвЂќР‚РІвЂќР‚РІвЂќР‚ ApplicationV2 lifecycle РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚

  async _prepareContext(options) {
    const scActive  = !!(window.SimpleCalendar?.api);
    const scData    = scActive ? CalendarWidget.#getScDateTime() : null;
    const saved     = game.settings.get("ClueBook", "calendarData") || {};

    const date = scData?.date ?? saved.date ?? game.i18n.localize("CLUEBOOK.Weather.DefaultDate");
    const time = scData?.time ?? saved.time ?? "18:30";
    const weekday = scData?.weekday ?? saved.weekday ?? game.i18n.localize("CLUEBOOK.Weather.DefaultWeekday");

    // Weather always comes from in-memory store
    const wx = CalendarWidget.#getWeather();
    const preset = WEATHER_PRESETS[wx.weatherId] ?? WEATHER_PRESETS["fog"];

    const pos = game.user.getFlag("ClueBook", "calendarWidgetPos")
      ?? { left: Math.round(window.innerWidth / 2 - 150), top: 20 };

    this.position.left = pos.left;
    this.position.top  = pos.top;

    return {
      isGM:                  game.user.isGM,
      isSimpleCalendarActive: scActive,
      date,
      time,
      weekday,
      temperature:  wx.temperature,
      weatherName:  game.i18n.localize(preset.nameKey),
      weatherIcon:  preset.icon
    };
  }

  _onRender(context, options) {
    super._onRender(context, options);

    const widget = this.element;
    if (!widget) return;

    const pos = game.user.getFlag("ClueBook", "calendarWidgetPos")
      ?? { left: Math.round(window.innerWidth / 2 - 150), top: 20 };
    widget.style.left = `${pos.left}px`;
    widget.style.top  = `${pos.top}px`;

    // РІвЂќР‚РІвЂќР‚ Drag РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚
    let isDragging = false, hasMoved = false;
    let dragStartX = 0, dragStartY = 0, startLeft = 0, startTop = 0;

    widget.addEventListener("pointerdown", (ev) => {
      if (ev.button !== 0) return;
      // Don't intercept clicks on any interactive action element
      if (ev.target.closest("[data-action]")) return;

      isDragging = true;
      hasMoved   = false;
      dragStartX = ev.clientX;
      dragStartY = ev.clientY;
      const rect = widget.getBoundingClientRect();
      startLeft  = rect.left;
      startTop   = rect.top;
      widget.setPointerCapture(ev.pointerId);
    });

    widget.addEventListener("pointermove", (ev) => {
      if (!isDragging) return;
      const dx = ev.clientX - dragStartX;
      const dy = ev.clientY - dragStartY;
      if (Math.abs(dx) > 5 || Math.abs(dy) > 5) {
        hasMoved = true;
        widget.classList.add("is-dragging");
      }
      if (hasMoved) {
        widget.style.left = `${startLeft + dx}px`;
        widget.style.top  = `${startTop  + dy}px`;
      }
    });

    widget.addEventListener("pointerup", (ev) => {
      if (!isDragging) return;
      isDragging = false;
      widget.releasePointerCapture(ev.pointerId);
      if (hasMoved) {
        setTimeout(() => widget.classList.remove("is-dragging"), 100);
        const newLeft = parseInt(widget.style.left);
        const newTop  = parseInt(widget.style.top);
        this.position.left = newLeft;
        this.position.top  = newTop;
        game.user.setFlag("ClueBook", "calendarWidgetPos", { left: newLeft, top: newTop });
      }
    });
  }

  // РІвЂќР‚РІвЂќР‚РІвЂќР‚ Actions РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚

  static async #onEdit(event, target) {
    event.preventDefault();
    if (!game.user.isGM) return;

    const scActive       = !!(window.SimpleCalendar?.api);
    const wx             = CalendarWidget.#getWeather();
    const saved          = game.settings.get("ClueBook", "calendarData") || {};
    const weatherOptions = Object.entries(WEATHER_PRESETS)
      .map(([id, p]) => ({ id, name: game.i18n.localize(p.nameKey), selected: id === wx.weatherId }));

    const templateData = {
      isSimpleCalendarActive: scActive,
      temperature:      wx.temperature,
      currentWeatherId: wx.weatherId,
      weatherPresets:   weatherOptions,
      date:             saved.date    ?? game.i18n.localize("CLUEBOOK.Weather.DefaultDate"),
      time:             saved.time    ?? "18:30",
      weekday:          saved.weekday ?? game.i18n.localize("CLUEBOOK.Weather.DefaultWeekday")
    };

    const content = await foundry.applications.handlebars.renderTemplate(
      "modules/ClueBook/templates/calendar-edit.hbs",
      templateData
    );

    new foundry.applications.api.DialogV2({
      window: { title: game.i18n.localize("CLUEBOOK.Weather.SettingsTitle") },
      content: content,
      buttons: [
        {
          action: "save",
          label: game.i18n.localize("CLUEBOOK.Weather.Save"),
          icon: "fas fa-save",
          default: true,
          callback: async (event, button, dialog) => {
            const form = button.form;
            const tempVal = form.elements.temperature?.value;
            const weatherId = form.elements.weatherPreset?.value;
            const dateVal = form.elements.date?.value;
            const weekdayVal = form.elements.weekday?.value;
            const timeVal = form.elements.time?.value;
            
            const temp = Number(tempVal);
            
            const weatherIdToSave = weatherId;
            const temperatureToSave = isNaN(temp) ? 13 : temp;

            // Persist
            const saved = game.settings.get("ClueBook", "calendarData") || {};
            const updateObj = {
              ...saved,
              weatherId: weatherIdToSave,
              temperature: temperatureToSave
            };
            
            if (dateVal !== undefined) updateObj.date = dateVal;
            if (weekdayVal !== undefined) updateObj.weekday = weekdayVal;
            if (timeVal !== undefined) updateObj.time = timeVal;
            
            await game.settings.set("ClueBook", "calendarData", updateObj);

            // Immediate render via the instance
            this.render({ force: true });
          }
        },
        {
          action: "cancel",
          label: game.i18n.localize("CLUEBOOK.Weather.Cancel"),
          icon: "fas fa-times"
        }
      ],
      rejectClose: false
    }).render(true);
  }

  static async #onAdjustTime(event, target) {
    event.preventDefault();
    if (!game.user.isGM) return;

    const minutes = parseInt(target.dataset.amount, 10) || 0;
    if (minutes === 0) return;

    if (window.SimpleCalendar?.api) {
      window.SimpleCalendar.api.changeDate({ minute: minutes });
      // updateWorldTime hook fires automatically; also force render immediately
      this.render({ force: true });
      return;
    }

    // РІвЂќР‚РІвЂќР‚ Fallback: no Simple Calendar РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚РІвЂќР‚
    const saved = game.settings.get("ClueBook", "calendarData") || {};
    const match = (saved.time ?? "18:30").match(/^(\d{1,2}):(\d{2})$/);
    if (!match) { ui.notifications.warn(game.i18n.localize("CLUEBOOK.Weather.ErrorReadTime")); return; }

    let total = parseInt(match[1]) * 60 + parseInt(match[2]) + minutes;
    if (total < 0) total += 24 * 60;
    total = total % (24 * 60);

    const hh = String(Math.floor(total / 60)).padStart(2, "0");
    const mm = String(total % 60).padStart(2, "0");

    game.settings.set("ClueBook", "calendarData", { ...saved, time: `${hh}:${mm}` });
  }

  static #onOpenSimpleCalendar(event, _target) {
    event.preventDefault();
    window.SimpleCalendar?.api?.showCalendar();
  }
}

