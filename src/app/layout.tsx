import type { Metadata } from "next";
import "@/app/globals.css";
import { SiteHeader } from "@/components/site-header";

export const metadata: Metadata = {
  title: { default: "MacroFast — Fast Food Macros Tracker", template: "%s | MacroFast" },
  description: "Find high-protein fast-food choices by calories, macros, and protein efficiency using transparent official nutrition sources.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <SiteHeader />
        <main>{children}</main>
        <footer className="site-footer">
          <div className="shell footer-inner">
            <span>MacroFast</span>
            <p>Nutrition varies by location and customization. Verify dietary decisions with the linked official source.</p>
            <a href="/admin/data-health">Data health</a>
          </div>
        </footer>
      </body>
    </html>
  );
}
