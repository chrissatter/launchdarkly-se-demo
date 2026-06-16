import { useEffect, useMemo, useState } from "react";
import { useFlags, useLDClient } from "launchdarkly-react-client-sdk";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Bell,
  Bot,
  CheckCircle2,
  FlaskConical,
  MousePointerClick,
  RotateCcw,
  ShieldCheck,
  Target,
  UserRound
} from "lucide-react";

const HERO_FLAG_KEY = "new-landing-page-hero";
const AI_CONFIG_KEY = "support-chatbot-ai-config";
const EXPERIMENT_EVENT_KEY = "hero-cta-clicked";
const EXPERIMENT_COHORT = "landing-page-q3";
const SIMULATED_VISITOR_COUNT = 24;

const defaultAiConfig = {
  name: "Concise support guide",
  model: "gpt-4o-mini",
  temperature: 0.2,
  systemPrompt:
    "You are an ABC SaaS support assistant. Give concise, accurate answers, ask one clarifying question when needed, and recommend escalation for account-specific issues.",
  welcomeMessage: "Ask about onboarding, billing, incidents, or release safety.",
  responseStyle: "concise",
  escalationThreshold: 0.7
};

const demoContexts = [
  {
    label: "Anonymous prospect",
    kind: "user",
    key: "visitor-free-001",
    name: "Morgan Free",
    email: "morgan.free@example.com",
    plan: "free",
    companySize: 20,
    region: "US",
    betaAccess: false
  },
  {
    label: "Individually targeted beta user",
    kind: "user",
    key: "alice-beta-001",
    name: "Alice Beta",
    email: "alice.beta@example.com",
    plan: "pro",
    companySize: 180,
    region: "US",
    betaAccess: true
  },
  {
    label: "Enterprise rule match",
    kind: "user",
    key: "evan-enterprise-001",
    name: "Evan Enterprise",
    email: "evan.enterprise@example.com",
    plan: "enterprise",
    companySize: 2500,
    region: "EU",
    betaAccess: false
  }
];

const rolloutEvents = [
  "Create flag with default off variation",
  "Target internal beta user by key",
  "Add rule: plan is enterprise OR companySize greater than 1000",
  "Attach trigger to turn targeting off during an incident",
  "Create an experiment metric from hero-cta-clicked",
  "Change chatbot prompts and models with an AI Config"
];

