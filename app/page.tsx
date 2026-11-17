import { ForestBackground } from "@/components/landing/ForestBackground";
import { LoginScreen } from "@/components/landing/LoginScreen";

export default function HomePage() {
  return (
    <div className="relative min-h-screen overflow-hidden">
      <ForestBackground />
      <LoginScreen />
    </div>
  );
}
