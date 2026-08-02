export class TimeService {

  /**
   * Identifies which calendar module is currently active.
   * @returns {string} "simple-calendar", "calendaria", or "none"
   */
  static getProvider() {
    if (window.SimpleCalendar?.api) return "simple-calendar";
    if (window.CALENDARIA?.api) return "calendaria";
    return "none";
  }

  /**
   * Checks if any supported calendar module is active.
   * @returns {boolean}
   */
  static isActive() {
    return this.getProvider() !== "none";
  }

  /**
   * Registers a callback that fires whenever the game time/date changes.
   * @param {Function} callback 
   */
  static registerHook(callback) {
    const provider = this.getProvider();
    if (provider === "simple-calendar" && window.SimpleCalendar?.Hooks?.DateTimeChange) {
      Hooks.on(window.SimpleCalendar.Hooks.DateTimeChange, callback);
    }
    // Fallback: listen to default Foundry time changes
    Hooks.on("updateWorldTime", callback);
  }

  /**
   * Gets the current date/time from the active calendar.
   * @returns {Object|null} { timestamp, date, time, weekday, fullStr }
   */
  static getCurrentDateTime() {
    const provider = this.getProvider();
    if (provider === "simple-calendar") {
      const api = window.SimpleCalendar.api;
      const ts = game.time.worldTime;
      const d = api.timestampToDate(ts);
      if (!d) return null;

      const h = String(d.hour ?? 0).padStart(2, "0");
      const m = String(d.minute ?? 0).padStart(2, "0");
      const timeStr = `${h}:${m}`;

      const dateStr = d.display?.date ?? `${d.day} ${d.monthName ?? d.month}, ${d.year}`;
      const weekdayStr = d.weekday || d.display?.weekday || "";
      const formatted = api.formatDateTime(d);

      return {
        timestamp: ts,
        date: dateStr,
        time: timeStr,
        weekday: weekdayStr,
        fullStr: `${formatted.date} ${formatted.time}`
      };
    } else if (provider === "calendaria") {
      const api = window.CALENDARIA.api;
      const ts = game.time.worldTime;
      const d = api.timestampToDate(ts);
      if (!d) return null;

      const h = String(d.hour ?? 0).padStart(2, "0");
      const m = String(d.minute ?? 0).padStart(2, "0");
      const timeStr = `${h}:${m}`;
      const fullStr = api.formatDate ? api.formatDate(d) : `${d.day}.${d.month}.${d.year} ${timeStr}`;

      return {
        timestamp: ts,
        date: `${d.day}.${d.month}.${d.year}`,
        time: timeStr,
        weekday: "",
        fullStr: fullStr
      };
    }
    return null;
  }

  /**
   * Gets the months of the current calendar.
   * @returns {Array} Array of month objects
   */
  static getMonths() {
    if (!this.isActive()) return [];
    const provider = this.getProvider();
    if (provider === "simple-calendar") {
      return window.SimpleCalendar.api.getCurrentCalendar().months || [];
    } else if (provider === "calendaria") {
      try {
        const cal = window.CALENDARIA.api.getActiveCalendar();
        if (cal && cal.months) {
          // Calendaria stores months inside a 'values' object
          const rawMonths = cal.months.values || cal.months;
          const monthsArr = Array.isArray(rawMonths) ? rawMonths : Object.values(rawMonths);
          
          // Sort by ordinal if available (since Object.values might not guarantee order)
          monthsArr.sort((a, b) => (a.ordinal || 0) - (b.ordinal || 0));
          
          if (monthsArr.length > 0) return monthsArr;
        }
      } catch (e) {}
      return Array.from({length: 12}, (_, i) => ({ name: `${i+1}` }));
    }
    return [];
  }

  /**
   * Formats a given timestamp into strings.
   * @param {number} timestamp 
   * @returns {Object} { date, time, fullStr }
   */
  static formatTimestamp(timestamp) {
    if (!this.isActive() || timestamp === undefined || timestamp === null) {
      return { date: "", time: "", fullStr: "—" };
    }
    const provider = this.getProvider();
    if (provider === "simple-calendar") {
      const api = window.SimpleCalendar.api;
      const dt = api.timestampToDate(timestamp);
      const formatted = api.formatDateTime(dt);
      return {
        date: formatted.date,
        time: formatted.time,
        fullStr: `${formatted.date} ${formatted.time}`
      };
    } else if (provider === "calendaria") {
      const api = window.CALENDARIA.api;
      const dt = api.timestampToDate(timestamp);
      if (!dt) return { date: "", time: "", fullStr: "—" };
      
      const h = String(dt.hour ?? 0).padStart(2, "0");
      const m = String(dt.minute ?? 0).padStart(2, "0");
      const timeStr = `${h}:${m}`;
      const fullStr = api.formatDate ? api.formatDate(dt) : `${dt.day}.${dt.month}.${dt.year} ${timeStr}`;
      
      return {
        date: `${dt.day}.${dt.month}.${dt.year}`,
        time: timeStr,
        fullStr: fullStr
      };
    }
    return { date: "", time: "", fullStr: "—" };
  }

  static timestampToDate(timestamp) {
    if (!this.isActive()) return null;
    const provider = this.getProvider();
    if (provider === "simple-calendar") {
      return window.SimpleCalendar.api.timestampToDate(timestamp);
    } else if (provider === "calendaria") {
      const dt = window.CALENDARIA.api.timestampToDate(timestamp);
      if (dt) {
        return {
          ...dt,
          month: (dt.month ?? 1) - 1, // Calendaria is 1-indexed, ClueBook UI expects 0-indexed
          day: (dt.day ?? 1) - 1      // Calendaria is 1-indexed, ClueBook UI expects 0-indexed
        };
      }
    }
    return null;
  }

  static dateToTimestamp(dateObj) {
    if (!this.isActive()) return null;
    const provider = this.getProvider();
    if (provider === "simple-calendar") {
      return window.SimpleCalendar.api.dateToTimestamp(dateObj);
    } else if (provider === "calendaria") {
      return window.CALENDARIA.api.dateToTimestamp({
        ...dateObj,
        month: (dateObj.month ?? 0) + 1, // Convert 0-indexed back to 1-indexed
        day: (dateObj.day ?? 0) + 1      // Convert 0-indexed back to 1-indexed
      });
    }
    return null;
  }

  /**
   * Adds a note/journal entry to the active calendar.
   * @param {string} title 
   * @param {string} content 
   * @param {number} timestamp 
   */
  static async addNote(title, content, timestamp) {
    if (!this.isActive()) return null;
    const provider = this.getProvider();
    if (provider === "simple-calendar") {
      const dateObj = window.SimpleCalendar.api.timestampToDate(timestamp);
      const permissions = { default: 0 };
      game.users.forEach(u => permissions[u.id] = 2); // all players observer
      if (game.user) permissions[game.user.id] = 3;   // creator is owner
      
      return await window.SimpleCalendar.api.addNote(
        title,
        content,
        {
          startingDate: {
            year: dateObj.year,
            month: dateObj.month,
            day: dateObj.day,
            hour: dateObj.hour,
            minute: dateObj.minute
          },
          endingDate: {
            year: dateObj.year,
            month: dateObj.month,
            day: dateObj.day,
            hour: dateObj.hour,
            minute: dateObj.minute
          }
        },
        null,
        {},
        permissions
      );
    } else if (provider === "calendaria") {
      try {
        const dt = window.CALENDARIA.api.timestampToDate(timestamp);
        return await window.CALENDARIA.api.createNote({
          title: title,
          content: content,
          date: dt
        });
      } catch (e) {
        console.warn("ClueBook | Calendaria createNote error:", e);
      }
    }
  }

  /**
   * Advances the game time by the specified number of minutes.
   * @param {number} minutes 
   */
  static changeTime(minutes) {
    if (!this.isActive()) {
      game.time.advance(minutes * 60);
      return;
    }
    const provider = this.getProvider();
    if (provider === "simple-calendar") {
      window.SimpleCalendar.api.changeDate({ minute: minutes });
    } else if (provider === "calendaria") {
      window.CALENDARIA.api.advanceTime({ minute: minutes });
    }
  }

  /**
   * Opens the calendar UI.
   */
  static openApp() {
    if (!this.isActive()) return;
    const provider = this.getProvider();
    if (provider === "simple-calendar") {
      window.SimpleCalendar.api.showCalendar();
    } else if (provider === "calendaria") {
      if (window.CALENDARIA.api.showChronicle) {
        window.CALENDARIA.api.showChronicle();
      }
    }
  }

  /**
   * Opens the time UI (if supported).
   */
  static openTime() {
    if (!this.isActive()) return;
    const provider = this.getProvider();
    if (provider === "simple-calendar") {
      window.SimpleCalendar.api.showCalendar(); // SC has one UI for all
    } else if (provider === "calendaria") {
      if (window.CALENDARIA.api.showTimeKeeper) {
        window.CALENDARIA.api.showTimeKeeper();
      }
    }
  }

  /**
   * Opens the weather UI (if supported).
   */
  static openWeather() {
    if (!this.isActive()) return;
    const provider = this.getProvider();
    if (provider === "simple-calendar") {
      window.SimpleCalendar.api.showCalendar();
    } else if (provider === "calendaria") {
      if (window.CALENDARIA.api.showChronicle) {
        window.CALENDARIA.api.showChronicle();
      }
    }
  }

  /**
   * Gets weather from the active provider or falls back to local.
   * @returns {Object|null}
   */
  static getWeather() {
    const provider = this.getProvider();
    if (provider === "calendaria") {
      try {
        const w = window.CALENDARIA.api.getCurrentWeather();
        const t = window.CALENDARIA.api.getTemperature();
        const tempStr = window.CALENDARIA.api.formatTemperature ? window.CALENDARIA.api.formatTemperature(t) : `${t}°C`;
        return {
          weatherId: w?.id || "unknown",
          weatherName: game.i18n.localize(w?.label || "CLUEBOOK.Weather.Unknown"),
          weatherIcon: w?.icon || "fa-smog",
          temperature: tempStr,
          provider: "calendaria"
        };
      } catch (e) {
        console.warn("ClueBook | Calendaria weather error:", e);
      }
    }
    
    // Fallback to ClueBook internal
    const saved = game.settings.get("ClueBook", "calendarData") || {};
    return {
      weatherId: saved.weatherId ?? "fog",
      temperature: saved.temperature ?? 13,
      provider: "cluebook"
    };
  }
}
