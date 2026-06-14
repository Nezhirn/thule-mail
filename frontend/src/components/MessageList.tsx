import { memo, useEffect, useMemo, useState } from "react";
import { Virtuoso } from "react-virtuoso";
import {
  Check, CheckCheck, Mail, MailOpen, Paperclip, RefreshCw, Search, Trash2, X,
} from "lucide-react";
import { toast } from "sonner";
import {
  useAccounts, useFolderMessages, useMessageActions, useSearch, useUnifiedMessages,
} from "../api/hooks";
import { useUI } from "../stores/ui";
import type { MessageListItem } from "../api/types";
import { formatListDate, colorFromString } from "../lib/format";
import { localizeFolderName } from "../lib/folders";

function messageKey(message: Pick<MessageListItem, "account_id" | "folder" | "uid">) {
  return `${message.account_id}\u0000${message.folder}\u0000${message.uid}`;
}

function messageSeen(message: MessageListItem) {
  return Boolean(message.seen || message.flags.includes("\\Seen"));
}

function groupMessages(messages: MessageListItem[]) {
  const groups = new Map<string, {
    accountId: number;
    folder: string;
    uids: number[];
  }>();
  messages.forEach((m) => {
    const key = `${m.account_id}\u0000${m.folder}`;
    const group = groups.get(key) ?? { accountId: m.account_id, folder: m.folder, uids: [] };
    group.uids.push(m.uid);
    groups.set(key, group);
  });
  return Array.from(groups.values());
}

