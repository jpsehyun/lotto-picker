"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import Confetti from "react-confetti";
import { useWindowSize } from "react-use";

/** Panels and types */
const PANELS = ["A", "B", "C", "D", "E"] as const;
const MAX_PER_PANEL = 6;
type PanelKey = (typeof PANELS)[number];
type SelectedMap = Record<PanelKey, Set<number>>;
type AutoMap = Record<PanelKey, boolean>;

/** Animation timing (tweak freely) */
const ROLL_INTERVAL_MS = 30;
const LOCK_STEP_MS = 220;
const SPIN_SEC = 1;

/** Image native size and grid */
const IMG_W = 1614;
const IMG_H = 700;
const COLS = 7;
const ROWS = 7;

/** Bounding boxes for each panel (tuned for your image) */
const PANEL_RECTS: Record<
  PanelKey,
  { x: number; y: number; w: number; h: number }
> = {
  A: { x: 338, y: 75, w: 200, h: 375 },
  B: { x: 570, y: 75, w: 200, h: 375 },
  C: { x: 804, y: 75, w: 200, h: 375 },
  D: { x: 1037, y: 75, w: 200, h: 375 },
  E: { x: 1270, y: 75, w: 200, h: 375 },
};

/** Light tints per sheet for readability */
const PANEL_TINT: Record<PanelKey, string> = {
  A: "bg-white/[.03]",
  B: "bg-white/[.045]",
  C: "bg-white/[.06]",
  D: "bg-white/[.075]",
  E: "bg-white/[.09]",
};

/** Inner padding inside each cell so hit boxes do not touch borders */
const BOX_PAD = 0.12;

/** Initial state */
const initialSelected: SelectedMap = {
  A: new Set<number>(),
  B: new Set<number>(),
  C: new Set<number>(),
  D: new Set<number>(),
  E: new Set<number>(),
};
const initialAuto: AutoMap = {
  A: false,
  B: false,
  C: false,
  D: false,
  E: false,
};

type Box = {
  panel: PanelKey;
  num: number;
  x: number;
  y: number;
  w: number;
  h: number;
  cx: number;
  cy: number;
};

type Control = {
  panel: PanelKey;
  kind: "auto" | "clear";
  x: number;
  y: number;
  w: number;
  h: number;
};

type DrawRank = "1등" | "2등" | "3등" | "4등" | "5등" | "낙첨";
type DrawResult = {
  panel: PanelKey;
  picks: number[];
  matchCount: number;
  bonusMatch: boolean;
  rank: DrawRank;
};

function playSound(src: string) {
  const audio = new Audio(src);
  audio.volume = 0.8;
  audio.play().catch((err) => {
    console.warn("Audio play blocked by browser:", err);
  });
}

/* ---------------- Confetti (no library) ---------------- */
function ConfettiCanvas({
  fire,
  onDone,
}: {
  fire: boolean;
  onDone?: () => void;
}) {
  const ref = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (!fire) return;
    const canvas = ref.current!;
    const ctx = canvas.getContext("2d")!;
    let w = (canvas.width = canvas.offsetWidth);
    let h = (canvas.height = canvas.offsetHeight);

    const onResize = () => {
      w = canvas.width = canvas.offsetWidth;
      h = canvas.height = canvas.offsetHeight;
    };
    window.addEventListener("resize", onResize);

    type P = {
      x: number;
      y: number;
      vx: number;
      vy: number;
      s: number;
      rot: number;
      vr: number;
      color: string;
      life: number;
    };
    const colors = ["#FFD166", "#EF476F", "#06D6A0", "#118AB2", "#F78C6B"];
    const particles: P[] = [];
    const N = 160;
    for (let i = 0; i < N; i++) {
      particles.push({
        x: w * (0.25 + 0.5 * Math.random()),
        y: -20 - 50 * Math.random(),
        vx: (Math.random() - 0.5) * 2.2,
        vy: 1 + Math.random() * 2.8,
        s: 6 + Math.random() * 6,
        rot: Math.random() * Math.PI,
        vr: (Math.random() - 0.5) * 0.2,
        color: colors[(Math.random() * colors.length) | 0],
        life: 0,
      });
    }

    let raf = 0;
    const start = performance.now();
    const duration = 3500;

    const tick = (t: number) => {
      const elapsed = t - start;
      ctx.clearRect(0, 0, w, h);
      particles.forEach((p) => {
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.02;
        p.rot += p.vr;
        p.life += 1;

        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        ctx.globalAlpha = Math.max(0, 1 - p.life / 240);
        ctx.fillRect(-p.s / 2, -p.s / 2, p.s, p.s);
        ctx.restore();
      });
      raf = requestAnimationFrame(tick);
      if (elapsed > duration) {
        cancelAnimationFrame(raf);
        window.removeEventListener("resize", onResize);
        onDone?.();
      }
    };
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
    };
  }, [fire, onDone]);

  return (
    <canvas
      ref={ref}
      className="pointer-events-none absolute inset-0 h-full w-full"
      style={{ filter: "drop-shadow(0 0 2px rgba(0,0,0,.25))" }}
    />
  );
}
/* ------------------------------------------------------- */

