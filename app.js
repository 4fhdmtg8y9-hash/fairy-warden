
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

const descriptions = {
  "Dashboard": "Welcome to your magical staff hub.",
  "Staff Directory": "Meet the Fairy Academy staff team.",
  "Moderation Logs": "Review and track moderation actions.",
  "Inactivity Requests": "Manage staff absence requests.",
  "Leaderboard": "Track staff points and activity.",
  "Announcements": "Keep up with staff announcements.",
  "Schedule": "Stay up to date with staff scheduling."
};

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
        <div class="account-area">
          <div id="user-info" hidden>
            <img id="user-avatar" alt="Discord avatar">
            <span id="user-name"></span>
            <button id="logout-button" type="button">
              Log out
            </button>
          </div>

          <button id="discord-login" type="button">
            ✧ Continue with Discord
          </button>
        </div>

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

function openSection(section) {
  if (!sections.includes(section)) return;

  document.querySelectorAll(".nav-item").forEach(button => {
    button.classList.toggle(
      "active",
      button.dataset.section === section
    );
  });

  document.getElementById("page-title").textContent = section;
  document.getElementById("page-description").textContent =
    descriptions[section];

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

const loginButton = document.getElementById("discord-login");
const logoutButton = document.getElementById("logout-button");
const userInfo = document.getElementById("user-info");
const userName = document.getElementById("user-name");
const userAvatar = document.getElementById("user-avatar");

function showMessage(message) {
  let notice = document.getElementById("auth-notice");

  if (!notice) {
    notice = document.createElement("p");
    notice.id = "auth-notice";
    notice.setAttribute("role", "status");
    document.querySelector(".page-header").appendChild(notice);
  }

  notice.textContent = message;
}

function updateAccountUI(user) {
  if (!user) {
    loginButton.hidden = false;
    userInfo.hidden = true;
    userName.textContent = "";
    userAvatar.removeAttribute("src");
    return;
  }

  loginButton.hidden = true;
  userInfo.hidden = false;

  const metadata = user.user_metadata || {};
  const discordName =
    metadata.full_name ||
    metadata.name ||
    metadata.custom_claims?.global_name ||
    user.email ||
    "Fairy Academy Member";

  userName.textContent = discordName;

  const avatarUrl = metadata.avatar_url || metadata.picture;

  if (avatarUrl) {
    userAvatar.src = avatarUrl;
    userAvatar.hidden = false;
  } else {
    userAvatar.removeAttribute("src");
    userAvatar.hidden = true;
  }
}

loginButton.addEventListener("click", async () => {
  loginButton.disabled = true;
  loginButton.textContent = "Connecting to Discord...";

  try {
    const { error } = await supabaseClient.auth.signInWithOAuth({
      provider: "discord",
      options: {
        redirectTo: window.location.origin
      }
    });

    if (error) throw error;
  } catch (error) {
    showMessage("Discord login failed: " + error.message);
    loginButton.disabled = false;
    loginButton.textContent = "✧ Continue with Discord";
  }
});

logoutButton.addEventListener("click", async () => {
  logoutButton.disabled = true;

  try {
    const { error } = await supabaseClient.auth.signOut();

    if (error) throw error;

    updateAccountUI(null);
    showMessage("You have been logged out.");
  } catch (error) {
    showMessage("Logout failed: " + error.message);
  } finally {
    logoutButton.disabled = false;
  }
});

async function initializeAuth() {
  try {
    const { data, error } = await supabaseClient.auth.getSession();

    if (error) throw error;

    updateAccountUI(data.session?.user || null);

    supabaseClient.auth.onAuthStateChange((_event, session) => {
      updateAccountUI(session?.user || null);
    });
  } catch (error) {
    showMessage("Authentication setup error: " + error.message);
  }
}

initializeAuth();
