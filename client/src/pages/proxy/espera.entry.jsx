import "../../index.css";
import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import WaitRoom from "../../components/WaitRoom/WaitRoom";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <WaitRoom />
    </BrowserRouter>
  </React.StrictMode>,
);
