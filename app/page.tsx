import HeroSection from "@/components/hero-section";
import LocationPrompt from "@/components/location-prompt";
import StarfieldCanvas from "@/components/starfield-canvas";

export default function HomePage() {
  return (
    <main className="relative min-h-screen w-full bg-[#020617] overflow-hidden">
      {/* Animated starfield — purely decorative, aria-hidden */}
      <StarfieldCanvas />

      {/* Ambient glows */}
      <div
        aria-hidden="true"
        className="absolute -top-24 -left-24 w-96 h-96 bg-blue-500/10 rounded-full blur-[120px] pointer-events-none"
      />
      <div
        aria-hidden="true"
        className="absolute -bottom-24 -right-24 w-96 h-96 bg-indigo-500/10 rounded-full blur-[120px] pointer-events-none"
      />

      {/* Content */}
      <div className="relative z-10 flex flex-col items-center justify-center px-4 pt-20 pb-10">
        <HeroSection />
        <LocationPrompt />
      </div>
    </main>
  );
}
