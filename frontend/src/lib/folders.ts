import type { Folder } from "../api/types";

export type FolderCategory = "inbox" | "sent" | "drafts" | "trash" | "other";

// Порядок основных папок в сайдбаре.
export const MAIN_ORDER: FolderCategory[] = ["inbox", "drafts", "sent", "trash"];

const RU_NAMES: Record<Exclude<FolderCategory, "other">, string> = {
  inbox: "Входящие",
  sent: "Отправленные",
  drafts: "Черновики",
  trash: "Корзина",
};

function hasFlag(folder: Folder, flag: string): boolean {
  return folder.flags.some((f) => f.toLowerCase() === flag.toLowerCase());
}

function isNested(folder: Folder): boolean {
  return !!folder.delimiter && folder.name.includes(folder.delimiter);
}

function categoryFromFlags(folder: Folder): Exclude<FolderCategory, "other"> | null {
  if (hasFlag(folder, "\\Sent")) return "sent";
  if (hasFlag(folder, "\\Drafts")) return "drafts";
  if (hasFlag(folder, "\\Trash")) return "trash";
  return null;
}

/** Категория папки: сначала special-use флаги, затем — имя верхнего уровня. */
export function folderCategory(folder: Folder): FolderCategory {
  if (folder.name.toUpperCase() === "INBOX") return "inbox";
  const byFlag = categoryFromFlags(folder);
  if (byFlag) return byFlag;
  // Имя-эвристика только для папок верхнего уровня — чтобы вложенные
  // вроде "user@host/Sent" не схлопывались в канонические.
  if (!isNested(folder)) {
    const n = folder.name.toLowerCase();
    if (/sent|отправл/.test(n)) return "sent";
    if (/draft|черновик/.test(n)) return "drafts";
    if (/trash|корзин|deleted/.test(n)) return "trash";
  }
  return "other";
}

/** Последний сегмент пути как читаемое имя. */
function prettifyName(folder: Folder): string {
  const delim = folder.delimiter || "/";
  const parts = folder.name.split(delim);
  return parts[parts.length - 1] || folder.name;
}

/** Отображаемое имя: алиас → канон по флагу → читаемый leaf-сегмент. */
export function folderDisplayName(folder: Folder): string {
  if (folder.alias) return folder.alias;
  if (folder.name.toUpperCase() === "INBOX") return RU_NAMES.inbox;
  const byFlag = categoryFromFlags(folder);
  if (byFlag) return RU_NAMES[byFlag];
  return prettifyName(folder);
}

/** Локализация по одному имени (для заголовка списка, без объекта Folder). */
export function localizeFolderName(name: string): string {
  if (name.toUpperCase() === "INBOX") return "Входящие";
  // Вложенные пути показываем leaf-сегментом без агрессивной локализации.
  const leaf = name.split(/[/.|\\]/).pop() || name;
  const nested = leaf !== name;
  const n = (nested ? leaf : name).toLowerCase();
  if (!nested) {
    if (/sent|отправл/.test(n)) return "Отправленные";
    if (/draft|черновик/.test(n)) return "Черновики";
    if (/trash|корзин|deleted/.test(n)) return "Корзина";
    if (/spam|junk|спам/.test(n)) return "Спам";
    if (/archive|архив/.test(n)) return "Архив";
  }
  return leaf;
}

/** Разбить папки на «основные» (по одной канонической каждого типа) и «другие». */
export function splitFolders(folders: Folder[]): { main: Folder[]; others: Folder[] } {
  const visible = folders.filter((f) => !f.hidden);
  // Папки со special-use флагами рассматриваем первыми — они выигрывают
  // место в «основных» у одноимённых без флага (напр. нативная «Отправленные»
  // побеждает созданную клиентом «Sent»).
  const ordered = [...visible].sort(
    (a, b) => (categoryFromFlags(b) ? 1 : 0) - (categoryFromFlags(a) ? 1 : 0),
  );

  const mainByCat = new Map<FolderCategory, Folder>();
  const pinned: Folder[] = [];
  const others: Folder[] = [];

  for (const f of ordered) {
    const cat = folderCategory(f);
    if (cat !== "other") {
      if (!mainByCat.has(cat)) mainByCat.set(cat, f);
      else others.push(f); // лишний канонический дубль → «Другие»
    } else if (f.pinned) {
      pinned.push(f);
    } else {
      others.push(f);
    }
  }

  const mainCanon = MAIN_ORDER.map((c) => mainByCat.get(c)).filter(Boolean) as Folder[];
  const main = [...pinned, ...mainCanon];
  others.sort((a, b) => a.sort_order - b.sort_order);
  return { main, others };
}
