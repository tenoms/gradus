import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { configureApiSpace } from "./lib/api";
import "./styles/app.css";
configureApiSpace("learning");
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter basename="/learn">
      <App />
    </BrowserRouter>
  </React.StrictMode>,
);
