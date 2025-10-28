let session;
let lastAnalysis; // store the latest parsed analysis for Details view

// Nielsen's 10 Heuristics weights (sum to 1.0)
const HEURISTIC_WEIGHTS = {
  1: 0.13, // Visibility of System Status
  2: 0.1, // Match Between the System and the Real World
  3: 0.11, // User Control and Freedom
  4: 0.15, // Consistency and Standards
  5: 0.12, // Error Prevention
  6: 0.1, // Recognition Rather than Recall
  7: 0.08, // Flexibility and Efficiency of Use
  8: 0.07, // Aesthetic and Minimalist Design
  9: 0.1, // Help Users Recognize, Diagnose, and Recover from Errors
  10: 0.03, // Help and Documentation
};

const HEURISTIC_NAMES = {
  1: "Visibility of System Status",
  2: "Match Between the System and the Real World",
  3: "User Control and Freedom",
  4: "Consistency and Standards",
  5: "Error Prevention",
  6: "Recognition Rather than Recall",
  7: "Flexibility and Efficiency of Use",
  8: "Aesthetic and Minimalist Design",
  9: "Help Users Recognize, Diagnose, and Recover from Errors",
  10: "Help and Documentation",
};

async function runPrompt(prompt, params, schema, onChunk) {
  try {
    const t0 = performance.now();
    if (!session) {
      const c0 = performance.now();
      const paramsWithMonitor = Object.assign({}, params, {
        monitor(m) {
          try {
            m.addEventListener("downloadprogress", (e) => {
              const pct = Math.round((e.loaded || 0) * 100);
              console.log(`[Heurix][Perf] model download: ${pct}%`);
            });
          } catch (_) {}
        },
      });
      session = await LanguageModel.create(params);
      const c1 = performance.now();
      console.log(
        `[Heurix][Perf] LanguageModel.create: ${Math.round(c1 - c0)} ms`
      );
    }
    const p0 = performance.now();
    const stream = session.promptStreaming(prompt, {
      responseConstraint: schema,
    });
    let aggregated = "";
    for await (const chunk of stream) {
      let piece = "";
      if (typeof chunk === "string") {
        piece = chunk;
      } else if (chunk && typeof chunk.text === "function") {
        try {
          piece = await chunk.text();
        } catch (_) {}
      } else if (chunk && typeof chunk === "object") {
        const maybe = String(chunk);
        if (maybe && maybe !== "[object Object]") piece = maybe;
      }
      if (piece) {
        aggregated += piece;
        if (typeof onChunk === "function") {
          try {
            onChunk(piece);
          } catch (_) {}
        }
      }
    }
    const p1 = performance.now();
    console.log(
      `[Heurix][Perf] session.promptStreaming: ${Math.round(p1 - p0)} ms`
    );
    console.log(`[Heurix][Perf] runPrompt total: ${Math.round(p1 - t0)} ms`);
    return aggregated;
  } catch (e) {
    console.log("Prompt failed");
    console.error(e);
    console.log("Prompt:", prompt);
    // Reset session
    reset();
    throw e;
  }
}

async function reset() {
  if (session) {
    session.destroy();
  }
  session = null;
}

