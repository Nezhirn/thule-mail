import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  ChevronRight, FolderOpen, GripVertical, Inbox, Moon, PanelLeftClose, PanelLeftOpen,
  PenSquare, Send, Settings, Star, Sun, Trash2,
} from "lucide-react";
import {
  useAccounts, useFolders, useUpdateAccount, useUpdateFolderLayout,
} from "../api/hooks";
import type { FolderLayoutItem } from "../api/hooks";
import { useUI } from "../stores/ui";
import type { Account, Folder } from "../api/types";
import { folderDisplayName, splitFolders } from "../lib/folders";
import FolderContextMenu from "./FolderContextMenu";

function folderIcon(name: string) {
  const n = name.toLowerCase();
  if (n.includes("sent") || n.includes("отправ")) return <Send size={15} />;
  if (n.includes("trash") || n.includes("корзин") || n.includes("delet")) return <Trash2 size={15} />;
  return <Inbox size={15} />;
}

export default function Sidebar() {
  const { sidebarCollapsed } = useUI();
  return (
    <motion.aside
      animate={{ width: sidebarCollapsed ? 64 : 252 }}
      transition={{ type: "spring", stiffness: 320, damping: 34 }}
      className="glass-sidebar relative z-10 flex h-full flex-col overflow-hidden border-r border-sep"
    >
      <AnimatePresence mode="wait" initial={false}>
        {sidebarCollapsed ? <CollapsedRail key="rail" /> : <ExpandedSidebar key="full" />}
      </AnimatePresence>
    </motion.aside>
  );
}

/* ── Свёрнутый rail ─────────────────────────────────────────────────────── */
function CollapsedRail() {
  const { data: accounts } = useAccounts();
  const { selection, setSelection, setComposerOpen, toggleSidebar, theme, toggleTheme } = useUI();
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="flex h-full flex-col items-center gap-1.5 px-2 py-3"
    >
      <RailButton title="Развернуть" onClick={toggleSidebar}><PanelLeftOpen size={18} /></RailButton>
      <button
        onClick={() => setComposerOpen(true)}
        title="Написать"
        className="my-1 flex h-10 w-10 items-center justify-center rounded-full bg-accent text-white shadow-sm transition active:scale-90"
      >
        <PenSquare size={17} />
      </button>
      <RailButton
        title="Объединённый входящий"
        active={selection.kind === "unified"}
        onClick={() => setSelection({ kind: "unified" })}
      >
        <Star size={17} />
      </RailButton>
      <div className="my-1 h-px w-7 bg-separator/10" />
      <div className="flex flex-col items-center gap-2.5 overflow-y-auto py-1">
        {accounts?.filter((a) => a.enabled).map((a) => (
          <button
            key={a.id}
            title={a.display_name || a.email}
            onClick={toggleSidebar}
            className="h-3.5 w-3.5 rounded-full ring-2 ring-transparent transition hover:ring-white/40"
            style={{ background: a.color }}
          />
        ))}
      </div>
      <div className="mt-auto flex flex-col items-center gap-1">
        <RailButton title="Сменить тему" onClick={toggleTheme}>
          {theme === "light" ? <Moon size={16} /> : <Sun size={16} />}
        </RailButton>
        <Link to="/accounts" title="Аккаунты" className="flex h-9 w-9 items-center justify-center rounded-lg text-muted hover:bg-hover/5">
          <Settings size={16} />
        </Link>
      </div>
    </motion.div>
  );
}

function RailButton({
  children, title, active, onClick,
}: { children: React.ReactNode; title: string; active?: boolean; onClick: () => void }) {
  return (
    <button
      title={title}
      onClick={onClick}
      className={`flex h-9 w-9 items-center justify-center rounded-lg transition ${
        active ? "bg-accent/15 text-accent" : "text-muted hover:bg-hover/5"
      }`}
    >
      {children}
    </button>
  );
}

