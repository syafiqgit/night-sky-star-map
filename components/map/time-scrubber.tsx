"use client";

import {
  useState,
  useEffect,
  useRef,
} from "react";

import {
  Play,
  Pause,
  RotateCcw,
  FastForward,
  Calendar,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";

interface TimeScrubberProps {
  time: Date;

  onTimeChange: React.Dispatch<
    React.SetStateAction<Date>
  >;
}

export default function TimeScrubber({
  time,
  onTimeChange,
}: TimeScrubberProps) {
  const [isAutoPlay, setIsAutoPlay] =
    useState(false);

  const [speedMultiplier, setSpeedMultiplier] =
    useState(1);

  const [isDragging, setIsDragging] =
    useState(false);

  const currentFractionalHour =
    time.getHours() +
    time.getMinutes() / 60 +
    time.getSeconds() / 3600;

  const handleSliderChange = (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const val = parseFloat(e.target.value);

    const totalSeconds = Math.floor(
      val * 3600
    );

    const hours = Math.floor(
      totalSeconds / 3600
    );

    const minutes = Math.floor(
      (totalSeconds % 3600) / 60
    );

    const seconds =
      totalSeconds % 60;

    onTimeChange((prev) => {
      const newDate = new Date(prev);

      newDate.setHours(
        hours,
        minutes,
        seconds,
        0
      );

      return newDate;
    });
  };

  const shiftDays = (
    daysOffset: number
  ) => {
    onTimeChange((prev) => {
      const newDate = new Date(prev);

      newDate.setDate(
        newDate.getDate() + daysOffset
      );

      return newDate;
    });
  };

  const handleReset = () => {
    setIsAutoPlay(false);

    setSpeedMultiplier(1);

    onTimeChange(new Date());
  };

  const lastTickRef =
    useRef<number>(0);

  const requestRef =
    useRef<number>(0);

  useEffect(() => {
    if (!isAutoPlay || isDragging) {
      if (requestRef.current) {
        cancelAnimationFrame(
          requestRef.current
        );
      }

      lastTickRef.current = 0;

      return;
    }

    const animate = (now: number) => {
      if (!lastTickRef.current) {
        lastTickRef.current = now;
      }

      const deltaMs =
        now - lastTickRef.current;

      lastTickRef.current = now;

      onTimeChange((prevTime) => {
        return new Date(
          prevTime.getTime() +
            deltaMs *
              speedMultiplier *
              100
        );
      });

      requestRef.current =
        requestAnimationFrame(
          animate
        );
    };

    requestRef.current =
      requestAnimationFrame(
        animate
      );

    return () => {
      if (requestRef.current) {
        cancelAnimationFrame(
          requestRef.current
        );
      }
    };
  }, [
    isAutoPlay,
    isDragging,
    speedMultiplier,
    onTimeChange,
  ]);

  return (
    <div
      className="
        absolute
        left-1/2
        z-50
        w-full
        -translate-x-1/2
        px-3
        bottom-[max(env(safe-area-inset-bottom),12px)]

        sm:bottom-8
        sm:max-w-3xl
        sm:px-4
      "
    >
      <div
        className="
          rounded-2xl
          border border-white/10
          bg-slate-950/80
          p-3
          shadow-[0_0_30px_rgba(0,0,0,0.5)]
          backdrop-blur-xl

          sm:p-4
        "
      >
        {/* TOP */}
        <div
          className="
            flex flex-col gap-3

            sm:flex-row
            sm:items-center
            sm:justify-between
          "
        >
          {/* Controls */}
          <div
            className="
              flex flex-wrap items-center gap-2
            "
          >
            <button
              title="Play/Pause Simulation"
              onClick={() =>
                setIsAutoPlay(
                  !isAutoPlay
                )
              }
              className={`
                flex h-10 w-10 items-center justify-center
                rounded-xl border
                transition-all

                sm:h-auto sm:w-auto sm:p-2

                ${
                  isAutoPlay
                    ? "border-blue-500/50 bg-blue-500/20 text-blue-400 shadow-[0_0_15px_rgba(59,130,246,0.3)]"
                    : "border-white/10 bg-white/5 text-slate-300 hover:bg-white/10"
                }
              `}
            >
              {isAutoPlay ? (
                <Pause size={16} />
              ) : (
                <Play size={16} />
              )}
            </button>

            <button
              title="Reset to Real-Time"
              onClick={handleReset}
              className="
                flex h-10 w-10 items-center justify-center
                rounded-xl border border-white/10
                bg-white/5 text-slate-300
                transition-colors
                hover:bg-white/10

                sm:h-auto sm:w-auto sm:p-2
              "
            >
              <RotateCcw size={16} />
            </button>

            <button
              title="Time Speed"
              onClick={() =>
                setSpeedMultiplier(
                  (prev) =>
                    prev === 1
                      ? 10
                      : prev === 10
                        ? 100
                        : 1
                )
              }
              className="
                flex h-10 items-center gap-1.5
                rounded-xl border border-white/10
                bg-white/5
                px-3
                text-xs font-mono text-slate-300
                transition-colors
                hover:bg-white/10
              "
            >
              <FastForward size={14} />

              {speedMultiplier}x
            </button>
          </div>

          {/* Date */}
          <div
            className="
              flex items-center justify-between
              rounded-xl border border-white/10
              bg-white/5
              p-1

              sm:justify-center
            "
          >
            <button
              title="Kembali 1 Hari"
              onClick={() =>
                shiftDays(-1)
              }
              className="
                rounded-lg p-2
                text-slate-400
                transition-colors
                hover:text-blue-400
              "
            >
              <ChevronLeft size={16} />
            </button>

            <div
              className="
                flex min-w-0 flex-1 items-center justify-center gap-2
                px-2
                text-center
                text-[11px]
                font-mono text-slate-300

                sm:min-w-35
                sm:flex-none
                sm:text-xs
              "
            >
              <Calendar
                size={14}
                className="shrink-0 text-slate-500"
              />

              <span className="truncate">
                {time.toLocaleDateString(
                  "id-ID",
                  {
                    day: "2-digit",
                    month: "short",
                    year: "numeric",
                  }
                )}
              </span>
            </div>

            <button
              title="Maju 1 Hari"
              onClick={() =>
                shiftDays(1)
              }
              className="
                rounded-lg p-2
                text-slate-400
                transition-colors
                hover:text-blue-400
              "
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>

        {/* SLIDER */}
        <div
          className="
            mt-4
            flex items-center gap-2

            sm:gap-4
          "
        >
          <div
            className="
              w-9 shrink-0
              text-right
              font-mono
              text-[10px]
              text-slate-500

              sm:w-10
              sm:text-[11px]
            "
          >
            00:00
          </div>

          <input
            type="range"
            min="0"
            max="24"
            step="0.05"
            value={currentFractionalHour}
            onChange={
              handleSliderChange
            }
            onMouseDown={() =>
              setIsDragging(true)
            }
            onMouseUp={() =>
              setIsDragging(false)
            }
            onTouchStart={() =>
              setIsDragging(true)
            }
            onTouchEnd={() =>
              setIsDragging(false)
            }
            className="
              h-2 flex-1
              cursor-grab appearance-none
              rounded-lg bg-slate-800
              focus:outline-none
              focus:ring-1 focus:ring-blue-500/50
              active:cursor-grabbing

              [&::-webkit-slider-thumb]:h-5
              [&::-webkit-slider-thumb]:w-5
              [&::-webkit-slider-thumb]:appearance-none
              [&::-webkit-slider-thumb]:rounded-full
              [&::-webkit-slider-thumb]:bg-blue-400
              [&::-webkit-slider-thumb]:shadow-[0_0_12px_rgba(96,165,250,0.8)]

              sm:[&::-webkit-slider-thumb]:h-4
              sm:[&::-webkit-slider-thumb]:w-4
            "
          />

          <div
            className="
              w-9 shrink-0
              font-mono
              text-[10px]
              text-slate-500

              sm:w-10
              sm:text-[11px]
            "
          >
            23:59
          </div>
        </div>
      </div>
    </div>
  );
}