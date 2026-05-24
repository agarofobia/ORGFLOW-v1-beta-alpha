import { DashboardSidebar } from "@/components/dashboard/sidebar";
import { DashboardTopbar } from "@/components/dashboard/topbar";
import { ToastProvider } from "@/components/ui/toast";
import { ErrorBoundary } from "@/components/ui/error-boundary";
import { CommandPalette } from "@/components/ui/command-palette";
import { MobileNavProvider } from "@/components/dashboard/mobile-nav-context";
import { ConfirmDialogProvider } from "@/components/ui/confirm-dialog";
import AiChatWidget from "@/components/dashboard/ai-chat-widget";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ToastProvider>
      <ConfirmDialogProvider>
        <MobileNavProvider>
          <div className="flex h-screen overflow-hidden" style={{ background: "var(--c-bg-base)" }}>
            <DashboardSidebar />
            <div className="flex flex-1 flex-col overflow-hidden">
              <DashboardTopbar />
              <main className="flex-1 overflow-y-auto">
                <ErrorBoundary>{children}</ErrorBoundary>
              </main>
            </div>
          </div>
          {/* Command palette global — Ctrl+K / Cmd+K en cualquier lado del dashboard */}
          <CommandPalette />
          {/* Asistente IA flotante — se auto-oculta si la org no lo configuró o el user no tiene permiso */}
          <AiChatWidget />
        </MobileNavProvider>
      </ConfirmDialogProvider>
    </ToastProvider>
  );
}