function App({ launchDarklyReady }) {
  const flags = useFlags();
  const ldClient = useLDClient();
  const [activeContext, setActiveContext] = useState(demoContexts[0]);
  const [changeLog, setChangeLog] = useState([]);
  const [incidentState, setIncidentState] = useState("healthy");
  const [ctaClicks, setCtaClicks] = useState(0);
  const [isSimulating, setIsSimulating] = useState(false);
  const [experimentRun, setExperimentRun] = useState(null);
  const [chatQuestion, setChatQuestion] = useState("How do I roll back a risky release?");
  const [chatHistory, setChatHistory] = useState([]);

  const rawHeroFlag = flags[HERO_FLAG_KEY];
  const rawAiConfig = flags[AI_CONFIG_KEY];
  const heroFlagPresent = Object.prototype.hasOwnProperty.call(flags, HERO_FLAG_KEY);
  const aiConfigPresent = Object.prototype.hasOwnProperty.call(flags, AI_CONFIG_KEY);
  const heroEnabled = rawHeroFlag === true;
  const aiConfig = useMemo(() => normalizeAiConfig(rawAiConfig), [rawAiConfig]);

  useEffect(() => {
    if (!ldClient) return undefined;

    const handleChange = (value, previous) => {
      setChangeLog((current) => [
        {
          id: crypto.randomUUID(),
          text: `${HERO_FLAG_KEY} changed from ${String(previous)} to ${String(value)}`,
          at: new Date().toLocaleTimeString()
        },
        ...current
      ].slice(0, 5));
    };

    ldClient.on(`change:${HERO_FLAG_KEY}`, handleChange);
    return () => ldClient.off(`change:${HERO_FLAG_KEY}`, handleChange);
  }, [ldClient]);

  async function identifyContext(context) {
    setActiveContext(context);
    if (ldClient) {
      await ldClient.identify(context);
    }
  }

  function handleCtaClick() {
    setCtaClicks((count) => count + 1);
    ldClient?.track(EXPERIMENT_EVENT_KEY, {
      contextKey: activeContext.key,
      flagKey: HERO_FLAG_KEY,
      variation: heroEnabled ? "new" : "control",
      source: "manual-demo-click"
    });
  }

  function handleAskAssistant(event) {
    event.preventDefault();
    const question = chatQuestion.trim();
    if (!question) return;

    const answer = generateSupportAnswer(question, aiConfig);
    const message = {
      id: crypto.randomUUID(),
      question,
      answer,
      configName: aiConfig.name,
      model: aiConfig.model,
      at: new Date().toLocaleTimeString()
    };

    setChatHistory((current) => [message, ...current].slice(0, 3));
    ldClient?.track("chatbot-message-sent", {
      configKey: AI_CONFIG_KEY,
      configName: aiConfig.name,
      model: aiConfig.model,
      responseStyle: aiConfig.responseStyle,
      source: "ai-config-demo"
    });
  }

  function handleHelpfulClick(message, helpful) {
    ldClient?.track(helpful ? "chatbot-helpful-clicked" : "chatbot-escalation-clicked", {
      configKey: AI_CONFIG_KEY,
      configName: message.configName,
      model: message.model,
      source: "ai-config-demo"
    });
  }

  async function simulateExperimentTraffic() {
    if (!ldClient || isSimulating) return;

    setIsSimulating(true);
    const previousContext = activeContext;
    let conversions = 0;

    try {
      for (let index = 0; index < SIMULATED_VISITOR_COUNT; index += 1) {
        const context = {
          kind: "user",
          key: `experiment-visitor-${Date.now()}-${index}`,
          name: `Experiment Visitor ${index + 1}`,
          plan: index % 2 === 0 ? "pro" : "free",
          companySize: 50 + index * 25,
          region: index % 3 === 0 ? "EU" : "US",
          betaAccess: false,
          experimentCohort: EXPERIMENT_COHORT
        };

        await ldClient.identify(context);
        const variation = await ldClient.variation(HERO_FLAG_KEY, false);
        const conversionRate = variation === true ? 0.58 : 0.34;
        const converted = Math.random() < conversionRate;

        if (converted) {
          conversions += 1;
          ldClient.track(EXPERIMENT_EVENT_KEY, {
            contextKey: context.key,
            flagKey: HERO_FLAG_KEY,
            variation: variation === true ? "new" : "control",
            experimentCohort: EXPERIMENT_COHORT,
            source: "sample-traffic-generator"
          });
        }
      }

      await ldClient.flush?.();
      await ldClient.identify(previousContext);
      setCtaClicks((count) => count + conversions);
      setExperimentRun({
        visitors: SIMULATED_VISITOR_COUNT,
        conversions,
        at: new Date().toLocaleTimeString()
      });
    } finally {
      setIsSimulating(false);
    }
  }

  const triggerCurl = useMemo(() => {
    return "curl -X POST \"$LD_REMEDIATION_TRIGGER_URL\" -H \"Content-Type: application/json\" -d '{\"eventName\":\"Demo incident: hero conversion errors\",\"url\":\"http://localhost:5173\"}'";
  }, []);

  return (
    <main>
      <section className={`hero ${heroEnabled ? "hero-new" : "hero-control"}`}>
        <nav className="topbar" aria-label="Primary">
          <div className="brand-mark">ABC</div>
          <div className="nav-actions">
            <span className={launchDarklyReady ? "status ready" : "status missing"}>
              {launchDarklyReady ? "LaunchDarkly connected" : "Add VITE_LD_CLIENT_ID"}
            </span>
            <button className="icon-button" type="button" aria-label="Reset demo incident" onClick={() => setIncidentState("healthy")}>
              <RotateCcw size={18} />
            </button>
          </div>
        </nav>

        <div className="demo-stage">
          <div className="landing-preview">
            <div className="eyebrow">
              <ShieldCheck size={18} />
              Safe release demo
            </div>
            {heroEnabled ? (
              <>
                <h1>Launch the new customer experience without waiting for deploys.</h1>
                <p>
                  ABC SaaS can release the redesigned hero to targeted visitors, monitor conversion,
                  and roll back immediately if the launch creates risk.
                </p>
              </>
            ) : (
              <>
                <h1>Reliable operations for modern SaaS teams.</h1>
                <p>
                  The current landing page stays stable while the next experience is hidden behind
                  a feature flag and prepared for controlled release.
                </p>
              </>
            )}
            <div className="hero-actions">
              <button className="primary-button" type="button" onClick={handleCtaClick}>
                {heroEnabled ? "Book a launch review" : "Start free trial"}
                <ArrowRight size={18} />
              </button>
              <button className="secondary-button" type="button" onClick={() => setIncidentState("firing")}>
                <AlertTriangle size={18} />
                Simulate incident
              </button>
            </div>
          </div>

          <aside className="demo-console" aria-label="LaunchDarkly demo console">
            <div className="console-header">
              <div>
                <span className="console-kicker">LaunchDarkly console</span>
                <h2>Run the release live</h2>
              </div>
              <span className={heroEnabled ? "variation-pill enabled" : "variation-pill"}>
                {heroEnabled ? "true" : "false"}
              </span>
            </div>

            <section className="console-section" aria-label="Flag status">
              <div className="panel-header">
                <Activity size={18} />
                <span>Release control</span>
              </div>
              <dl className="flag-table">
                <div>
                  <dt>Flag</dt>
                  <dd>{HERO_FLAG_KEY}</dd>
                </div>
                <div>
                  <dt>Variation</dt>
                  <dd>{heroEnabled ? "new experience" : "control"}</dd>
                </div>
                <div>
                  <dt>Raw value</dt>
                  <dd>{heroFlagPresent ? String(rawHeroFlag) : "not found"}</dd>
                </div>
                <div>
                  <dt>Incident</dt>
                  <dd className={incidentState === "healthy" ? "healthy" : "alerting"}>
                    {incidentState === "healthy" ? "healthy" : "trigger ready"}
                  </dd>
                </div>
                <div>
                  <dt>CTA events</dt>
                  <dd>{ctaClicks}</dd>
                </div>
              </dl>
            </section>

            <section className="console-section" aria-label="Context targeting">
              <div className="section-title compact">
                <UserRound size={18} />
                <h2>Context targeting</h2>
              </div>
              <div className="context-list">
                {demoContexts.map((context) => (
                  <button
                    className={activeContext.key === context.key ? "context-card selected" : "context-card"}
                    key={context.key}
                    type="button"
                    onClick={() => identifyContext(context)}
                  >
                    <span>{context.label}</span>
                    <small>{context.key}</small>
                  </button>
                ))}
              </div>
            </section>

            <section className="console-section experiment-panel" aria-label="Experimentation">
              <div className="section-title compact">
                <MousePointerClick size={18} />
                <h2>Experimentation</h2>
              </div>
              <dl className="flag-table">
                <div>
                  <dt>Metric event</dt>
                  <dd>{EXPERIMENT_EVENT_KEY}</dd>
                </div>
                <div>
                  <dt>Cohort</dt>
                  <dd>{EXPERIMENT_COHORT}</dd>
                </div>
                <div>
                  <dt>Last sample</dt>
                  <dd>
                    {experimentRun
                      ? `${experimentRun.conversions}/${experimentRun.visitors} at ${experimentRun.at}`
                      : "not generated"}
                  </dd>
                </div>
              </dl>
              <button
                className="sample-button"
                type="button"
                onClick={simulateExperimentTraffic}
                disabled={!ldClient || isSimulating}
              >
                <FlaskConical size={16} />
                {isSimulating ? "Generating sample..." : "Generate sample traffic"}
              </button>
            </section>

            <section className="console-section ai-panel" aria-label="AI Config chatbot">
              <div className="section-title compact">
                <Bot size={18} />
                <h2>AI Config</h2>
              </div>
              <dl className="flag-table">
                <div>
                  <dt>Config</dt>
                  <dd>{aiConfigPresent ? AI_CONFIG_KEY : "fallback"}</dd>
                </div>
                <div>
                  <dt>Variant</dt>
                  <dd>{aiConfig.name}</dd>
                </div>
                <div>
                  <dt>Model</dt>
                  <dd>{aiConfig.model}</dd>
                </div>
                <div>
                  <dt>Temp</dt>
                  <dd>{aiConfig.temperature}</dd>
                </div>
              </dl>
              <p className="prompt-preview">{aiConfig.systemPrompt}</p>
              <form className="chat-form" onSubmit={handleAskAssistant}>
                <input
                  aria-label="Support chatbot question"
                  value={chatQuestion}
                  onChange={(event) => setChatQuestion(event.target.value)}
                />
                <button className="sample-button" type="submit">
                  Ask
                </button>
              </form>
              <div className="chat-history">
                {chatHistory.length ? (
                  chatHistory.map((message) => (
                    <article className="chat-message" key={message.id}>
                      <span>{message.question}</span>
                      <p>{message.answer}</p>
                      <div className="chat-actions">
                        <small>{message.model} at {message.at}</small>
                        <button type="button" onClick={() => handleHelpfulClick(message, true)}>
                          Helpful
                        </button>
                        <button type="button" onClick={() => handleHelpfulClick(message, false)}>
                          Escalate
                        </button>
                      </div>
                    </article>
                  ))
                ) : (
                  <p className="empty-chat">{aiConfig.welcomeMessage}</p>
                )}
              </div>
            </section>

            <section className="console-section split-section" aria-label="Active attributes and listener">
              <div>
                <div className="section-title compact">
                  <Target size={18} />
                  <h2>Attributes</h2>
                </div>
                <div className="attribute-grid">
                  <Attribute label="plan" value={activeContext.plan} />
                  <Attribute label="companySize" value={activeContext.companySize} />
                  <Attribute label="region" value={activeContext.region} />
                  <Attribute label="betaAccess" value={String(activeContext.betaAccess)} />
                </div>
              </div>
              <div>
                <div className="section-title compact">
                  <Bell size={18} />
                  <h2>Live listener</h2>
                </div>
                <div className="listener-log compact-log">
                  {changeLog.length ? (
                    changeLog.slice(0, 2).map((entry) => (
                      <div className="log-entry" key={entry.id}>
                        <span>{entry.text}</span>
                        <small>{entry.at}</small>
                      </div>
                    ))
                  ) : (
                    <p>Toggle the flag in LaunchDarkly while this page stays open.</p>
                  )}
                </div>
              </div>
            </section>
          </aside>
        </div>
      </section>

      <section className="playbook" aria-label="Demo playbook">
        <div>
          <div className="section-title">
            <CheckCircle2 size={20} />
            <h2>Reviewer demo path</h2>
          </div>
          <ol>
            {rolloutEvents.map((event) => (
              <li key={event}>{event}</li>
            ))}
          </ol>
        </div>
        <div className="code-panel">
          <div className="section-title">
            <FlaskConical size={20} />
            <h2>Remediation trigger</h2>
          </div>
          <code>{triggerCurl}</code>
        </div>
      </section>
    </main>
  );
}