/* ── Развёрнутый сайдбар ────────────────────────────────────────────────── */
function ExpandedSidebar() {
  const { data: accounts } = useAccounts();
  const { selection, setSelection, setComposerOpen, toggleSidebar, theme, toggleTheme } = useUI();
  const update = useUpdateAccount();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const enabled = (accounts ?? []).filter((a) => a.enabled);
  const [order, setOrder] = useState<number[]>([]);
  useEffect(() => setOrder(enabled.map((a) => a.id)), [accounts]); // eslint-disable-line

  const ordered = order
    .map((id) => enabled.find((a) => a.id === id))
    .filter(Boolean) as Account[];

  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldI = order.indexOf(active.id as number);
    const newI = order.indexOf(over.id as number);
    const next = arrayMove(order, oldI, newI);
    setOrder(next);
    next.forEach((id, idx) => update.mutate({ id, body: { sort_order: idx } }));
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="flex h-full flex-col gap-0.5 px-2.5 py-3"
    >
      <div className="mb-1 flex items-center gap-1 px-1">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-faint">Почта</span>
        <button onClick={toggleSidebar} title="Свернуть" className="ml-auto rounded-md p-1 text-muted hover:bg-hover/5">
          <PanelLeftClose size={16} />
        </button>
      </div>

      <button
        onClick={() => setComposerOpen(true)}
        className="mb-2 flex items-center gap-2 rounded-xl bg-accent px-3 py-2.5 text-sm font-medium text-white shadow-sm transition active:scale-[0.97]"
      >
        <PenSquare size={16} /> Написать
      </button>

      <NavRow
        active={selection.kind === "unified"}
        icon={<Star size={15} />}
        label="Объединённый входящий"
        onClick={() => setSelection({ kind: "unified" })}
      />

      <div className="my-2 h-px bg-separator/10" />

      <div className="flex-1 overflow-y-auto">
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={order} strategy={verticalListSortingStrategy}>
            {ordered.map((acc) => (
              <SortableAccount key={acc.id} account={acc} />
            ))}
          </SortableContext>
        </DndContext>
      </div>

      <div className="mt-auto flex gap-1 border-t border-sep pt-3">
        <Link to="/accounts" className="flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-xs text-muted hover:bg-hover/5">
          <Settings size={14} /> Аккаунты
        </Link>
        <button onClick={toggleTheme} className="flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-xs text-muted hover:bg-hover/5">
          {theme === "light" ? <Moon size={14} /> : <Sun size={14} />}
          {theme === "light" ? "Тёмная" : "Светлая"}
        </button>
      </div>
    </motion.div>
  );
}

function SortableAccount({ account }: { account: Account }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: account.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };
  return (
    <div ref={setNodeRef} style={style}>
      <AccountGroup account={account} dragHandle={{ ...attributes, ...listeners }} />
    </div>
  );
}

function AccountGroup({
  account, dragHandle,
}: { account: Account; dragHandle: Record<string, unknown> }) {
  const [open, setOpen] = useState(true);
  const [othersOpen, setOthersOpen] = useState(false);
  const [showHidden, setShowHidden] = useState(false);
  const { data: folders } = useFolders(open ? account.id : null);
  const layout = useUpdateFolderLayout(account.id);

  const all = folders ?? [];
  const hiddenCount = all.filter((f) => f.hidden).length;
  const { main, others } = splitFolders(all);
  // Скрытые показываем внутри «Другие» по запросу.
  const hiddenOthers = showHidden ? all.filter((f) => f.hidden) : [];
  const othersAll = [...others, ...hiddenOthers];

  const [menu, setMenu] = useState<{ folder: Folder; x: number; y: number } | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const persist = (items: Folder[]) => {
    const payload: FolderLayoutItem[] = items.map((f, idx) => ({
      folder: f.name,
      alias: f.alias,
      sort_order: idx,
      pinned: f.pinned,
      hidden: f.hidden,
    }));
    layout.mutate(payload);
  };

  // Контекстное меню применяет patch к одной папке (на весь видимый набор).
  const applyPatch = (target: Folder, patch: Partial<Folder>) =>
    persist(all.map((f) => (f.name === target.name ? { ...f, ...patch } : f)));

  const onOthersDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldI = othersAll.findIndex((f) => f.name === active.id);
    const newI = othersAll.findIndex((f) => f.name === over.id);
    persist(arrayMove(othersAll, oldI, newI));
  };

  return (
    <div className="mb-0.5">
      <div className="group flex w-full items-center gap-1.5 rounded-lg px-1 py-1.5 hover:bg-hover/5">
        <button {...dragHandle} className="cursor-grab text-faint opacity-0 transition group-hover:opacity-100" title="Перетащить">
          <GripVertical size={13} />
        </button>
        <button onClick={() => setOpen((o) => !o)} className="flex flex-1 items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-faint">
          <motion.span animate={{ rotate: open ? 90 : 0 }} transition={{ duration: 0.15 }}>
            <ChevronRight size={11} />
          </motion.span>
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: account.color }} />
          <span className="truncate">{account.display_name || account.email}</span>
        </button>
      </div>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="overflow-hidden pl-1.5"
          >
            {/* Основные папки — фиксированный порядок, локализованные имена */}
            {main.map((f) => (
              <FolderRow
                key={f.name}
                folder={f}
                accountId={account.id}
                onContext={(x, y) => setMenu({ folder: f, x, y })}
              />
            ))}

            {/* Прочие папки — сворачиваемая секция «Другие» с drag&drop */}
            {othersAll.length > 0 && (
              <>
                <button
                  onClick={() => setOthersOpen((o) => !o)}
                  className="mt-1 flex w-full items-center gap-2 rounded-lg px-2.5 py-1 text-[12px] text-muted hover:bg-hover/5"
                >
                  <motion.span animate={{ rotate: othersOpen ? 90 : 0 }} transition={{ duration: 0.15 }}>
                    <ChevronRight size={11} />
                  </motion.span>
                  <FolderOpen size={14} className="opacity-80" />
                  <span className="flex-1 text-left">Другие</span>
                  <span className="text-[11px] text-faint">{othersAll.length}</span>
                </button>
                <AnimatePresence initial={false}>
                  {othersOpen && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.18 }}
                      className="overflow-hidden pl-2"
                    >
                      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onOthersDragEnd}>
                        <SortableContext items={othersAll.map((f) => f.name)} strategy={verticalListSortingStrategy}>
                          {othersAll.map((f) => (
                            <SortableFolder
                              key={f.name}
                              folder={f}
                              accountId={account.id}
                              onContext={(x, y) => setMenu({ folder: f, x, y })}
                            />
                          ))}
                        </SortableContext>
                      </DndContext>
                      {hiddenCount > 0 && (
                        <button
                          onClick={() => setShowHidden((v) => !v)}
                          className="mt-0.5 px-2.5 py-1 text-[11px] text-faint hover:text-muted"
                        >
                          {showHidden ? "Спрятать скрытые" : `Показать скрытые (${hiddenCount})`}
                        </button>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {menu && (
        <FolderContextMenu
          folder={menu.folder}
          x={menu.x}
          y={menu.y}
          onClose={() => setMenu(null)}
          onApply={(patch) => applyPatch(menu.folder, patch)}
        />
      )}
    </div>
  );
}

