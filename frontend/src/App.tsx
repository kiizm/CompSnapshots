import { useEffect, useState } from "react";
import { supabase } from "./lib/supabaseClient";
import { postJson } from "./lib/api";

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

  // ===== RENDER: LOGGED-OUT VIEW =====
  if (!session) {
    return (
      <div style={{ maxWidth: 400, margin: "40px auto", fontFamily: "sans-serif" }}>
        <h1>Competitive Intelligence MVP</h1>
        <p>{authView === "sign-in" ? "Sign in" : "Sign up"} to continue.</p>

        <button
          onClick={() =>
            setAuthView(authView === "sign-in" ? "sign-up" : "sign-in")
          }
        >
          Switch to {authView === "sign-in" ? "Sign Up" : "Sign In"}
        </button>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (authView === "sign-in") {
              handleSignIn();
            } else {
              handleSignUp();
            }
          }}
          style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 8 }}
        >
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <input
            type="password"
            placeholder="Password (min 6 chars)"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />

          <button type="submit" disabled={loading}>
            {loading
              ? "Please wait..."
              : authView === "sign-in"
              ? "Sign In"
              : "Sign Up"}
          </button>
        </form>

        {authError && (
          <p style={{ color: "red", marginTop: 8 }}>Error: {authError}</p>
        )}
      </div>
    );
  }

  // ===== RENDER: LOGGED-IN VIEW =====
  return (
    <div style={{ maxWidth: 900, margin: "24px auto", fontFamily: "sans-serif" }}>
      <header
        style={{
          display: "flex",
          justifyContent: "space-between",
          marginBottom: 24,
        }}
      >
        <div>
          <h1>Dashboard</h1>
          <p style={{ fontSize: 12 }}>Logged in as: {session.user.email}</p>
        </div>
        <button onClick={handleLogout}>Log out</button>
      </header>

      {globalMessage && (
        <div
          style={{
            marginBottom: 16,
            padding: 8,
            backgroundColor: "#ecfdf5",
            borderRadius: 6,
            fontSize: 13,
          }}
        >
          {globalMessage}
        </div>
      )}

      {/* Businesses section */}
      <section style={{ marginBottom: 24 }}>
        <h2>Your Businesses</h2>

        <form
          onSubmit={handleAddBusiness}
          style={{ display: "flex", gap: 8, marginTop: 8 }}
        >
          <input
            type="text"
            placeholder="Business name"
            value={businessName}
            onChange={(e) => setBusinessName(e.target.value)}
          />
          <button type="submit">Add</button>
        </form>

        {businessError && (
          <p style={{ color: "red", marginTop: 8 }}>Error: {businessError}</p>
        )}

        <div style={{ marginTop: 12 }}>
          {businesses.length === 0 ? (
            <p style={{ fontSize: 13 }}>No businesses yet. Add one above.</p>
          ) : (
            <div>
              <label style={{ fontSize: 13 }}>Select business:</label>
              <select
                value={selectedBusinessId || ""}
                onChange={(e) =>
                  setSelectedBusinessId(e.target.value || null)
                }
                style={{ marginLeft: 8 }}
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

      {/* Competitors section */}
      <section style={{ marginBottom: 24 }}>
        <h2>Competitors for selected business</h2>

        {!selectedBusinessId ? (
          <p style={{ fontSize: 13 }}>
            Select or add a business to manage competitors.
          </p>
        ) : (
          <>
            <form
              onSubmit={handleAddCompetitor}
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 2fr 1fr auto",
                gap: 8,
                marginTop: 8,
                alignItems: "center",
              }}
            >
              <input
                type="text"
                placeholder="Competitor name"
                value={competitorName}
                onChange={(e) => setCompetitorName(e.target.value)}
              />
              <input
                type="text"
                placeholder="Google Maps URL"
                value={competitorUrl}
                onChange={(e) => setCompetitorUrl(e.target.value)}
              />
              <input
                type="text"
                placeholder="Category (optional)"
                value={competitorCategory}
                onChange={(e) => setCompetitorCategory(e.target.value)}
              />
              <button type="submit">Add</button>
            </form>

            {competitorError && (
              <p style={{ color: "red", marginTop: 8 }}>{competitorError}</p>
            )}

            <div style={{ marginTop: 12 }}>
              {competitors.length === 0 ? (
                <p style={{ fontSize: 13 }}>
                  No competitors yet. Add one above.
                </p>
              ) : (
                <table
                  style={{
                    width: "100%",
                    borderCollapse: "collapse",
                    fontSize: 13,
                  }}
                >
                  <thead>
                    <tr>
                      <th
                        style={{
                          textAlign: "left",
                          borderBottom: "1px solid #e5e7eb",
                          padding: 6,
                        }}
                      >
                        Name
                      </th>
                      <th
                        style={{
                          textAlign: "left",
                          borderBottom: "1px solid #e5e7eb",
                          padding: 6,
                        }}
                      >
                        Google Maps URL
                      </th>
                      <th
                        style={{
                          textAlign: "left",
                          borderBottom: "1px solid #e5e7eb",
                          padding: 6,
                        }}
                      >
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {competitors.map((c) => (
                      <tr key={c.id}>
                        <td
                          style={{
                            borderBottom: "1px solid #f3f4f6",
                            padding: 6,
                            verticalAlign: "top",
                          }}
                        >
                          {c.name}
                          {c.category && (
                            <div style={{ fontSize: 11, color: "#6b7280" }}>
                              {c.category}
                            </div>
                          )}
                        </td>
                        <td
                          style={{
                            borderBottom: "1px solid #f3f4f6",
                            padding: 6,
                            verticalAlign: "top",
                            wordBreak: "break-all",
                          }}
                        >
                          <a
                            href={c.google_maps_url}
                            target="_blank"
                            rel="noreferrer"
                          >
                            Open in Maps
                          </a>
                        </td>
                        <td
                          style={{
                            borderBottom: "1px solid #f3f4f6",
                            padding: 6,
                            verticalAlign: "top",
                          }}
                        >
                          <button
                            style={{ marginRight: 8, marginBottom: 4 }}
                            disabled={loading}
                            onClick={() => handleScrape(c.id)}
                          >
                            Scrape reviews
                          </button>
                          <button
                            disabled={loading}
                            onClick={() => handleGenerateReport(c.id)}
                          >
                            Generate report (PDF)
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </>
        )}
      </section>

      {/* Reports section */}
      <section style={{ marginBottom: 24 }}>
        <h2>Reports for selected business</h2>

        {!selectedBusinessId ? (
          <p style={{ fontSize: 13 }}>Select a business to see reports.</p>
        ) : (
          <>
            {reportsError && (
              <p style={{ color: "red", marginTop: 8 }}>{reportsError}</p>
            )}

            {reports.length === 0 ? (
              <p style={{ fontSize: 13, marginTop: 8 }}>
                No reports yet. Generate one from the competitors table above.
              </p>
            ) : (
              <table
                style={{
                  width: "100%",
                  borderCollapse: "collapse",
                  fontSize: 13,
                  marginTop: 8,
                }}
              >
                <thead>
                  <tr>
                    <th
                      style={{
                        textAlign: "left",
                        borderBottom: "1px solid #e5e7eb",
                        padding: 6,
                      }}
                    >
                      Created at
                    </th>
                    <th
                      style={{
                        textAlign: "left",
                        borderBottom: "1px solid #e5e7eb",
                        padding: 6,
                      }}
                    >
                      PDF
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {reports.map((r) => (
                    <tr key={r.id}>
                      <td
                        style={{
                          borderBottom: "1px solid #f3f4f6",
                          padding: 6,
                        }}
                      >
                        {new Date(r.created_at).toLocaleString()}
                      </td>
                      <td
                        style={{
                          borderBottom: "1px solid #f3f4f6",
                          padding: 6,
                        }}
                      >
                        {r.pdf_url ? (
                          <button
                            onClick={() => {
                              const apiBase =
                                (import.meta.env.VITE_API_BASE_URL as string) ||
                                "http://localhost:4000";
                              window.open(`${apiBase}${r.pdf_url}`, "_blank");
                            }}
                          >
                            Open PDF
                          </button>
                        ) : (
                          <span style={{ fontSize: 11, color: "#6b7280" }}>
                            No file URL
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </>
        )}
      </section>
    </div>
  );
}

export default App;
