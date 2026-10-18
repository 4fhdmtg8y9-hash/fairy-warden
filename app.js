const SUPABASE_URL = "https://fwjukrrvkerqeavpztil.supabase.co";
const SUPABASE_KEY = "sb_publishable_t-WV203nt30hunLvo2L3CA_6Vnu5bYD";

const supabaseClient = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_KEY
);
const app = document.getElementById("app");

const sections = [
  "Dashboard",
  "Staff Directory",
  "Moderation Logs",
  "Inactivity Requests",
  "Leaderboard",
  "Announcements",
  "Schedule"
];

app.innerHTML = `
  <main class="dashboard">
    <aside class="sidebar">
      <div class="brand">
        <h1>Fairy Warden</h1>
        <p>Fairy Academy</p>
      </div>

      <nav aria-label="Main navigation">
        ${sections.map((section, index) => `
          <button
            class="nav-item ${index === 0 ? "active" : ""}"
            data-section="${section}"
          >${section}</button>
        `).join("")}
      </nav>

      <footer>Made for Fairy Academy ✧</footer>
    </aside>

    <section class="main-content">
      <header class="page-header">
        <p class="eyebrow">FAIRY ACADEMY · STAFF PORTAL</p>
        <h2 id="page-title">Dashboard</h2>
        <p id="page-description">
          Welcome to your magical staff hub.
        </p>
      </header>

      <div id="page-content">
        <article class="welcome-card">
          <p class="eyebrow">YOUR MAGICAL HEADQUARTERS</p>
          <h3>Welcome to Fairy Warden ✧</h3>
          <p>Your staff dashboard is taking shape.</p>
        </article>

        <div class="feature-grid">
          ${sections.slice(1).map(section => `
            <button class="feature-card" data-section="${section}">
              <span class="feature-star">✧</span>
              <h3>${section}</h3>
              <p>Explore the ${section.toLowerCase()} section.</p>
              <span class="feature-link">Open section →</span>
            </button>
          `).join("")}
        </div>
      </div>
    </section>
  </main>
`;

const descriptions = {
  "Dashboard": "Welcome to your magical staff hub.",
  "Staff Directory": "Meet the Fairy Academy staff team.",
  "Moderation Logs": "Review and track moderation actions.",
  "Inactivity Requests": "Manage staff absence requests.",
  "Leaderboard": "Track staff points and activity.",
  "Announcements": "Keep up with staff announcements.",
  "Schedule": "Stay up to date with staff scheduling."
};

function openSection(section) {
  document.querySelectorAll(".nav-item").forEach(button => {
    button.classList.toggle(
      "active",
      button.dataset.section === section
    );
  });

  document.getElementById("page-title").textContent = section;
  document.getElementById("page-description").textContent =
    descriptions[section] || "";

  const content = document.getElementById("page-content");

  if (section === "Dashboard") {
    content.innerHTML = `
      <article class="welcome-card">
        <p class="eyebrow">YOUR MAGICAL HEADQUARTERS</p>
        <h3>Welcome to Fairy Warden ✧</h3>
        <p>Your staff dashboard is taking shape.</p>
      </article>
      <div class="notice-card">
        <strong>Coming soon</strong>
        <p>Staff tools will become available as we connect the database and Discord.</p>
      </div>
    `;
    return;
  }

  content.innerHTML = `
    <article class="notice-card">
      <span class="feature-star">✧</span>
      <h3>${section}</h3>
      <p>This section is ready for development.</p>
      <p>Staff data and permissions will be connected in a later step.</p>
    </article>
  `;
}

document.addEventListener("click", event => {
  const button = event.target.closest("[data-section]");
  if (button) openSection(button.dataset.section);
});
