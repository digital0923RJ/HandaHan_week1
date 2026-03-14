import { useState, useRef, useEffect, useCallback } from "react";

// ─── Constants ───────────────────────────────────────────────────────────────
const MAX_TURNS = 5;
const MAX_SESSIONS = 3;
const MODEL = "claude-sonnet-4-20250514";

const GREETINGS = [
  { k: "안녕하세요",e: "Hello" },
  { k: "반가워요", e: "Nice to meet you" },
  { k: "잘 부탁해요",e: "Please take care of me" },
  { k: "어서 오세요",e: "Welcome" },
  { k: "좋은 하루예요",e: "It's a good day" },
];

const QUICK_STARTS = [
  "자기소개해 줘",
  "오늘 날씨 어때요?",
  "뭐 먹었어요?",
  "취미가 뭐예요?",
];

const SYSTEM_PROMPT = `You are HanDa (한다), a warm Korean language tutor. Your job:

1. Always respond in Korean (한국어), no matter what language the user writes in.
2. Keep responses natural and conversational — like a friendly Korean friend texting.
3. After your Korean response, always include structured learning data.

Return ONLY valid JSON (no markdown fences), with this exact shape:
{
  "korean_response": "your Korean text here",
  "romanization": "romanized pronunciation of your response",
  "english_hint": "brief English translation/hint",
  "grammar_note": {
    "pattern": "grammar point name (e.g. -아/어요 polite ending)",
    "explanation": "simple English explanation, 1-2 sentences",
    "examples": [
      "Korean example 1 (English translation)",
      "Korean example 2 (English translation)"
    ]
  },
  "correction": null,
  "level_signal": "beginner|intermediate|advanced",
  "is_final": false,
  "final_summary": null
}

If the user made a spelling or grammar error, set "correction" to:
{
  "original": "what they wrote (just the error part)",
  "corrected": "correct version",
  "explanation": "brief English explanation"
}

On the FINAL turn (when instructed), set "is_final": true and "final_summary" to:
{
  "corrections": [{"original":"...","corrected":"...","explanation":"..."}],
  "grammar_covered": ["pattern 1 — brief description", "pattern 2 — brief description"],
  "practice_questions": [
    "Q1 — Korean question (English hint)",
    "Q2 — Korean question (English hint)",
    "Q3 — Korean question (English hint)",
    "Q4 — Korean question (English hint)",
    "Q5 — Korean question (English hint)"
  ],
  "tomorrow_review": [
    "Review topic 1",
    "Review topic 2",
    "Review topic 3"
  ],
  "level": "초급",
  "level_reasoning": "English explanation of the assessed level"
}
Level options: 초급 (beginner), 중급 (intermediate), 고급 (advanced).`;

