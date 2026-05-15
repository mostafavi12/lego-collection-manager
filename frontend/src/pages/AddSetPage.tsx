import { useNavigate } from "react-router-dom";

import { AddSetWizard } from "../components/AddSetWizard";

export function AddSetPage() {
  const navigate = useNavigate();

  return (
    <AddSetWizard
      onClose={() => navigate(-1)}
      onCreated={(id) => navigate(`/sets/${id}`)}
    />
  );
}
