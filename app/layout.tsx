import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "The Law Office of Isa Abdur-Rahman, PLLC",
  description:
    "Real Estate, Business Law, and Family Estates attorney serving New York since 2004.",
};

// Set the saved theme before paint to avoid a flash of the wrong theme.
const themeScript = `
(function(){
  try {
    var t = localStorage.getItem('wadr-theme');
    if (t === 'dark') document.documentElement.setAttribute('data-theme','dark');
  } catch (e) {}
})();
`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
