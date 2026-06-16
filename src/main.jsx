import React from "react";
import { createRoot } from "react-dom/client";
import { asyncWithLDProvider } from "launchdarkly-react-client-sdk";
import App from "./App.jsx";
import "./styles.css";

const clientSideID = import.meta.env.VITE_LD_CLIENT_ID;

const fallbackContext = {
  kind: "user",
  key: "demo-anonymous",
  name: "Demo Visitor",
  email: "demo@example.com",
  plan: "free",
  companySize: 20,
  region: "US",
  betaAccess: false
};

async function render() {
  const root = createRoot(document.getElementById("root"));

  if (!clientSideID) {
    root.render(<App launchDarklyReady={false} />);
    return;
  }

  const LDProvider = await asyncWithLDProvider({
    clientSideID,
    context: fallbackContext,
    reactOptions: {
      useCamelCaseFlagKeys: false
    },
    options: {
      streaming: true
    }
  });

  root.render(
    <LDProvider>
      <App launchDarklyReady />
    </LDProvider>
  );
}

render();
