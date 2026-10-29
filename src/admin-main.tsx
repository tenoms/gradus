import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import AdminApp from "./apps/AdminApp";
import { configureApiSpace } from "./lib/api";
import "./styles/app.css";
configureApiSpace("admin");
ReactDOM.createRoot(document.getElementById("root")!).render(<React.StrictMode><BrowserRouter basename="/admin"><AdminApp /></BrowserRouter></React.StrictMode>);
