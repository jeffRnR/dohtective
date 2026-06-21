// app/layout.tsx
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