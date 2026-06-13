import { useRef, useState } from "react";
import { motion } from "framer-motion";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import {
  Bold, ChevronDown, Italic, List, ListOrdered, Paperclip, X,
} from "lucide-react";
import { toast } from "sonner";
import { useAccounts } from "../api/hooks";
import { api } from "../api/client";
import { useUI } from "../stores/ui";
import { formatBytes } from "../lib/format";
import { composerSpring, fadeIn } from "../lib/motion";

interface PendingAttachment {
  filename: string;
  content_type: string;
  size: number;
  content_b64: string;
}

export default function Composer() {
  const { setComposerOpen } = useUI();
  const { data: accounts } = useAccounts();
  const enabled = accounts?.filter((a) => a.enabled) ?? [];

  const [accountId, setAccountId] = useState<number | null>(null);
  const [to, setTo] = useState("");
  const [showCcBcc, setShowCcBcc] = useState(false);
  const [cc, setCc] = useState("");
  const [bcc, setBcc] = useState("");
  const [subject, setSubject] = useState("");
  const [attachments, setAttachments] = useState<PendingAttachment[]>([]);
  const [sending, setSending] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const editor = useEditor({
    extensions: [StarterKit],
    content: "",
    editorProps: {
      attributes: { class: "prose-mail min-h-[180px] outline-none" },
    },
  });

  const fromId = accountId ?? enabled[0]?.id ?? null;

  const addFiles = async (files: FileList | File[]) => {
    const list = Array.from(files);
    const loaded = await Promise.all(
      list.map(
        (f) =>
          new Promise<PendingAttachment>((resolve) => {
            const reader = new FileReader();
            reader.onload = () => {
              const b64 = (reader.result as string).split(",")[1] || "";
              resolve({ filename: f.name, content_type: f.type || "application/octet-stream", size: f.size, content_b64: b64 });
            };
            reader.readAsDataURL(f);
          }),
      ),
    );
    setAttachments((a) => [...a, ...loaded]);
  };

  const send = async () => {
    if (!fromId) return toast.error("Нет доступного аккаунта-отправителя");
    if (!to.trim()) return toast.error("Укажите получателя");
    setSending(true);
    try {
      const html = editor?.getHTML() || "";
      const text = editor?.getText() || "";
      await api.post(`/api/accounts/${fromId}/send`, {
        to: splitAddrs(to),
        cc: splitAddrs(cc),
        bcc: splitAddrs(bcc),
        subject,
        text,
        html,
        attachments: attachments.map(({ filename, content_type, content_b64 }) => ({
          filename, content_type, content_b64,
        })),
      });
      toast.success("Письмо отправлено");
      setComposerOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка отправки");
    } finally {
      setSending(false);
    }
  };

  const field = "w-full bg-transparent text-sm outline-none";

  return (
    <motion.div {...fadeIn} className="fixed inset-0 z-50 flex items-end justify-end bg-black/20 p-4 sm:items-center sm:justify-center">
      <motion.div
        {...composerSpring}
        className="glass-modal flex h-[600px] w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-sep shadow-2xl"
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => { e.preventDefault(); setDragOver(false); if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files); }}
      >
        <div className="flex items-center border-b border-sep px-4 py-3">
          <h2 className="text-sm font-bold">Новое письмо</h2>
          <button onClick={() => setComposerOpen(false)} className="ml-auto rounded-lg p-1 text-muted hover:bg-hover/5">
            <X size={18} />
          </button>
        </div>

        <div className="flex items-center gap-2 border-b border-sep px-4 py-2 text-sm">
          <span className="text-muted">От:</span>
          <select className="flex-1 bg-transparent outline-none" value={fromId ?? ""} onChange={(e) => setAccountId(+e.target.value)}>
            {enabled.map((a) => (
              <option key={a.id} value={a.id}>{a.display_name || a.email} &lt;{a.email}&gt;</option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2 border-b border-sep px-4 py-2">
          <span className="text-sm text-muted">Кому:</span>
          <input className={field} value={to} onChange={(e) => setTo(e.target.value)} autoFocus />
          <button onClick={() => setShowCcBcc((v) => !v)} className="flex items-center gap-0.5 text-xs text-muted">
            Cc/Bcc <ChevronDown size={13} className={showCcBcc ? "rotate-180 transition" : "transition"} />
          </button>
        </div>

        {showCcBcc && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} className="overflow-hidden">
            <div className="flex items-center gap-2 border-b border-sep px-4 py-2">
              <span className="text-sm text-muted">Cc:</span>
              <input className={field} value={cc} onChange={(e) => setCc(e.target.value)} />
            </div>
            <div className="flex items-center gap-2 border-b border-sep px-4 py-2">
              <span className="text-sm text-muted">Bcc:</span>
              <input className={field} value={bcc} onChange={(e) => setBcc(e.target.value)} />
            </div>
          </motion.div>
        )}

        <div className="flex items-center gap-2 border-b border-sep px-4 py-2">
          <span className="text-sm text-muted">Тема:</span>
          <input className={field} value={subject} onChange={(e) => setSubject(e.target.value)} />
        </div>

        {/* Панель форматирования Tiptap */}
        <div className="flex items-center gap-1 border-b border-sep px-3 py-1.5">
          <FmtButton active={editor?.isActive("bold")} onClick={() => editor?.chain().focus().toggleBold().run()}><Bold size={15} /></FmtButton>
          <FmtButton active={editor?.isActive("italic")} onClick={() => editor?.chain().focus().toggleItalic().run()}><Italic size={15} /></FmtButton>
          <FmtButton active={editor?.isActive("bulletList")} onClick={() => editor?.chain().focus().toggleBulletList().run()}><List size={15} /></FmtButton>
          <FmtButton active={editor?.isActive("orderedList")} onClick={() => editor?.chain().focus().toggleOrderedList().run()}><ListOrdered size={15} /></FmtButton>
          <button onClick={() => fileInput.current?.click()} className="ml-auto flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted hover:bg-hover/5">
            <Paperclip size={14} /> Вложить
          </button>
          <input ref={fileInput} type="file" multiple hidden onChange={(e) => e.target.files && addFiles(e.target.files)} />
        </div>

        <div className={`relative flex-1 overflow-y-auto px-4 py-3 ${dragOver ? "ring-2 ring-inset ring-accent" : ""}`}>
          <EditorContent editor={editor} />
          {dragOver && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm font-medium text-accent">
              Отпустите файлы, чтобы вложить
            </div>
          )}
        </div>

        {attachments.length > 0 && (
          <div className="flex flex-wrap gap-2 border-t border-sep px-4 py-2">
            {attachments.map((a, i) => (
              <span key={i} className="flex items-center gap-1.5 rounded-lg border border-sep px-2 py-1 text-xs">
                <Paperclip size={12} /> {a.filename}
                <span className="text-faint">{formatBytes(a.size)}</span>
                <button onClick={() => setAttachments((x) => x.filter((_, j) => j !== i))} className="text-faint hover:text-red-500">
                  <X size={12} />
                </button>
              </span>
            ))}
          </div>
        )}

        <div className="flex items-center border-t border-sep px-4 py-3">
          <button onClick={send} disabled={sending} className="rounded-lg bg-accent px-5 py-2 text-sm font-medium text-white active:scale-95 disabled:opacity-60">
            {sending ? "Отправка…" : "Отправить"}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

function FmtButton({ children, active, onClick }: { children: React.ReactNode; active?: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`flex h-7 w-7 items-center justify-center rounded-md transition ${
        active ? "bg-accent/15 text-accent" : "text-muted hover:bg-hover/5"
      }`}
    >
      {children}
    </button>
  );
}

function splitAddrs(s: string): string[] {
  return s.split(/[,;]/).map((x) => x.trim()).filter(Boolean);
}
