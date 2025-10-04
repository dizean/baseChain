"use client";

import { useState } from "react";
import {
  useAccount,
  useConnect,
  useWriteContract,
  useDisconnect,
} from "wagmi";
import { metaMask } from "wagmi/connectors";
import { gameAddress, gameABI, PACK_COSTS } from "../../lib/BaseBidGame";
import "../page.module.css";

export default function Game() {
  const { address, isConnected } = useAccount();
  const { connect } = useConnect();
  const { disconnect } = useDisconnect();
  const { writeContract, isLoading: txPending } = useWriteContract();

  const [packChoice, setPackChoice] = useState<3 | 5 | 8>(3);
  const [status, setStatus] = useState("");
  const [gameActive, setGameActive] = useState(false);
  const [secret, setSecret] = useState<number | null>(null);
  const [triesLeft, setTriesLeft] = useState(0);
  const [wrongGuesses, setWrongGuesses] = useState(0);
  const [rewardPending, setRewardPending] = useState(false);

  // Start local game
  const startGame = (pack: 3 | 5 | 8) => {
    const rand = Math.floor(Math.random() * 300); // 0–300 now
    console.log(rand);
    setSecret(rand);
    setTriesLeft(pack);
    setWrongGuesses(0);
    setGameActive(true);
    setStatus("🎯 Game started! Guess the number (300)");
  };

  // Guess logic
  const makeGuess = (guess: number) => {
    if (secret === null || triesLeft <= 0 || !gameActive) return;

    if (guess === secret) {
      setStatus(`🎉 You won! Secret was ${secret}`);
      setGameActive(false);
      rewardWinner();
      return;
    }

    const newTries = triesLeft - 1;
    const newWrong = wrongGuesses + 1;

    let hint = guess < secret ? "🔼 Try higher!" : "🔽 Try lower!";

    if (newWrong === 2) hint += secret % 2 === 0 ? " | ℹ️ It's even." : " | ℹ️ It's odd.";
    if (newWrong === 4) hint += ` | ℹ️ Last digit is ${secret % 10}`;
    if (newWrong === 6) {
      const lower = Math.floor(secret / 100) * 100;
      const upper = Math.min(lower + 100, 300);
      hint += ` | ℹ️ It's between ${lower}-${upper}`;
    }
    if (newWrong === 8) {
      const lower = Math.max(0, secret - 20);
      const upper = Math.min(secret + 20, 300);
      hint += ` | ℹ️ It's between ${lower}-${upper}`;
    }

    setStatus(
      newTries <= 0
        ? `❌ Game over. Secret was ${secret}`
        : `❌ Wrong! ${newTries} tries left. ${hint}`
    );

    setWrongGuesses(newWrong);
    setTriesLeft(newTries);

    if (newTries <= 0) setGameActive(false);
  };

  // Reward winner
  const rewardWinner = async () => {
    if (!address || rewardPending) return;
    setRewardPending(true);
    setStatus("⏳ Sending reward... confirm in wallet");
    try {
      const rewardAmount = PACK_COSTS[packChoice];
      await writeContract({
        address: gameAddress,
        abi: gameABI,
        functionName: "rewardWinnerDirect",
        args: [address, rewardAmount],
      });
      setStatus("✅ Reward sent! 🎁");
    } catch (e: any) {
      setStatus(`❌ Reward failed: ${e?.message || e}`);
    } finally {
      setRewardPending(false);
    }
  };

  // Calculate progress for tries left
  const progress = ((packChoice - triesLeft) / packChoice) * 100;

  return (
    <div className="game-container" style={{ display: "flex", justifyContent: "center", marginTop: "50px" }}>
      <div className="game-card" style={{
        padding: "2rem",
        borderRadius: "15px",
        background: "linear-gradient(135deg,#6a11cb,#2575fc)",
        color: "white",
        width: "400px",
        boxShadow: "0 10px 25px rgba(0,0,0,0.2)",
        textAlign: "center",
        fontFamily: "Arial, sans-serif"
      }}>
        <h2 style={{ fontSize: "2rem", marginBottom: "1rem" }}>Number Sniper 🎯</h2>

        {!isConnected ? (
          <button onClick={() => connect({ connector: metaMask() })} style={{
            padding: "0.8rem 1.5rem",
            borderRadius: "10px",
            border: "none",
            background: "#ffcc00",
            fontWeight: "bold",
            cursor: "pointer"
          }}>Connect Wallet</button>
        ) : (
          <>
            <p>Connected: {address?.slice(0, 6)}...{address?.slice(-4)}</p>
            <button onClick={() => disconnect()} style={{
              marginBottom: "1rem",
              padding: "0.5rem 1rem",
              borderRadius: "10px",
              background: "#ff4444",
              border: "none",
              cursor: "pointer"
            }}>Disconnect</button>

            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "1rem" }}>
              {[3, 5, 8].map((pack) => {
                const rewards = pack === 3 ? 30 : pack === 5 ? 20 : 6;
                const isSelected = packChoice === pack;
                return (
                  <div
                    key={pack}
                    onClick={() => { setPackChoice(pack as 3 | 5 | 8); setGameActive(false); setStatus(""); setTriesLeft(0); setWrongGuesses(0); setSecret(null); }}
                    style={{
                      flex: 1,
                      margin: "0 5px",
                      padding: "1rem",
                      borderRadius: "15px",
                      background: isSelected ? "linear-gradient(45deg, #ffdd33, #ff8800)" : "rgba(255,255,255,0.1)",
                      cursor: "pointer",
                      textAlign: "center",
                      transition: "all 0.3s",
                      boxShadow: isSelected ? "0 5px 15px rgba(0,0,0,0.3)" : "none",
                    }}
                  >
                    <h3 style={{ margin: 0 }}>{pack} Guesses</h3>
                    <p style={{ margin: "5px 0", fontWeight: "bold" }}>Reward: {rewards} BASE</p>
                    <p style={{ fontSize: "0.8rem", color: "rgba(255,255,255,0.8)" }}>
                      {pack === 3 ? "High reward, risky!" : pack === 5 ? "Balanced pack" : "More chances, smaller reward"}
                    </p>
                  </div>
                );
              })}
            </div>

            <button
              onClick={() => startGame(packChoice)}
              disabled={gameActive || rewardPending}
              style={{
                padding: "0.8rem 1.5rem",
                borderRadius: "10px",
                border: "none",
                background: "#00cc88",
                fontWeight: "bold",
                cursor: "pointer",
                marginBottom: "1rem"
              }}
            >
              Start Game
            </button>

            {gameActive && triesLeft > 0 && !rewardPending && (
              <div>
                <div style={{ marginBottom: "10px" }}>
                  <div style={{
                    height: "20px",
                    width: "100%",
                    background: "rgba(255,255,255,0.2)",
                    borderRadius: "10px",
                    overflow: "hidden",
                    marginBottom: "5px"
                  }}>
                    <div style={{
                      height: "100%",
                      width: `${progress}%`,
                      background: "#ffdd33",
                      borderRadius: "10px",
                      transition: "width 0.3s ease"
                    }}></div>
                  </div>
                  <p>Tries left: {triesLeft}</p>
                </div>
                <input
                  type="number"
                  min={0}
                  max={300}
                  placeholder="Enter guess"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      makeGuess(Number((e.target as HTMLInputElement).value));
                      (e.target as HTMLInputElement).value = "";
                    }
                  }}
                  style={{
                    padding: "0.5rem",
                    borderRadius: "10px",
                    border: "none",
                    width: "100%",
                    marginBottom: "1rem",
                    textAlign: "center"
                  }}
                />
              </div>
            )}

            {status && (
              <p style={{
                background: "rgba(0,0,0,0.3)",
                padding: "0.5rem",
                borderRadius: "10px",
                animation: "fadein 0.5s"
              }}>{status}</p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
// git config --global user.email "you@example.com"
  // git config --global user.name "Your Name"