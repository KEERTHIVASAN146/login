const keyInput = document.getElementById("adminKey");
const loadBtn = document.getElementById("loadBtn");
const exportBtn = document.getElementById("exportBtn");
const msg = document.getElementById("adminMsg");
const table = document.getElementById("regTable");
const body = document.getElementById("regBody");

const savedKey = sessionStorage.getItem("phantasm_admin_key");
if (savedKey) keyInput.value = savedKey;

function eventsSummaryHtml(events, contactEmail) {
  if (!events || !events.length) return "—";
  return events
    .map((ev) => {
      const others = (ev.participants || []).filter((p) => p.email !== contactEmail);
      const teamBit = ev.teamName ? ` (${ev.teamName})` : "";
      const membersBit = others.length
        ? `<br><span class="team-members-note">+ ${others.map((p) => p.name).join(", ")}</span>`
        : "";
      return `<div>${ev.eventName}${teamBit}${membersBit}</div>`;
    })
    .join("");
}

async function loadRegistrations() {
  const key = keyInput.value.trim();
  if (!key) {
    msg.textContent = "Enter the admin key first.";
    return;
  }
  sessionStorage.setItem("phantasm_admin_key", key);
  msg.textContent = "Loading...";

  try {
    const res = await fetch("/api/admin/registrations", {
      headers: { "X-Admin-Key": key },
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to load.");

    body.innerHTML = data.registrations
      .map(
        (r) => `
        <tr>
          <td>${r.phantasm_id || ""}</td>
          <td>${r.contact_name || ""}</td>
          <td>${r.college_name || ""}</td>
          <td>${r.contact_email || ""}</td>
          <td>${r.contact_phone || ""}</td>
          <td>${eventsSummaryHtml(r.events, r.contact_email)}</td>
          <td>${new Date(r.created_at).toLocaleString()}</td>
        </tr>`,
      )
      .join("");
    table.style.display = data.registrations.length ? "table" : "none";
    msg.textContent = data.registrations.length ? "" : "No registrations yet.";
  } catch (err) {
    msg.textContent = err.message;
    table.style.display = "none";
  }
}

loadBtn.addEventListener("click", loadRegistrations);

exportBtn.addEventListener("click", () => {
  const key = keyInput.value.trim();
  if (!key) {
    msg.textContent = "Enter the admin key first.";
    return;
  }
  // CSV download needs the key as a header, which a plain link can't send,
  // so fetch it and trigger a blob download instead.
  fetch("/api/admin/export.csv", { headers: { "X-Admin-Key": key } })
    .then(async (res) => {
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Export failed.");
      }
      return res.blob();
    })
    .then((blob) => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "registrations.csv";
      a.click();
      URL.revokeObjectURL(url);
    })
    .catch((err) => {
      msg.textContent = err.message;
    });
});

if (savedKey) loadRegistrations();
