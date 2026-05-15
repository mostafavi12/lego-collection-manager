import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";

import { Layout } from "./components/Layout";
import { AddSetPage } from "./pages/AddSetPage";
import { ImportPage } from "./pages/ImportPage";
import { SetDetailPage } from "./pages/SetDetailPage";
import { SetsListPage } from "./pages/SetsListPage";
import { SearchPage } from "./pages/SearchPage";
import "./App.css";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<SetsListPage />} />
          <Route path="sets/:id" element={<SetDetailPage />} />
          <Route path="search" element={<SearchPage />} />
          <Route path="add" element={<AddSetPage />} />
          <Route path="import" element={<ImportPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
