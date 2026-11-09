import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { AppearanceProvider } from "./Appearance";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import "./index.css";
import "./Appearance.css";

const router = createBrowserRouter([{ path: "*", element: <App /> }]);
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <AppearanceProvider><RouterProvider router={router} /></AppearanceProvider>
  </React.StrictMode>
);
