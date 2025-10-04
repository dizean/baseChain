"use client";

import { Wallet } from "@coinbase/onchainkit/wallet";
import { useReadContract, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { useState, useEffect } from "react";
import { counterABI, counterAddress } from "@/lib/contract";

export default function Home() {
  // Auto-updating counter value
  const { data, isLoading } = useReadContract({
    address: counterAddress,
    abi: counterABI,
    functionName: "number",
    watch: true, // 👈 auto-refreshes after tx confirms
  });

  const { writeContract, data: txHash, isPending } = useWriteContract();

  // Wait until transaction is mined
  const { isLoading: isTxLoading, isSuccess } = useWaitForTransactionReceipt({
    hash: txHash,
  });

  const [input, setInput] = useState("");

  const setNumber = async () => {
    await writeContract({
      address: counterAddress,
      abi: counterABI,
      functionName: "setNumber",
      args: [BigInt(input)],
    });
    setInput(""); // clear input after submit
  };

  const increment = async () => {
    await writeContract({
      address: counterAddress,
      abi: counterABI,
      functionName: "increment",
    });
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-[#0f2027] via-[#203a43] to-[#2c5364] text-white font-sans relative overflow-hidden">
      {/* Floating gradient orbs */}
      <div className="absolute w-[400px] h-[400px] bg-[#0052FF]/30 rounded-full blur-3xl top-[-100px] left-[-150px]" />
      <div className="absolute w-[300px] h-[300px] bg-[#00D2FF]/20 rounded-full blur-3xl bottom-[-80px] right-[-100px]" />

      {/* Header */}
      <header className="absolute top-5 right-5">
        <Wallet />
      </header>

      {/* Main Card */}
      <main className="bg-white/10 backdrop-blur-xl p-10 rounded-3xl shadow-2xl w-[90%] max-w-md flex flex-col items-center border border-white/20">
        <h1 className="text-3xl font-extrabold mb-6 text-center bg-gradient-to-r from-[#00D2FF] to-[#338AFF] bg-clip-text text-transparent">
          🚀 Base Counter
        </h1>

        <h2 className="text-xl font-semibold">Counter Value:</h2>
        {isLoading ? (
          <p className="text-lg mt-2 animate-pulse">Loading...</p>
        ) : (
          <p className="text-5xl font-extrabold mt-2 text-[#00D2FF] drop-shadow-lg">
            {data?.toString()}
          </p>
        )}

        {/* Transaction Status */}
        {isTxLoading && (
          <p className="mt-4 text-sm text-yellow-300 animate-pulse">
            ⏳ Transaction Confirming...
          </p>
        )}
        {isSuccess && (
          <p className="mt-4 text-sm text-green-400">
            ✅ Transaction Confirmed!
          </p>
        )}

        {/* Input + Buttons */}
        <div className="w-full mt-8 flex flex-col gap-4">
          <input
            type="number"
            placeholder="Enter new number"
            className="w-full px-4 py-3 rounded-xl text-black focus:outline-none focus:ring-2 focus:ring-[#00D2FF] shadow-inner"
            value={input}
            onChange={(e) => setInput(e.target.value)}
          />
          <button
            onClick={setNumber}
            disabled={isPending || isTxLoading}
            className="w-full py-3 bg-[#0052FF] hover:bg-[#003FCC] rounded-xl text-white font-semibold transition-all duration-200 disabled:opacity-50 shadow-md"
          >
            {isPending || isTxLoading ? "Processing..." : "Set Number"}
          </button>
          <button
            onClick={increment}
            disabled={isPending || isTxLoading}
            className="w-full py-3 bg-gradient-to-r from-[#338AFF] to-[#00D2FF] hover:opacity-90 rounded-xl text-white font-semibold transition-all duration-200 disabled:opacity-50 shadow-md"
          >
            {isPending || isTxLoading ? "Processing..." : "Increment"}
          </button>
        </div>
      </main>

      {/* Footer */}
      <footer className="absolute bottom-5 text-sm text-white/70 tracking-wide">
        Built on <span className="font-semibold text-[#00D2FF]">Base</span>
      </footer>
    </div>
  );
}
