import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles.css";

const THEME_STORAGE_KEY = "foncu_theme";

try {
  const savedTheme = localStorage.getItem(THEME_STORAGE_KEY);
  document.documentElement.dataset.theme = savedTheme === "dark" ? "dark" : "light";
} catch {
  document.documentElement.dataset.theme = "light";
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
