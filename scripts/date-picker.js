export class ClueBookDatePicker {
  /**
   * Open the custom date picker dialog.
   * @param {number|null} initialTimestamp - The starting timestamp (optional). If null, defaults to current world time.
   * @param {string} title - The title of the dialog.
   * @returns {Promise<number|null>} - Resolves to the selected timestamp, or null if cancelled.
   */
  static async prompt(initialTimestamp = null, title = null) {
    if (!title) title = game.i18n.localize("CLUEBOOK.DatePicker.Title");
    if (!window.SimpleCalendar || !window.SimpleCalendar.api) {
      ui.notifications.warn(game.i18n.localize("CLUEBOOK.DatePicker.NoSimpleCalendar"));
      return null;
    }

    const scApi = window.SimpleCalendar.api;
    const currentTimestamp = game.time.worldTime;
    const targetTimestamp = (initialTimestamp !== null && initialTimestamp !== undefined && initialTimestamp !== "") ? initialTimestamp : currentTimestamp;

    // Convert timestamp to DateData
    const scDate = scApi.timestampToDate(targetTimestamp) || scApi.timestampToDate(currentTimestamp);
    if (!scDate) return null;

    // Get all months in current calendar
    let allMonths = [];
    try {
      allMonths = scApi.getCurrentCalendar().months || [];
    } catch (e) {
      console.warn("ClueBook | Could not get calendar months", e);
      // Fallback
      allMonths = Array.from({length: 12}, (_, i) => ({ name: `${game.i18n.localize("CLUEBOOK.DatePicker.Month")} ${i+1}` }));
    }
    
    const monthsData = allMonths.map((m, i) => ({
      index: i,
      name: m.name,
      selected: i === scDate.month
    }));

    // Estimate max days for current month (rough fallback if API doesn't expose it directly for current month easily, though Simple Calendar months have different lengths)
    // Actually, getDaysForMonth API doesn't exist directly, but we can allow up to 99 and let SC normalize it, or try to clamp. Let's allow up to 99.
    const maxDays = 99; 

    const templateData = {
      year: scDate.year,
      month: scDate.month, // index
      day: scDate.day,
      hour: scDate.hour,
      minute: scDate.minute,
      months: monthsData,
      maxDays
    };

    const content = await foundry.applications.handlebars.renderTemplate("modules/ClueBook/templates/date-picker.hbs", templateData);

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
              const form = button.form;
              const year = Number(form.elements.year?.value) || 0;
              const month = Number(form.elements.month?.value) || 0;
              const day = Number(form.elements.day?.value) || 1;
              const hour = Number(form.elements.hour?.value) || 0;
              const minute = Number(form.elements.minute?.value) || 0;

              const newTimestamp = scApi.dateToTimestamp({ year, month, day, hour, minute });
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

