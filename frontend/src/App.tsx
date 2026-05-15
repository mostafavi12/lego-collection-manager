import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";

import { Layout } from "./components/Layout";
import { ImportPage } from "./pages/ImportPage";
import { OwnedSetDetailPage } from "./pages/OwnedSetDetailPage";
import { OwnedSetsPage } from "./pages/OwnedSetsPage";
import { SearchPage } from "./pages/SearchPage";
import "./App.css";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<OwnedSetsPage />} />
          <Route path="sets/:id" element={<OwnedSetDetailPage />} />
          <Route path="search" element={<SearchPage />} />
          <Route path="import" element={<ImportPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
