"use client";

import { useState } from "react";
import ChartTab from "@/components/ChartTab";
import ExactTab from "@/components/ExactTab";
import LiveTab from "@/components/LiveTab";

export default function Home() {
  const [tab, setTab] = useState<"chart" | "exact" | "live">("chart");

  return (
    <main className="mx-auto max-w-[1500px] px-4 py-6">
      <header className="no-print mb-6">
        <h1 className="text-2xl font-bold">
          ✈️ Inflight Zmanim <span className="text-blue-700">— Chabad</span>
        </h1>
        <p className="mt-1 text-sm text-gray-600">
          Zmanim for your flight per the Alter Rebbe — tzeis 6° (Baal HaTanya), with the
          zmanim formulas from the Zmanim project. Build a printable pre-flight chart, get
          exact times for a known takeoff, or track your flight live.
        </p>
        <nav className="mt-4 flex gap-2 border-b border-gray-200">
          {(
            [
              ["chart", "📋 Pre-Flight Chart"],
              ["exact", "🎯 Exact Takeoff"],
              ["live", "🛰 Live Tracking"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={
                "rounded-t-md px-4 py-2 text-sm font-semibold " +
                (tab === key
                  ? "border border-b-0 border-gray-200 bg-white text-blue-700"
                  : "text-gray-500 hover:text-gray-800")
              }
            >
              {label}
            </button>
          ))}
        </nav>
      </header>

      <div className={tab === "chart" ? "" : "hidden"}>
        <ChartTab />
      </div>
      <div className={tab === "exact" ? "" : "hidden"}>
        <ExactTab />
      </div>
      <div className={tab === "live" ? "" : "hidden"}>
        <LiveTab />
      </div>

      <footer className="no-print mt-12 border-t border-gray-200 pt-4 text-xs text-gray-500">
        <p>
          In-flight zmanim are approximations based on great-circle routes and live ADS-B
          data. The precision achievable on the ground is not achievable in the air —
          distance yourself from the zmanim boundaries as much as possible, and consult a
          Rov for practical halacha. Not affiliated with MyZmanim.
        </p>
      </footer>
    </main>
  );
}
