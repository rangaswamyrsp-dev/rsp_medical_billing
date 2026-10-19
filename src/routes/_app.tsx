import { createFileRoute, Outlet, redirect, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { AppSidebar } from "@/components/app/AppSidebar";
import { AppHeader } from "@/components/app/AppHeader";
import { ChatHelpFab } from "@/components/app/ChatHelpFab";
import { getUser } from "@/lib/auth";
import { useFeatures } from "@/lib/tenant";

export const Route = createFileRoute("/_app")({
  beforeLoad: () => {
    if (typeof window !== "undefined" && !getUser()) {
      throw redirect({ to: "/login" });
    }
  },
  component: AppLayout,
});

function AppLayout() {
  const features = useFeatures();
  const navigate = useNavigate();

  useEffect(() => {
    const handleGlobalShortcuts = (e: KeyboardEvent) => {
      // Toggle sidebar collapse: Ctrl + B
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "b") {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent("rsp:toggle-sidebar"));
        return;
      }

      // Help Assistant: F1
      if (e.key === "F1") {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent("rsp:open-chat"));
        return;
      }

      // New Bill / Billing Navigation: F2 (handled specifically if on billing, otherwise navigates to /)
      if (e.key === "F2") {
        e.preventDefault();
        navigate({ to: "/" });
        // Also notify billing page if already there
        window.dispatchEvent(new CustomEvent("rsp:shortcut-f2"));
        return;
      }

      // Focus Search: F3
      if (e.key === "F3") {
        e.preventDefault();
        const medSearch = document.getElementById("medicine-search-input");
        const globalSearch = document.getElementById("global-search-input");
        if (medSearch) {
          medSearch.focus();
        } else if (globalSearch) {
          globalSearch.focus();
        }
        return;
      }

      // Inventory: F7
      if (e.key === "F7") {
        e.preventDefault();
        navigate({ to: "/inventory" });
        return;
      }

      // Purchase: F8
      if (e.key === "F8") {
        e.preventDefault();
        navigate({ to: "/purchase" });
        return;
      }
    };

    window.addEventListener("keydown", handleGlobalShortcuts);
    return () => window.removeEventListener("keydown", handleGlobalShortcuts);
  }, [navigate]);

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background">
      <AppSidebar />
      <div className="flex flex-1 flex-col min-w-0">
        <AppHeader />
        <main className="flex-1 overflow-auto">
          <Outlet />
        </main>
      </div>
      {features.helpAssistant && <ChatHelpFab />}
    </div>
  );
}

