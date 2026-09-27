import { Routes, Route, Navigate } from "react-router-dom";
import HomePage from "./pages/HomePage";
import ChatPage from "./pages/ChatPage";
import AskPage from "./pages/AskPage";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/triage" element={<ChatPage />} />
      <Route path="/chat" element={<AskPage />} />
      {/* Old paths */}
      <Route path="/ask" element={<Navigate to="/chat" replace />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
