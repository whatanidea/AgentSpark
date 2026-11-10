import React from "react";
import ReactDOM from "react-dom/client";
import { flushSync } from "react-dom";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import App from "./App";
import { AppearanceProvider } from "./Appearance";
import type PublicLanding from "./components/Landing";
import "./index.css";
import "./Appearance.css";

export function mount(publicLanding?: typeof PublicLanding) {
  const router = createBrowserRouter([{ path: "*", element: <App publicLanding={publicLanding} /> }]);
  const root = ReactDOM.createRoot(document.getElementById("root")!);
  const content =
    <React.StrictMode>
      <AppearanceProvider><RouterProvider router={router} /></AppearanceProvider>
    </React.StrictMode>;
  // Only public documents need a synchronous static-to-interactive handoff.
  if (publicLanding) flushSync(() => root.render(content));
  else root.render(content);
}
