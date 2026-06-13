import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Eye, EyeOff, Pin, PinOff, Tag } from "lucide-react";
import type { Folder } from "../api/types";

interface Props {
  folder: Folder;
  x: number;
  y: number;
  onClose: () => void;
  onApply: (patch: Partial<Pick<Folder, "pinned" | "hidden" | "alias">>) => void;
}

export default function FolderContextMenu({ folder, x, y, onClose, onApply }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [renaming, setRenaming] = useState(false);
  const [alias, setAlias] = useState(folder.alias || folder.name);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onEsc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onEsc);
    };
  }, [onClose]);

  const item = "flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[13px] text-content hover:bg-accent hover:text-white transition";

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.12 }}
      style={{ top: y, left: x }}
      className="glass-modal fixed z-[60] w-52 rounded-xl border border-sep p-1 shadow-2xl"
    >
      {renaming ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            onApply({ alias: alias.trim() === folder.name ? null : alias.trim() });
            onClose();
          }}
          className="p-1"
        >
          <label className="mb-1 block px-1 text-[11px] text-muted">Имя-алиас</label>
          <input
            autoFocus
            value={alias}
            onChange={(e) => setAlias(e.target.value)}
            className="w-full rounded-md border border-sep bg-elevated px-2 py-1.5 text-[13px] outline-none focus:ring-2 focus:ring-accent/40"
          />
          <div className="mt-2 flex gap-1">
            <button type="submit" className="flex-1 rounded-md bg-accent py-1.5 text-xs font-medium text-white">Сохранить</button>
            {folder.alias && (
              <button
                type="button"
                onClick={() => { onApply({ alias: null }); onClose(); }}
                className="rounded-md border border-sep px-2 py-1.5 text-xs text-muted"
                title="Сбросить алиас"
              >
                Сброс
              </button>
            )}
          </div>
        </form>
      ) : (
        <>
          <button className={item} onClick={() => { onApply({ pinned: !folder.pinned }); onClose(); }}>
            {folder.pinned ? <PinOff size={14} /> : <Pin size={14} />}
            {folder.pinned ? "Открепить" : "Закрепить наверху"}
          </button>
          <button className={item} onClick={() => setRenaming(true)}>
            <Tag size={14} /> Переименовать (алиас)
          </button>
          <button className={item} onClick={() => { onApply({ hidden: !folder.hidden }); onClose(); }}>
            {folder.hidden ? <Eye size={14} /> : <EyeOff size={14} />}
            {folder.hidden ? "Показать папку" : "Скрыть папку"}
          </button>
        </>
      )}
    </motion.div>
  );
}
