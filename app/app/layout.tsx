import { Sidebar } from "@/components/layout/Sidebar";
import { MainContent } from "@/components/layout/MainContent";
import { ArtifactsPanel } from "@/components/layout/ArtifactsPanel";

export default function AppLayout() {
  return (
    <div className="flex h-dvh w-full gap-3 overflow-hidden p-3">
      <Sidebar />
      <MainContent />
      <ArtifactsPanel />
    </div>
  );
}
