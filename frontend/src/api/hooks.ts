import { useEffect } from "react";
import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import { api, encodeFolder } from "./client";
import type {
  Account,
  AutodetectResult,
  Folder,
  FullMessage,
  MessageList,
  TestConnectionResult,
} from "./types";

function updateFlag(flags: string[], flag: string, add: boolean) {
  const next = new Set(flags);
  if (add) next.add(flag);
  else next.delete(flag);
  return Array.from(next).sort();
}

function patchCollectionSeen<T extends { messages: MessageList["messages"] }>(
  data: T | undefined,
  accountId: number,
  folder: string,
  uid: number,
  seen: boolean,
): T | undefined {
  if (!data) return data;
  let changed = false;
  const messages = data.messages.map((m) => {
    if (m.account_id !== accountId || m.folder !== folder || m.uid !== uid) return m;
    changed = true;
    return { ...m, seen, flags: updateFlag(m.flags, "\\Seen", seen) };
  });
  return changed ? { ...data, messages } : data;
}

function patchSeenCaches(
  qc: QueryClient,
  accountId: number,
  folder: string,
  uid: number,
  seen: boolean,
) {
  qc.setQueriesData<MessageList>(
    { queryKey: ["messages"] },
    (data) => patchCollectionSeen(data, accountId, folder, uid, seen),
  );
  qc.setQueryData<MessageList>(
    ["unified"],
    (data) => patchCollectionSeen(data, accountId, folder, uid, seen),
  );
  qc.setQueriesData<{ messages: MessageList["messages"]; count: number }>(
    { queryKey: ["search"] },
    (data) => patchCollectionSeen(data, accountId, folder, uid, seen),
  );
  qc.setQueryData<FullMessage>(
    ["message", accountId, folder, uid],
    (data) => data
      ? { ...data, seen, flags: updateFlag(data.flags, "\\Seen", seen) }
      : data,
  );
}

function removeFromCollection<T extends { messages: MessageList["messages"] }>(
  data: T | undefined,
  accountId: number,
  folder: string,
  uids: number[],
): T | undefined {
  if (!data) return data;
  const uidSet = new Set(uids);
  const messages = data.messages.filter(
    (m) => m.account_id !== accountId || m.folder !== folder || !uidSet.has(m.uid),
  );
  return messages.length === data.messages.length ? data : { ...data, messages };
}

function removeMessageCaches(
  qc: QueryClient,
  accountId: number,
  folder: string,
  uids: number[],
) {
  qc.setQueriesData<MessageList>(
    { queryKey: ["messages"] },
    (data) => removeFromCollection(data, accountId, folder, uids),
  );
  qc.setQueryData<MessageList>(
    ["unified"],
    (data) => removeFromCollection(data, accountId, folder, uids),
  );
  qc.setQueriesData<{ messages: MessageList["messages"]; count: number }>(
    { queryKey: ["search"] },
    (data) => removeFromCollection(data, accountId, folder, uids),
  );
  uids.forEach((uid) => qc.removeQueries({ queryKey: ["message", accountId, folder, uid] }));
}

// ── Сессия ──────────────────────────────────────────────────────────────
export function useSession() {
  return useQuery({
    queryKey: ["session"],
    queryFn: () => api.get<{ authenticated: boolean; user: string | null }>("/api/auth/me"),
    retry: false,
    staleTime: 60_000,
  });
}

export function useLogin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (creds: { username: string; password: string }) =>
      api.post("/api/auth/login", creds),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["session"] }),
  });
}

export function useLogout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post("/api/auth/logout"),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["session"] }),
  });
}

// ── Аккаунты ────────────────────────────────────────────────────────────
export function useAccounts() {
  return useQuery({
    queryKey: ["accounts"],
    queryFn: () => api.get<Account[]>("/api/accounts"),
  });
}

export function useAutodetect() {
  return useMutation({
    mutationFn: (email: string) =>
      api.get<AutodetectResult>(`/api/accounts/autodetect?email=${encodeURIComponent(email)}`),
  });
}

export function useTestConnection() {
  return useMutation({
    mutationFn: (body: {
      imap_host: string;
      imap_port: number;
      imap_security: string;
      username: string;
      password: string;
    }) => api.post<TestConnectionResult>("/api/accounts/test", body),
  });
}

export function useCreateAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) => api.post<Account>("/api/accounts", body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["accounts"] }),
  });
}

export function useUpdateAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: number; body: Record<string, unknown> }) =>
      api.patch<Account>(`/api/accounts/${id}`, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["accounts"] }),
  });
}