function Attribute({ label, value }) {
  return (
    <div className="attribute">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function normalizeAiConfig(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return defaultAiConfig;
  }

  return {
    ...defaultAiConfig,
    ...value,
    temperature: Number.isFinite(Number(value.temperature))
      ? Number(value.temperature)
      : defaultAiConfig.temperature,
    escalationThreshold: Number.isFinite(Number(value.escalationThreshold))
      ? Number(value.escalationThreshold)
      : defaultAiConfig.escalationThreshold
  };
}

function generateSupportAnswer(question, config) {
  const normalizedQuestion = question.toLowerCase();
  const stylePrefix = config.responseStyle === "empathetic"
    ? "I understand why you would want a safe path here."
    : "Recommended path:";

  if (normalizedQuestion.includes("rollback") || normalizedQuestion.includes("risky")) {
    return `${stylePrefix} use the feature flag kill switch first, confirm the app receives the update without reload, and then invoke the remediation trigger if the release is causing customer impact.`;
  }

  if (normalizedQuestion.includes("billing") || normalizedQuestion.includes("invoice")) {
    return `${stylePrefix} check the account plan and billing owner, then escalate if payment or contract details are required.`;
  }

  if (normalizedQuestion.includes("onboard") || normalizedQuestion.includes("setup")) {
    return `${stylePrefix} start with the client-side ID, verify the first SDK event in LaunchDarkly, then create targeting rules for the first customer cohort.`;
  }

  return `${stylePrefix} answer with the current product documentation, ask one clarifying question, and escalate when confidence is below ${config.escalationThreshold}.`;
}

export default App;
