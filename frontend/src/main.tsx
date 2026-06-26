import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  ArrowUpRight,
  BadgeCheck,
  CircuitBoard,
  Fingerprint,
  LockKeyhole,
  ReceiptText,
  RefreshCw,
  Send,
  ShieldCheck,
  Sparkles
} from "lucide-react";
import {
  createOneInvoicePolicy,
  demoDefaults,
  generateDemoProof,
  type PrivatePolicy
} from "../../src/policy";
import { createDemoWitnessInput, expectedDemoContractInputs } from "./lib/zk/demoWitness";
import { getStellarConfig } from "./lib/stellar/config";
import { executePactraPayment, type ExecutePaymentState } from "./lib/stellar/contracts";
import { loadLiveMandate, validateLiveMandateProof, type LiveMandate } from "./lib/stellar/liveMandate";
import { connectWallet } from "./lib/stellar/wallet";
import { bytesFromHex, formatForContract } from "./lib/zk/formatForContract";
import type { ContractProofBundle, SafeProofSummary, SnarkProof } from "./lib/zk/types";
import "./styles.css";

const HERO_VIDEO =
  "https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260418_080021_d598092b-c4c2-4e53-8e46-94cf9064cd50.mp4";
const CAPABILITIES_VIDEO =
  "https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260418_094631_d30ab262-45ee-4b7d-99f3-5d5848c8ef13.mp4";

type Route = "/" | "/review" | "/audit" | "/receipt";
type BrowserProofPhase =
  | "idle"
  | "preparing_input"
  | "loading_artifacts"
  | "generating_witness"
  | "generating_proof"
  | "proof_ready"
  | "formatting_for_contract"
  | "ready_to_submit"
  | "failed";

type AppMode = "demo" | "testnet";
type SubmitPhase = "ready_to_submit" | ExecutePaymentState | "failed";
type LiveReceipt = {
  transactionHash: string;
  pactraContractId: string;
  verifierContractId: string;
  tokenContractId: string;
  mandateId: string;
  vendor: string;
  amount: string;
  invoiceCommitment: string;
  nullifier: string;
  proofStatus: string;
  escrowReleaseStatus: string;
};
type ReadinessItem = {
  label: string;
  ok: boolean;
  detail: string;
};
type SignalRow = [string, string, string?];

type ProofWorkerMessage =
  | {
      type: "status";
      status: Extract<BrowserProofPhase, "loading_artifacts" | "generating_witness" | "generating_proof" | "proof_ready">;
    }
  | {
      type: "result";
      ok: true;
      proof: SnarkProof;
      publicSignals: string[];
      summary: Omit<SafeProofSummary, "proofByteLength">;
    }
  | { type: "result"; ok: false; error: string };

