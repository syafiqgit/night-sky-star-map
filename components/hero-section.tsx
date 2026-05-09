import { Sparkles } from "lucide-react";

export default function HeroSection() {
  return (
    <div className="text-center max-w-3xl mx-auto mb-12">
      <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-blue-500/30 bg-blue-500/10 text-blue-400 text-xs font-medium mb-6 hover:bg-blue-500/20 transition-colors">
        <Sparkles size={14} />
        <span>Astronomical Precision</span>
      </div>
      <h1 className="text-5xl md:text-7xl font-bold tracking-tighter text-white mb-6">
        Discover the{" "}
        <span className="text-transparent bg-clip-text bg-linear-to-r from-blue-400 to-indigo-500">
          Unseen Sky
        </span>
      </h1>
      <p className="text-lg text-slate-400 leading-relaxed max-w-2xl mx-auto">
        A high-performance star map rendering real-time celestial positions
        based on your precise location on Earth. Engineered for clarity,
        accuracy, and exploration.
      </p>
    </div>
  );
}
