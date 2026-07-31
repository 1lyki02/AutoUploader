import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { bootstrapTelegram, waitForInitData } from "./telegram";
import "./index.css";

bootstrapTelegram();

async function mount() {
  // Give Telegram a moment to inject initData before the first API call.
  await waitForInitData();
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

void mount();
