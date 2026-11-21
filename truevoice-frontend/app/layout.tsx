import type { Metadata } from "next";
import { IBM_Plex_Sans, Source_Serif_4 } from "next/font/google";
import "./globals.css";

const sans = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-sans",
});
const serif = Source_Serif_4({ subsets: ["latin"], variable: "--font-serif" });

export const metadata: Metadata = {
  metadataBase: new URL("https://www.thetruevoice.xyz"),
  title: {
    default: "TrueVoice | Brand Governance Before Publishing",
    template: "%s | TrueVoice",
  },
  description:
    "Review marketing drafts against approved brand guidelines, facts, pricing and campaign details before publishing. Human reviewers stay in control.",
  applicationName: "TrueVoice",
  keywords: [
    "brand governance",
    "content compliance",
    "pre-publication review",
    "marketing content review",
    "brand consistency",
    "claim verification",
  ],
  verification: {
    google: "PeX4XooZbbHyb5ya6t0KBB0m4_y3XSVwoavy_tRaM9g",
  },
  openGraph: {
    type: "website",
    siteName: "TrueVoice",
    title: "TrueVoice | Check it before you publish it",
    description:
      "A pre-publication workspace for reviewing content against approved brand information, with human decisions at the center.",
    url: "https://www.thetruevoice.xyz/",
  },
  twitter: {
    card: "summary",
    title: "TrueVoice | Check it before you publish it",
    description:
      "Review marketing drafts against approved facts and brand rules before publishing.",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${serif.variable}`}>
      <body>{children}</body>
    </html>
  );
}
