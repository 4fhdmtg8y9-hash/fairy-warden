
const SUPABASE_URL = "https://fwjukrrvkerqeavpztil.supabase.co";
const SUPABASE_KEY = "sb_publishable_t-WV203nt30hunLvo2L3CA_6Vnu5bYD";
const VERIFY_URL = "https://fairy-warden.4fhdmtg8y9.workers.dev/api/verify";

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

      <nav id="main-navigation" aria-label="Main navigation" hidden>
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
            <button id="logout-button" type="button">Log out</button>
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
        <p id="auth-notice" role="status" aria-live="polite">
          Checking your login...
        </p>
      </header>

      <div id="page-content" hidden>
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

const loginButton = document.getElementById("discord-login");
const logoutButton = document.getElementById("logout-button");
const userInfo = document.getElementById("user-info");
const userName = document.getElementById("user-name");
const userAvatar = document.getElementById("user-avatar");
const navigation = document.getElementById("main-navigation");
const pageContent = document.getElementById("page-content");
const authNotice = document.getElementById("auth-notice");

let authCheckNumber = 0;

function showMessage(message) {
  authNotice.textContent = message;
}

function lockDashboard() {
  navigation.hidden = true;
  pageContent.hidden = true;
}

function updateAccountUI(user) {
  if (!user) {
    loginButton.hidden = false;
    loginButton.disabled = false;
    loginButton.textContent = "✧ Continue with Discord";

    userInfo.hidden = true;
    userName.textContent = "";
    userAvatar.removeAttribute("src");
    userAvatar.hidden = true;
    return;
  }

  loginButton.hidden = true;
  userInfo.hidden = false;

  const metadata = user.user_metadata || {};

  userName.textContent =
    metadata.full_name ||
    metadata.name ||
    metadata.custom_claims?.global_name ||
    user.email ||
    "Fairy Academy Member";

  const avatarUrl = metadata.avatar_url || metadata.picture;

  if (avatarUrl) {
    userAvatar.src = avatarUrl;
    userAvatar.hidden = false;
  } else {
    userAvatar.removeAttribute("src");
    userAvatar.hidden = true;
  }
}

function openSection(section) {
  if (!sections.includes(section)) return;
  if (navigation.hidden) return;

  document.querySelectorAll(".nav-item").forEach(button => {
    button.classList.toggle(
      "active",
      button.dataset.section === section
    );
  });

  document.getElementById("page-title").textContent = section;
  document.getElementById("page-description").textContent =
    descriptions[section];

  if (section === "Dashboard") {
    pageContent.innerHTML = `
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

  pageContent.innerHTML = `
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
  lockDashboard();

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

async function verifyStaff(session) {
  const checkNumber = ++authCheckNumber;
  lockDashboard();

  if (!session) {
    updateAccountUI(null);
    showMessage("Please sign in with Discord to continue.");
    return;
  }

  updateAccountUI(session.user);
  showMessage("Verifying your Fairy Academy staff role...");

  try {
    const response = await fetch(VERIFY_URL, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${session.access_token}`
      }
    });

    const result = await response.json();

    if (checkNumber !== authCheckNumber) return;

    if (!response.ok || result.allowed !== true) {
      showMessage(
        response.status === 403
          ? "Access denied. You need an approved Fairy Academy staff role."
          : response.status === 401
            ? "Your login could not be verified. Please log in again."
            : "Staff verification is unavailable. Please try again later."
      );
      return;
    }

    navigation.hidden = false;
    pageContent.hidden = false;
    showMessage("Staff verification successful. Welcome!");
  } catch {
    if (checkNumber !== authCheckNumber) return;

    showMessage(
      "Could not connect to staff verification. Please try again later."
    );
  }
}

async function initializeAuth() {
  lockDashboard();

  try {
    const { data, error } = await supabaseClient.auth.getSession();
    if (error) throw error;

    await verifyStaff(data.session);

    supabaseClient.auth.onAuthStateChange((_event, session) => {
      void verifyStaff(session);
    });
  } catch {
    lockDashboard();
    showMessage("Authentication error. Please refresh the page.");
  }
}

initializeAuth();