function App() {
  const [policy, setPolicy] = useState<PrivatePolicy>(() => createOneInvoicePolicy(demoDefaults));
  const [amount, setAmount] = useState(policy.maxPayment);
  const [proofStatus, setProofStatus] = useState("Ready");
  const [route, setRoute] = useState<Route>(() => normalizeRoute(window.location.pathname));
  const [browserProofPhase, setBrowserProofPhase] = useState<BrowserProofPhase>("idle");
  const [browserProofSummary, setBrowserProofSummary] = useState<SafeProofSummary | null>(null);
  const [browserProofError, setBrowserProofError] = useState<string | null>(null);
  const [contractProof, setContractProof] = useState<ContractProofBundle | null>(null);
  const [proofMode, setProofMode] = useState<"browser" | "demo_fixture" | "prepared_live">("demo_fixture");
  const [appMode, setAppMode] = useState<AppMode>("demo");
  const [walletPublicKey, setWalletPublicKey] = useState<string | null>(null);
  const [submitPhase, setSubmitPhase] = useState<SubmitPhase>("ready_to_submit");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [liveReceipt, setLiveReceipt] = useState<LiveReceipt | null>(() => readStoredReceipt());
  const [liveMandate, setLiveMandate] = useState<LiveMandate | null>(null);
  const [liveMandateChecked, setLiveMandateChecked] = useState(false);
  const timers = useRef<number[]>([]);
  const workerRef = useRef<Worker | null>(null);
  const stellarConfig = useMemo(() => getStellarConfig(), []);

  const proof = useMemo(() => {
    try {
      return generateDemoProof(policy, {
        mandateId: policy.mandateId,
        vendorAddress: policy.vendorAddresses[0],
        amount,
        invoiceSecret: policy.invoiceSecret
      });
    } catch {
      return null;
    }
  }, [amount, policy]);

  useEffect(() => () => {
    timers.current.forEach(window.clearTimeout);
    workerRef.current?.terminate();
  }, []);

  useEffect(() => {
    const onPopState = () => setRoute(normalizeRoute(window.location.pathname));
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  useEffect(() => {
    loadLiveMandate().then((mandate) => {
      setLiveMandate(mandate);
      if (mandate) {
        setAmount(mandate.amountToPay);
        const preparedProof = proofBundleFromLiveMandate(mandate);
        if (preparedProof) {
          setProofMode("prepared_live");
          setContractProof(preparedProof);
          setBrowserProofSummary(preparedProof.summary);
          setBrowserProofPhase("ready_to_submit");
        }
      }
      setLiveMandateChecked(true);
    });
  }, []);

  function navigate(nextRoute: Route, event?: React.MouseEvent<HTMLAnchorElement>) {
    event?.preventDefault();
    if (nextRoute !== route) {
      window.history.pushState({}, "", nextRoute);
      setRoute(nextRoute);
    }
  }

  function regeneratePolicy() {
    timers.current.forEach(window.clearTimeout);
    timers.current = [];
    const next = createOneInvoicePolicy(demoDefaults);
    setPolicy(next);
    setAmount(next.maxPayment);
    setProofStatus("Ready");
  }

  function executePayment() {
    timers.current.forEach(window.clearTimeout);
    timers.current = [];

    if (!proof) {
      setProofStatus("Rejected");
      return;
    }

    setProofStatus("Preparing witness");
    timers.current = [
      window.setTimeout(() => setProofStatus("Generating proof"), 360),
      window.setTimeout(() => setProofStatus("Groth16 verified"), 840),
      window.setTimeout(() => setProofStatus("Escrow released"), 1280)
    ];
  }

  function runProofFromNav() {
    executePayment();
    navigate("/review");
  }

  function useDemoProofFixture() {
    workerRef.current?.terminate();
    workerRef.current = null;
    setProofMode("demo_fixture");
    setContractProof(null);
    setBrowserProofSummary(null);
    setBrowserProofError(null);
    setBrowserProofPhase("idle");
  }

  function generateRealGroth16Proof() {
    workerRef.current?.terminate();
    const witness = createDemoWitnessInput();
    const worker = new Worker(new URL("./workers/proofWorker.ts", import.meta.url), { type: "module" });
    workerRef.current = worker;

    setProofMode("browser");
    setContractProof(null);
    setBrowserProofSummary(null);
    setBrowserProofError(null);
    setBrowserProofPhase("preparing_input");

    worker.onmessage = (event: MessageEvent<ProofWorkerMessage>) => {
      const message = event.data;

      if (message.type === "status") {
        setBrowserProofPhase(message.status);
        return;
      }

      worker.terminate();
      workerRef.current = null;

      if (!message.ok) {
        setBrowserProofError(message.error);
        setBrowserProofPhase("failed");
        return;
      }

      try {
        setBrowserProofPhase("formatting_for_contract");
        const formatted = formatForContract(
          message.proof,
          message.publicSignals,
          { ...expectedDemoContractInputs(), amount },
          message.summary.generationMs
        );
        setContractProof(formatted);
        setBrowserProofSummary(formatted.summary);
        setBrowserProofPhase("ready_to_submit");
      } catch (error) {
        setBrowserProofError(error instanceof Error ? error.message : "Failed to format proof for Pactra.");
        setBrowserProofPhase("failed");
      }
    };

    worker.onerror = () => {
      worker.terminate();
      workerRef.current = null;
      setBrowserProofError("Browser proof worker failed. Check that ZK artifacts were exported with `npm run zk:export`.");
      setBrowserProofPhase("failed");
    };

    worker.postMessage({ witness });
  }

  async function connectLiveWallet() {
    setSubmitError(null);
    try {
      const connection = await connectWallet(stellarConfig);
      setWalletPublicKey(connection.publicKey);
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "Wallet connection failed.");
    }
  }

  async function submitProofToStellar() {
    if (!stellarConfig.isTestnetConfigured) {
      setSubmitError(`Live Testnet Mode is missing: ${stellarConfig.missingConfigKeys.join(", ")}`);
      setSubmitPhase("failed");
      return;
    }

    if (!walletPublicKey) {
      setSubmitError("Connect Freighter before submitting to Stellar.");
      setSubmitPhase("failed");
      return;
    }

    if (!contractProof) {
      setSubmitError("Generate and format a Groth16 proof before submitting.");
      setSubmitPhase("failed");
      return;
    }

    const validationError = validateLiveMandateProof(liveMandate, contractProof.publicInputsForContract, amount);
    if (validationError) {
      setSubmitError(validationError);
      setSubmitPhase("failed");
      return;
    }

    if (liveMandate && walletPublicKey !== liveMandate.agentPublicKey) {
      setSubmitError("Connected wallet does not match the seeded mandate agent.");
      setSubmitPhase("failed");
      return;
    }

    setSubmitError(null);

    try {
      const publicInputs = contractProof.publicInputsForContract;
      const mandate = liveMandate;
      if (!mandate) throw new Error("Run `npm run seed:live-mandate` first.");
      const result = await executePactraPayment(
        stellarConfig,
        {
          agent: walletPublicKey,
          mandateId: mandate.mandateId,
          vendor: mandate.vendorPublicKey,
          vendorHash: publicInputs[1],
          amount: mandate.amountToPay,
          amountInput: publicInputs[2],
          invoiceCommitment: publicInputs[3],
          nullifier: publicInputs[4],
          mandateIdHash: publicInputs[5],
          proofBytes: contractProof.proofBytes,
          publicInputs
        },
        setSubmitPhase
      );

      const receipt: LiveReceipt = {
        transactionHash: result.hash,
        pactraContractId: result.pactraContractId,
        verifierContractId: result.verifierContractId,
        tokenContractId: result.tokenContractId,
        mandateId: mandate.mandateId,
        vendor: mandate.vendorPublicKey,
        amount: mandate.amountToPay,
        invoiceCommitment: publicInputs[3],
        nullifier: publicInputs[4],
        proofStatus: "verified",
        escrowReleaseStatus: result.status === "SUCCESS" ? "payment_released" : result.status
      };
      setLiveReceipt(receipt);
      window.localStorage.setItem("pactra:lastReceipt", JSON.stringify(receipt));
      navigate("/receipt");
    } catch (error) {
      setSubmitError(explainSubmitError(error));
      setSubmitPhase("failed");
    }
  }

  const privateItems: SignalRow[] = [
    ["Policy commitment", short(policy.policyCommitment)],
    ["Approved vendor", "CloudAPI"],
    ["Invoice secret", short(policy.invoiceSecret)],
    ["Policy salt", short(policy.policySalt)]
  ];

  const requestItems: SignalRow[] = [
    ["Vendor", policy.vendorAddresses[0]],
    ["Amount", formatUsdc(amount)],
    ["Invoice commitment", short(policy.invoiceCommitment)],
    ["Proof bundle", proof ? "Ready" : "Rejected"]
  ];

  const verifiedItems: SignalRow[] = [
    ["Verifier", proofStatus === "Groth16 verified" || proofStatus === "Escrow released" ? "Accepted" : "Waiting"],
    ["Escrow", proofStatus === "Escrow released" ? "Released" : "Locked"],
    ["Receipt", proofStatus === "Escrow released" ? "Emitted" : short(policy.mandateId)],
    ["Nullifier", proof ? short(proof.nullifier) : "Invalid"]
  ];

  const paymentState = proof ? proofStatus : "Policy mismatch";
  const isReleased = proofStatus === "Escrow released";
  const isVerified = proofStatus === "Groth16 verified" || isReleased;
  const decisionTitle = proof ? (isReleased ? "Payment released" : "Ready for release") : "Payment blocked";
  const decisionCopy = proof
    ? "The request satisfies Ada's private mandate, so Pactra can unlock the exact payment from the vault."
    : "The request no longer matches the committed invoice rule, so escrow stays locked.";

  const proofInputs = proof?.publicInputsForContract ?? [
    policy.policyCommitment,
    policy.vendorHashes[0],
    amount,
    policy.invoiceCommitment,
    "Invalid",
    "Invalid"
  ];

  const publicInputRows = [
    ["00", "policy_commitment", short(proofInputs[0]), "private rule committed"],
    ["01", "vendor_hash", short(proofInputs[1]), "CloudAPI approved"],
    ["02", "amount", formatUsdc(proofInputs[2]), "exact invoice value"],
    ["03", "invoice_commitment", short(proofInputs[3]), "invoice bound to proof"],
    ["04", "nullifier", short(proofInputs[4]), "single-use receipt"],
    ["05", "mandate_id_hash", short(proofInputs[5]), "escrow request scoped"]
  ];

  const reviewCards = [
    {
      icon: <LockKeyhole />,
      label: "Private rule",
      title: "Ada approved one invoice",
      body: "CloudAPI may be paid once, for the committed invoice amount, before the mandate expires."
    },
    {
      icon: <ShieldCheck />,
      label: "Proof check",
      title: isVerified ? "Verifier accepted" : "Verifier waiting",
      body: "The agent proves the hidden rule matches this request without exposing the invoice secret."
    },
    {
      icon: <ReceiptText />,
      label: "Receipt",
      title: isReleased ? "Nullifier recorded" : "No replay allowed",
      body: "A successful release writes a receipt and burns the invoice nullifier so it cannot be reused."
    }
  ];

  const mandateChecks = [
    ["Vendor", "CloudAPI is approved", proof ? "Pass" : "Blocked"],
    ["Amount", `${formatUsdc(amount)} requested`, proof ? "Pass" : "Blocked"],
    ["Invoice", "Commitment matches", proof ? "Pass" : "Blocked"],
    ["Replay", proof ? "Fresh nullifier" : "Invalid nullifier", proof ? "Pass" : "Blocked"]
  ];
  const liveValidationError = validateLiveMandateProof(liveMandate, contractProof?.publicInputsForContract, amount);
  const walletMismatch =
    appMode === "testnet" && liveMandate && walletPublicKey && walletPublicKey !== liveMandate.agentPublicKey
      ? "Connected wallet does not match the seeded mandate agent."
      : null;
  const localReceiptReplay =
    appMode === "testnet" &&
    liveMandate &&
    liveReceipt &&
    liveReceipt.mandateId === liveMandate.mandateId &&
    liveReceipt.nullifier === liveMandate.nullifier
      ? "This prepared live demo has already been executed. Run `npm run live:reset` to generate a fresh mandate and nullifier."
      : null;
  const liveSubmitBlocker = localReceiptReplay || walletMismatch || liveValidationError;
  const liveReadinessItems: ReadinessItem[] = [
    {
      label: "Contracts configured",
      ok: stellarConfig.isTestnetConfigured,
      detail: stellarConfig.isTestnetConfigured ? "Pactra, verifier, and token IDs are present." : stellarConfig.missingConfigKeys.join(", ")
    },
    {
      label: "Live mandate loaded",
      ok: Boolean(liveMandate),
      detail: liveMandate ? short(liveMandate.mandateId) : "Run npm run seed:live-mandate."
    },
    {
      label: "Wallet connected",
      ok: Boolean(walletPublicKey),
      detail: walletPublicKey ? short(walletPublicKey) : "Connect Freighter on testnet."
    },
    {
      label: "Wallet matches agent",
      ok: Boolean(liveMandate && walletPublicKey && walletPublicKey === liveMandate.agentPublicKey),
      detail: walletMismatch || (liveMandate ? short(liveMandate.agentPublicKey) : "Waiting for seeded mandate.")
    },
    {
      label: "Proof generated",
      ok: Boolean(contractProof),
      detail: contractProof ? `${contractProof.proofBytes.length} bytes formatted for Pactra.` : "Generate a real Groth16 proof."
    },
    {
      label: "Proof matches mandate",
      ok: Boolean(contractProof && liveMandate && !liveValidationError),
      detail: contractProof && liveMandate ? liveValidationError || "Public inputs match the seeded mandate." : "Waiting for proof and mandate."
    },
    {
      label: "One-off release unused",
      ok: !localReceiptReplay,
      detail: localReceiptReplay || "No local receipt for this nullifier."
    }
  ];
  const isSubmitting =
    submitPhase === "preparing_transaction" ||
    submitPhase === "awaiting_signature" ||
    submitPhase === "submitting_to_stellar" ||
    submitPhase === "confirming";

  return (
    <main className="site-shell">
      <Nav route={route} onNavigate={navigate} onExecute={runProofFromNav} />

      {route === "/" && (
      <section className="cinema-section hero-section">
        <FadingVideo
          src={HERO_VIDEO}
          className="hero-video"
          style={{ width: "120%", height: "120%" }}
        />
        <div className="hero-content">
          <BlurText text="ZK payment firewall for autonomous agents" />

          <p className="hero-lede reveal reveal-delay-3">
            Let AI agents pay vendors, APIs, and contractors from a Stellar payment vault only after they prove they followed your private spending mandate.
          </p>

          <div className="hero-actions reveal reveal-delay-4">
            <button className="glass-button strong" onClick={runProofFromNav}>
              Execute payment
              <ArrowUpRight size={18} />
            </button>
            <button className="glass-button quiet" onClick={regeneratePolicy}>
              <RefreshCw size={17} />
              New mandate
            </button>
          </div>

          <div className="metric-row reveal reveal-delay-5">
            <Metric icon={<CircuitBoard />} value="256 bytes" label="Groth16 proof payload" />
            <Metric icon={<Fingerprint />} value="6 inputs" label="Public verifier boundary" />
          </div>
        </div>

        <div className="stack-row reveal reveal-delay-6">
          <span className="liquid-glass">Proof-gated spending for autonomous agents</span>
          <div className="stack-names">
            <span>Soroban</span>
            <span>Circom</span>
            <span>Groth16</span>
            <span>BN254</span>
            <span>Stellar</span>
          </div>
        </div>
      </section>
      )}

      {route === "/review" && (
      <section className="cinema-section proof-section">
        <FadingVideo src={CAPABILITIES_VIDEO} className="section-video" />

        <div className="proof-layout">
          <header className="section-heading reveal">
            <p>// Payment Review</p>
            <h2>
              Review this
              <br />
              agent payment
            </h2>
          </header>

          <div className="review-page reveal reveal-delay-1">
            <ModeSwitch
              mode={appMode}
              onModeChange={setAppMode}
              configured={stellarConfig.isTestnetConfigured}
              missing={stellarConfig.missingConfigKeys}
              walletPublicKey={walletPublicKey}
              onConnectWallet={connectLiveWallet}
            />

            {appMode === "testnet" && (
              <>
                <LiveReadinessPanel items={liveReadinessItems} />
                <LiveMandatePanel
                  mandate={liveMandate}
                  checked={liveMandateChecked}
                  validationError={liveSubmitBlocker}
                />
              </>
            )}

            <section className="proof-ledger" aria-label="Pactra payment review">
              <div className="payment-hero">
                <div>
                  <span className="eyebrow">Payment request</span>
                  <h3>{policy.vendorAddresses[0]}</h3>
                  <p>
                    Invoice {policy.invoiceId} from {policy.agent}
                  </p>
                </div>
                <div className="amount-lockup">
                  <span>Amount</span>
                  <strong>{formatUsdc(amount)}</strong>
                </div>
              </div>

              <div className="review-strip">
                {reviewCards.map((card, index) => (
                  <ReviewCard key={card.label} card={card} index={index} />
                ))}
              </div>

              <div className={`decision-panel ${proof ? "ok" : "bad"}`}>
                <div>
                  <span className="eyebrow">Mandate decision</span>
                  <h3>{decisionTitle}</h3>
                  <p>{decisionCopy}</p>
                </div>
                <div className={`verifier-pill ${proof ? "ok" : "bad"}`}>
                  {proof ? <BadgeCheck size={17} /> : <LockKeyhole size={17} />}
                  {paymentState}
                </div>
              </div>

              <div className="mandate-checks" aria-label="Mandate checks">
                {mandateChecks.map(([label, value, state]) => (
                  <div key={label} className={state === "Pass" ? "check-row ok" : "check-row bad"}>
                    <span>{label}</span>
                    <strong>{value}</strong>
                    <em>{state}</em>
                  </div>
                ))}
              </div>

              <div className="review-actions">
                <label className="field">
                  Invoice amount
                  <input value={amount} onChange={(event) => setAmount(event.target.value)} />
                </label>

                <div className={`status ${proof ? "ok" : "bad"}`}>
                  {proof ? <BadgeCheck size={18} /> : <LockKeyhole size={18} />}
                  {proof ? proofStatus : "Policy mismatch"}
                </div>

                <div className="console-actions">
                  <button onClick={regeneratePolicy}>
                    <RefreshCw size={16} />
                    New mandate
                  </button>
                  <button className="primary" onClick={executePayment}>
                    <Send size={16} />
                    Execute
                  </button>
                </div>
              </div>

              <div className="proof-lab" aria-label="Browser proof generation">
                <div>
                  <span className="eyebrow">Proof mode</span>
                  <h3>
                    {proofMode === "browser"
                      ? "Browser Groth16 proving"
                      : proofMode === "prepared_live"
                        ? "Prepared live Groth16 proof"
                        : "Fallback demo proof"}
                  </h3>
                  <p>
                    {proofMode === "browser"
                      ? "Primary path: generate a real Groth16 proof from precompiled Circom artifacts in this browser."
                      : proofMode === "prepared_live"
                        ? "Loaded from the latest live reset bundle. The proof is public; private witness values are not written to public files."
                        : "Fallback demo proof. Browser proving is the primary path."}
                  </p>
                </div>

                <div className="proof-controls">
                  <button onClick={generateRealGroth16Proof}>
                    <CircuitBoard size={16} />
                    Generate Real Groth16 Proof
                  </button>
                  <button onClick={useDemoProofFixture}>
                    <RefreshCw size={16} />
                    Use Demo Proof Fixture
                  </button>
                </div>

                <ProofStatusPanel
                  phase={browserProofPhase}
                  summary={browserProofSummary}
                  error={browserProofError}
                  proofBytes={contractProof?.proofBytes.length}
                />

                {appMode === "testnet" && (
                  <section className={`submit-panel ${submitPhase === "failed" ? "bad" : "ok"}`}>
                    <div>
                      <span className="eyebrow">Live Testnet</span>
                      <h3>Submit proof to Stellar</h3>
                      <p>{submitPhase.replaceAll("_", " ")}</p>
                      {submitError && <p className="proof-error">{submitError}</p>}
                    </div>
                    <button
                      onClick={submitProofToStellar}
                      disabled={!stellarConfig.isTestnetConfigured || !walletPublicKey || !contractProof || Boolean(liveSubmitBlocker) || isSubmitting}
                    >
                      <Send size={16} />
                      Submit Proof to Stellar
                    </button>
                  </section>
                )}
              </div>
            </section>
          </div>
        </div>
      </section>
      )}

      {route === "/audit" && (
      <section className="cinema-section audit-section">
        <FadingVideo src={CAPABILITIES_VIDEO} className="section-video" />

        <div className="proof-layout audit-layout">
          <header className="section-heading reveal">
            <p>// Proof Audit</p>
            <h2>
              Why Pactra
              <br />
              trusts the release
            </h2>
          </header>

          <div className="audit-grid reveal reveal-delay-1">
            <section className="proof-ledger" aria-label="Pactra proof packet">
              <div className="technical-trail">
                <div className="trail-title">
                  <span className="eyebrow">Verifier evidence</span>
                  <p>Public inputs used by the real Groth16 boundary</p>
                </div>
                <div className="packet-table" aria-label="Public input order">
                  <div className="packet-table-head">
                    <span>Index</span>
                    <span>Signal</span>
                    <span>Value</span>
                    <span>Meaning</span>
                  </div>
                  {publicInputRows.map(([index, signal, value, note]) => (
                    <PacketRow key={signal} index={index} signal={signal} value={value} note={note} />
                  ))}
                </div>
              </div>
            </section>
          </div>
        </div>
      </section>
      )}

      {route === "/receipt" && (
      <section className="cinema-section audit-section">
        <FadingVideo src={CAPABILITIES_VIDEO} className="section-video" />

        <div className="proof-layout receipt-layout">
          <header className="section-heading reveal">
            <p>// Receipt</p>
            <h2>
              What Pactra
              <br />
              records on release
            </h2>
          </header>

          <div className="receipt-page reveal reveal-delay-1">
            <aside className="settlement-console" aria-label="Pactra proof receipt">
              <div className="console-header">
                <div>
                  <span className="eyebrow">Receipt trail</span>
                  <h3>What gets recorded</h3>
                </div>
                <ReceiptText size={23} />
              </div>

              <div className="signal-stack">
                {liveReceipt ? (
                  <>
                    <SignalColumn icon={<LockKeyhole />} title="Contracts" rows={[
                      ["Pactra", short(liveReceipt.pactraContractId)],
                      ["Verifier", short(liveReceipt.verifierContractId)],
                      ["Token", short(liveReceipt.tokenContractId)],
                      ["Tx hash", short(liveReceipt.transactionHash), stellarExpertTxUrl(liveReceipt.transactionHash)]
                    ]} />
                    <SignalColumn icon={<Send />} title="Payment" rows={[
                      ["Mandate", short(liveReceipt.mandateId)],
                      ["Vendor", short(liveReceipt.vendor)],
                      ["Amount", formatUsdc(liveReceipt.amount)],
                      ["Proof", liveReceipt.proofStatus]
                    ]} />
                    <SignalColumn icon={<ReceiptText />} title="Receipt" rows={[
                      ["Invoice", short(liveReceipt.invoiceCommitment)],
                      ["Nullifier", short(liveReceipt.nullifier)],
                      ["Escrow", liveReceipt.escrowReleaseStatus],
                      ["Mode", "Live testnet"]
                    ]} />
                  </>
                ) : (
                  <>
                    <SignalColumn icon={<LockKeyhole />} title="Hidden Policy" rows={privateItems} />
                    <SignalColumn icon={<Send />} title="Agent Call" rows={requestItems} />
                    <SignalColumn icon={<ReceiptText />} title="Receipt" rows={verifiedItems} />
                  </>
                )}
              </div>

              <div className="receipt-line">
                <Sparkles size={17} />
                No budget bucket. No replay. Just this invoice.
              </div>
            </aside>
          </div>
        </div>
      </section>
      )}
    </main>
  );
}

function Nav({
  route,
  onNavigate,
  onExecute
}: {
  route: Route;
  onNavigate: (route: Route, event?: React.MouseEvent<HTMLAnchorElement>) => void;
  onExecute: () => void;
}) {
  return (
    <nav className="nav-shell">
      <a className="brand liquid-glass" href="/" onClick={(event) => onNavigate("/", event)} aria-label="Pactra home">
        p
      </a>
      <div className="nav-links liquid-glass">
        <a className={route === "/" ? "active" : undefined} href="/" onClick={(event) => onNavigate("/", event)}>
          Mandate
        </a>
        <a
          className={route === "/review" ? "active" : undefined}
          href="/review"
          onClick={(event) => onNavigate("/review", event)}
        >
          Review
        </a>
        <a
          className={route === "/audit" ? "active" : undefined}
          href="/audit"
          onClick={(event) => onNavigate("/audit", event)}
        >
          Audit
        </a>
        <a
          className={route === "/receipt" ? "active" : undefined}
          href="/receipt"
          onClick={(event) => onNavigate("/receipt", event)}
        >
          Receipt
        </a>
        <button onClick={onExecute}>
          Run proof
          <ArrowUpRight size={16} />
        </button>
      </div>
      <div className="nav-spacer" aria-hidden="true" />
    </nav>
  );
}

function FadingVideo({
  src,
  className,
  style
}: {
  src: string;
  className?: string;
  style?: React.CSSProperties;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const fadingOutRef = useRef(false);
  const timeoutRef = useRef<number | null>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const fadeTo = (target: number, duration: number) => {
      if (rafRef.current !== null) window.cancelAnimationFrame(rafRef.current);
      const start = window.performance.now();
      const current = Number.parseFloat(video.style.opacity || "0");

      const tick = (time: number) => {
        const progress = Math.min((time - start) / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 3);
        video.style.opacity = String(current + (target - current) * eased);
        if (progress < 1) {
          rafRef.current = window.requestAnimationFrame(tick);
        }
      };

      rafRef.current = window.requestAnimationFrame(tick);
    };

    const onLoadedData = () => {
      video.style.opacity = "0";
      void video.play();
      fadeTo(1, 500);
    };

    const onTimeUpdate = () => {
      if (!video.duration || fadingOutRef.current) return;
      const remaining = video.duration - video.currentTime;
      if (remaining <= 0.55 && remaining > 0) {
        fadingOutRef.current = true;
        fadeTo(0, 500);
      }
    };

    const onEnded = () => {
      video.style.opacity = "0";
      timeoutRef.current = window.setTimeout(() => {
        video.currentTime = 0;
        fadingOutRef.current = false;
        void video.play();
        fadeTo(1, 500);
      }, 100);
    };

    video.addEventListener("loadeddata", onLoadedData);
    video.addEventListener("timeupdate", onTimeUpdate);
    video.addEventListener("ended", onEnded);

    return () => {
      if (rafRef.current !== null) window.cancelAnimationFrame(rafRef.current);
      if (timeoutRef.current !== null) window.clearTimeout(timeoutRef.current);
      video.removeEventListener("loadeddata", onLoadedData);
      video.removeEventListener("timeupdate", onTimeUpdate);
      video.removeEventListener("ended", onEnded);
    };
  }, []);

  return (
    <video
      ref={videoRef}
      className={className}
      style={{ opacity: 0, ...style }}
      autoPlay
      muted
      playsInline
      preload="auto"
      src={src}
    />
  );
}