// ─── API ─────────────────────────────────────────────────────────────────────
async function callClaude(messages: {role: string; content: string}[], isFinal: boolean) {
  const processedMessages = messages.map((m, i) => {
    if (i === messages.length - 1 && m.role === "user" && isFinal) {
      return {
        ...m,
        content: m.content + "\n\n[FINAL TURN: Please provide full summary, corrections, practice questions, and level assessment in final_summary field. Set is_final: true.]"
      };
    }
    return m;
  });

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 1000,
      system: SYSTEM_PROMPT,
      messages: processedMessages,
    }),
  });
  if (!res.ok) throw new Error(`API error ${res.status}`);
  const data = await res.json();
  const raw = data.content?.find((b: {type: string}) => b.type === "text")?.text || "{}";
  try {
    return JSON.parse(raw.replace(/```json|```/g, "").trim());
  } catch {
    return {
      korean_response: raw,
      romanization: "",
      english_hint: "",
      grammar_note: null,
      correction: null,
      level_signal: "beginner",
      is_final: false,
      final_summary: null,
    };
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function genId() {
  return Math.random().toString(36).slice(2);
}

function levelColor(lvl: string) {
  if (lvl === "초급") return { bg: "#22c55e20", text: "#16a34a", border: "#22c55e40" };
  if (lvl === "중급") return { bg: "#f59e0b20", text: "#d97706", border: "#f59e0b40" };
  if (lvl === "고급") return { bg: "#ef444420", text: "#dc2626", border: "#ef444440" };
  return { bg: "#6366f120", text: "#6366f1", border: "#6366f140" };
}

function formatDate(ts: number) {
  const d = new Date(ts);
  return d.toLocaleDateString("ko-KR", { month: "short", day: "numeric" });
}

interface Session {
  id: string;
  createdAt: number;
  title: string;
  messages: Message[];
  finalSummary: FinalSummary | null;
  level: string | null;
}

interface Message {
  id: string;
  role: "user" | "ai" | "error";
  text: string;
  aiData?: AiData;
}

interface AiData {
  korean_response: string;
  romanization: string;
  english_hint: string;
  grammar_note: {
    pattern: string;
    explanation: string;
    examples: string[];
  } | null;
  correction: {
    original: string;
    corrected: string;
    explanation: string;
  } | null;
  level_signal: string;
  is_final: boolean;
  final_summary: FinalSummary | null;
}

interface FinalSummary {
  corrections: {original: string; corrected: string; explanation: string}[];
  grammar_covered: string[];
  practice_questions: string[];
  tomorrow_review: string[];
  level: string;
  level_reasoning: string;
}

function buildNoteText(session: Session) {
  const fs = session.finalSummary;
  if (!fs) return "";
  const lines = [
    "━━━━━━━━━━━━━━━━━━━━━━━━━━",
    "  HanDa 학습 노트 (Study Notes)",
    "━━━━━━━━━━━━━━━━━━━━━━━━━━",
    `📅 날짜: ${new Date(session.createdAt).toLocaleDateString("ko-KR")}`,
    `🎯 레벨 평가: ${fs.level}`,
    `   ${fs.level_reasoning || ""}`,
    "",
    "━━ 📚 문법 포인트 ━━",
    ...(fs.grammar_covered || []).map((g, i) => `  ${i + 1}. ${g}`),
    "",
    "━━ ✏️ 오류 교정 ━━",
    ...((fs.corrections || []).length
      ? (fs.corrections || []).map(c => `  • ${c.original} → ${c.corrected}\n    (${c.explanation})`)
      : ["  (오류 없음 — No errors!)"]),
    "",
    "━━ 📝 연습 문제 ━━",
    ...(fs.practice_questions || []).map((q, i) => `  ${i + 1}. ${q}`),
    "",
    "━━ 🔄 내일 복습 ━━",
    ...(fs.tomorrow_review || []).map(r => `  • ${r}`),
    "",
    "━━━━━━━━━━━━━━━━━━━━━━━━━━",
    "  HanDa — 한국어 학습 앱",
    "━━━━━━━━━━━━━━━━━━━━━━━━━━",
  ];
  return lines.join("\n");
}

// ─── Main App ─────────────────────────────────────────────────────────────────
export default function HandaApp() {
  const [screen, setScreen] = useState("landing"); // landing | chat
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [apiHistory, setApiHistory] = useState<{role: string; content: string}[]>([]);
  const [turnCount, setTurnCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [inputVal, setInputVal] = useState("");
  const [greetIdx, setGreetIdx] = useState(0);
  const [userLevel, setUserLevel] = useState<string | null>(null);
  const [sessionsDone, setSessionsDone] = useState(0);
  const [expandedCards, setExpandedCards] = useState<Record<string, boolean>>({});
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Rotate greeting
  useEffect(() => {
    const t = setInterval(() => setGreetIdx(i => (i + 1) % GREETINGS.length), 2800);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const toggleCard = (id: string) => setExpandedCards(p => ({ ...p, [id]: !p[id] }));

  // ─ Start new session ─
  const beginSession = useCallback(async (text: string) => {
    if (!text.trim() || sessionsDone >= MAX_SESSIONS) return;
    const sid = genId();
    const newSession: Session = {
      id: sid,
      createdAt: Date.now(),
      title: text.slice(0, 30),
      messages: [],
      finalSummary: null,
      level: null,
    };
    setSessions(prev => [newSession, ...prev]);
    setActiveSessionId(sid);
    setMessages([]);
    setApiHistory([]);
    setTurnCount(0);
    setInputVal("");
    setScreen("chat");

    // Send first message
    await doSendMessage(text, [], 0, sid);
  }, [sessionsDone]);

  // ─ Send message within session ─
  const doSendMessage = async (text: string, history: {role: string; content: string}[], turn: number, sid: string) => {
    setLoading(true);
    const userMsgId = genId();
    const isFinal = turn + 1 >= MAX_TURNS;

    const userMsg: Message = { id: userMsgId, role: "user", text };
    setMessages(prev => [...prev, userMsg]);

    const newHistory = [...history, { role: "user", content: text }];

    try {
      const aiData: AiData = await callClaude(newHistory, isFinal);
      const aiMsgId = genId();
      const aiMsg: Message = { id: aiMsgId, role: "ai", text: aiData.korean_response, aiData };
      const updatedHistory = [...newHistory, { role: "assistant", content: JSON.stringify(aiData) }];

      setMessages(prev => [...prev, aiMsg]);
      setApiHistory(updatedHistory);

      const newTurn = turn + 1;
      setTurnCount(newTurn);

      // Update session in list
      setSessions(prev => prev.map(s => {
        if (s.id !== sid) return s;
        return {
          ...s,
          messages: [...(s.messages || []), userMsg, aiMsg],
          finalSummary: aiData.final_summary || s.finalSummary,
          level: aiData.final_summary?.level || s.level,
        };
      }));

      if (aiData.is_final || newTurn >= MAX_TURNS) {
        if (aiData.final_summary?.level) setUserLevel(aiData.final_summary.level);
        setSessionsDone(n => n + 1);
      }
    } catch {
      const errMsg: Message = { id: genId(), role: "error", text: "연결 오류가 발생했어요. 다시 시도해 주세요." };
      setMessages(prev => [...prev, errMsg]);
    }
    setLoading(false);
  };

  const handleSend = () => {
    if (!inputVal.trim() || loading || turnCount >= MAX_TURNS) return;
    const text = inputVal;
    setInputVal("");
    doSendMessage(text, apiHistory, turnCount, activeSessionId!);
  };

  const loadSession = (s: Session) => {
    setActiveSessionId(s.id);
    setMessages(s.messages || []);
    setTurnCount(s.messages ? Math.floor(s.messages.length / 2) : 0);
    setScreen("chat");
    setSidebarOpen(false);
  };

  const downloadNotes = (session: Session) => {
    const text = buildNoteText(session);
    if (!text) return;
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `handa-notes-${new Date(session.createdAt).toISOString().slice(0, 10)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const activeSession = sessions.find(s => s.id === activeSessionId);
  const sessionIsDone = turnCount >= MAX_TURNS || !!activeSession?.finalSummary;
  const lc = userLevel ? levelColor(userLevel) : null;

  // ──────────────────────────────────────────────────────────────────────────
  // RENDER
  // ──────────────────────────────────────────────────────────────────────────
  return (
    <div style={S.root}>
      {/* ── SIDEBAR ─────────────────────────────────────────────────────── */}
      <div style={{ ...S.sidebar, transform: sidebarOpen ? "translateX(0)" : "translateX(-100%)" }}>
        <div style={S.sidebarHeader}>
          <span style={S.sidebarLogo}>HanDa <span style={S.sidebarLogoKo}>한다</span></span>
          <button style={S.iconBtn} onClick={() => setSidebarOpen(false)}>✕</button>
        </div>

        {userLevel && lc && (
          <div style={{ ...S.profileCard, background: lc.bg, border: `1px solid ${lc.border}` }}>
            <div style={S.profileAvatar}>🧑‍🎓</div>
            <div>
              <div style={S.profileName}>학습자 프로필</div>
              <div style={{ ...S.profileLevel, color: lc.text }}>레벨: {userLevel}</div>
            </div>
          </div>
        )}

        <div style={S.sidebarSection}>대화 기록 ({sessions.length})</div>
        <div style={S.sessionList}>
          {sessions.length === 0 && (
            <div style={S.noSessions}>아직 대화가 없어요</div>
          )}
          {sessions.map(s => {
            const lc2 = s.level ? levelColor(s.level) : null;
            return (
              <div
                key={s.id}
                style={{ ...S.sessionItem, background: s.id === activeSessionId ? "rgba(124,58,237,0.15)" : "transparent" }}
                onClick={() => loadSession(s)}
              >
                <div style={S.sessionItemTop}>
                  <span style={S.sessionTitle}>{s.title || "대화"}</span>
                  {s.level && lc2 && (
                    <span style={{ ...S.levelPill, background: lc2.bg, color: lc2.text, border: `1px solid ${lc2.border}` }}>
                      {s.level}
                    </span>
                  )}
                </div>
                <div style={S.sessionDate}>{formatDate(s.createdAt)} · {Math.floor((s.messages || []).length / 2)} 턴</div>
                {s.finalSummary && (
                  <button
                    style={S.downloadSmall}
                    onClick={e => { e.stopPropagation(); downloadNotes(s); }}
                  >
                    ⬇ 노트 다운로드
                  </button>
                )}
              </div>
            );
          })}
        </div>

        <div style={S.sidebarFooter}>
          <div style={S.sessionCounter}>세션 {sessionsDone}/{MAX_SESSIONS} 사용</div>
          <div style={S.sessionDots}>
            {Array.from({ length: MAX_SESSIONS }).map((_, i) => (
              <div key={i} style={{ ...S.dot, background: i < sessionsDone ? "#7c3aed" : "rgba(255,255,255,0.15)" }} />
            ))}
          </div>
        </div>
      </div>

      {/* Sidebar overlay */}
      {sidebarOpen && <div style={S.overlay} onClick={() => setSidebarOpen(false)} />}

      {/* ── MAIN ────────────────────────────────────────────────────────── */}
      <div style={S.main}>
        {/* Top navbar */}
        <div style={S.navbar}>
          <button style={S.iconBtn} onClick={() => setSidebarOpen(true)}>☰</button>
          <div style={S.navTitle} onClick={() => setScreen("landing")}>
            HanDa <span style={S.navTitleKo}>한다</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {userLevel && (
              <span style={{ ...S.levelPill, ...levelColor(userLevel), background: levelColor(userLevel).bg, color: levelColor(userLevel).text, border: `1px solid ${levelColor(userLevel).border}` }}>
                {userLevel}
              </span>
            )}
            {screen === "chat" && (
              <button
                style={{ ...S.newChatBtn, opacity: sessionsDone >= MAX_SESSIONS ? 0.4 : 1 }}
                onClick={() => setScreen("landing")}
                disabled={sessionsDone >= MAX_SESSIONS}
              >
                + 새 대화
              </button>
            )}
          </div>
        </div>

        {/* ── LANDING ─────────────────────────────────────────────── */}
        {screen === "landing" && (
          <div style={S.landing}>
            <div style={S.landingInner}>
              {/* Avatar */}
              <div style={S.avatarRing}>
                <div style={S.avatarCircle}>
                  <span style={{ fontSize: 56 }}>🤖</span>
                </div>
              </div>

              {/* Animated greeting */}
              <div style={S.greetBox} key={greetIdx}>
                <div style={S.greetKo}>{GREETINGS[greetIdx].k}</div>
                <div style={S.greetEn}>{GREETINGS[greetIdx].e}</div>
              </div>

              <p style={S.tagline}>What do you want to say in Korean?</p>
              <p style={S.taglineSub}>아무 언어로 입력해도 괜찮아요 — any language works!</p>

              {/* Main input */}
              <div style={S.landingInputRow}>
                <input
                  ref={inputRef}
                  style={S.landingInput}
                  placeholder="Type here to start talking..."
                  value={inputVal}
                  onChange={e => setInputVal(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && beginSession(inputVal)}
                  autoFocus
                />
                <button
                  style={{ ...S.sendCircle, opacity: inputVal.trim() ? 1 : 0.4 }}
                  onClick={() => beginSession(inputVal)}
                  disabled={!inputVal.trim() || sessionsDone >= MAX_SESSIONS}
                >
                  →
                </button>
              </div>

              {sessionsDone >= MAX_SESSIONS && (
                <div style={S.limitNotice}>오늘 세션이 모두 끝났어요! 내일 또 만나요 👋</div>
              )}

              {/* Quick start chips */}
              <div style={S.chips}>
                {QUICK_STARTS.map(q => (
                  <button key={q} style={S.chip} onClick={() => beginSession(q)}>{q}</button>
                ))}
              </div>

              {/* Session counter */}
              <div style={S.sessionCounter}>
                대화 세션 {sessionsDone}/{MAX_SESSIONS}
                <div style={S.sessionDots}>
                  {Array.from({ length: MAX_SESSIONS }).map((_, i) => (
                    <div key={i} style={{ ...S.dot, background: i < sessionsDone ? "#a78bfa" : "rgba(255,255,255,0.15)" }} />
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── CHAT ────────────────────────────────────────────────── */}
        {screen === "chat" && (
          <div style={S.chatWrapper}>
            <div style={S.chatMessages}>
              {/* Welcome bubble */}
              <div style={S.aiBubbleRow}>
                <div style={S.aiAvatarSmall}>🤖</div>
                <div style={S.aiBubble}>
                  <div style={S.bubbleKo}>안녕하세요! 저는 HanDa예요.</div>
                  <div style={S.bubbleEn}>I'm HanDa, your Korean tutor. Chat with me in any language! (Turn limit: {MAX_TURNS} each)</div>
                </div>
              </div>

              {messages.map(msg => (
                <div key={msg.id}>
                  {/* User message */}
                  {msg.role === "user" && (
                    <div style={S.userBubbleRow}>
                      <div style={S.userBubble}>{msg.text}</div>
                    </div>
                  )}

                  {/* AI message */}
                  {msg.role === "ai" && msg.aiData && (
                    <div style={S.aiBubbleRow}>
                      <div style={S.aiAvatarSmall}>🤖</div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 8, maxWidth: "80%" }}>
                        {/* Main response */}
                        <div style={S.aiBubble}>
                          <div style={S.bubbleKo}>{msg.aiData.korean_response}</div>
                          {msg.aiData.romanization && (
                            <div style={S.bubbleRom}>{msg.aiData.romanization}</div>
                          )}
                          {msg.aiData.english_hint && (
                            <div style={S.bubbleEn}>{msg.aiData.english_hint}</div>
                          )}
                        </div>

                        {/* Correction card */}
                        {msg.aiData.correction && (
                          <div style={S.correctionCard}>
                            <div style={S.cardToggle} onClick={() => toggleCard(`c-${msg.id}`)}>
                              <span style={S.cardIcon}>✏️</span>
                              <span style={S.cardTitle}>교정 (Correction)</span>
                              <span style={S.chevron}>{expandedCards[`c-${msg.id}`] ? "▲" : "▼"}</span>
                            </div>
                            {expandedCards[`c-${msg.id}`] !== false && (
                              <div style={S.cardBody}>
                                <div style={S.corrRow}>
                                  <span style={S.corrOriginal}>{msg.aiData.correction.original}</span>
                                  <span style={S.corrArrow}>→</span>
                                  <span style={S.corrFixed}>{msg.aiData.correction.corrected}</span>
                                </div>
                                <div style={S.corrNote}>{msg.aiData.correction.explanation}</div>
                              </div>
                            )}
                          </div>
                        )}

                        {/* Grammar card */}
                        {msg.aiData.grammar_note && (
                          <div style={S.grammarCard}>
                            <div style={S.cardToggle} onClick={() => toggleCard(`g-${msg.id}`)}>
                              <span style={S.cardIcon}>📚</span>
                              <span style={S.cardTitle}>문법 노트 · {msg.aiData.grammar_note.pattern}</span>
                              <span style={S.chevron}>{expandedCards[`g-${msg.id}`] === false ? "▼" : "▲"}</span>
                            </div>
                            {expandedCards[`g-${msg.id}`] !== false && (
                              <div style={S.cardBody}>
                                <div style={S.grammarExplain}>{msg.aiData.grammar_note.explanation}</div>
                                <div style={S.examplesLabel}>예시:</div>
                                {msg.aiData.grammar_note.examples?.map((ex, i) => (
                                  <div key={i} style={S.exampleItem}>• {ex}</div>
                                ))}
                              </div>
                            )}
                          </div>
                        )}

                        {/* Final summary card */}
                        {msg.aiData.final_summary && (
                          <div style={S.summaryCard}>
                            <div style={S.summaryHeader}>
                              <span style={S.summaryTitle}>🎓 대화 완료!</span>
                              <span style={{
                                ...S.levelPill,
                                ...levelColor(msg.aiData.final_summary.level),
                                background: levelColor(msg.aiData.final_summary.level).bg,
                                color: levelColor(msg.aiData.final_summary.level).text,
                                border: `1px solid ${levelColor(msg.aiData.final_summary.level).border}`,
                              }}>
                                {msg.aiData.final_summary.level}
                              </span>
                            </div>
                            <div style={S.summaryReason}>{msg.aiData.final_summary.level_reasoning}</div>

                            <div style={S.summarySect}>📝 연습 문제 (Practice Questions)</div>
                            {msg.aiData.final_summary.practice_questions?.map((q, i) => (
                              <div key={i} style={S.practiceQ}>{i + 1}. {q}</div>
                            ))}

                            {msg.aiData.final_summary.tomorrow_review?.length > 0 && (
                              <>
                                <div style={S.summarySect}>🔄 내일 복습 (Tomorrow's Review)</div>
                                {msg.aiData.final_summary.tomorrow_review.map((r, i) => (
                                  <div key={i} style={S.reviewItem}>• {r}</div>
                                ))}
                              </>
                            )}

                            <button
                              style={S.downloadBtn}
                              onClick={() => activeSession && downloadNotes(activeSession)}
                            >
                              ⬇ 노트 다운로드 (.txt)
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Error */}
                  {msg.role === "error" && (
                    <div style={S.errorMsg}>{msg.text}</div>
                  )}
                </div>
              ))}

              {/* Loading */}
              {loading && (
                <div style={S.aiBubbleRow}>
                  <div style={S.aiAvatarSmall}>🤖</div>
                  <div style={S.loadingBubble}>
                    <span style={{ ...S.loadDot, animationDelay: "0s" }} />
                    <span style={{ ...S.loadDot, animationDelay: "0.2s" }} />
                    <span style={{ ...S.loadDot, animationDelay: "0.4s" }} />
                  </div>
                </div>
              )}
              <div ref={bottomRef} />
            </div>

            {/* Turn indicator */}
            <div style={S.turnBar}>
              {Array.from({ length: MAX_TURNS }).map((_, i) => (
                <div key={i} style={{ ...S.turnDot, background: i < turnCount ? "#7c3aed" : "rgba(255,255,255,0.15)" }} />
              ))}
              <span style={S.turnLabel}>{turnCount}/{MAX_TURNS} 턴</span>
            </div>

            {/* Input bar */}
            {!sessionIsDone ? (
              <div style={S.chatInputBar}>
                <input
                  style={S.chatInput}
                  placeholder="답변해 주세요... (아무 언어나 괜찮아요)"
                  value={inputVal}
                  onChange={e => setInputVal(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && !loading && handleSend()}
                  disabled={loading}
                  autoFocus
                />
                <button
                  style={{ ...S.sendCircle, opacity: !inputVal.trim() || loading ? 0.4 : 1 }}
                  onClick={handleSend}
                  disabled={!inputVal.trim() || loading}
                >
                  →
                </button>
              </div>
            ) : (
              <div style={S.sessionDoneBar}>
                <span style={S.sessionDoneText}>대화가 끝났어요!</span>
                <div style={{ display: "flex", gap: 8 }}>
                  {activeSession?.finalSummary && (
                    <button style={S.downloadBtnSm} onClick={() => downloadNotes(activeSession)}>⬇ 노트</button>
                  )}
                  {sessionsDone < MAX_SESSIONS && (
                    <button style={S.newChatBtnPrimary} onClick={() => setScreen("landing")}>
                      새 대화 시작 ({MAX_SESSIONS - sessionsDone} 남음)
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;700&family=DM+Sans:wght@400;500;600&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        input::placeholder { color: rgba(255,255,255,0.3); }
        input:focus { outline: none; }
        button { cursor: pointer; }
        @keyframes bounce {
          0%,80%,100% { transform: translateY(0); }
          40% { transform: translateY(-5px); }
        }
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes greetFade {
          0% { opacity: 0; transform: translateY(-8px); }
          15%,85% { opacity: 1; transform: translateY(0); }
          100% { opacity: 0; transform: translateY(8px); }
        }
        @keyframes pulse {
          0%,100% { box-shadow: 0 0 0 0 rgba(124,58,237,0.4); }
          50% { box-shadow: 0 0 0 16px rgba(124,58,237,0); }
        }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 2px; }
      `}</style>
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const S: Record<string, React.CSSProperties> = {
  root: {
    fontFamily: "'DM Sans', 'Noto Sans KR', sans-serif",
    display: "flex",
    height: "100vh",
    background: "#0d0d14",
    color: "#f1f0ff",
    overflow: "hidden",
    position: "relative",
  },

  // Sidebar
  sidebar: {
    position: "fixed",
    left: 0,
    top: 0,
    bottom: 0,
    width: 280,
    background: "#13131f",
    borderRight: "1px solid rgba(255,255,255,0.06)",
    display: "flex",
    flexDirection: "column",
    zIndex: 100,
    transition: "transform 0.25s cubic-bezier(0.4,0,0.2,1)",
  },
  sidebarHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "20px 16px",
    borderBottom: "1px solid rgba(255,255,255,0.06)",
  },
  sidebarLogo: { fontSize: 18, fontWeight: 600, color: "#f1f0ff" },
  sidebarLogoKo: { color: "#a78bfa", fontFamily: "'Noto Sans KR', sans-serif" },
  profileCard: {
    margin: "12px 12px 0",
    borderRadius: 10,
    padding: "10px 12px",
    display: "flex",
    alignItems: "center",
    gap: 10,
  },
  profileAvatar: { fontSize: 24 },
  profileName: { fontSize: 12, color: "rgba(255,255,255,0.5)", marginBottom: 2 },
  profileLevel: { fontSize: 14, fontWeight: 600 },
  sidebarSection: {
    fontSize: 11,
    color: "rgba(255,255,255,0.35)",
    padding: "16px 16px 6px",
    textTransform: "uppercase",
    letterSpacing: "0.08em",
  },
  sessionList: { flex: 1, overflowY: "auto", padding: "4px 8px" },
  noSessions: { fontSize: 13, color: "rgba(255,255,255,0.3)", padding: "12px 8px" },
  sessionItem: {
    padding: "10px 12px",
    borderRadius: 8,
    cursor: "pointer",
    marginBottom: 4,
    transition: "background 0.15s",
  },
  sessionItemTop: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6 },
  sessionTitle: { fontSize: 13, fontWeight: 500, color: "#f1f0ff", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  sessionDate: { fontSize: 11, color: "rgba(255,255,255,0.35)", marginTop: 3 },
  downloadSmall: {
    marginTop: 6,
    fontSize: 11,
    background: "transparent",
    border: "1px solid rgba(255,255,255,0.12)",
    borderRadius: 6,
    color: "#a78bfa",
    padding: "3px 8px",
    cursor: "pointer",
  },
  sidebarFooter: {
    padding: "16px",
    borderTop: "1px solid rgba(255,255,255,0.06)",
  },

  // Overlay
  overlay: {
    position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 99,
  },

  // Main area
  main: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
    minWidth: 0,
  },

  // Navbar
  navbar: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "0 16px",
    height: 56,
    borderBottom: "1px solid rgba(255,255,255,0.06)",
    background: "#0d0d14",
    flexShrink: 0,
  },
  navTitle: {
    fontSize: 18,
    fontWeight: 600,
    cursor: "pointer",
    userSelect: "none",
    color: "#f1f0ff",
  },
  navTitleKo: { color: "#a78bfa", fontFamily: "'Noto Sans KR', sans-serif" },
  iconBtn: {
    background: "transparent",
    border: "none",
    color: "rgba(255,255,255,0.6)",
    fontSize: 18,
    cursor: "pointer",
    padding: "6px 8px",
    borderRadius: 6,
    lineHeight: 1,
  },
  newChatBtn: {
    background: "transparent",
    border: "1px solid rgba(255,255,255,0.15)",
    color: "rgba(255,255,255,0.7)",
    fontSize: 12,
    padding: "6px 12px",
    borderRadius: 20,
    cursor: "pointer",
  },

  // Level pill
  levelPill: {
    fontSize: 11,
    fontWeight: 600,
    padding: "3px 10px",
    borderRadius: 20,
    display: "inline-block",
  },

  // Session dots
  sessionCounter: {
    fontSize: 12,
    color: "rgba(255,255,255,0.35)",
    display: "flex",
    alignItems: "center",
    gap: 8,
  },
  sessionDots: { display: "flex", gap: 5 },
  dot: { width: 8, height: 8, borderRadius: "50%", transition: "background 0.3s" },

  // ── LANDING ──
  landing: {
    flex: 1,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    overflow: "auto",
    padding: "32px 16px",
  },
  landingInner: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 20,
    width: "100%",
    maxWidth: 480,
  },
  avatarRing: {
    width: 140,
    height: 140,
    borderRadius: "50%",
    background: "conic-gradient(from 180deg, #7c3aed, #db2777, #7c3aed)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    animation: "pulse 2.5s ease-in-out infinite",
    flexShrink: 0,
  },
  avatarCircle: {
    width: 120,
    height: 120,
    borderRadius: "50%",
    background: "#0d0d14",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  greetBox: {
    textAlign: "center",
    animation: "greetFade 2.8s ease-in-out",
    minHeight: 80,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 4,
  },
  greetKo: {
    fontSize: 34,
    fontWeight: 700,
    color: "#f1f0ff",
    fontFamily: "'Noto Sans KR', sans-serif",
    letterSpacing: "-0.5px",
  },
  greetEn: { fontSize: 13, color: "rgba(255,255,255,0.4)" },
  tagline: { fontSize: 18, fontWeight: 500, color: "#f1f0ff", textAlign: "center" },
  taglineSub: { fontSize: 13, color: "rgba(255,255,255,0.4)", textAlign: "center", marginTop: -12 },
  landingInputRow: { display: "flex", width: "100%", gap: 8 },
  landingInput: {
    flex: 1,
    background: "rgba(255,255,255,0.05)",
    border: "1px solid rgba(124,58,237,0.35)",
    borderRadius: 999,
    padding: "13px 20px",
    color: "#f1f0ff",
    fontSize: 15,
    fontFamily: "'DM Sans', sans-serif",
    transition: "border-color 0.2s",
  },
  sendCircle: {
    width: 48,
    height: 48,
    borderRadius: "50%",
    border: "none",
    background: "linear-gradient(135deg, #7c3aed, #db2777)",
    color: "#fff",
    fontSize: 20,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    transition: "transform 0.15s, opacity 0.2s",
  },
  limitNotice: {
    fontSize: 13,
    color: "#f59e0b",
    background: "rgba(245,158,11,0.1)",
    border: "1px solid rgba(245,158,11,0.2)",
    borderRadius: 8,
    padding: "8px 16px",
    textAlign: "center",
  },
  chips: { display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "center" },
  chip: {
    background: "rgba(255,255,255,0.05)",
    border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: 999,
    color: "rgba(255,255,255,0.65)",
    fontSize: 13,
    padding: "7px 14px",
    cursor: "pointer",
    fontFamily: "'Noto Sans KR', sans-serif",
    transition: "background 0.15s",
  },

  // ── CHAT ──
  chatWrapper: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
    minHeight: 0,
  },
  chatMessages: {
    flex: 1,
    overflowY: "auto",
    padding: "20px 16px",
    display: "flex",
    flexDirection: "column",
    gap: 16,
  },

  // AI bubble row
  aiBubbleRow: { display: "flex", alignItems: "flex-start", gap: 10 },
  aiAvatarSmall: {
    width: 32,
    height: 32,
    borderRadius: "50%",
    background: "rgba(124,58,237,0.2)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 16,
    flexShrink: 0,
    marginTop: 2,
  },
  aiBubble: {
    background: "rgba(255,255,255,0.05)",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: "4px 14px 14px 14px",
    padding: "12px 14px",
    maxWidth: "80%",
    animation: "fadeUp 0.2s ease",
  },
  bubbleKo: {
    fontSize: 15,
    fontFamily: "'Noto Sans KR', sans-serif",
    lineHeight: 1.7,
    color: "#f1f0ff",
  },
  bubbleRom: { fontSize: 12, color: "#a78bfa", marginTop: 4 },
  bubbleEn: { fontSize: 12, color: "rgba(255,255,255,0.4)", marginTop: 2 },

  // User bubble
  userBubbleRow: { display: "flex", justifyContent: "flex-end" },
  userBubble: {
    background: "linear-gradient(135deg, #7c3aed, #6d28d9)",
    borderRadius: "14px 4px 14px 14px",
    padding: "11px 16px",
    maxWidth: "75%",
    fontSize: 14,
    lineHeight: 1.6,
    color: "#fff",
    animation: "fadeUp 0.2s ease",
  },

  // Cards (correction / grammar)
  correctionCard: {
    background: "rgba(239,68,68,0.06)",
    border: "1px solid rgba(239,68,68,0.2)",
    borderRadius: 10,
    overflow: "hidden",
    animation: "fadeUp 0.2s ease",
    maxWidth: "80%",
  },
  grammarCard: {
    background: "rgba(124,58,237,0.06)",
    border: "1px solid rgba(124,58,237,0.2)",
    borderRadius: 10,
    overflow: "hidden",
    animation: "fadeUp 0.2s ease",
    maxWidth: "80%",
  },
  cardToggle: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "9px 12px",
    cursor: "pointer",
    userSelect: "none",
  },
  cardIcon: { fontSize: 14 },
  cardTitle: { fontSize: 12, fontWeight: 500, flex: 1, color: "rgba(255,255,255,0.7)" },
  chevron: { fontSize: 10, color: "rgba(255,255,255,0.35)" },
  cardBody: { padding: "0 12px 12px", borderTop: "1px solid rgba(255,255,255,0.06)" },
  corrRow: { display: "flex", alignItems: "center", gap: 10, padding: "8px 0 4px" },
  corrOriginal: { fontSize: 13, color: "#f87171", textDecoration: "line-through" },
  corrArrow: { fontSize: 12, color: "rgba(255,255,255,0.3)" },
  corrFixed: { fontSize: 13, color: "#4ade80", fontFamily: "'Noto Sans KR', sans-serif" },
  corrNote: { fontSize: 12, color: "rgba(255,255,255,0.5)" },
  grammarExplain: { fontSize: 12, color: "rgba(255,255,255,0.6)", padding: "8px 0 6px", lineHeight: 1.5 },
  examplesLabel: { fontSize: 11, color: "rgba(255,255,255,0.3)", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.06em" },
  exampleItem: { fontSize: 12, color: "rgba(255,255,255,0.55)", lineHeight: 1.8, fontFamily: "'Noto Sans KR', sans-serif" },

  // Summary
  summaryCard: {
    background: "rgba(16,185,129,0.05)",
    border: "1px solid rgba(16,185,129,0.2)",
    borderRadius: 12,
    padding: "14px 16px",
    maxWidth: "90%",
    animation: "fadeUp 0.25s ease",
  },
  summaryHeader: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 },
  summaryTitle: { fontSize: 15, fontWeight: 600, color: "#f1f0ff" },
  summaryReason: { fontSize: 12, color: "rgba(255,255,255,0.5)", marginBottom: 12, lineHeight: 1.5 },
  summarySect: { fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,0.5)", marginTop: 12, marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.06em" },
  practiceQ: { fontSize: 13, color: "#f1f0ff", lineHeight: 1.8, fontFamily: "'Noto Sans KR', sans-serif" },
  reviewItem: { fontSize: 12, color: "rgba(255,255,255,0.55)", lineHeight: 1.8 },
  downloadBtn: {
    marginTop: 14,
    display: "block",
    width: "100%",
    padding: "10px",
    background: "rgba(16,185,129,0.15)",
    border: "1px solid rgba(16,185,129,0.3)",
    borderRadius: 8,
    color: "#10b981",
    fontSize: 13,
    fontWeight: 500,
    cursor: "pointer",
    textAlign: "center",
  },

  // Loading
  loadingBubble: {
    background: "rgba(255,255,255,0.05)",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: "4px 14px 14px 14px",
    padding: "14px 18px",
    display: "flex",
    gap: 5,
    alignItems: "center",
  },
  loadDot: {
    display: "inline-block",
    width: 7,
    height: 7,
    borderRadius: "50%",
    background: "rgba(167,139,250,0.7)",
    animation: "bounce 1.2s ease-in-out infinite",
  },

  errorMsg: {
    textAlign: "center",
    fontSize: 13,
    color: "#f87171",
    background: "rgba(239,68,68,0.08)",
    border: "1px solid rgba(239,68,68,0.15)",
    borderRadius: 8,
    padding: "8px 14px",
  },

  // Turn bar
  turnBar: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    padding: "6px 20px",
    borderTop: "1px solid rgba(255,255,255,0.05)",
    flexShrink: 0,
  },
  turnDot: { width: 24, height: 4, borderRadius: 2, transition: "background 0.3s" },
  turnLabel: { fontSize: 11, color: "rgba(255,255,255,0.25)", marginLeft: 4 },

  // Chat input bar
  chatInputBar: {
    display: "flex",
    gap: 8,
    padding: "12px 16px",
    borderTop: "1px solid rgba(255,255,255,0.06)",
    background: "#0d0d14",
    flexShrink: 0,
  },
  chatInput: {
    flex: 1,
    background: "rgba(255,255,255,0.05)",
    border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: 999,
    padding: "11px 18px",
    color: "#f1f0ff",
    fontSize: 14,
    fontFamily: "'DM Sans', 'Noto Sans KR', sans-serif",
  },

  // Session done bar
  sessionDoneBar: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "12px 16px",
    borderTop: "1px solid rgba(255,255,255,0.06)",
    background: "#0d0d14",
    flexShrink: 0,
    flexWrap: "wrap",
    gap: 8,
  },
  sessionDoneText: { fontSize: 14, color: "rgba(255,255,255,0.5)" },
  newChatBtnPrimary: {
    background: "linear-gradient(135deg, #7c3aed, #db2777)",
    border: "none",
    borderRadius: 20,
    color: "#fff",
    fontSize: 13,
    fontWeight: 500,
    padding: "8px 16px",
    cursor: "pointer",
  },
  downloadBtnSm: {
    background: "transparent",
    border: "1px solid rgba(16,185,129,0.3)",
    borderRadius: 20,
    color: "#10b981",
    fontSize: 13,
    padding: "7px 14px",
    cursor: "pointer",
  },
};
