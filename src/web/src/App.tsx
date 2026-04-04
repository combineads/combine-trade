import { Route, Routes } from "react-router";
import { Layout } from "./components/Layout.tsx";
import { LoginPage } from "./pages/LoginPage.tsx";

function Home() {
  return (
    <main id="main" className="flex min-h-screen items-center justify-center">
      <h1 className="text-2xl font-semibold text-primary-500">combine-trade</h1>
    </main>
  );
}

function Trades() {
  return (
    <main id="main" className="flex min-h-screen items-center justify-center">
      <h1 className="text-2xl font-semibold text-foreground">Trades</h1>
    </main>
  );
}

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<Layout />}>
        <Route path="/" element={<Home />} />
        <Route path="/trades" element={<Trades />} />
      </Route>
    </Routes>
  );
}
