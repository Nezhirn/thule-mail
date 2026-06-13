import { Navigate, Route, Routes } from "react-router-dom";
import { useSession } from "./api/hooks";
import LoginPage from "./pages/LoginPage";
import MailPage from "./pages/MailPage";
import AccountsPage from "./pages/AccountsPage";

function Loading() {
  return (
    <div className="flex h-full items-center justify-center text-muted">
      Загрузка…
    </div>
  );
}

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { data, isLoading, isError } = useSession();
  if (isLoading) return <Loading />;
  if (isError || !data?.authenticated) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/accounts"
        element={
          <RequireAuth>
            <AccountsPage />
          </RequireAuth>
        }
      />
      <Route
        path="/"
        element={
          <RequireAuth>
            <MailPage />
          </RequireAuth>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
