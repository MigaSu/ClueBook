import { TimeService } from "./services/time-service.js";

export class ClueBookDatePicker {
  /**
   * Open the custom date picker dialog.
   * @param {number|null} initialTimestamp - The starting timestamp (optional). If null, defaults to current world time.
   * @param {string} title - The title of the dialog.
   * @returns {Promise<number|null>} - Resolves to the selected timestamp, or null if cancelled.
   */
  static async prompt(initialTimestamp = null, title = null) {
    if (!title) title = game.i18n.localize("CLUEBOOK.DatePicker.Title");
    if (!TimeService.isActive()) {
      ui.notifications.warn(game.i18n.localize("CLUEBOOK.DatePicker.NoSimpleCalendar"));
      return null;
    }

    const currentTimestamp = game.time.worldTime;
    const targetTimestamp = (initialTimestamp !== null && initialTimestamp !== undefined && initialTimestamp !== "") ? initialTimestamp : currentTimestamp;

    // Convert timestamp to DateData
    const scDate = TimeService.timestampToDate(targetTimestamp) || TimeService.timestampToDate(currentTimestamp);
    if (!scDate) return null;

    // Get all months in current calendar
    let allMonths = TimeService.getMonths();
    if (!allMonths || allMonths.length === 0) {
      // Fallback
      allMonths = Array.from({length: 12}, (_, i) => ({ name: `${game.i18n.localize("CLUEBOOK.DatePicker.Month")} ${i+1}` }));
    }
    
    const monthsData = allMonths.map((m, i) => ({
      index: i,
      name: m.name || m,
      selected: i === scDate.month
    }));

    // Allow up to 99 days for human input
    const maxDays = 99; 

    const templateData = {
      year: scDate.year ?? 0,
      month: scDate.month ?? 0, // index
      day: (scDate.day ?? 0) + 1, // 1-indexed for human display
      hour: scDate.hour ?? 0,
      minute: scDate.minute ?? 0,
      months: monthsData,
      maxDays
    };

    const renderTpl = foundry.applications?.handlebars?.renderTemplate ?? renderTemplate;
    const content = await renderTpl("modules/ClueBook/templates/date-picker.hbs", templateData);

    return new Promise((resolve) => {
      new foundry.applications.api.DialogV2({
        window: { title: title },
        content: content,
        classes: ["cb-date-picker-dialog"],
        buttons: [
          {
            action: "save",
            label: game.i18n.localize("CLUEBOOK.DatePicker.Select"),
            icon: "fas fa-check",
            default: true,
            callback: (event, button, dialog) => {
              const root = button.form || dialog.element;
              const getVal = (name, fallback) => Number(root.querySelector(`[name="${name}"]`)?.value ?? fallback);

              const year = getVal("year", 0);
              const month = getVal("month", 0);
              const dayInput = Math.max(1, getVal("day", 1));
              const day = dayInput - 1; // 0-indexed for TimeService
              const hour = Math.max(0, Math.min(23, getVal("hour", 0)));
              const minute = Math.max(0, Math.min(59, getVal("minute", 0)));

              const newTimestamp = TimeService.dateToTimestamp({ year, month, day, hour, minute });
              resolve(newTimestamp);
            }
          },
          {
            action: "cancel",
            label: game.i18n.localize("CLUEBOOK.DatePicker.Cancel"),
            icon: "fas fa-times",
            callback: () => resolve(null)
          }
        ],
        rejectClose: false
      }).render(true);
    });
  }
}
