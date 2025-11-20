import { useEffect, useState } from "react";
import { supabase } from "./lib/supabaseClient";
import { postJson } from "./lib/api";
import "./App.css";

type Business = {
  id: string;
  name: string;
  created_at: string;
};

type Competitor = {
  id: string;
  name: string;
  google_maps_url: string;
  category: string | null;
  created_at: string;
};

type Report = {
  id: string;
  pdf_url: string | null;
  created_at: string;
};

type AuthView = "sign-in" | "sign-up";

function App() {
  const [session, setSession] = useState<null | any>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authView, setAuthView] = useState<AuthView>("sign-in");
  const [loading, setLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const [businessName, setBusinessName] = useState("");
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [selectedBusinessId, setSelectedBusinessId] = useState<string | null>(
    null
  );
  const [businessError, setBusinessError] = useState<string | null>(null);

  const [competitors, setCompetitors] = useState<Competitor[]>([]);
  const [competitorName, setCompetitorName] = useState("");
  const [competitorUrl, setCompetitorUrl] = useState("");
  const [competitorCategory, setCompetitorCategory] = useState("");
  const [competitorError, setCompetitorError] = useState<string | null>(null);

  const [reports, setReports] = useState<Report[]>([]);
  const [reportsError, setReportsError] = useState<string | null>(null);

  const [globalMessage, setGlobalMessage] = useState<string | null>(null);

  // ===== AUTH HANDLING =====
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (session) {
      fetchBusinesses();
    } else {
      setBusinesses([]);
      setSelectedBusinessId(null);
      setCompetitors([]);
      setReports([]);
    }
  }, [session]);

  useEffect(() => {
    if (selectedBusinessId) {
      fetchCompetitors(selectedBusinessId);
      fetchReports(selectedBusinessId);
    } else {
      setCompetitors([]);
      setReports([]);
    }
  }, [selectedBusinessId]);

  async function handleSignIn() {
    setAuthError(null);
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    setLoading(false);
    if (error) {
      setAuthError(error.message);
    }
  }

  async function handleSignUp() {
    setAuthError(null);
    setLoading(true);
    const { error } = await supabase.auth.signUp({
      email,
      password,
    });
    setLoading(false);
    if (error) {
      setAuthError(error.message);
    }
  }

  async function handleLogout() {
    await supabase.auth.signOut();
  }

  // ===== BUSINESSES =====
  async function fetchBusinesses() {
    setBusinessError(null);
    const { data, error } = await supabase
      .from("businesses")
      .select("id, name, created_at")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error fetching businesses:", error);
      setBusinessError(error.message);
      return;
    }

    setBusinesses(data || []);

    if (!selectedBusinessId && data && data.length > 0) {
      setSelectedBusinessId(data[0].id);
    }
  }

  async function handleAddBusiness(e: React.FormEvent) {
    e.preventDefault();
    setBusinessError(null);
    setGlobalMessage(null);

    if (!businessName.trim()) {
      setBusinessError("Business name is required");
      return;
    }

    const user = session?.user;
    if (!user) {
      setBusinessError("You must be logged in to add a business");
      return;
    }

    const { error } = await supabase.from("businesses").insert({
      name: businessName.trim(),
      user_id: user.id,
    });

    if (error) {
      console.error("Error adding business:", error);
      setBusinessError(error.message);
      return;
    }

    setBusinessName("");
    await fetchBusinesses();
    setGlobalMessage("Business added successfully.");
  }

  // ===== COMPETITORS =====
  async function fetchCompetitors(businessId: string) {
    setCompetitorError(null);
    const { data, error } = await supabase
      .from("competitors")
      .select("id, name, google_maps_url, category, created_at")
      .eq("business_id", businessId)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error fetching competitors:", error);
      setCompetitorError(error.message);
      return;
    }

    setCompetitors(data || []);
  }

  async function handleAddCompetitor(e: React.FormEvent) {
    e.preventDefault();
    setCompetitorError(null);
    setGlobalMessage(null);

    if (!selectedBusinessId) {
      setCompetitorError("Please select a business first.");
      return;
    }

    if (!competitorName.trim() || !competitorUrl.trim()) {
      setCompetitorError("Competitor name and Google Maps URL are required.");
      return;
    }

    const user = session?.user;
    if (!user) {
      setCompetitorError("You must be logged in.");
      return;
    }

    const { error } = await supabase.from("competitors").insert({
      name: competitorName.trim(),
      google_maps_url: competitorUrl.trim(),
      category: competitorCategory.trim() || null,
      business_id: selectedBusinessId,
      user_id: user.id,
    });

    if (error) {
      console.error("Error adding competitor:", error);
      setCompetitorError(error.message);
      return;
    }

    setCompetitorName("");
    setCompetitorUrl("");
    setCompetitorCategory("");
    await fetchCompetitors(selectedBusinessId);
    setGlobalMessage("Competitor added successfully.");
  }

  async function handleScrape(competitorId: string) {
    try {
      setGlobalMessage(null);
      setLoading(true);
      const result = await postJson<{
        status: string;
        competitor_id: string;
        reviews_inserted: number;
      }>(`/scrape-competitor/${competitorId}`);
      setGlobalMessage(
        `Scraping completed. Inserted ${result.reviews_inserted} reviews.`
      );
    } catch (error: any) {
      console.error("Error triggering scrape:", error);
      setGlobalMessage(`Scrape failed: ${error.message}`);
    } finally {
      setLoading(false);
    }
  }

  async function handleGenerateReport(competitorId: string) {
    if (!selectedBusinessId) {
      setGlobalMessage("Please select a business first.");
      return;
    }

    try {
      setGlobalMessage(null);
      setLoading(true);
      const result = await postJson<{
        status: string;
        report_id: string;
        pdf_url: string;
      }>(
        `/businesses/${selectedBusinessId}/competitors/${competitorId}/report`
      );

      setGlobalMessage("Report generated successfully.");
      await fetchReports(selectedBusinessId);

      const apiBase =
        (import.meta.env.VITE_API_BASE_URL as string) ||
        "http://localhost:4000";
      window.open(`${apiBase}${result.pdf_url}`, "_blank");
    } catch (error: any) {
      console.error("Error generating report:", error);
      setGlobalMessage(`Report generation failed: ${error.message}`);
    } finally {
      setLoading(false);
    }
  }

  // ===== REPORTS =====
  async function fetchReports(businessId: string) {
    setReportsError(null);
    const { data, error } = await supabase
      .from("reports")
      .select("id, pdf_url, created_at")
      .eq("business_id", businessId)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error fetching reports:", error);
      setReportsError(error.message);
      return;
    }

    setReports(data || []);
  }

  // ===== AUTH VIEW =====
  if (!session) {
    return (
      <div className="auth-shell">
        <div className="auth-card">
          <div className="app-logo" style={{ marginBottom: 12 }}>
            <div className="app-logo-badge">CI</div>
            <div className="app-logo-text">
              <div className="app-logo-title">Local Intel</div>
              <div className="app-logo-subtitle">
                Competitive insights for local businesses
              </div>
            </div>
          </div>

          <div className="auth-toggle">
            <div>
              <div className="auth-title">
                {authView === "sign-in" ? "Welcome back" : "Create an account"}
              </div>
              <div className="auth-subtitle">
                {authView === "sign-in"
                  ? "Sign in to manage businesses and reports."
                  : "Start tracking your competitors in minutes."}
              </div>
            </div>
            <button
              className="btn btn-ghost"
              onClick={() =>
                setAuthView(authView === "sign-in" ? "sign-up" : "sign-in")
              }
            >
              {authView === "sign-in" ? "Need an account?" : "Have an account?"}
            </button>
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (authView === "sign-in") {
                handleSignIn();
              } else {
                handleSignUp();
              }
            }}
            className="auth-form"
          >
            <input
              type="email"
              className="input"
              placeholder="Work email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            <input
              type="password"
              className="input"
              placeholder="Password (min 6 characters)"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />

            <button type="submit" className="btn btn-primary" disabled={loading}>
              <span className="btn-icon">⚡</span>
              {loading
                ? "Please wait..."
                : authView === "sign-in"
                ? "Sign in"
                : "Sign up"}
            </button>
          </form>

          {authError && <p className="auth-error">Error: {authError}</p>}
        </div>
      </div>
    );
  }

  // ===== LOGGED-IN DASHBOARD =====
  return (
    <div className="app-shell">
      {/* Sidebar */}
      <aside className="app-sidebar">
        <div className="app-logo">
          <div className="app-logo-badge">CI</div>
          <div className="app-logo-text">
            <div className="app-logo-title">Local Intel</div>
            <div className="app-logo-subtitle">AI competitive insights</div>
          </div>
        </div>

        <div>
          <div className="sidebar-section-title">Account</div>
          <div className="sidebar-user-card">
            <div className="sidebar-user-email">{session.user.email}</div>
            <div className="sidebar-user-meta">
              Solo workspace · Early access
            </div>
          </div>
        </div>

        <div>
          <div className="sidebar-section-title">Views</div>
          <div className="sidebar-nav">
            <div className="sidebar-pill sidebar-pill-active">
              <span>📊 Dashboard</span>
              <span className="sidebar-pill-badge">MVP</span>
            </div>
          </div>
        </div>

        <div className="sidebar-footer">
          <div>Tip: start with 1–3 key competitors per location.</div>
        </div>
      </aside>

      {/* Main content */}
      <main className="app-main">
        <header className="top-bar">
          <div className="top-bar-left">
            <div className="top-bar-title">Competitive Intelligence</div>
            <div className="top-bar-subtitle">
              Add your business, link competitors, and generate AI-ready reports.
            </div>
          </div>
          <div className="top-bar-actions">
            {globalMessage && (
              <div className="alert">
                <span>✅</span>
                <span>{globalMessage}</span>
              </div>
            )}
            <button className="btn btn-ghost" onClick={handleLogout}>
              <span className="btn-icon">⏏</span>
              Log out
            </button>
          </div>
        </header>

        {/* Row: Businesses + Competitors */}
        <div className="section-row">
          {/* Businesses */}
          <section className="card">
            <div className="card-header">
              <div>
                <div className="card-title">Your businesses</div>
                <div className="card-subtitle">
                  Add locations you want to monitor.
                </div>
              </div>
            </div>
            <div className="card-body">
              <form
                onSubmit={handleAddBusiness}
                style={{ display: "flex", gap: 8, marginBottom: 10 }}
              >
                <input
                  type="text"
                  className="input"
                  placeholder="e.g. Frituur Centrale Lanaken"
                  value={businessName}
                  onChange={(e) => setBusinessName(e.target.value)}
                />
                <button type="submit" className="btn btn-primary">
                  <span className="btn-icon">＋</span>
                  Add
                </button>
              </form>

              {businessError && (
                <p className="text-error">Error: {businessError}</p>
              )}

              {businesses.length === 0 ? (
                <p className="text-muted">
                  No businesses yet. Add your first one above.
                </p>
              ) : (
                <div style={{ marginTop: 6 }}>
                  <div className="text-muted" style={{ marginBottom: 4 }}>
                    Active business
                  </div>
                  <select
                    className="select"
                    value={selectedBusinessId || ""}
                    onChange={(e) =>
                      setSelectedBusinessId(e.target.value || null)
                    }
                  >
                    {businesses.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          </section>

          {/* Competitors */}
          <section className="card">
            <div className="card-header">
              <div>
                <div className="card-title">Competitors</div>
                <div className="card-subtitle">
                  Link Google Maps profiles for competitors to track.
                </div>
              </div>
            </div>
            <div className="card-body">
              {!selectedBusinessId ? (
                <p className="text-muted">
                  Select or add a business to start adding competitors.
                </p>
              ) : (
                <>
                  <form
                    onSubmit={handleAddCompetitor}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 2fr 1fr auto",
                      gap: 8,
                      marginBottom: 10,
                      alignItems: "center",
                    }}
                  >
                    <input
                      type="text"
                      className="input"
                      placeholder="Competitor name"
                      value={competitorName}
                      onChange={(e) => setCompetitorName(e.target.value)}
                    />
                    <input
                      type="text"
                      className="input"
                      placeholder="Google Maps URL"
                      value={competitorUrl}
                      onChange={(e) => setCompetitorUrl(e.target.value)}
                    />
                    <input
                      type="text"
                      className="input"
                      placeholder="Category (optional)"
                      value={competitorCategory}
                      onChange={(e) => setCompetitorCategory(e.target.value)}
                    />
                    <button type="submit" className="btn btn-primary">
                      Add
                    </button>
                  </form>

                  {competitorError && (
                    <p className="text-error">{competitorError}</p>
                  )}

                  {competitors.length === 0 ? (
                    <p className="text-muted">
                      No competitors yet. Add at least one using Google Maps URL.
                    </p>
                  ) : (
                    <div className="table-wrapper">
                      <table className="table">
                        <thead>
                          <tr>
                            <th>Name</th>
                            <th>Google Maps</th>
                            <th>Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {competitors.map((c) => (
                            <tr key={c.id} className="table-row-soft">
                              <td>
                                {c.name}
                                {c.category && (
                                  <div
                                    style={{
                                      fontSize: 11,
                                      color: "var(--text-soft)",
                                      marginTop: 2,
                                    }}
                                  >
                                    {c.category}
                                  </div>
                                )}
                              </td>
                              <td>
                                <a
                                  href={c.google_maps_url}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="text-muted"
                                >
                                  Open in Maps
                                </a>
                              </td>
                              <td>
                                <div className="table-actions">
                                  <button
                                    className="btn"
                                    disabled={loading}
                                    onClick={() => handleScrape(c.id)}
                                  >
                                    <span className="btn-icon">🕸</span>
                                    Scrape
                                  </button>
                                  <button
                                    className="btn btn-primary"
                                    disabled={loading}
                                    onClick={() => handleGenerateReport(c.id)}
                                  >
                                    <span className="btn-icon">📄</span>
                                    Report
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </>
              )}
            </div>
          </section>
        </div>

        {/* Reports */}
        <section className="card">
          <div className="card-header">
            <div>
              <div className="card-title">Reports</div>
              <div className="card-subtitle">
                Download previously generated PDF reports per business.
              </div>
            </div>
          </div>
          <div className="card-body">
            {!selectedBusinessId ? (
              <p className="text-muted">Select a business to see reports.</p>
            ) : (
              <>
                {reportsError && (
                  <p className="text-error">{reportsError}</p>
                )}

                {reports.length === 0 ? (
                  <p className="text-muted">
                    No reports yet. Generate your first report from the
                    competitors table above.
                  </p>
                ) : (
                  <div className="table-wrapper">
                    <table className="table">
                      <thead>
                        <tr>
                          <th>Created at</th>
                          <th>PDF</th>
                        </tr>
                      </thead>
                      <tbody>
                        {reports.map((r) => (
                          <tr key={r.id} className="table-row-soft">
                            <td>
                              {new Date(r.created_at).toLocaleString()}
                            </td>
                            <td>
                              {r.pdf_url ? (
                                <button
                                  className="btn btn-primary"
                                  onClick={() => {
                                    const apiBase =
                                      (import.meta.env.VITE_API_BASE_URL as string) ||
                                      "http://localhost:4000";
                                    window.open(
                                      `${apiBase}${r.pdf_url}`,
                                      "_blank"
                                    );
                                  }}
                                >
                                  <span className="btn-icon">🔍</span>
                                  Open PDF
                                </button>
                              ) : (
                                <span className="text-muted">No file URL</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}

export default App;
