import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import LearningApp from "./LearningApp";
import { configureApiSpace } from "../../shared/api/client";
import InteractionProvider from "../../shared/ui/dialogs/InteractionProvider";
import { trackInputModality } from "../../shared/lib/input-modality";
import "../styles/app.css";
import "../../shared/theme/theme.css";
configureApiSpace("learning");
trackInputModality(document);
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <InteractionProvider><BrowserRouter basename="/learn">
      <LearningApp />
    </BrowserRouter></InteractionProvider>
  </React.StrictMode>,
);
