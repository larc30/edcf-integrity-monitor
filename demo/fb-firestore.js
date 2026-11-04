// 데모용 Firestore 대체 — 브라우저 메모리에서만 동작 (실제 Firebase에 접속하지 않음)
import { seed, kst } from "./data.js";

const DB = (window.__DB = window.__DB || seed());
let seq = 0;
const coll = (n) => (DB[n] = DB[n] || {});
export const getFirestore = () => ({});
export const collection = (db, name) => ({ t: "col", name });
export function doc(a, name, id) {
  if (a && a.t === "col") return { t: "doc", col: a.name, id: "auto" + ++seq };
  return { t: "doc", col: name, id };
}
export const where = (f, op, v) => ({ w: [f, op, v] });
export const orderBy = (f, d) => ({ o: [f, d] });
export const limit = (n) => ({ l: n });
export const query = (c, ...cs) => ({ ...c, cs });
const snapDoc = (col, id) => ({ id, data: () => structuredClone(coll(col)[id]), ref: { t: "doc", col, id } });
export async function getDocs(q) {
  let ids = Object.keys(coll(q.name));
  const OPS = { "==": (a, b) => a === b, ">=": (a, b) => a >= b, "<": (a, b) => a < b, ">": (a, b) => a > b, "<=": (a, b) => a <= b };
  for (const c of q.cs || []) if (c.w) ids = ids.filter((id) => { const v = coll(q.name)[id][c.w[0]]; return v != null && OPS[c.w[1]](v, c.w[2]); });
  return { docs: ids.map((id) => snapDoc(q.name, id)) };
}
export async function getDoc(r) { const d = coll(r.col)[r.id]; return { exists: () => !!d, data: () => structuredClone(d) }; }
export async function addDoc(c, data) {
  const id = "auto" + ++seq;
  coll(c.name)[id] = structuredClone(data);
  if (c.name === "requests") simulate(id);
  return { id };
}
export async function setDoc(r, data, o) { coll(r.col)[r.id] = o?.merge ? { ...(coll(r.col)[r.id] || {}), ...structuredClone(data) } : structuredClone(data); }
export async function updateDoc(r, data) { Object.assign(coll(r.col)[r.id], structuredClone(data)); }
export async function deleteDoc(r) { delete coll(r.col)[r.id]; }
export function writeBatch() {
  const ops = [];
  return { set: (r, d, o) => ops.push(() => setDoc(r, d, o)), update: (r, d) => ops.push(() => updateDoc(r, d)), delete: (r) => ops.push(() => deleteDoc(r)), commit: async () => { for (const f of ops) await f(); } };
}

// [지금 스캔] 흉내: 3초 뒤 시작 → 업체를 차례로 검사 → 완료
function simulate(id) {
  const r = coll("requests")[id];
  const names = Object.values(coll("companies")).map((c) => c.name);
  const total = names.length;
  setTimeout(() => {
    if (r.status !== "pending") return;
    r.status = "running";
    let done = 0;
    const t = setInterval(() => {
      if (r.status === "cancel_requested") { clearInterval(t); r.status = "cancelled"; r.finished_at = kst(Date.now()); r.result = { stopped: true }; return; }
      done = Math.min(total, done + 2);
      r.progress = { done, total, current: names[done - 1] || "" };
      if (done >= total) {
        clearInterval(t);
        const at = kst(Date.now());
        Object.assign(r, { status: "done", finished_at: at, result: { companies: total, seconds: 13.8, new_findings: 0 } });
        Object.assign(coll("meta").status, { last_scan_at: at, last_scan_seconds: 13.8 });
      }
    }, 450);
  }, 3000);
}