/** Папка как строка (для основных — без dnd). */
function FolderRow({
  folder, accountId, onContext, dragRef, dragProps, dragging,
}: {
  folder: Folder;
  accountId: number;
  onContext: (x: number, y: number) => void;
  dragRef?: (el: HTMLElement | null) => void;
  dragProps?: Record<string, unknown>;
  dragging?: boolean;
}) {
  const { selection, setSelection } = useUI();
  const active =
    selection.kind === "folder" &&
    selection.accountId === accountId &&
    selection.folder === folder.name;

  return (
    <div ref={dragRef} {...dragProps} style={dragging ? { opacity: 0.5 } : undefined}>
      <button
        onClick={() => setSelection({ kind: "folder", accountId, folder: folder.name })}
        onContextMenu={(e) => { e.preventDefault(); onContext(e.clientX, e.clientY); }}
        className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-[13.5px] transition ${
          active ? "bg-accent/15 font-medium text-accent" : "text-content hover:bg-hover/5"
        } ${folder.hidden ? "opacity-50" : ""}`}
      >
        <span className="opacity-85">{folderIcon(folder.name)}</span>
        <span className="flex-1 truncate text-left">{folderDisplayName(folder)}</span>
        {folder.pinned && <span className="text-[10px]">📌</span>}
        {folder.unread ? (
          <span className={`text-xs tabular-nums ${active ? "text-accent" : "text-faint"}`}>{folder.unread}</span>
        ) : null}
      </button>
    </div>
  );
}

function SortableFolder({
  folder, accountId, onContext,
}: { folder: Folder; accountId: number; onContext: (x: number, y: number) => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: folder.name });
  return (
    <div style={{ transform: CSS.Transform.toString(transform), transition }}>
      <FolderRow
        folder={folder}
        accountId={accountId}
        onContext={onContext}
        dragRef={setNodeRef}
        dragProps={{ ...attributes, ...listeners }}
        dragging={isDragging}
      />
    </div>
  );
}

function NavRow({
  active, icon, label, onClick,
}: { active: boolean; icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-[13.5px] transition ${
        active ? "bg-accent/15 font-medium text-accent" : "text-content hover:bg-hover/5"
      }`}
    >
      <span className="opacity-85">{icon}</span>
      <span className="flex-1 truncate text-left">{label}</span>
    </button>
  );
}
