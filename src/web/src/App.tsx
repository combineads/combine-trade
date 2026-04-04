import { Route, Routes } from "react-router";
import { Layout } from "./components/Layout.tsx";
import { DashboardPage } from "./pages/DashboardPage.tsx";
import { LoginPage } from "./pages/LoginPage.tsx";

function Trades() {
  return (
    <main id="main" className="flex min-h-screen items-center justify-center">
      <h1 className="text-2xl font-semibold text-foreground">거래 내역</h1>
    </main>
  );
}

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<Layout />}>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/trades" element={<Trades />} />
      </Route>
    </Routes>
  );
}
