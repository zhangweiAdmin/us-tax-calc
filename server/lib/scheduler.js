import { refreshTaxData } from "./taxUpdater.js";

const TIMEZONE = "America/New_York";
const REFRESH_HOUR = 5;
const REFRESH_MINUTE_WINDOW = 10;

function getEasternDateParts(date = new Date()) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  });

  const parts = formatter.formatToParts(date);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));

  return {
    dateKey: `${value.year}-${value.month}-${value.day}`,
    hour: Number(value.hour),
    minute: Number(value.minute)
  };
}

export function startDailyTaxRefresh({ onSuccess, onError } = {}) {
  let lastRunDateKey = null;

  const interval = setInterval(async () => {
    try {
      const now = getEasternDateParts();
      const withinWindow =
        now.hour === REFRESH_HOUR && now.minute >= 0 && now.minute <= REFRESH_MINUTE_WINDOW;

      if (!withinWindow || lastRunDateKey === now.dateKey) {
        return;
      }

      const result = await refreshTaxData({ reason: "daily-scheduled-refresh" });
      lastRunDateKey = now.dateKey;
      if (onSuccess) onSuccess(result);
    } catch (error) {
      if (onError) onError(error);
    }
  }, 60 * 1000);

  return () => clearInterval(interval);
}
