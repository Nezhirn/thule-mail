import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Mail } from "lucide-react";
import { toast } from "sonner";
import { useLogin } from "../api/hooks";
import { ApiError } from "../api/client";
import { composerSpring } from "../lib/motion";

export default function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const login = useLogin();
  const navigate = useNavigate();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await login.mutateAsync({ username, password });
      navigate("/");
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : "Не удалось войти";
      toast.error(msg);
    }
  };

  return (
    <div className="flex h-full items-center justify-center px-4">
      <motion.form
        {...composerSpring}
        onSubmit={submit}
        className="glass-modal w-full max-w-sm rounded-2xl border border-sep p-8 shadow-2xl"
      >
        <div className="mb-6 flex flex-col items-center gap-3">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-accent text-white">
            <Mail size={28} />
          </div>
          <h1 className="text-xl font-bold tracking-tight">ThuleMail</h1>
          <p className="text-sm text-muted">Вход в почтовый агрегатор</p>
        </div>

        <label className="mb-1 block text-xs font-medium text-muted">Логин</label>
        <input
          className="mb-4 w-full rounded-lg border border-sep bg-elevated px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-accent/40"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          autoFocus
        />

        <label className="mb-1 block text-xs font-medium text-muted">Пароль</label>
        <input
          type="password"
          className="mb-6 w-full rounded-lg border border-sep bg-elevated px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-accent/40"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />

        <button
          type="submit"
          disabled={login.isPending}
          className="w-full rounded-lg bg-accent py-2.5 text-sm font-medium text-white transition active:scale-[0.98] disabled:opacity-60"
        >
          {login.isPending ? "Входим…" : "Войти"}
        </button>
      </motion.form>
    </div>
  );
}
