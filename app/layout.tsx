// app/layout.tsx
import "./globals.css";
import "./frontend/styles/tokens.css";
import SessionProviderWrapper from "./frontend/components/SessionProviderWrapper";
import { ThirdwebProvider } from "thirdweb/react";

export const metadata = {
  title: "Dohtective",
  description: "AI Financial Controller for Kenyan SMEs",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <ThirdwebProvider>
          <SessionProviderWrapper>{children}</SessionProviderWrapper>
        </ThirdwebProvider>
      </body>
    </html>
  );
}