function BlurText({ text }: { text: string }) {
  const ref = useRef<HTMLHeadingElement | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!ref.current) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) setVisible(true);
      },
      { threshold: 0.1 }
    );
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);

  return (
    <h1 ref={ref} className="blur-heading" aria-label={text}>
      {text.split(" ").map((word, index) => (
        <span
          key={`${word}-${index}`}
          className={visible ? "blur-word show" : "blur-word"}
          style={{ animationDelay: `${index * 0.1}s` }}
        >
          {word}
        </span>
      ))}
    </h1>
  );
}

function Metric({ icon, value, label }: { icon: React.ReactNode; value: string; label: string }) {
  return (
    <div className="metric-card liquid-glass">
      <div className="metric-icon">{icon}</div>
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

function ModeSwitch({
  mode,
  onModeChange,
  configured,
  missing,
  walletPublicKey,
  onConnectWallet
}: {
  mode: AppMode;
  onModeChange: (mode: AppMode) => void;
  configured: boolean;
  missing: string[];
  walletPublicKey: string | null;
  onConnectWallet: () => void;
}) {
  return (
    <section className="mode-switch">
      <div className="segmented-control" role="tablist" aria-label="Pactra mode">
        <button className={mode === "demo" ? "active" : undefined} onClick={() => onModeChange("demo")}>
          Demo Mode
        </button>
        <button
          className={mode === "testnet" ? "active" : undefined}
          onClick={() => onModeChange("testnet")}
          disabled={!configured}
        >
          Live Testnet Mode
        </button>
      </div>

      <div className={`mode-status ${configured ? "ok" : "bad"}`}>
        <span>{configured ? "Testnet config ready" : "Testnet config missing"}</span>
        {!configured && <p>Add {missing.join(", ")} to frontend/.env.local.</p>}
        {mode === "testnet" && configured && (
          <button onClick={onConnectWallet}>
            {walletPublicKey ? short(walletPublicKey) : "Connect Wallet"}
          </button>
        )}
      </div>
    </section>
  );
}

function LiveReadinessPanel({ items }: { items: ReadinessItem[] }) {
  return (
    <section className="live-readiness" aria-label="Live readiness">
      <div className="readiness-title">
        <span className="eyebrow">Live readiness</span>
        <strong>{items.every((item) => item.ok) ? "Ready to submit" : "Check before submit"}</strong>
      </div>
      <div className="readiness-grid">
        {items.map((item) => (
          <div key={item.label} className={`readiness-item ${item.ok ? "ok" : "bad"}`}>
            {item.ok ? <BadgeCheck size={16} /> : <LockKeyhole size={16} />}
            <div>
              <span>{item.label}</span>
              <p>{item.detail}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function LiveMandatePanel({
  mandate,
  checked,
  validationError
}: {
  mandate: LiveMandate | null;
  checked: boolean;
  validationError: string | null;
}) {
  if (!checked) {
    return (
      <section className="live-mandate-panel">
        <span className="eyebrow">Live mandate</span>
        <h3>Checking live mandate state</h3>
      </section>
    );
  }

  if (!mandate) {
    return (
      <section className="live-mandate-panel bad">
        <span className="eyebrow">Live mandate</span>
        <h3>Run `npm run seed:live-mandate` first</h3>
        <p>The deployed Pactra contract needs a matching funded mandate before live submit can succeed.</p>
      </section>
    );
  }

  return (
    <section className={`live-mandate-panel ${validationError ? "bad" : "ok"}`}>
      <div>
        <span className="eyebrow">Live mandate loaded</span>
        <h3>{short(mandate.mandateId)}</h3>
        <p>{validationError || "Seeded mandate matches the current proof boundary."}</p>
      </div>
      <dl>
        <div>
          <dt>Escrow</dt>
          <dd>{formatUsdc(mandate.fundingAmount)}</dd>
        </div>
        <div>
          <dt>Invoice</dt>
          <dd>{short(mandate.invoiceCommitment)}</dd>
        </div>
        <div>
          <dt>Nullifier</dt>
          <dd>{short(mandate.nullifier)}</dd>
        </div>
        <div>
          <dt>Agent</dt>
          <dd>{short(mandate.agentPublicKey)}</dd>
        </div>
      </dl>
    </section>
  );
}

function ProofStatusPanel({
  phase,
  summary,
  error,
  proofBytes
}: {
  phase: BrowserProofPhase;
  summary: SafeProofSummary | null;
  error: string | null;
  proofBytes?: number;
}) {
  const readablePhase = phase.replaceAll("_", " ");

  return (
    <section className={`proof-status ${phase === "failed" ? "bad" : "ok"}`}>
      <div className="proof-status-line">
        {phase === "failed" ? <LockKeyhole size={17} /> : <BadgeCheck size={17} />}
        <span>{readablePhase}</span>
      </div>

      {error && <p className="proof-error">{error}</p>}

      {summary && (
        <dl className="proof-summary">
          <div>
            <dt>Circuit</dt>
            <dd>{summary.circuit}</dd>
          </div>
          <div>
            <dt>Proof system</dt>
            <dd>{summary.proofSystem}</dd>
          </div>
          <div>
            <dt>Curve</dt>
            <dd>{summary.curve}</dd>
          </div>
          <div>
            <dt>Public inputs</dt>
            <dd>{summary.publicInputCount}</dd>
          </div>
          <div>
            <dt>Proof bytes</dt>
            <dd>{proofBytes ?? summary.proofByteLength}</dd>
          </div>
          <div>
            <dt>Generated</dt>
            <dd>{summary.generationMs ? `${summary.generationMs} ms` : "Ready"}</dd>
          </div>
          <div>
            <dt>Invoice commitment</dt>
            <dd>{short(summary.invoiceCommitment)}</dd>
          </div>
          <div>
            <dt>Nullifier</dt>
            <dd>{short(summary.nullifier)}</dd>
          </div>
        </dl>
      )}
    </section>
  );
}

function ReviewCard({
  card,
  index
}: {
  card: { icon: React.ReactNode; label: string; title: string; body: string };
  index: number;
}) {
  return (
    <article className="review-card">
      <div className="step-marker">
        <span className="step-icon">{card.icon}</span>
        <span className="step-count">{String(index + 1).padStart(2, "0")}</span>
      </div>
      <div>
        <p>{card.label}</p>
        <h4>{card.title}</h4>
        <span className="step-body">{card.body}</span>
      </div>
    </article>
  );
}

function PacketRow({ index, signal, value, note }: { index: string; signal: string; value: string; note: string }) {
  return (
    <div className="packet-row">
      <span className="packet-index">{index}</span>
      <span className="packet-signal">{signal}</span>
      <span className="packet-value">{value}</span>
      <span className="packet-note">{note}</span>
    </div>
  );
}

function SignalColumn({
  icon,
  title,
  rows
}: {
  icon: React.ReactNode;
  title: string;
  rows: SignalRow[];
}) {
  return (
    <section className="signal-column">
      <div className="signal-title">
        {icon}
        <h4>{title}</h4>
      </div>
      <dl>
        {rows.map(([label, value, href]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>
              {href ? (
                <a className="signal-link" href={href} target="_blank" rel="noreferrer">
                  {value}
                  <ArrowUpRight size={13} />
                </a>
              ) : (
                value
              )}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function short(value: string): string {
  if (value.length <= 18) return value;
  return `${value.slice(0, 10)}...${value.slice(-6)}`;
}

function formatUsdc(value: string): string {
  try {
    const units = BigInt(value);
    return `${Number(units) / 10_000_000} test USDC`;
  } catch {
    return value;
  }
}

function stellarExpertTxUrl(hash: string): string {
  return `https://stellar.expert/explorer/testnet/tx/${hash}`;
}

function proofBundleFromLiveMandate(mandate: LiveMandate): ContractProofBundle | null {
  if (!mandate.proofBytes || mandate.publicInputs.length !== 6) return null;

  try {
    const proofBytes = bytesFromHex(mandate.proofBytes);
    if (proofBytes.length !== 256) return null;

    return {
      proofBytes,
      proofHex: mandate.proofBytes,
      publicInputsForContract: mandate.publicInputs,
      summary: {
        circuit: "mandate.circom",
        proofSystem: "Groth16",
        curve: "BN254",
        publicInputCount: mandate.publicInputs.length,
        proofByteLength: proofBytes.length,
        invoiceCommitment: mandate.invoiceCommitment,
        nullifier: mandate.nullifier
      }
    };
  } catch {
    return null;
  }
}

function explainSubmitError(error: unknown): string {
  const raw = error instanceof Error ? error.message : "Failed to submit Pactra payment.";
  const code = raw.match(/Error\(Contract,\s*#(\d+)\)/)?.[1];
  const codeMessages: Record<string, string> = {
    "4": "Mandate not found. Run `npm run seed:live-mandate` and reload Live Testnet Mode.",
    "7": "This one-off mandate has already paid out. Run `npm run live:reset`.",
    "9": "Wrong wallet. Connect Freighter as the seeded mandate agent.",
    "10": "Mandate expired. Seed a fresh live mandate.",
    "11": "This prepared live demo has already been executed. Run `npm run live:reset` to generate a fresh mandate and nullifier.",
    "12": "Mandate is not funded enough for this payment. Seed or fund a fresh mandate.",
    "14": "Groth16 verifier rejected the proof. Regenerate the proof and confirm public inputs match.",
    "15": "Invalid proof shape. Pactra expects the 256-byte Groth16 proof encoding.",
    "16": "Invalid public input count. Pactra expects exactly six public inputs.",
    "17": "Public input mismatch. The payment request does not match the seeded mandate."
  };

  if (code && codeMessages[code]) return codeMessages[code];

  const lower = raw.toLowerCase();
  if (lower.includes("user") && lower.includes("reject")) return "Wallet rejected the signature request.";
  if (lower.includes("freighter")) return `Freighter wallet error: ${raw}`;
  if (lower.includes("not found") && lower.includes("account")) return "Wallet account was not found on testnet. Fund it with Stellar testnet funds.";
  if (lower.includes("simulation") && lower.includes("failed")) return `Stellar simulation failed: ${raw}`;
  if (lower.includes("rpc") || lower.includes("network") || lower.includes("fetch")) return `Stellar RPC/network error: ${raw}`;

  return `Stellar submit failed: ${raw}`;
}

function normalizeRoute(pathname: string): Route {
  if (pathname === "/review" || pathname === "/audit" || pathname === "/receipt") {
    return pathname;
  }

  return "/";
}

function readStoredReceipt(): LiveReceipt | null {
  try {
    const raw = window.localStorage.getItem("pactra:lastReceipt");
    return raw ? (JSON.parse(raw) as LiveReceipt) : null;
  } catch {
    return null;
  }
}

createRoot(document.getElementById("root")!).render(<App />);
