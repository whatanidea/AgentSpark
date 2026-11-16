import { useState } from "react";
import { createRoot } from "react-dom/client";
import AzureDevOpsConnector from "../../src/components/AzureDevOpsConnector";
import { setAccessToken } from "../../src/api";

setAccessToken("fictional-app-access-token");
const sourceToken = async () => "fictional-source-access-token-for-ui-tests";

function Harness() {
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [opened, setOpened] = useState("");
  return <main>
    <p role="status">{busy ? "Harness busy" : "Harness ready"} / {dirty ? "Unsaved" : "Saved"}</p>
    {opened ? <h1>Opened discovery {opened}</h1> : <AzureDevOpsConnector onBusyChange={setBusy}
      onUnsavedChange={setDirty} onOpenDiscovery={setOpened} acquireToken={sourceToken} />}
  </main>;
}

const root = document.getElementById("root");
if (!root) throw new Error("Missing test harness root.");
createRoot(root).render(<Harness />);
