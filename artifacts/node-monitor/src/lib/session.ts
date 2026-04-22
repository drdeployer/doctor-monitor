export function getSessionId() {
  let sessionId = localStorage.getItem("node-monitor-session-id");
  if (!sessionId) {
    sessionId = crypto.randomUUID();
    localStorage.setItem("node-monitor-session-id", sessionId);
  }
  return sessionId;
}
