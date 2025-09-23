"use client";

import dynamic from "next/dynamic";
import { useWindowSize } from "react-use";

// Load react-confetti only on the client
const Confetti = dynamic(() => import("react-confetti"), { ssr: false });

export default function ConfettiBackground({
  enabled = true,
  numberOfPieces = 200,
  recycle = true,
}) {
  const { width, height } = useWindowSize();

  if (!enabled || !width || !height) return null;

  return (
    <Confetti
      width={width}
      height={height}
      numberOfPieces={numberOfPieces}
      recycle={recycle}
      className="fixed inset-0 -z-10 pointer-events-none"
    />
  );
}