export function useDeleteAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.delete(`/api/accounts/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["accounts"] }),
  });
}

// ── Папки ───────────────────────────────────────────────────────────────
export function useFolders(accountId: number | null) {
  return useQuery({
    queryKey: ["folders", accountId],
    queryFn: () => api.get<Folder[]>(`/api/accounts/${accountId}/folders`),
    enabled: accountId != null,
  });
}

export interface FolderLayoutItem {
  folder: string;
  alias: string | null;
  sort_order: number;
  pinned: boolean;
  hidden: boolean;
}

export function useUpdateFolderLayout(accountId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (items: FolderLayoutItem[]) =>
      api.patch(`/api/accounts/${accountId}/folders/layout`, { items }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["folders", accountId] }),
  });
}

// ── Поиск ────────────────────────────────────────────────────────────────
export function useSearch(query: string, accountId: number | null, scope: "account" | "all") {
  return useQuery({
    queryKey: ["search", query, accountId, scope],
    queryFn: () => {
      const params = new URLSearchParams({ q: query, scope });
      if (accountId != null && scope === "account") params.set("account_id", String(accountId));
      return api.get<{ messages: MessageList["messages"]; count: number }>(
        `/api/search?${params.toString()}`,
      );
    },
    enabled: query.trim().length > 0,
  });
}

// ── Список писем ────────────────────────────────────────────────────────
export function useUnifiedMessages() {
  return useQuery({
    queryKey: ["unified"],
    queryFn: () => api.get<MessageList>("/api/unified/messages?limit=100"),
    refetchInterval: 60_000,
  });
}

export function useFolderMessages(accountId: number | null, folder: string | null) {
  return useQuery({
    queryKey: ["messages", accountId, folder],
    queryFn: () =>
      api.get<MessageList>(
        `/api/accounts/${accountId}/messages?folder=${encodeFolder(folder!)}&limit=100`,
      ),
    enabled: accountId != null && folder != null,
    refetchInterval: 60_000,
  });
}

// ── Одно письмо ─────────────────────────────────────────────────────────
export function useMessage(
  accountId: number | null,
  folder: string | null,
  uid: number | null,
) {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: ["message", accountId, folder, uid],
    queryFn: () =>
      api.get<FullMessage>(
        `/api/accounts/${accountId}/messages/${uid}?folder=${encodeFolder(folder!)}&mark_seen=true`,
      ),
    enabled: accountId != null && folder != null && uid != null,
  });

  useEffect(() => {
    if (!query.data?.seen) return;
    // Оптимистично помечаем письмо прочитанным во всех списках/кэшах.
    // Широкие invalidate здесь убраны намеренно: они вызывали рефетч всех
    // списков и живой IMAP LIST (/folders) на КАЖДОЕ открытие письма.
    // Счётчики папок освежает фоновый поллинг.
    patchSeenCaches(qc, query.data.account_id, query.data.folder, query.data.uid, true);
  }, [qc, query.data?.account_id, query.data?.folder, query.data?.uid, query.data?.seen]);

  return query;
}

// ── Действия с письмом ──────────────────────────────────────────────────
export function useMessageActions() {
  const qc = useQueryClient();
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["messages"] });
    qc.invalidateQueries({ queryKey: ["unified"] });
    qc.invalidateQueries({ queryKey: ["folders"] });
  };
  return {
    setFlags: useMutation({
      mutationFn: ({
        accountId,
        folder,
        uid,
        flags,
        add,
      }: {
        accountId: number;
        folder: string;
        uid: number;
        flags: string[];
        add: boolean;
      }) =>
        api.post(
          `/api/accounts/${accountId}/messages/${uid}/flags?folder=${encodeFolder(folder)}`,
          { flags, add },
        ),
      onSuccess: (_data, vars) => {
        if (vars.flags.includes("\\Seen")) {
          patchSeenCaches(qc, vars.accountId, vars.folder, vars.uid, vars.add);
        }
        invalidate();
      },
    }),
    remove: useMutation({
      mutationFn: ({
        accountId,
        folder,
        uid,
      }: {
        accountId: number;
        folder: string;
        uid: number;
      }) =>
        api.delete(
          `/api/accounts/${accountId}/messages/${uid}?folder=${encodeFolder(folder)}`,
        ),
      onSuccess: invalidate,
    }),
    bulkSetFlags: useMutation({
      mutationFn: ({
        accountId,
        folder,
        uids,
        flags,
        add,
      }: {
        accountId: number;
        folder: string;
        uids: number[];
        flags: string[];
        add: boolean;
      }) =>
        api.post<{ affected: number }>(
          `/api/accounts/${accountId}/messages/bulk/flags?folder=${encodeFolder(folder)}`,
          { uids, flags, add },
        ),
      onSuccess: (_data, vars) => {
        if (vars.flags.includes("\\Seen")) {
          vars.uids.forEach((uid) =>
            patchSeenCaches(qc, vars.accountId, vars.folder, uid, vars.add),
          );
        }
        invalidate();
      },
    }),
    bulkRemove: useMutation({
      mutationFn: ({
        accountId,
        folder,
        uids,
      }: {
        accountId: number;
        folder: string;
        uids: number[];
      }) =>
        api.post<{ affected: number }>(
          `/api/accounts/${accountId}/messages/bulk/delete?folder=${encodeFolder(folder)}`,
          { uids },
        ),
      onSuccess: (_data, vars) => {
        removeMessageCaches(qc, vars.accountId, vars.folder, vars.uids);
        invalidate();
      },
    }),
    sync: useMutation({
      mutationFn: ({ accountId, folder }: { accountId: number; folder: string }) =>
        api.post(`/api/accounts/${accountId}/sync?folder=${encodeFolder(folder)}`),
      onSuccess: invalidate,
    }),
    markAllRead: useMutation({
      mutationFn: ({ accountId, folder }: { accountId: number; folder: string }) =>
        api.post<{ affected: number }>(
          `/api/accounts/${accountId}/messages/mark_all_read?folder=${encodeFolder(folder)}`,
        ),
      onSuccess: invalidate,
    }),
    markAllUnread: useMutation({
      mutationFn: ({ accountId, folder }: { accountId: number; folder: string }) =>
        api.post<{ affected: number }>(
          `/api/accounts/${accountId}/messages/mark_all_unread?folder=${encodeFolder(folder)}`,
        ),
      onSuccess: invalidate,
    }),
  };
}
