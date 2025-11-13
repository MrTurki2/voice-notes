import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Voice Notes - تفريغ صوتي فوري بالذكاء الاصطناعي",
  description: "تطبيق احترافي لتفريغ الملاحظات الصوتية بالعربية والإنجليزية باستخدام Groq Whisper و Google Gemini. تفريغ فوري، كشف صوتي ذكي (VAD)، ودعم متعدد الوسائط.",
  keywords: ["تفريغ صوتي", "voice transcription", "whisper", "groq", "gemini", "arabic transcription", "AI", "voice notes", "تحويل صوت لنص"],
  authors: [{ name: "Mr Turki" }],
  openGraph: {
    title: "Voice Notes - تفريغ صوتي فوري",
    description: "تطبيق احترافي لتفريغ الملاحظات الصوتية بالذكاء الاصطناعي",
    type: "website",
    locale: "ar_SA",
  },
  twitter: {
    card: "summary_large_image",
    title: "Voice Notes - تفريغ صوتي فوري",
    description: "تطبيق احترافي لتفريغ الملاحظات الصوتية بالذكاء الاصطناعي",
  },
  robots: {
    index: true,
    follow: true,
  },
  viewport: {
    width: "device-width",
    initialScale: 1,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ar" dir="rtl">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
