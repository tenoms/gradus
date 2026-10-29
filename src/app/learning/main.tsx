import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import LearningApp from "./LearningApp";
import { configureApiSpace } from "../../shared/api/client";
import InteractionProvider from "../../shared/ui/dialogs/InteractionProvider";
import "../styles/app.css";
import "../../shared/theme/theme.css";
configureApiSpace("learning");
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <InteractionProvider><BrowserRouter basename="/learn">
      <LearningApp />
    </BrowserRouter></InteractionProvider>
  </React.StrictMode>,
);
