import { useEffect, useState } from "react";
import { Virtuoso } from "react-virtuoso";
import { motion } from "framer-motion";
import { Paperclip, RefreshCw, Search, X } from "lucide-react";
import {
  useFolderMessages, useMessageActions, useSearch, useUnifiedMessages,
} from "../api/hooks";
import { useUI } from "../stores/ui";
import type { MessageListItem } from "../api/types";
import { formatListDate, colorFromString } from "../lib/format";
import { listItem } from "../lib/motion";

export default function MessageList() {
  const { selection, openedUid, openMessage, search, setSearch } = useUI();
  const unified = selection.kind === "unified";
  const accountId = unified ? null : selection.accountId;

  // Дебаунс ввода поиска (400 мс).
  const [debounced, setDebounced] = useState(search);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(search), 400);
    return () => clearTimeout(t);
  }, [search]);

  const unifiedQ = useUnifiedMessages();
  const folderQ = useFolderMessages(
    unified ? null : selection.accountId,
    unified ? null : selection.folder,
  );
  const searchQ = useSearch(debounced, accountId, unified ? "all" : "account");
  const actions = useMessageActions();

  const searching = debounced.trim().length > 0;
  const listQuery = unified ? unifiedQ : folderQ;
  const messages = searching ? searchQ.data?.messages ?? [] : listQuery.data?.messages ?? [];
  const isLoading = searching ? searchQ.isLoading : listQuery.isLoading;
  const isFetching = searching ? searchQ.isFetching : listQuery.isFetching;
  const title = searching
    ? "Результаты поиска"
    : unified ? "Объединённый входящий" : selection.folder;
  const unreadCount = messages.filter((m) => !m.seen).length;

  const onSync = () => {
    if (!unified) {
      actions.sync.mutate({ accountId: selection.accountId, folder: selection.folder });
    } else {
      unifiedQ.refetch();
    }
  };

  return (
    <section className="glass-panel flex h-full flex-col overflow-hidden border-r border-sep">
      <div className="glass-bar border-b border-sep px-4 pb-2.5 pt-3">
        <div className="flex items-center gap-2">
          <h2 className="truncate text-[17px] font-bold tracking-tight">{title}</h2>
          <button
            onClick={onSync}
            className="ml-auto rounded-lg p-1.5 text-muted hover:bg-hover/5"
            title="Обновить"
          >
            <RefreshCw size={15} className={isFetching ? "animate-spin" : ""} />
          </button>
        </div>
        <p className="mt-0.5 text-xs text-muted">
          {searching
            ? `Найдено: ${messages.length}`
            : unreadCount > 0 ? `${unreadCount} непрочитанных` : "Нет непрочитанных"}
        </p>
        <div className="mt-2.5 flex items-center gap-2 rounded-lg bg-hover/5 px-2.5 py-1.5 text-faint">
          <Search size={14} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-transparent text-[13px] text-content outline-none"
            placeholder={unified ? "Поиск по всем ящикам" : "Поиск в аккаунте"}
          />
          {search && (
            <button onClick={() => setSearch("")} className="text-faint hover:text-content">
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      {isLoading ? (
        <ListSkeleton />
      ) : messages.length === 0 ? (
        <div className="flex flex-1 items-center justify-center px-6 text-center text-sm text-muted">
          {searching ? "Ничего не найдено." : "Писем нет. Нажмите «Обновить», чтобы синхронизировать."}
        </div>
      ) : (
        <Virtuoso
          className="flex-1"
          data={messages}
          itemContent={(index, m) => (
            <MessageRow
              message={m}
              index={index}
              showAccount={unified || searching}
              selected={openedUid === m.uid}
              onClick={() => openMessage(m.account_id, m.folder, m.uid)}
            />
          )}
        />
      )}
    </section>
  );
}

function MessageRow({
  message, index, showAccount, selected, onClick,
}: {
  message: MessageListItem;
  index: number;
  showAccount: boolean;
  selected: boolean;
  onClick: () => void;
}) {
  const from = message.from[0];
  const fromName = from?.name || from?.email || "—";
  const accColor = message.account_color || colorFromString(from?.email || "");

  return (
    <motion.div
      // Анимация только для появляющегося видимого окна (Virtuoso рендерит малое число строк).
      initial={listItem.initial}
      animate={listItem.animate}
      transition={{ ...listItem.transition, delay: Math.min(index * 0.012, 0.15) }}
      onClick={onClick}
      className={`cursor-pointer border-b border-sep px-4 py-2.5 transition ${
        selected ? "bg-accent" : "hover:bg-hover/[0.035]"
      }`}
    >
      <div className={`flex items-baseline gap-2 ${selected ? "text-white" : ""}`}>
        {!message.seen && !selected && (
          <span className="mt-1.5 h-2 w-2 flex-none rounded-full bg-accent" />
        )}
        {(message.seen || selected) && <span className="mt-1.5 h-2 w-2 flex-none" />}
        <span className={`flex-1 truncate text-sm font-semibold ${selected ? "text-white" : "text-content"}`}>
          {fromName}
        </span>
        {showAccount && (
          <span className="h-1.5 w-1.5 flex-none rounded-full" style={{ background: accColor }} />
        )}
        <span className={`flex-none text-xs ${selected ? "text-white/80" : "text-faint"}`}>
          {formatListDate(message.date)}
        </span>
      </div>
      <div className={`mt-0.5 flex items-center gap-1.5 pl-4 ${selected ? "text-white" : "text-content"}`}>
        <span className="truncate text-[13.5px]">{message.subject || "(без темы)"}</span>
        {message.has_attachments && (
          <Paperclip size={12} className={selected ? "text-white/70" : "text-faint"} />
        )}
      </div>
      <p className={`mt-0.5 line-clamp-2 pl-4 text-[13px] ${selected ? "text-white/80" : "text-muted"}`}>
        {message.snippet || " "}
      </p>
    </motion.div>
  );
}

function ListSkeleton() {
  return (
    <div className="space-y-1 p-4">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="space-y-2 border-b border-sep py-3">
          <div className="h-3.5 w-1/3 animate-pulse rounded bg-hover/10" />
          <div className="h-3 w-2/3 animate-pulse rounded bg-hover/10" />
          <div className="h-3 w-full animate-pulse rounded bg-hover/5" />
        </div>
      ))}
    </div>
  );
}