export default function LottoPage() {
  const [selected, setSelected] = useState<SelectedMap>(initialSelected);
  const [autoTicked, setAutoTicked] = useState<AutoMap>(initialAuto);

  const { width, height } = useWindowSize();
  const [showConfetti, setShowConfetti] = useState(false);
  const [pieces, setPieces] = useState(0);

  useEffect(() => {
    if (showConfetti) {
      setPieces(500);
      const stopSpawning = setTimeout(() => setPieces(0), 1000);
      const cleanup = setTimeout(() => setShowConfetti(false), 4000);

      return () => {
        clearTimeout(stopSpawning);
        clearTimeout(cleanup);
      };
    }
  }, [showConfetti]);

  // Modal + animation state
  const [showModal, setShowModal] = useState(false);
  const [animating, setAnimating] = useState(false);
  const [displayed, setDisplayed] = useState<(number | null)[]>(
    Array(7).fill(null)
  );

  // Final winning set (6 + bonus)
  const [winning, setWinning] = useState<number[]>([]);
  const [bonus, setBonus] = useState<number | null>(null);

  // Results
  const [results, setResults] = useState<DrawResult[]>([]);
  const [shouldConfetti, setShouldConfetti] = useState(false);

  // Keep the last used snapshot of user picks so we can "Play Again"
  type Snapshot = Record<PanelKey, number[]>;
  const [lastSnapshot, setLastSnapshot] = useState<Snapshot | null>(null);

  // Instruction modal state
  const [showInstruction, setShowInstruction] = useState(true);

  const toggle = (panel: PanelKey, num: number) => {
    setSelected((prev) => {
      const nextSet = new Set(prev[panel]);
      if (nextSet.has(num)) {
        nextSet.delete(num);
        return { ...prev, [panel]: nextSet };
      }
      if (nextSet.size < MAX_PER_PANEL) {
        nextSet.add(num);
        return { ...prev, [panel]: nextSet };
      }
      return prev;
    });
  };

  /** Build all clickable boxes once */
  const boxes: Box[] = useMemo(() => {
    const out: Box[] = [];
    PANELS.forEach((panel) => {
      const rect = PANEL_RECTS[panel];
      const cellW = rect.w / COLS;
      const cellH = rect.h / ROWS;

      for (let n = 1; n <= 45; n++) {
        const idx = n - 1;
        const r = Math.floor(idx / COLS);
        const c = idx % COLS;

        const x = rect.x + c * cellW + cellW * BOX_PAD;
        const y = rect.y + r * cellH + cellH * BOX_PAD;
        const w = cellW * (1 - 2 * BOX_PAD);
        const h = cellH * (1 - 2 * BOX_PAD);

        out.push({ panel, num: n, x, y, w, h, cx: x + w / 2, cy: y + h / 2 });
      }
    });
    return out;
  }, []);

  /** Helpers for auto/clear */
  const ALL_NUMS = useMemo(
    () => Array.from({ length: 45 }, (_, i) => i + 1),
    []
  );

  const autoFillPanel = (panel: PanelKey) => {
    setSelected((prev) => {
      const current = new Set(prev[panel]);
      const result = new Set<number>(current);

      if (current.size < MAX_PER_PANEL) {
        const need = MAX_PER_PANEL - current.size;
        const pool = ALL_NUMS.filter((n) => !current.has(n));
        for (let i = 0; i < need && pool.length > 0; i++) {
          const j = Math.floor(Math.random() * pool.length);
          result.add(pool.splice(j, 1)[0]);
        }
      } else {
        const pool = [...ALL_NUMS];
        const fresh = new Set<number>();
        for (let i = 0; i < MAX_PER_PANEL; i++) {
          const j = Math.floor(Math.random() * pool.length);
          fresh.add(pool.splice(j, 1)[0]);
        }
        return { ...prev, [panel]: fresh };
      }

      return { ...prev, [panel]: result };
    });

    setAutoTicked((prev) => ({ ...prev, [panel]: true }));
  };

  const clearPanel = (panel: PanelKey) => {
    setSelected((prev) => ({ ...prev, [panel]: new Set() }));
    setAutoTicked((prev) => ({ ...prev, [panel]: false }));
  };

  /** Clickable areas over the printed checkboxes */
  const controls: Control[] = useMemo(() => {
    const CHECK_SIZE = 20;
    const CHECK_RIGHT_PAD = 5;
    const CHECK_TOP_OFFSET = 125;
    const CHECK_VERTICAL_GAP = 55;

    const out: Control[] = [];
    PANELS.forEach((panel) => {
      const rect = PANEL_RECTS[panel];
      const x = rect.x + rect.w - CHECK_RIGHT_PAD - CHECK_SIZE;
      const yAuto = rect.y + rect.h + CHECK_TOP_OFFSET;
      const yClear = yAuto + CHECK_VERTICAL_GAP;

      out.push({
        panel,
        kind: "auto",
        x,
        y: yAuto,
        w: CHECK_SIZE,
        h: CHECK_SIZE,
      });
      out.push({
        panel,
        kind: "clear",
        x,
        y: yClear,
        w: CHECK_SIZE,
        h: CHECK_SIZE,
      });
    });
    return out;
  }, []);

  /* ----------- Draw + animated reveal + evaluate + clear ----------- */
  function generateWinning() {
    const pool = [...ALL_NUMS];
    const win: number[] = [];
    for (let i = 0; i < 6; i++) {
      const j = Math.floor(Math.random() * pool.length);
      win.push(pool.splice(j, 1)[0]);
    }
    win.sort((a, b) => a - b);
    const b = pool[Math.floor(Math.random() * pool.length)];
    return { win, bonus: b };
  }

  const genRandomSet = () => {
    const pool = [...ALL_NUMS];
    const out: number[] = [];
    for (let i = 0; i < 6; i++) {
      const j = Math.floor(Math.random() * pool.length);
      out.push(pool.splice(j, 1)[0]);
    }
    return out.sort((a, b) => a - b);
  };

  const makeRandomSnapshot = (): Record<PanelKey, number[]> => ({
    A: genRandomSet(),
    B: genRandomSet(),
    C: genRandomSet(),
    D: genRandomSet(),
    E: genRandomSet(),
  });

  const runDrawAnimationAndEvaluate = (
    snapshot: Record<PanelKey, number[]>
  ) => {
    setAnimating(true);
    setDisplayed(Array(7).fill(null));
    setShouldConfetti(false);

    const { win, bonus } = generateWinning();
    const finalAll = [...win, bonus];
    setWinning(win);
    setBonus(bonus);

    const intervals: number[] = [];
    for (let i = 0; i < 7; i++) {
      const id = window.setInterval(() => {
        setDisplayed((prev) => {
          const next = [...prev];
          next[i] = Math.floor(Math.random() * 45) + 1;
          return next;
        });
      }, ROLL_INTERVAL_MS);
      intervals.push(id);
    }

    const lockOne = (idx: number) => {
      window.clearInterval(intervals[idx]);
      setDisplayed((prev) => {
        const next = [...prev];
        next[idx] = finalAll[idx];
        return next;
      });
    };

    for (let i = 0; i < 7; i++) {
      window.setTimeout(() => {
        lockOne(i);
        if (i === 6) {
          const winSet = new Set(win);
          const computed: DrawResult[] = PANELS.map((p) => {
            const picks = snapshot[p].slice().sort((a, b) => a - b);
            const matchCount = picks.filter((n) => winSet.has(n)).length;
            const bonusMatch = picks.includes(bonus);
            let rank: DrawRank = "낙첨";
            if (matchCount === 6) rank = "1등";
            else if (matchCount === 5 && bonusMatch) rank = "2등";
            else if (matchCount === 5) rank = "3등";
            else if (matchCount === 4) rank = "4등";
            else if (matchCount === 3) rank = "5등";
            return { panel: p, picks, matchCount, bonusMatch, rank };
          });
          setResults(computed);
          setShouldConfetti(
            computed.some((r) =>
              ["1등", "2등", "3등", "4등", "5등"].includes(r.rank)
            )
          );
          if (
            computed.some((r) =>
              ["1등", "2등", "3등", "4등", "5등"].includes(r.rank)
            )
          ) {
            setShowConfetti(true);
            playSound("/sfx/winning.mp3");
          }

          setSelected({
            A: new Set(),
            B: new Set(),
            C: new Set(),
            D: new Set(),
            E: new Set(),
          });
          setAutoTicked({ A: false, B: false, C: false, D: false, E: false });

          setAnimating(false);
        }
      }, LOCK_STEP_MS * (i + 1));
    }
  };

  const drawAndEvaluate = () => {
    const snapshot: Record<PanelKey, number[]> = {
      A: Array.from(selected.A),
      B: Array.from(selected.B),
      C: Array.from(selected.C),
      D: Array.from(selected.D),
      E: Array.from(selected.E),
    };

    const allEmpty = PANELS.every((p) => snapshot[p].length === 0);
    const incompleteSheets = PANELS.filter(
      (p) => snapshot[p].length > 0 && snapshot[p].length < MAX_PER_PANEL
    );

    if (allEmpty) {
      toast.warning("모든 용지가 비어 있습니다. 번호를 먼저 선택해주세요.");
      return;
    }

    if (incompleteSheets.length > 0) {
      const list = incompleteSheets.join(", ");
      toast.warning(
        `${list} 용지의 번호 선택이 완료되지 않았습니다. 번호를 고른 용지는 반드시 6개를 선택해야 합니다.`
      );
      return;
    }

    playSound("/sfx/ball.mp3");

    setLastSnapshot(snapshot);
    setShowModal(true);
    runDrawAnimationAndEvaluate(snapshot);
  };

  const playAgainSameNumbers = () => {
    const snapshot = lastSnapshot ?? { A: [], B: [], C: [], D: [], E: [] };
    runDrawAnimationAndEvaluate(snapshot);
  };

  const playWithNewNumbers = () => {
    const randomSnap = makeRandomSnapshot();
    setLastSnapshot(randomSnap);
    runDrawAnimationAndEvaluate(randomSnap);
  };
  /* ----------------------------------------------------------------- */

  return (
    <div className="min-h-screen flex items-center justify-center bg-black">
      <div
        className="mx-auto px-3 sm:px-6"
        style={{ width: "min(1100px, 100%)" }}
      >
        <h1 className="mb-4 text-2xl sm:text-3xl font-semibold text-white">
          Lotto 6/45 Picker
        </h1>

        {/* Ticket image + overlay */}
        <div
          className="
    relative mx-auto
    w-[min(95vw,1100px)]   /* mobile: almost full width; desktop: cap */
    sm:w-[min(92vw,1100px)]
  "
          style={{ aspectRatio: `${IMG_W}/${IMG_H}` }}
        >
          <Image
            src="/img.jpg"
            alt="Lotto ticket"
            fill
            priority
            sizes="(max-width: 640px) 95vw, (max-width: 1024px) 92vw, 1100px"
            style={{ objectFit: "contain" }}
          />

          <svg
            viewBox={`0 0 ${IMG_W} ${IMG_H}`}
            className="absolute inset-0"
            aria-label="clickable number overlay"
          >
            {/* Number grid */}
            {boxes.map((b) => {
              const isOn = selected[b.panel].has(b.num);
              const panelFull = selected[b.panel].size >= MAX_PER_PANEL;
              const canClick = isOn || !panelFull;

              return (
                <g key={`${b.panel}-${b.num}`}>
                  <rect
                    x={b.x}
                    y={b.y}
                    width={b.w}
                    height={b.h}
                    rx={6}
                    ry={6}
                    fill={
                      isOn
                        ? "rgba(0,0,0,0.85)"
                        : panelFull
                        ? "rgba(255,255,255,0.04)"
                        : "rgba(255,255,255,0.01)"
                    }
                    stroke={isOn ? "rgba(0,0,0,0.9)" : "rgba(0,0,0,0.15)"}
                    strokeWidth={isOn ? 2 : 1}
                    style={{ cursor: canClick ? "pointer" : "not-allowed" }}
                    onClick={() => canClick && toggle(b.panel, b.num)}
                  />
                  <text
                    x={b.cx}
                    y={b.cy + 4}
                    textAnchor="middle"
                    fontSize={18}
                    fontFamily="ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto"
                    fill={isOn ? "white" : "black"}
                    pointerEvents="none"
                  >
                    {b.num}
                  </text>
                </g>
              );
            })}

            {/* Clickable printed checkboxes */}
            {controls.map((c) => {
              const size = selected[c.panel].size;
              const isAuto = c.kind === "auto";

              const handle = () => {
                if (isAuto) autoFillPanel(c.panel);
                else if (size > 0) clearPanel(c.panel);
              };

              const isDisabled = !isAuto && size === 0;
              const isChecked = isAuto && autoTicked[c.panel];

              return (
                <g
                  key={`${c.panel}-${c.kind}`}
                  onClick={handle}
                  style={{ cursor: isDisabled ? "not-allowed" : "pointer" }}
                >
                  <rect
                    x={c.x}
                    y={c.y}
                    width={c.w}
                    height={c.h}
                    rx={3}
                    ry={3}
                    fill="rgba(255,255,255,0.001)"
                    stroke={
                      isDisabled ? "rgba(0,0,0,0.15)" : "rgba(0,0,0,0.35)"
                    }
                    strokeWidth={1}
                  />
                  {isChecked && (
                    <text
                      x={c.x + c.w / 2}
                      y={c.y + c.h / 2 + 5}
                      textAnchor="middle"
                      fontSize={16}
                      fontFamily="ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto"
                      fill="black"
                      pointerEvents="none"
                    >
                      ✓
                    </text>
                  )}
                </g>
              );
            })}
          </svg>
        </div>

        {/* ===== Refreshed Sheets section ===== */}
        <section className="mt-6">
          {/* 5-up row to mirror the real ticket */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5 items-stretch">
            {PANELS.map((p) => {
              const picks = Array.from(selected[p]).sort((a, b) => a - b);
              return (
                <div
                  key={p}
                  className={[
                    "w-full",
                    "rounded-2xl border p-4 text-center shadow-sm",
                    "border-white/10",
                    PANEL_TINT[p],
                  ].join(" ")}
                >
                  <div className="mx-auto mb-3 inline-block rounded-full border border-white/15 px-3 py-1 text-xs font-semibold tracking-wide text-white">
                    Sheet {p}
                  </div>

                  {/* keep height stable + always render grid */}
                  <div className="min-h-[48px] min-w-[150px]">
                    <div className="grid grid-cols-3 gap-2 justify-items-center">
                      {picks.length ? (
                        picks.map((n) => (
                          <span
                            key={n}
                            className="rounded-full border border-white/20 px-2 py-0.5 text-xs text-center text-white"
                          >
                            {n}
                          </span>
                        ))
                      ) : (
                        <span className="col-span-3 opacity-50">—</span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* centered Draw button below all sheets */}
          <div className="mt-4 flex justify-center">
            <button
              onClick={() => {
                drawAndEvaluate();
              }}
              className="rounded-xl bg-gradient-to-r from-pink-500 to-yellow-500 px-6 py-2 text-sm font-semibold text-white shadow-md transition hover:scale-[1.02]"
            >
              Draw (6 + Bonus)
            </button>
          </div>
        </section>
        {/* ==================================== */}

        {/* Modal */}
        {showModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div
              className="absolute inset-0 bg-black/60"
              onClick={() => setShowModal(false)}
            />
            <div className="relative w-[min(720px,92vw)] overflow-hidden rounded-2xl border bg-black p-6 shadow-xl">
              {shouldConfetti && <ConfettiCanvas fire={true} />}

              <div className="mb-4 text-lg font-semibold text-white">
                Draw Results
              </div>

              {/* Animated balls */}
              <div className="mb-5 flex flex-wrap items-center gap-3">
                {displayed.map((n, i) => (
                  <div
                    key={i}
                    className={[
                      "flex h-12 w-12 items-center justify-center rounded-full border text-base font-semibold",
                      i === 6
                        ? "border-yellow-400 text-yellow-300"
                        : "border-white/70 text-white",
                      animating ? "animate-spin" : "",
                    ].join(" ")}
                    style={
                      animating
                        ? { animationDuration: `${SPIN_SEC}s` }
                        : undefined
                    }
                    title={i === 6 ? "Bonus" : `Ball ${i + 1}`}
                  >
                    {n ?? "?"}
                  </div>
                ))}
              </div>

              {!animating && (
                <>
                  <div className="mb-2 text-sm text-white">
                    당첨번호:{" "}
                    <span className="text-base">{winning.join(", ")}</span>{" "}
                    <span className="ml-2 text-sm opacity-80 ">
                      보너스: {bonus}
                    </span>
                  </div>

                  <div className="mb-4">
                    <table className="w-full text-sm text-white">
                      <thead className="text-left opacity-70">
                        <tr>
                          <th className="py-1">Sheet</th>
                          <th className="py-1">Your Picks</th>
                          <th className="py-1">Matches</th>
                          <th className="py-1">Bonus</th>
                          <th className="py-1">Result</th>
                        </tr>
                      </thead>
                      <tbody>
                        {results.map((r) => (
                          <tr key={r.panel}>
                            <td className="py-1 font-medium">{r.panel}</td>
                            <td className="py-1">
                              {r.picks.join(", ") || "—"}
                            </td>
                            <td className="py-1">{r.matchCount}</td>
                            <td className="py-1">{r.bonusMatch ? "✓" : "—"}</td>
                            <td className="py-1">{r.rank}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}

              {!animating && (
                <div className="flex justify-end gap-2">
                  <button
                    className="rounded-lg border px-3 py-1 text-sm text-white hover:bg-white/10"
                    onClick={() => {
                      playSound("/sfx/ball.mp3");
                      playAgainSameNumbers();
                    }}
                  >
                    같은 번호로 다시하기
                  </button>
                  <button
                    className="rounded-lg border px-3 py-1 text-sm text-white hover:bg-white/10"
                    onClick={() => {
                      playSound("/sfx/ball.mp3");
                      playWithNewNumbers();
                    }}
                    title="Replay with brand-new random picks for all sheets"
                  >
                    새 번호로 다시하기
                  </button>
                  <button
                    className="rounded-lg border px-3 py-1 text-sm text-white hover:bg-white/10"
                    onClick={() => {
                      setShowModal(false);
                      setShouldConfetti(false);
                    }}
                  >
                    Close
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
        {showInstruction && (
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            {/* background overlay */}
            <div
              className="absolute inset-0 bg-black/70"
              onClick={() => setShowInstruction(false)}
            />

            {/* modal content */}
            <div className="relative w-[min(420px,90vw)] rounded-2xl border border-white/10 bg-zinc-900 p-6 text-white shadow-xl">
              <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold">
                사용 방법
              </h2>

              <ul className="space-y-3 text-sm leading-relaxed">
                <li>
                  1️⃣ 각 용지(A–E)에서 원하는 번호를 최대 6개까지 선택하세요.
                </li>
                <li>
                  2️⃣ <span className="font-semibold">자동</span> 버튼으로 무작위
                  선택을 할 수 있고, <span className="font-semibold">취소</span>{" "}
                  버튼으로 초기화할 수 있습니다.
                </li>
                <li>
                  3️⃣ 준비가 되면{" "}
                  <span className="font-semibold">추첨하기 (6 + 보너스)</span>{" "}
                  버튼을 눌러 결과를 확인하세요.
                </li>
                <li>
                  4️⃣ 결과 창에서 당첨 번호와 각 용지의 등수를 확인할 수
                  있습니다.
                </li>
                <li>
                  5️⃣ 일부 용지를 비워둬도 괜찮습니다. 단, 번호를 고른 용지는
                  반드시 6개를 모두 선택해야 합니다.
                </li>
              </ul>

              <div className="mt-6 flex justify-end">
                <button
                  onClick={() => setShowInstruction(false)}
                  className="rounded-lg bg-gradient-to-r from-pink-500 to-yellow-500 px-4 py-2 text-sm font-semibold text-white shadow hover:scale-105 transition"
                >
                  확인했어요
                </button>
              </div>
            </div>
          </div>
        )}

        {showConfetti && (
          <Confetti
            width={width}
            height={height}
            numberOfPieces={pieces}
            recycle={false}
            gravity={0.3}
            className="fixed inset-0 z-50 pointer-events-none overflow-hidden"
            style={{ position: "fixed", top: 0, left: 0 }}
          />
        )}
      </div>
    </div>
  );
}
