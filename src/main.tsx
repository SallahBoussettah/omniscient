import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { FloatingBar } from "./windows/FloatingBar";
import "./styles/app.css";

const isFloatingBar =
  new URLSearchParams(window.location.search).get("window") === "floating";

if (isFloatingBar) {
  // Make the host transparent so only our styled content paints.
  // (The default body background is opaque dark from app.css)
  document.documentElement.classList.add("floating-host");
  document.body.classList.add("floating-host");
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>{isFloatingBar ? <FloatingBar /> : <App />}</StrictMode>
);
