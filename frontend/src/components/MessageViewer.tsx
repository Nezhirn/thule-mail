import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import DOMPurify from "dompurify";
import {
  CornerUpLeft, CornerUpRight, Forward, ImageOff, Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { useMessage, useMessageActions } from "../api/hooks";
import { useUI } from "../stores/ui";
import { encodeFolder } from "../api/client";
import type { Attachment, FullMessage } from "../api/types";
import {
  colorFromString, formatBytes, formatFullDate, initialsFromName,
} from "../lib/format";
import { slideInRight } from "../lib/motion";

export default function MessageViewer() {
  const { openedAccountId, openedFolder, openedUid } = useUI();
  const { data, isLoading } = useMessage(openedAccountId, openedFolder, openedUid);

  return (
    <section className="glass-panel flex h-full flex-col overflow-hidden">
      <AnimatePresence mode="wait">
        {openedUid == null ? (
          <motion.div
            key="empty"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex h-full items-center justify-center text-sm text-muted"
          >
            Выберите письмо для просмотра
          </motion.div>
        ) : isLoading || !data ? (
          <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex h-full items-center justify-center text-sm text-muted">
            Загрузка письма…
          </motion.div>
        ) : (
          <motion.div key={openedUid} {...slideInRight} className="flex h-full flex-col">
            <MessageContent message={data} />
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}

function MessageContent({ message }: { message: FullMessage }) {
  const [showImages, setShowImages] = useState(false);
  const actions = useMessageActions();
  const { closeMessage } = useUI();

  const { html, hadExternal } = useMemo(
    () => sanitizeBody(message, showImages),
    [message, showImages],
  );

  const fromName = parseFromName(message.from);
  const avatarColor = colorFromString(message.from);

  const onDelete = () => {
    actions.remove.mutate(
      { accountId: message.account_id, folder: message.folder, uid: message.uid },
      {
        onSuccess: () => {
          toast.success("Письмо удалено");
          closeMessage();
        },
        onError: () => toast.error("Не удалось удалить"),
      },
    );
  };

  return (
    <>
      <div className="glass-bar flex items-center gap-1 border-b border-sep px-4 py-2">
        <ToolButton icon={<CornerUpLeft size={16} />} title="Ответить" />
        <ToolButton icon={<CornerUpRight size={16} />} title="Ответить всем" />
        <ToolButton icon={<Forward size={16} />} title="Переслать" />
        <div className="mx-2 h-4 w-px bg-separator/15" />
        <ToolButton icon={<Trash2 size={16} />} title="Удалить" onClick={onDelete} />
      </div>

      <div className="flex-1 overflow-y-auto px-8 py-6">
        <h1 className="text-[22px] font-bold leading-tight tracking-tight">
          {message.subject || "(без темы)"}
        </h1>

        <div className="mt-4 flex items-center gap-3">
          <div
            className="flex h-10 w-10 flex-none items-center justify-center rounded-full text-base font-semibold text-white"
            style={{ background: avatarColor }}
          >
            {initialsFromName(fromName, message.from)}
          </div>
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold">{fromName}</div>
            <div className="truncate text-xs text-muted">Кому: {message.to || "—"}</div>
          </div>
          <div className="ml-auto flex-none text-xs text-faint">
            {formatFullDate(message.date)}
          </div>
        </div>

        {hadExternal && !showImages && (
          <div className="mt-4 flex items-center gap-2.5 rounded-lg border border-amber-300/60 bg-amber-50 px-3.5 py-2.5 text-[13px] text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
            <ImageOff size={15} />
            Внешние изображения заблокированы для защиты приватности.
            <button
              onClick={() => setShowImages(true)}
              className="ml-auto rounded-md border border-amber-400/60 bg-surface px-2.5 py-1 text-xs font-medium"
            >
              Показать изображения
            </button>
          </div>
        )}

        <BodyFrame html={html} />

        {message.attachments.length > 0 && (
          <div className="mt-6 flex flex-wrap gap-2.5">
            {message.attachments.map((a) => (
              <AttachmentCard key={a.part} attachment={a} message={message} />
            ))}
          </div>
        )}
      </div>
    </>
  );
}

function BodyFrame({ html }: { html: string }) {
  // Изолированный sandbox-iframe: внешние ресурсы режутся CSP, скрипты запрещены.
  const srcDoc = useMemo(
    () => `<!DOCTYPE html><html><head><meta charset="utf-8">
      <meta http-equiv="Content-Security-Policy"
            content="default-src 'none'; img-src data: cid: https:; style-src 'unsafe-inline'; font-src data:;">
      <base target="_blank">
      <style>
        html,body{background:#fff;}
        body{font-family:-apple-system,BlinkMacSystemFont,'SF Pro Text',Inter,'Segoe UI',sans-serif;
             font-size:15px;line-height:1.6;color:#2a2a2c;margin:0;padding:14px 16px;word-wrap:break-word;
             border-radius:12px;}
        a{color:#0a84ff;} img{max-width:100%;height:auto;}
      </style></head><body>${html}</body></html>`,
    [html],
  );

  return (
    <iframe
      title="Тело письма"
      sandbox="allow-popups allow-popups-to-escape-sandbox"
      srcDoc={srcDoc}
      className="mt-4 w-full"
      style={{ minHeight: 300, border: "none" }}
      onLoad={(e) => {
        // Подгоняем высоту под контент.
        const f = e.currentTarget;
        try {
          const h = f.contentWindow?.document.body.scrollHeight;
          if (h) f.style.height = `${h + 20}px`;
        } catch {
          /* cross-origin — оставляем minHeight */
        }
      }}
    />
  );
}

function AttachmentCard({ attachment, message }: { attachment: Attachment; message: FullMessage }) {
  const url = `/api/accounts/${message.account_id}/messages/${message.uid}/attachments/${attachment.part}` +
    `?folder=${encodeFolder(message.folder)}&filename=${encodeURIComponent(attachment.filename)}` +
    `&content_type=${encodeURIComponent(attachment.content_type)}`;
  return (
    <a
      href={url}
      download={attachment.filename}
      className="flex items-center gap-2.5 rounded-lg border border-sep px-3 py-2 text-[13px] hover:bg-hover/5"
    >
      <span className="flex h-8 w-8 items-center justify-center rounded-md bg-accent text-white">
        📄
      </span>
      <span>
        <span className="block font-medium">{attachment.filename}</span>
        <span className="block text-[11px] text-faint">{formatBytes(attachment.size)}</span>
      </span>
    </a>
  );
}

function ToolButton({ icon, title, onClick }: { icon: React.ReactNode; title: string; onClick?: () => void }) {
  return (
    <button
      onClick={onClick}
      title={title}
      className="flex h-8 w-9 items-center justify-center rounded-lg text-muted transition hover:bg-hover/5 hover:text-content"
    >
      {icon}
    </button>
  );
}

// ── helpers ──────────────────────────────────────────────────────────────
function parseFromName(from: string): string {
  const m = from.match(/^\s*"?([^"<]+?)"?\s*<.+>/);
  if (m) return m[1].trim();
  return from.replace(/[<>]/g, "").trim();
}

function sanitizeBody(message: FullMessage, showImages: boolean): { html: string; hadExternal: boolean } {
  if (message.html) {
    // Перехватываем внешние img: если картинки скрыты — вырезаем src.
    let hadExternal = false;
    DOMPurify.addHook("uponSanitizeAttribute", (_node, data) => {
      if (data.attrName === "src" && /^https?:\/\//i.test(data.attrValue)) {
        hadExternal = true;
        if (!showImages) data.keepAttr = false;
      }
    });
    const clean = DOMPurify.sanitize(message.html, {
      FORBID_TAGS: ["script", "style", "iframe", "object", "embed"],
      FORBID_ATTR: ["onerror", "onload", "onclick"],
    });
    DOMPurify.removeAllHooks();
    return { html: clean, hadExternal };
  }
  // Plain text fallback.
  const text = (message.text || "").replace(/[<>&]/g, (c) =>
    ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c] || c),
  );
  return { html: `<pre style="white-space:pre-wrap;font-family:inherit">${text}</pre>`, hadExternal: false };
}
