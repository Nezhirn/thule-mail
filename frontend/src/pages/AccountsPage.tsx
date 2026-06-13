import { useState } from "react";
import { Link } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft, Check, Loader2, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import {
  useAccounts,
  useAutodetect,
  useCreateAccount,
  useDeleteAccount,
  useTestConnection,
  useUpdateAccount,
} from "../api/hooks";
import { ApiError } from "../api/client";
import type { Account } from "../api/types";
import { composerSpring, fadeIn } from "../lib/motion";

const ACCENT_COLORS = [
  "#0a84ff", "#30d158", "#ff9f0a", "#ff375f",
  "#bf5af2", "#5ac8fa", "#ffd60a", "#64d2ff",
];

interface FormState {
  email: string;
  password: string;
  display_name: string;
  color: string;
  imap_host: string;
  imap_port: number;
  imap_security: string;
  smtp_host: string;
  smtp_port: number;
  smtp_security: string;
}

const EMPTY: FormState = {
  email: "", password: "", display_name: "", color: ACCENT_COLORS[0],
  imap_host: "", imap_port: 993, imap_security: "SSL",
  smtp_host: "", smtp_port: 465, smtp_security: "SSL",
};

export default function AccountsPage() {
  const { data: accounts } = useAccounts();
  const [adding, setAdding] = useState(false);

  return (
    <div className="mx-auto h-full max-w-2xl overflow-y-auto px-6 py-8">
      <div className="mb-6 flex items-center gap-3">
        <Link to="/" className="rounded-lg p-2 text-muted hover:bg-hover/5">
          <ArrowLeft size={18} />
        </Link>
        <h1 className="text-2xl font-bold tracking-tight">Почтовые ящики</h1>
        <button
          onClick={() => setAdding(true)}
          className="ml-auto flex items-center gap-2 rounded-lg bg-accent px-3 py-2 text-sm font-medium text-white active:scale-95"
        >
          <Plus size={16} /> Добавить
        </button>
      </div>

      <div className="space-y-2">
        {accounts?.map((acc) => (
          <AccountRow key={acc.id} account={acc} />
        ))}
        {accounts?.length === 0 && !adding && (
          <p className="py-12 text-center text-sm text-muted">
            Пока нет ни одного ящика. Нажмите «Добавить».
          </p>
        )}
      </div>

      <AnimatePresence>
        {adding && <AccountForm onClose={() => setAdding(false)} />}
      </AnimatePresence>
    </div>
  );
}

function AccountRow({ account }: { account: Account }) {
  const update = useUpdateAccount();
  const del = useDeleteAccount();
  return (
    <div className="glass-panel flex items-center gap-3 rounded-xl border border-sep p-4">
      <span className="h-3 w-3 rounded-full" style={{ background: account.color }} />
      <div className="min-w-0 flex-1">
        <div className="truncate font-medium">{account.display_name || account.email}</div>
        <div className="truncate text-xs text-muted">{account.email} · {account.imap_host}</div>
      </div>
      <button
        onClick={() => update.mutate({ id: account.id, body: { enabled: !account.enabled } })}
        className={`rounded-full px-3 py-1 text-xs font-medium ${
          account.enabled ? "bg-accent/15 text-accent" : "bg-hover/10 text-muted"
        }`}
      >
        {account.enabled ? "Включён" : "Выключен"}
      </button>
      <button
        onClick={() => {
          if (confirm(`Удалить ящик ${account.email}?`)) del.mutate(account.id);
        }}
        className="rounded-lg p-2 text-muted hover:text-red-500"
      >
        <Trash2 size={16} />
      </button>
    </div>
  );
}