export default function MessageList() {
  const {
    selection, openedAccountId, openedFolder, openedUid, openMessage, search, setSearch,
  } = useUI();
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
  const { data: accounts } = useAccounts();
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());

  const searching = debounced.trim().length > 0;
  const listQuery = unified ? unifiedQ : folderQ;
  const activeQuery = searching ? searchQ : listQuery;
  const messages = activeQuery.data?.messages ?? [];
  const isLoading = activeQuery.isLoading;
  const isFetching = activeQuery.isFetching;
  const isError = activeQuery.isError;
  const title = searching
    ? "Результаты поиска"
    : unified ? "Объединённый входящий" : localizeFolderName(selection.folder);
  const unreadCount = messages.filter((m) => !messageSeen(m)).length;
  const readCount = messages.length - unreadCount;
  const selectedMessages = useMemo(
    () => messages.filter((m) => selectedKeys.has(messageKey(m))),
    [messages, selectedKeys],
  );
  const allVisibleSelected = messages.length > 0 && selectedMessages.length === messages.length;
  const selectedPending = actions.bulkSetFlags.isPending || actions.bulkRemove.isPending;

  useEffect(() => {
    setSelectedKeys(new Set());
  }, [selection, debounced]);

  const toggleSelected = (message: MessageListItem) => {
    const key = messageKey(message);
    setSelectedKeys((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toggleAllVisible = () => {
    setSelectedKeys((current) => {
      if (allVisibleSelected) return new Set();
      const next = new Set(current);
      messages.forEach((m) => next.add(messageKey(m)));
      return next;
    });
  };

  const onSync = async () => {
    try {
      if (!unified) {
        await actions.sync.mutateAsync({
          accountId: selection.accountId,
          folder: selection.folder,
        });
      } else {
        // Реальная синхронизация INBOX всех включённых аккаунтов, затем обновление.
        const targets = (accounts ?? []).filter((a) => a.enabled);
        await Promise.allSettled(
          targets.map((a) => actions.sync.mutateAsync({ accountId: a.id, folder: "INBOX" })),
        );
        await unifiedQ.refetch();
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка синхронизации");
    }
  };

  const onMarkAllSeen = async (seen: boolean) => {
    try {
      if (unified) {
        const targets = (accounts ?? []).filter((a) => a.enabled);
        await Promise.all(
          targets.map((a) =>
            (seen ? actions.markAllRead : actions.markAllUnread)
              .mutateAsync({ accountId: a.id, folder: "INBOX" }),
          ),
        );
      } else {
        await (seen ? actions.markAllRead : actions.markAllUnread).mutateAsync({
          accountId: selection.accountId,
          folder: selection.folder,
        });
      }
      toast.success(seen ? "Все письма отмечены прочитанными" : "Все письма отмечены непрочитанными");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Не удалось отметить");
    }
  };

  const onSelectedSeen = async (seen: boolean) => {
    try {
      const groups = groupMessages(selectedMessages);
      await Promise.all(
        groups.map((group) =>
          actions.bulkSetFlags.mutateAsync({
            accountId: group.accountId,
            folder: group.folder,
            uids: group.uids,
            flags: ["\\Seen"],
            add: seen,
          }),
        ),
      );
      setSelectedKeys(new Set());
      toast.success(seen ? "Выбранные письма отмечены прочитанными" : "Выбранные письма отмечены непрочитанными");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Не удалось изменить выбранные письма");
    }
  };

  const onSelectedDelete = async () => {
    try {
      const groups = groupMessages(selectedMessages);
      await Promise.all(
        groups.map((group) =>
          actions.bulkRemove.mutateAsync({
            accountId: group.accountId,
            folder: group.folder,
            uids: group.uids,
          }),
        ),
      );
      setSelectedKeys(new Set());
      toast.success("Выбранные письма удалены");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Не удалось удалить выбранные письма");
    }
  };

  return (
    <section className="glass-panel flex h-full flex-col overflow-hidden border-r border-sep">
      <div className="glass-bar border-b border-sep px-4 pb-2.5 pt-3">
        <div className="flex items-center gap-2">
          <h2 className="truncate text-[17px] font-bold tracking-tight">{title}</h2>
          {!searching && messages.length > 0 && (
            <div className="ml-auto flex items-center gap-1">
              <button
                onClick={() => onMarkAllSeen(true)}
                disabled={actions.markAllRead.isPending || unreadCount === 0}
                className="rounded-lg p-1.5 text-muted hover:bg-hover/5 disabled:opacity-40"
                title="Отметить все прочитанными"
              >
                <CheckCheck size={16} />
              </button>
              <button
                onClick={() => onMarkAllSeen(false)}
                disabled={actions.markAllUnread.isPending || readCount === 0}
                className="rounded-lg p-1.5 text-muted hover:bg-hover/5 disabled:opacity-40"
                title="Отметить все непрочитанными"
              >
                <Mail size={16} />
              </button>
            </div>
          )}
          <button
            onClick={onSync}
            className={`${!searching && messages.length > 0 ? "" : "ml-auto"} rounded-lg p-1.5 text-muted hover:bg-hover/5`}
            title="Обновить"
          >
            <RefreshCw size={15} className={isFetching || actions.sync.isPending ? "animate-spin" : ""} />
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
        {selectedMessages.length > 0 && (
          <div className="mt-2 flex items-center gap-1.5 rounded-lg bg-accent/10 px-2 py-1.5">
            <button
              onClick={toggleAllVisible}
              className="mr-1 flex h-7 w-7 items-center justify-center rounded-md hover:bg-accent/10"
              title={allVisibleSelected ? "Снять выделение" : "Выделить все видимые"}
            >
              <span
                className={`flex h-[18px] w-[18px] items-center justify-center rounded-full border transition ${
                  allVisibleSelected ? "border-accent bg-accent text-white" : "border-accent/60 text-transparent"
                }`}
              >
                <Check size={11} strokeWidth={3.5} />
              </span>
            </button>
            <span className="min-w-0 flex-1 truncate text-xs font-medium text-accent">
              Выбрано: {selectedMessages.length}
            </span>
            <BulkButton
              icon={<MailOpen size={15} />}
              title="Отметить выбранные прочитанными"
              disabled={selectedPending}
              onClick={() => onSelectedSeen(true)}
            />
            <BulkButton
              icon={<Mail size={15} />}
              title="Отметить выбранные непрочитанными"
              disabled={selectedPending}
              onClick={() => onSelectedSeen(false)}
            />
            <BulkButton
              icon={<Trash2 size={15} />}
              title="Удалить выбранные"
              disabled={selectedPending}
              onClick={onSelectedDelete}
            />
            <BulkButton
              icon={<X size={15} />}
              title="Снять выделение"
              disabled={selectedPending}
              onClick={() => setSelectedKeys(new Set())}
            />
          </div>
        )}
      </div>

      {isLoading ? (
        <ListSkeleton />
      ) : isError && messages.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center text-sm text-muted">
          Не удалось загрузить письма.
          <button onClick={() => activeQuery.refetch()} className="rounded-lg bg-accent px-4 py-1.5 text-white">
            Повторить
          </button>
        </div>
      ) : messages.length === 0 ? (
        <div className="flex flex-1 items-center justify-center px-6 text-center text-sm text-muted">
          {searching ? "Ничего не найдено." : "Писем нет. Нажмите «Обновить», чтобы синхронизировать."}
        </div>
      ) : (
        <Virtuoso
          className="flex-1"
          data={messages}
          itemContent={(_index, m) => (
            <MessageRow
              message={m}
              showAccount={unified || searching}
              selected={
                openedAccountId === m.account_id &&
                openedFolder === m.folder &&
                openedUid === m.uid
              }
              selectedForAction={selectedKeys.has(messageKey(m))}
              selectionActive={selectedMessages.length > 0}
              onClick={() => openMessage(m.account_id, m.folder, m.uid)}
              onToggleSelected={() => toggleSelected(m)}
            />
          )}
        />
      )}
    </section>
  );
}

const MessageRow = memo(function MessageRow({
  message, showAccount, selected, selectedForAction, selectionActive,
  onClick, onToggleSelected,
}: {
  message: MessageListItem;
  showAccount: boolean;
  selected: boolean;
  selectedForAction: boolean;
  selectionActive: boolean;
  onClick: () => void;
  onToggleSelected: () => void;
}) {
  const from = message.from[0];
  const fromName = from?.name || from?.email || "—";
  const accColor = message.account_color || colorFromString(from?.email || "");
  const seen = messageSeen(message);
  const revealCheck = selectionActive || selectedForAction;

  // Без построчной entrance-анимации: Virtuoso перемонтирует строки при скролле,
  // и initial→animate переигрывался бы постоянно (джанк). Появление списка
  // целиком анимируется на уровне колонки.
  return (
    <div
      onClick={onClick}
      className={`group relative cursor-pointer border-b border-sep py-2.5 pl-5 pr-4 transition ${
        selected ? "bg-accent" : selectedForAction ? "bg-accent/[0.08]" : "hover:bg-hover/[0.035]"
      }`}
    >
      {showAccount && !selected && (
        <span
          className="absolute left-0 top-2 bottom-2 w-[3px] rounded-r-full"
          style={{ background: accColor }}
        />
      )}
      <div className={`flex items-baseline gap-2.5 ${selected ? "text-white" : ""}`}>
        <span className="relative mt-0.5 flex h-[18px] w-[18px] flex-none items-center justify-center self-start">
          {!seen && !selected && (
            <span
              className={`h-2 w-2 rounded-full bg-accent transition-opacity ${
                revealCheck ? "opacity-0" : "group-hover:opacity-0"
              }`}
            />
          )}
          <button
            onClick={(e) => { e.stopPropagation(); onToggleSelected(); }}
            title="Выделить письмо"
            className={`absolute inset-0 flex items-center justify-center rounded-full border transition ${
              selectedForAction
                ? "border-accent bg-accent text-white"
                : selected
                ? "border-white/50 text-transparent hover:bg-white/10"
                : "border-faint/60 text-transparent hover:border-accent"
            } ${revealCheck ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`}
          >
            <Check size={11} strokeWidth={3.5} />
          </button>
        </span>
        <span
          className={`flex-1 truncate text-sm ${
            seen && !selected ? "font-normal" : "font-semibold"
          } ${selected ? "text-white" : seen ? "text-muted" : "text-content"}`}
        >
          {fromName}
        </span>
        <span className={`flex-none text-xs ${selected ? "text-white/80" : "text-faint"}`}>
          {formatListDate(message.date)}
        </span>
      </div>
      <div className={`mt-0.5 flex items-center gap-1.5 pl-[28px] ${selected ? "text-white" : seen ? "text-muted" : "text-content"}`}>
        <span className={`truncate text-[13.5px] ${seen ? "" : "font-medium"}`}>{message.subject || "(без темы)"}</span>
        {message.has_attachments && (
          <Paperclip size={12} className={selected ? "text-white/70" : "text-faint"} />
        )}
      </div>
      <p className={`mt-0.5 line-clamp-2 pl-[28px] text-[13px] ${selected ? "text-white/80" : "text-muted"}`}>
        {message.snippet || " "}
      </p>
    </div>
  );
});

function BulkButton({
  icon, title, disabled, onClick,
}: { icon: React.ReactNode; title: string; disabled?: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className="flex h-7 w-7 items-center justify-center rounded-md text-accent transition hover:bg-accent/10 disabled:pointer-events-none disabled:opacity-40"
    >
      {icon}
    </button>
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
