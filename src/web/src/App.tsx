import { Route, Routes } from "react-router";

function Home() {
  return (
    <main id="main" className="flex min-h-screen items-center justify-center">
      <h1 className="text-2xl font-semibold text-primary-500">combine-trade</h1>
    </main>
  );
}

function Login() {
  return (
    <main id="main" className="flex min-h-screen items-center justify-center">
      <h1 className="text-2xl font-semibold text-foreground">Login</h1>
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
      <Route path="/" element={<Home />} />
      <Route path="/login" element={<Login />} />
      <Route path="/trades" element={<Trades />} />
    </Routes>
  );
}
