import { format, isThisYear, isToday, isYesterday } from "date-fns";
import { ru } from "date-fns/locale";

export function formatListDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  if (isToday(d)) return format(d, "HH:mm");
  if (isYesterday(d)) return "Вчера";
  if (isThisYear(d)) return format(d, "d MMM", { locale: ru });
  return format(d, "dd.MM.yy");
}

export function formatFullDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return format(d, "d MMMM yyyy, HH:mm", { locale: ru });
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} Б`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} КБ`;
  return `${(n / 1024 / 1024).toFixed(1)} МБ`;
}

export function initialsFromName(name: string, email: string): string {
  const src = (name || email || "?").trim();
  const parts = src.split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return src.slice(0, 1).toUpperCase();
}

// Стабильный цвет аватара из строки.
export function colorFromString(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360;
  return `hsl(${h} 65% 55%)`;
}