function AccountForm({ onClose }: { onClose: () => void }) {
  const [form, setForm] = useState<FormState>(EMPTY);
  const autodetect = useAutodetect();
  const test = useTestConnection();
  const create = useCreateAccount();
  const set = (patch: Partial<FormState>) => setForm((f) => ({ ...f, ...patch }));

  const onEmailBlur = async () => {
    if (!form.email.includes("@")) return;
    try {
      const r = await autodetect.mutateAsync(form.email);
      if (r.detected) {
        set({
          imap_host: r.imap_host || "", imap_port: r.imap_port || 993,
          imap_security: r.imap_security || "SSL",
          smtp_host: r.smtp_host || "", smtp_port: r.smtp_port || 465,
          smtp_security: r.smtp_security || "SSL",
        });
        toast.success(`Настройки для ${r.domain} подставлены автоматически`);
        if (r.note) toast.info(r.note, { duration: 6000 });
      }
    } catch {
      /* молча — пользователь введёт вручную */
    }
  };

  const onTest = async () => {
    try {
      const r = await test.mutateAsync({
        imap_host: form.imap_host, imap_port: form.imap_port,
        imap_security: form.imap_security,
        username: form.email, password: form.password,
      });
      r.ok ? toast.success(r.message) : toast.error(r.message);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Ошибка проверки");
    }
  };

  const onSave = async () => {
    try {
      await create.mutateAsync({ ...form, username: form.email });
      toast.success("Ящик добавлен");
      onClose();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Не удалось сохранить");
    }
  };

  const field = "w-full rounded-lg border border-sep bg-elevated px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-accent/40";

  return (
    <motion.div {...fadeIn} className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
      <motion.div {...composerSpring} className="glass-modal max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-sep p-6 shadow-2xl">
        <div className="mb-4 flex items-center">
          <h2 className="text-lg font-bold">Новый ящик</h2>
          <button onClick={onClose} className="ml-auto rounded-lg p-1.5 text-muted hover:bg-hover/5">
            <X size={18} />
          </button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted">E-mail</label>
            <input className={field} value={form.email} onChange={(e) => set({ email: e.target.value })} onBlur={onEmailBlur} placeholder="you@example.com" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted">Пароль (или пароль приложения)</label>
            <input type="password" className={field} value={form.password} onChange={(e) => set({ password: e.target.value })} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted">Отображаемое имя</label>
            <input className={field} value={form.display_name} onChange={(e) => set({ display_name: e.target.value })} placeholder="Андрей" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted">IMAP-хост</label>
              <input className={field} value={form.imap_host} onChange={(e) => set({ imap_host: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-muted">Порт</label>
                <input type="number" className={field} value={form.imap_port} onChange={(e) => set({ imap_port: +e.target.value })} />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted">Шифр.</label>
                <select className={field} value={form.imap_security} onChange={(e) => set({ imap_security: e.target.value })}>
                  <option>SSL</option><option>STARTTLS</option><option>NONE</option>
                </select>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted">SMTP-хост</label>
              <input className={field} value={form.smtp_host} onChange={(e) => set({ smtp_host: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-muted">Порт</label>
                <input type="number" className={field} value={form.smtp_port} onChange={(e) => set({ smtp_port: +e.target.value })} />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted">Шифр.</label>
                <select className={field} value={form.smtp_security} onChange={(e) => set({ smtp_security: e.target.value })}>
                  <option>SSL</option><option>STARTTLS</option><option>NONE</option>
                </select>
              </div>
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted">Цвет аккаунта</label>
            <div className="flex gap-2">
              {ACCENT_COLORS.map((c) => (
                <button
                  key={c}
                  onClick={() => set({ color: c })}
                  className="flex h-7 w-7 items-center justify-center rounded-full"
                  style={{ background: c }}
                >
                  {form.color === c && <Check size={14} className="text-white" />}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-6 flex gap-2">
          <button onClick={onTest} disabled={test.isPending} className="flex items-center gap-2 rounded-lg border border-sep px-4 py-2 text-sm font-medium hover:bg-hover/5">
            {test.isPending ? <Loader2 size={15} className="animate-spin" /> : null}
            Проверить
          </button>
          <button onClick={onSave} disabled={create.isPending} className="ml-auto rounded-lg bg-accent px-5 py-2 text-sm font-medium text-white active:scale-95 disabled:opacity-60">
            Сохранить
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
