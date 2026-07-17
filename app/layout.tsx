import { Suspense } from "react";
import "./globals.css";
import "./frontend/styles/tokens.css";
import SessionProviderWrapper from "./frontend/components/SessionProviderWrapper";
import LandingFooter from "./frontend/components/LandingFooter";
import Loader from "./frontend/components/Loader";

export const metadata = {
  title: "Dohtective",
  description: "AI Financial Controller for Kenyan SMEs",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
          <SessionProviderWrapper>
            <main style={{ flex: 1 }}>
              <Suspense fallback={<Loader />}>{children}</Suspense>
            </main>
          </SessionProviderWrapper>
          <LandingFooter />
        </div>
      </body>
    </html>
  );
}