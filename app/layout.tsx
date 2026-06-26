// app/layout.tsx
// ThirdwebProvider removed from root — it was initializing wallet connectors
// on every page including landing, dashboard, businesses etc. causing slow
// loads everywhere. It now lives only inside the pricing page where it's needed.

import "./globals.css";
import "./frontend/styles/tokens.css";
import SessionProviderWrapper from "./frontend/components/SessionProviderWrapper";

export const metadata = {
  title: "Dohtective",
  description: "AI Financial Controller for Kenyan SMEs",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <SessionProviderWrapper>{children}</SessionProviderWrapper>
      </body>
    </html>
  );
}