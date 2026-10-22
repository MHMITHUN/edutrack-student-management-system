import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "EduTrack | Student Management System",
    template: "%s | EduTrack",
  },
  description:
    "EduTrack — a student information system for schools: marks, GPA, attendance, notices, analytics and an audit trail. EduTrack Demo School, academic year 2026.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="flex min-h-screen flex-col">
        {children}
      </body>
    </html>
  );
}
