import { useCallback, useEffect, useState } from "react";
import BottomNav from "./components/BottomNav";
import type { Fund } from "./types";
import Funds from "./pages/Funds";
import FundDetail from "./pages/FundDetail";
import Home from "./pages/Home";
import Profile from "./pages/Profile";
import Search from "./pages/Search";
import Portfolio from "./pages/Portfolio";

type ViewKey = "home" | "funds" | "search" | "profile" | "fund-detail" | "portfolio";
type ThemeMode = "light" | "dark";
const THEME_STORAGE_KEY = "foncu_theme";

export default function App() {
  const [view, setView] = useState<ViewKey>("home");
  const [selectedFund, setSelectedFund] = useState<Fund | null>(null);
  const [theme, setTheme] = useState<ThemeMode>(() => {
    try {
      return localStorage.getItem(THEME_STORAGE_KEY) === "dark" ? "dark" : "light";
    } catch {
      return "light";
    }
  });

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;

    try {
      localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      // Ignore storage errors and keep the in-memory preference.
    }
  }, [theme]);

  useEffect(() => {
    const handleStorage = (event: StorageEvent) => {
      if (event.key !== THEME_STORAGE_KEY) return;
      setTheme(event.newValue === "dark" ? "dark" : "light");
    };

    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme((currentTheme) => (currentTheme === "light" ? "dark" : "light"));
  }, []);

  const goToFund = (fund: Fund) => {
    setSelectedFund(fund);
    setView("fund-detail");
  };

  const viewContent = () => {
    if (view === "home") {
      return (
        <Home
          onSelectFund={goToFund}
          onNavigate={() => setView("portfolio")}
          theme={theme}
          onToggleTheme={toggleTheme}
        />
      );
    }
    if (view === "funds") {
      return <Funds onSelectFund={goToFund} />;
    }
    if (view === "fund-detail") {
      return <FundDetail fund={selectedFund} onBack={() => setView("funds")} />;
    }
    if (view === "search") {
      return <Search />;
    }
    if (view === "profile") {
      return (
        <Profile
          onNavigate={() => setView("portfolio")}
          theme={theme}
          onToggleTheme={toggleTheme}
        />
      );
    }
    if (view === "portfolio") {
      return <Portfolio onBack={() => setView("home")} />;
    }
    return null;
  };

  return (
    <main className="app">
      <div className="app__glow" aria-hidden="true" />

      <section className="page-shell" key={view} data-view={view}>
        {viewContent()}
      </section>

      <BottomNav
        active={view}
        onChange={(next) => setView(next)}
      />
    </main>
  );
}
