import { Routes, Route, Navigate } from "react-router-dom";
import ChatPage from "./pages/ChatPage";
import AskPage from "./pages/AskPage";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<ChatPage />} />
      <Route path="/ask" element={<AskPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
