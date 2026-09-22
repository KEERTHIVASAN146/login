const form = document.getElementById("regForm");
const eventsList = document.getElementById("eventsList");
const submitBtn = document.getElementById("submitBtn");
const formMsg = document.getElementById("formMsg");

let EVENTS = [];

function setMsg(text, type) {
  formMsg.textContent = text;
  formMsg.className = `msg ${type || ""}`;
}

function memberRowHtml() {
  return `
    <div class="member-row">
      <input type="text" placeholder="Member name" data-field="name" />
      <input type="email" placeholder="Member email" data-field="email" />
      <input type="tel" placeholder="Member phone" data-field="phone" />
      <button type="button" class="remove-member" title="Remove">&times;</button>
    </div>`;
}

function teamPanelHtml(ev) {
  return `
    <div class="team-panel" data-event="${ev.id}" hidden>
      <label class="small-label">Team name (optional)</label>
      <input type="text" class="team-name" placeholder="Team name" />
      <p class="hint">You're counted as one member automatically. Add your teammates below
        (${ev.minSize}–${ev.maxSize} members total for ${ev.name}).</p>
      <div class="members-container"></div>
      <button type="button" class="add-member" data-event="${ev.id}">+ Add teammate</button>
    </div>`;
}

function renderEvents() {
  eventsList.innerHTML = EVENTS.map(
    (ev) => `
      <div class="event-block">
        <label class="event-chip">
          <input type="checkbox" name="events" value="${ev.id}" data-type="${ev.type}" />
          <span>
            ${ev.name}
            <span class="event-cat">${ev.category} · ${ev.type}</span>
          </span>
        </label>
        ${ev.type === "team" ? teamPanelHtml(ev) : ""}
      </div>`,
  ).join("");
}

async function loadEvents() {
  try {
    const res = await fetch("/api/events");
    const data = await res.json();
    EVENTS = data.events || [];
    renderEvents();
  } catch (err) {
    eventsList.innerHTML = '<p class="hint">Could not load events right now.</p>';
  }
}

// Show/hide a team's roster panel when its checkbox is toggled.
eventsList.addEventListener("change", (e) => {
  if (e.target.matches('input[name="events"]')) {
    const block = e.target.closest(".event-block");
    const panel = block.querySelector(".team-panel");
    if (panel) panel.hidden = !e.target.checked;
  }
});

// Add / remove teammate rows.
eventsList.addEventListener("click", (e) => {
  if (e.target.matches(".add-member")) {
    const eventId = e.target.dataset.event;
    const container = eventsList.querySelector(`.team-panel[data-event="${eventId}"] .members-container`);
    container.insertAdjacentHTML("beforeend", memberRowHtml());
  }
  if (e.target.matches(".remove-member")) {
    e.target.closest(".member-row").remove();
  }
});

function collectSelectedEvents() {
  const checked = Array.from(eventsList.querySelectorAll('input[name="events"]:checked'));
  return checked.map((cb) => {
    const eventId = cb.value;
    const type = cb.dataset.type;
    if (type !== "team") return { eventId };

    const panel = eventsList.querySelector(`.team-panel[data-event="${eventId}"]`);
    const teamName = panel.querySelector(".team-name").value.trim();
    const members = Array.from(panel.querySelectorAll(".member-row")).map((row) => ({
      name: row.querySelector('[data-field="name"]').value.trim(),
      email: row.querySelector('[data-field="email"]').value.trim(),
      phone: row.querySelector('[data-field="phone"]').value.trim(),
    }));
    return { eventId, teamName, members };
  });
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  setMsg("", "");

  const name = form.name.value.trim();
  const college = form.college.value.trim();
  const email = form.email.value.trim();
  const phone = form.phone.value.trim();

  if (!email) {
    setMsg("Email is required.", "error");
    form.email.focus();
    return;
  }

  const events = collectSelectedEvents();

  submitBtn.disabled = true;
  submitBtn.textContent = "Registering...";

  try {
    const res = await fetch("/api/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, college, email, phone, events }),
    });
    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || "Something went wrong. Please try again.");
    }

    setMsg(`You're registered! Reference ID: ${data.regId}`, "success");
    form.reset();
    renderEvents();
  } catch (err) {
    setMsg(err.message, "error");
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = "Register";
  }
});

loadEvents();