// Wait for DOM to be fully loaded
document.addEventListener("DOMContentLoaded", function () {
  const analyzeBtn = document.getElementById("analyzeBtn");
  const results = document.getElementById("results");
  const details = document.getElementById("details");
  const headerBackBtn = document.getElementById("headerBackBtn");
  const analyzeAgainBtnId = "analyzeAgainBtn";

  async function runAnalysis() {
    // Add loading state
    analyzeBtn.classList.add("loading");
    analyzeBtn.innerHTML = "<span>Analyzing...</span>";
    const tTotal0 = performance.now();

    // Query the active tab
    chrome.tabs.query(
      { active: true, currentWindow: true },
      async function (tabs) {
        const currentTab = tabs[0];

        // Ask content script for structured page info
        const tMsg0 = performance.now();
        const pageInfo = await new Promise((resolve) => {
          chrome.tabs.sendMessage(
            currentTab.id,
            { type: "GET_PAGE_INFO" },
            (response) => {
              console.log(
                `[Heurix][Perf] GET_PAGE_INFO roundtrip: ${Math.round(
                  performance.now() - tMsg0
                )} ms`
              );
              if (response && response.metrics) {
                console.log(
                  "[Heurix][Perf] content metrics:",
                  response.metrics
                );
              }
              resolve(response);
            }
          );
        });

        // Bind URL card early
        try {
          const urlTitle = document.querySelector(".url-title");
          const urlSubtitle = document.querySelector(".url-subtitle");
          if (urlTitle)
            urlTitle.textContent = currentTab.title || "Current Page";
          if (urlSubtitle) urlSubtitle.textContent = currentTab.url || "";
        } catch (_) {}

        // Create concise structured summary for the model
        const tCtx0 = performance.now();
        const structuredSummary = JSON.stringify(
          {
            url: currentTab.url,
            hierarchy: {
              headings: pageInfo?.headings,
              buttons: { count: pageInfo?.buttons?.count },
              forms: pageInfo?.forms,
            },
            readability: {
              wordCount: pageInfo?.textContent?.wordCount,
              paragraphs: pageInfo?.textContent?.paragraphs,
              averageSentenceLengthWords:
                pageInfo?.readability?.averageSentenceLengthWords,
            },
            accessibility: {
              ariaElements: pageInfo?.ariaLabels?.total,
              images: pageInfo?.images,
              altQuality: pageInfo?.altTexts,
            },
            contrast: pageInfo?.contrast,
            touchTargets: pageInfo?.touchTargets,
          },
          null,
          0
        );
        const tCtx1 = performance.now();
        console.log(
          `[Heurix][Perf] build structured context: ${Math.round(
            tCtx1 - tCtx0
          )} ms, size: ${structuredSummary.length} chars`
        );
        console.log(
          `[Heurix][Perf] build structured context: size: ${structuredSummary.length} chars`
        );

        const systemInstructions = `You are a UX/UI expert evaluating web pages based on Nielsen's 10 Usability Heuristics.

**Scoring Rules (CRITICAL):**
1. Calculate the overall usability_score using STRICTLY these weighted heuristics (weights sum to 1.0):
   ${Object.entries(HEURISTIC_WEIGHTS)
     .sort(([, a], [, b]) => b - a) // Sort by weight descending
     .map(([k, w]) => `   ${k}. ${HEURISTIC_NAMES[k]} — weight ${w}`)
     .join("\n")}

2. Score each heuristic from 0-100, then compute: usability_score = Σ(heuristic_score × weight)

**Issue Reporting Rules:**
1. PRIORITY: Report issues related to HIGH-WEIGHT heuristics FIRST (especially #4, #1, #5, #3)
2. Return 1-3 most critical issues, sorted by:
   - First: Heuristic weight (higher weight = higher priority)
   - Second: Severity (high > medium > low)

**Location Format (CRITICAL for developers):**
- Be EXTREMELY SPECIFIC and ACTIONABLE
- Include: CSS selector, element type, visual position, or XPath
- Good examples:
  * "Form input '#email' lacks label (line 42, main form)"
  * "Button '.submit-btn' in header navigation"
  * "<button class='cta'> in hero section, top-right"
  * "All <img> tags without alt attributes in gallery grid"
- Bad examples (too vague):
  * "Navigation area"
  * "Some buttons"
  * "Footer section"

Return ONLY valid JSON with the specified structure.`;

        const prompt = `Context:\n${structuredSummary}`;

        // Define JSON schema separately and pass as responseConstraint
        const schema = {
          type: "object",
          additionalProperties: false,
          properties: {
            usability_score: { type: "number", minimum: 0, maximum: 100 },
            strengths: {
              type: "array",
              items: { type: "string", maxLength: 240 },
            },
            issues: {
              type: "array",
              minItems: 1,
              maxItems: 3,
              items: {
                type: "object",
                additionalProperties: false,
                properties: {
                  id: { type: "string", maxLength: 64 },
                  title: { type: "string", maxLength: 240 },
                  category: { type: "string" },
                  severity: { type: "string", enum: ["low", "medium", "high"] },
                  description: { type: "string", maxLength: 240 },
                  location: { type: "string", maxLength: 240 },
                  impact: { type: "string", maxLength: 240 },
                  recommendation: { type: "string", maxLength: 240 },
                  heuristic_number: {
                    type: "number",
                    minimum: 1,
                    maximum: 10,
                  },
                },
                required: [
                  "title",
                  "category",
                  "severity",
                  "description",
                  "location",
                  "impact",
                  "recommendation",
                  "heuristic_number",
                ],
              },
            },
            summary: { type: "string", maxLength: 240 },
          },
          required: ["usability_score", "strengths", "issues", "summary"],
        };

        try {
          const params = {
            // control the stability of the model output
            initialPrompts: [
              {
                role: "system",
                content: systemInstructions,
              },
            ],
            temperature: 0.4,
            topK: 3,

            expectedInputs: [{ type: "text", languages: ["en"] }],
            expectedOutputs: [{ type: "text", languages: ["en"] }],
          };
          // Prepare live stream container
          const liveContainerId = "liveStream";
          let live = document.getElementById(liveContainerId);
          if (!live) {
            live = document.createElement("div");
            live.id = liveContainerId;
            live.className = "live-stream";
            try {
              analyzeBtn.insertAdjacentElement("afterend", live);
            } catch (_) {
              document.body.appendChild(live);
            }
          }
          live.style.whiteSpace = "pre-wrap";
          live.style.fontFamily =
            "ui-monospace, SFMono-Regular, Menlo, monospace";
          live.style.marginTop = "8px";
          live.textContent = "";
          const onChunk = (delta) => {
            if (!delta) return;
            try {
              live.textContent +=
                typeof delta === "string" ? delta : String(delta);
              live.scrollTop = live.scrollHeight;
            } catch (_) {}
          };
          const tModel0 = performance.now();
          const response = await runPrompt(prompt, params, schema, onChunk);
          const tModel1 = performance.now();
          console.log(
            `[Heurix][Perf] model total (incl. wrapper): ${Math.round(
              tModel1 - tModel0
            )} ms`
          );

          // Attempt to parse model response to JSON (tolerate markdown/fenced code)
          let parsed;
          const tParse0 = performance.now();
          let text;
          if (typeof response === "string") {
            text = response;
          } else if (response && typeof response.text === "function") {
            text = await response.text();
          } else {
            try {
              parsed = response;
            } catch (_) {}
          }
          if (!parsed && typeof text === "string") {
            // 1) Prefer fenced JSON block
            let match = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
            if (match && match[1]) {
              try {
                parsed = JSON.parse(match[1]);
              } catch (_) {}
            }
            // 2) Fallback to first JSON object in text
            if (!parsed) {
              const objMatch = text.match(/\{[\s\S]*\}/);
              if (objMatch) {
                try {
                  parsed = JSON.parse(objMatch[0]);
                } catch (_) {}
              }
            }
            // 3) Last resort: parse whole text (may throw; swallow)
            if (!parsed) {
              try {
                parsed = JSON.parse(text);
              } catch (_) {}
            }
          }
          const tParse1 = performance.now();
          console.log(
            `[Heurix][Perf] parse model output: ${Math.round(
              tParse1 - tParse0
            )} ms`
          );

          // Map to UI only if structure matches
          if (
            parsed &&
            typeof parsed.usability_score === "number" &&
            Array.isArray(parsed.strengths) &&
            Array.isArray(parsed.issues) &&
            typeof parsed.summary === "string"
          ) {
            // Sort issues by heuristic weight (higher first), then by severity
            const sortedIssues = [...parsed.issues].sort((a, b) => {
              const weightA = HEURISTIC_WEIGHTS[a.heuristic_number] || 0;
              const weightB = HEURISTIC_WEIGHTS[b.heuristic_number] || 0;
              if (weightB !== weightA) return weightB - weightA;

              // Secondary sort by severity
              const severityOrder = { high: 3, medium: 2, low: 1 };
              return (
                (severityOrder[b.severity] || 0) -
                (severityOrder[a.severity] || 0)
              );
            });

            // Save sorted analysis for Details view
            lastAnalysis = { ...parsed, issues: sortedIssues };

            const tUi0 = performance.now();
            // Update score number
            const scoreEl = document.querySelector(".score-value");
            scoreEl.textContent = String(Math.round(parsed.usability_score));

            // Update gauge fill
            const gaugeEl = document.querySelector(".gauge");
            const clamped = Math.max(0, Math.min(100, parsed.usability_score));
            gaugeEl.style.background = `radial-gradient(closest-side, #ecfdf5 72%, transparent 73% 100%), conic-gradient(#10b981 ${clamped}%, #e5e7eb 0)`;

            // Replace Strengths list
            const strengthsList = document.querySelector(
              ".panel--success .panel-list"
            );
            if (strengthsList) {
              strengthsList.innerHTML = "";
              parsed.strengths.forEach((strength) => {
                const li = document.createElement("li");
                li.className = "success";
                li.textContent = strength;
                strengthsList.appendChild(li);
              });
            }

            // Replace Issues list (titles only in summary view, using sorted issues)
            const issuesList = document.querySelector(
              ".panel--danger .panel-list"
            );
            issuesList.innerHTML = "";
            sortedIssues.forEach((issue) => {
              const li = document.createElement("li");
              li.className = "danger";
              const title =
                typeof issue === "string"
                  ? issue
                  : issue.title || issue.description || "Issue";
              li.textContent = title;
              issuesList.appendChild(li);
            });

            // Show summary in info panel
            const infoTitle = document.querySelector(
              ".panel--info .panel-title"
            );
            if (infoTitle) infoTitle.textContent = "Summary";
            const infoList = document.querySelector(".panel--info .panel-list");
            if (infoList) {
              infoList.innerHTML = "";
              const li = document.createElement("li");
              li.className = "info";
              li.textContent = parsed.summary;
              infoList.appendChild(li);
            }

            // Reveal results UI now
            analyzeBtn.classList.remove("loading");
            document.querySelector(".subtitle").style.display = "none";
            analyzeBtn.style.display = "none";
            document.querySelector(".instruction-text").style.display = "none";
            results.classList.remove("hidden");
            // Remove live stream container once final UI is ready
            try {
              if (live && live.parentNode) live.parentNode.removeChild(live);
            } catch (_) {}
            const tUi1 = performance.now();
            console.log(
              `[Heurix][Perf] update UI summary: ${Math.round(tUi1 - tUi0)} ms`
            );

            // Hook up Analyze Again
            const againBtn = document.getElementById(analyzeAgainBtnId);
            if (againBtn) {
              // Rebind to re-run analysis immediately
              againBtn.onclick = () => {
                results.classList.add("hidden");
                document.querySelector(".subtitle").style.display = "";
                analyzeBtn.style.display = "";
                document.querySelector(".instruction-text").style.display = "";
                // Trigger fresh analysis
                runAnalysis();
              };
            }

            // Bind View Details button
            const viewDetailsBtn = document.getElementById("viewDetailsBtn");
            if (viewDetailsBtn) {
              viewDetailsBtn.onclick = () => {
                renderDetails(lastAnalysis, currentTab);
                results.classList.add("hidden");
                if (details) details.classList.remove("hidden");
                if (headerBackBtn) headerBackBtn.style.display = "inline-flex";
                if (headerBackBtn) {
                  headerBackBtn.onclick = () => {
                    if (details) details.classList.add("hidden");
                    results.classList.remove("hidden");
                    headerBackBtn.style.display = "none";
                  };
                }
              };
            }

            // Stop here; skip fallback demo content
            console.log(
              `[Heurix][Perf] Analysis total: ${Math.round(
                performance.now() - tTotal0
              )} ms`
            );
            return;
          }
        } catch (error) {
          console.error("Error analyzing page:", error);
          alert("❌ Failed to analyze page. Please try again.");
          try {
            const live = document.getElementById("liveStream");
            if (live && live.parentNode) live.parentNode.removeChild(live);
          } catch (_) {}
        }

        // Here you can add your analysis logic
        console.log("Analyzing page:", currentTab.url);

        // Simulate analysis, then show example results
        setTimeout(() => {
          try {
            const live = document.getElementById("liveStream");
            if (live && live.parentNode) live.parentNode.removeChild(live);
          } catch (_) {}
          analyzeBtn.classList.remove("loading");
          // Hide intro elements
          document.querySelector(".subtitle").style.display = "none";
          analyzeBtn.style.display = "none";
          document.querySelector(".instruction-text").style.display = "none";
          // Show results
          results.classList.remove("hidden");
          // Hook up Analyze Again
          const againBtn = document.getElementById(analyzeAgainBtnId);
          if (againBtn) {
            againBtn.onclick = () => {
              // Reset to intro view and immediately analyze again
              results.classList.add("hidden");
              document.querySelector(".subtitle").style.display = "";
              analyzeBtn.style.display = "";
              document.querySelector(".instruction-text").style.display = "";
              runAnalysis();
            };
          }
        }, 1200);
      }
    );
  }

  // Handle analyze button click
  analyzeBtn.addEventListener("click", runAnalysis);

  function renderDetails(analysis, currentTab) {
    if (!analysis) return;
    const container = document.getElementById("details");
    if (!container) return;

    // URL card
    try {
      const urlTitle = container.querySelector(".url-title");
      const urlSubtitle = container.querySelector(".url-subtitle");
      if (urlTitle) urlTitle.textContent = currentTab?.title || "Current Page";
      if (urlSubtitle) urlSubtitle.textContent = currentTab?.url || "";
    } catch (_) {}

    // Score + Issues count
    const scoreEl = container.querySelector(".score-value");
    if (scoreEl)
      scoreEl.textContent = String(Math.round(analysis.usability_score || 0));
    const issuesCountEl = container.querySelector(".issues-count");
    if (issuesCountEl)
      issuesCountEl.textContent = String(
        Array.isArray(analysis.issues) ? analysis.issues.length : 0
      );

    // Issues list (already sorted by heuristic weight in lastAnalysis)
    const list = container.querySelector("#issuesListDetailed");
    if (!list) return;
    list.innerHTML = "";

    (analysis.issues || []).forEach((issue, index) => {
      const data =
        typeof issue === "string"
          ? {
              title: issue,
              category: "General",
              severity: "medium",
              description: issue,
              location: "",
              impact: "",
              recommendation: "",
              heuristic_number: null,
            }
          : issue;

      const heuristicInfo =
        data.heuristic_number && HEURISTIC_NAMES[data.heuristic_number]
          ? `<div class="kv" style="margin-top: 8px;">
               <span class="k">Heuristic #${data.heuristic_number}:</span> 
               <span class="v">${HEURISTIC_NAMES[data.heuristic_number]}</span>
             </div>`
          : "";

      const card = document.createElement("div");
      card.className = "issue-card";
      card.innerHTML = `
        <div class="issue-head">
          <span class="badge severity-${(
            data.severity || "medium"
          ).toLowerCase()}">${(data.severity || "medium").toLowerCase()}</span>
          <span class="category">${data.category || "General"}</span>
        </div>
        <div class="issue-title">${data.title || "Issue"}</div>
        ${
          data.description
            ? `<p class="issue-desc">${data.description}</p>`
            : ""
        }
        ${heuristicInfo}
        ${
          data.location
            ? `<div class="kv" style="background: #fef3c7; padding: 8px; border-radius: 6px; margin-top: 8px;">
                 <span class="k" style="color: #92400e;">Location:</span> 
                 <code class="v" style="background: #fef3c7; color: #92400e; font-weight: 600;">${data.location}</code>
               </div>`
            : ""
        }
        ${
          data.recommendation
            ? `<div class="callout"><div class="callout-title">Recommendation:</div><div class="callout-body">${data.recommendation}</div></div>`
            : ""
        }
      `;
      list.appendChild(card);
    });

    // Ensure header back button is visible when details are shown
    if (headerBackBtn) headerBackBtn.style.display = "inline-flex";
  }

  // Add keyboard support
  document.addEventListener("keydown", function (e) {
    if (e.key === "Enter" && document.activeElement === analyzeBtn) {
      analyzeBtn.click();
    }
  });

  // Auto-run analysis when popup opens
  runAnalysis();
});
