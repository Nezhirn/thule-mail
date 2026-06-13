import { create } from "zustand";

export type Theme = "light" | "dark";

interface UIState {
  theme: Theme;
  toggleTheme: () => void;
  setTheme: (t: Theme) => void;

  // Левая панель по умолчанию свёрнута (узкий rail с иконками).
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;
  setSidebarCollapsed: (v: boolean) => void;

  // Поиск по текущему списку / по всем ящикам.
  search: string;
  setSearch: (q: string) => void;

  // Активная «папка» в просмотре: либо unified, либо конкретная папка аккаунта.
  selection:
    | { kind: "unified" }
    | { kind: "folder"; accountId: number; folder: string };
  setSelection: (s: UIState["selection"]) => void;

  // Выбранное письмо (для правой панели).
  openedUid: number | null;
  openedAccountId: number | null;
  openedFolder: string | null;
  openMessage: (accountId: number, folder: string, uid: number) => void;
  closeMessage: () => void;

  composerOpen: boolean;
  setComposerOpen: (v: boolean) => void;
}

function applyTheme(t: Theme) {
  const root = document.documentElement;
  root.classList.remove("light", "dark");
  root.classList.add(t);
  localStorage.setItem("thulemail-theme", t);
}

const initialTheme = (localStorage.getItem("thulemail-theme") as Theme) || "light";

export const useUI = create<UIState>((set, get) => ({
  theme: initialTheme,
  toggleTheme: () => {
    const next = get().theme === "light" ? "dark" : "light";
    applyTheme(next);
    set({ theme: next });
  },
  setTheme: (t) => {
    applyTheme(t);
    set({ theme: t });
  },

  sidebarCollapsed: localStorage.getItem("thulemail-sidebar") !== "expanded",
  toggleSidebar: () => {
    const next = !get().sidebarCollapsed;
    localStorage.setItem("thulemail-sidebar", next ? "collapsed" : "expanded");
    set({ sidebarCollapsed: next });
  },
  setSidebarCollapsed: (v) => {
    localStorage.setItem("thulemail-sidebar", v ? "collapsed" : "expanded");
    set({ sidebarCollapsed: v });
  },

  search: "",
  setSearch: (search) => set({ search }),

  selection: { kind: "unified" },
  setSelection: (selection) =>
    set({ selection, openedUid: null, openedAccountId: null, openedFolder: null }),

  openedUid: null,
  openedAccountId: null,
  openedFolder: null,
  openMessage: (accountId, folder, uid) =>
    set({ openedAccountId: accountId, openedFolder: folder, openedUid: uid }),
  closeMessage: () => set({ openedUid: null }),

  composerOpen: false,
  setComposerOpen: (composerOpen) => set({ composerOpen }),
}));
