import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { DashboardSidebar } from "@/components/dashboard/sidebar";
import { DashboardTopbar } from "@/components/dashboard/topbar";
import { ToastProvider } from "@/components/ui/toast";
import { ErrorBoundary } from "@/components/ui/error-boundary";
import { CommandPalette } from "@/components/ui/command-palette";
import { MobileNavProvider } from "@/components/dashboard/mobile-nav-context";
import { ConfirmDialogProvider } from "@/components/ui/confirm-dialog";
import AiChatWidget from "@/components/dashboard/ai-chat-widget";
import OnboardingWizard from "@/components/dashboard/onboarding-wizard";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { userId, orgId } = await auth();
  if (!userId) redirect("/sign-in");
  if (!orgId) redirect("/select-org");

  return (
    <ToastProvider>
      <ConfirmDialogProvider>
        <MobileNavProvider>
          <div className="flo-grid-bg flex h-screen flex-col overflow-hidden">
            <div className="flex flex-1 overflow-hidden">
              <DashboardSidebar />
              <div className="flex flex-1 flex-col overflow-hidden">
                <DashboardTopbar />
                <main className="flex-1 overflow-y-auto">
                  <ErrorBoundary>{children}</ErrorBoundary>
                </main>
              </div>
            </div>
          </div>
          {/* Command palette global — Ctrl+K / Cmd+K en cualquier lado del dashboard */}
          <CommandPalette />
          {/* Asistente IA flotante — se auto-oculta si la org no lo configuró o el user no tiene permiso */}
          <AiChatWidget />
          {/* Onboarding wizard — solo aparece si la org está vacía y el user no apretó "skip forever" */}
          <OnboardingWizard />
        </MobileNavProvider>
      </ConfirmDialogProvider>
    </ToastProvider>
  );
}
