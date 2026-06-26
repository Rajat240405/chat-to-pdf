"use client";

import { useState, useEffect } from "react";

import { CheckCircle2, Loader2, X } from "lucide-react";
import { mockProcessingSteps } from "@/lib/mock-data";

interface ProcessingCardProps {
  autoRedirect?: boolean;
}

export default function ProcessingCard({
  autoRedirect = true,
}: ProcessingCardProps) {
  
  const [progress, setProgress] = useState(0);
  const [steps, setSteps] = useState(mockProcessingSteps);
  const [done, setDone] = useState(false);

  // Advance the progress bar at ~80 ms per tick (100 ticks = ~8 s total)
  useEffect(() => {
    const interval = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 100) {
          clearInterval(interval);
          return 100;
        }
        return prev + 1;
      });
    }, 80);

    return () => clearInterval(interval);
  }, []);

  // When progress hits 100: mark all steps completed, then redirect
  useEffect(() => {
    if (progress >= 100 && !done && autoRedirect) {
      setDone(true);
      // Mark the last active step as completed so the UI shows ✓ before redirect
      setSteps((prev) =>
        prev.map((s) =>
          s.status === "active" ? { ...s, status: "completed" as const, detail: "Success" } : s
        )
      );
      // 1 s delay lets the user see 100 % and green checkmarks before navigating
      
    }
  }, [progress, done]);

  return (
    <div className="mx-auto w-full max-w-xl rounded-lg border border-gray-200 bg-white p-8 shadow-sm">
      <div className="flex flex-col items-center text-center">
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-blue-50">
          {done ? (
            <CheckCircle2 className="h-6 w-6 text-emerald-500" />
          ) : (
            <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
          )}
        </div>
        <h2 className="text-xl font-semibold text-gray-900">
          {done ? "Processing Complete!" : "Processing Document"}
        </h2>
        <p className="mt-1 text-sm text-gray-500">
          {done
            ? "Redirecting to preview…"
            : "Please wait while we structure your conversation..."}
        </p>
      </div>

      <div className="mt-8">
        <div className="mb-2 flex items-center justify-between text-xs font-medium uppercase tracking-wider text-gray-500">
          <span>Extraction Progress</span>
          <span className={done ? "text-emerald-600" : "text-blue-600"}>
            {Math.min(progress, 100)}%
          </span>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-gray-100">
          <div
            className={`h-full rounded-full transition-all duration-300 ease-out ${done ? "bg-emerald-500" : "bg-blue-600"
              }`}
            style={{ width: `${Math.min(progress, 100)}%` }}
          />
        </div>
      </div>

      <div className="mt-6 space-y-3">
        {steps.map((step) => (
          <div key={step.id} className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {step.status === "completed" ? (
                <CheckCircle2 className="h-5 w-5 text-emerald-500" />
              ) : step.status === "active" ? (
                <Loader2 className="h-5 w-5 animate-spin text-blue-600" />
              ) : (
                <div className="h-5 w-5 rounded-full border-2 border-gray-200" />
              )}
              <span className="text-sm font-medium text-gray-700">{step.label}</span>
            </div>
            {step.detail && (
              <span
                className={`rounded-md px-2.5 py-1 text-xs font-medium ${step.status === "completed"
                  ? "bg-gray-100 text-gray-600"
                  : step.status === "active"
                    ? "bg-blue-50 text-blue-600"
                    : "bg-gray-50 text-gray-400"
                  }`}
              >
                {step.status === "active" && (
                  <span className="mr-1 inline-flex">
                    <span className="h-1 w-1 animate-bounce rounded-full bg-blue-600" style={{ animationDelay: "0ms" }} />
                    <span className="ml-0.5 h-1 w-1 animate-bounce rounded-full bg-blue-600" style={{ animationDelay: "150ms" }} />
                    <span className="ml-0.5 h-1 w-1 animate-bounce rounded-full bg-blue-600" style={{ animationDelay: "300ms" }} />
                  </span>
                )}
                {step.detail}
              </span>
            )}
          </div>
        ))}
      </div>

      <div className="mt-8 border-t border-gray-100 pt-6">
        <div className="flex items-center justify-between text-xs text-gray-500">
          <div>
            <p className="font-medium uppercase tracking-wider text-gray-400">Job ID</p>
            <p className="mt-1 font-mono text-gray-700">#PDF-8842-XC</p>
          </div>
          <div className="text-right">
            <p className="font-medium uppercase tracking-wider text-gray-400">Estimated Time</p>
            <p className="mt-1 text-gray-700">~4 seconds</p>
          </div>
        </div>
      </div>

      <div className="mt-8 flex justify-center">
        <button className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-900 transition-colors">
          <X className="h-4 w-4" />
          Cancel conversion
        </button>
      </div>
    </div>
  );
}
