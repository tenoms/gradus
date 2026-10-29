import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import LearningApp from "./LearningApp";
import { configureApiSpace } from "../../shared/api/client";
import "../styles/app.css";
configureApiSpace("learning");
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter basename="/learn">
      <LearningApp />
    </BrowserRouter>
  </React.StrictMode>,
);
