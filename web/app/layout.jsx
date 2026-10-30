import { IBM_Plex_Sans_Condensed, Spectral } from "next/font/google";
import Shell from "@/components/Shell.jsx";
import "./globals.css";

// Fonts are downloaded at build time and served locally: no requests to Google while you use the app.
const ui = IBM_Plex_Sans_Condensed({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-ui" });
const serif = Spectral({ subsets: ["latin"], weight: ["400", "600"], style: ["normal", "italic"], variable: "--font-serif" });

export const metadata = {
  title: { default: "Indicis", template: "%s · Indicis" },
  description: "Your notes as a slip box of linked index cards, on your own computer.",
};

// Apply the saved light/dark choice before the first paint, so the page never flashes the wrong theme.
const themeScript = `try{var t=JSON.parse(localStorage.getItem("kg-theme"));if(t)document.documentElement.dataset.theme=t}catch(e){}`;

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={`${ui.variable} ${serif.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <Shell>{children}</Shell>
      </body>
    </html>
  );
}
