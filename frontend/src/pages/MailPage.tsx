import { AnimatePresence, motion } from "framer-motion";
import { ArrowLeft } from "lucide-react";
import Sidebar from "../components/Sidebar";
import MessageList from "../components/MessageList";
import MessageViewer from "../components/MessageViewer";
import Composer from "../components/Composer";
import { useUI } from "../stores/ui";
import { fadeIn } from "../lib/motion";

export default function MailPage() {
  const { composerOpen, openedUid, closeMessage } = useUI();

  return (
    <div className="grid h-full grid-cols-[auto_minmax(320px,400px)_1fr]">
      {/* Sidebar сам управляет шириной (свёрнут/развёрнут) */}
      <div className="max-md:hidden">
        <Sidebar />
      </div>

      {/* Список писем */}
      <div className="min-w-0 max-md:col-span-full">
        <MessageList />
      </div>

      {/* Просмотр: на десктопе третья колонка, на узких — оверлей */}
      <div className="min-w-0 max-lg:hidden">
        <MessageViewer />
      </div>

      <AnimatePresence>
        {openedUid != null && (
          <motion.div
            {...fadeIn}
            className="fixed inset-0 z-30 hidden bg-surface max-lg:block"
          >
            <button
              onClick={closeMessage}
              className="absolute left-3 top-3 z-10 flex items-center gap-1 rounded-lg bg-elevated px-3 py-1.5 text-sm shadow"
            >
              <ArrowLeft size={16} /> Назад
            </button>
            <MessageViewer />
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>{composerOpen && <Composer />}</AnimatePresence>
    </div>
  );
}
