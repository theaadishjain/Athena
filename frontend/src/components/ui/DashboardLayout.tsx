"use client";

import Sidebar from "./Sidebar";

interface DashboardLayoutProps {
  children: React.ReactNode;
}

export default function DashboardLayout({ children }: DashboardLayoutProps) {
  return (
    <div className="sidebar-layout">
      <Sidebar />
      <main className="sidebar-main bg-background">{children}</main>
    </div>
  );
}
