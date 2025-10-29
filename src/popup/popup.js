let session;
let lastAnalysis; // store the latest parsed analysis for Details view
let previousIssues = []; // store previously reported issues to avoid repetition

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
  previousIssues = []; // Clear previous issues when resetting session
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

        // Create optimized structured summary (key details only for performance)
        const tCtx0 = performance.now();
        const headingItems = pageInfo?.headings?.items || [];
        const buttonItems = pageInfo?.buttons?.items || [];
        const formItems = pageInfo?.forms?.items || [];

        const structuredSummary = JSON.stringify(
          {
            url: currentTab.url,

            headings: {
              count: pageInfo?.headings?.count || 0,
              hasH1: pageInfo?.headings?.hasH1 || false,
              emptyCount: headingItems.filter((h) => h?.isEmpty).length || 0,
              structure: headingItems.slice(0, 5).map((h) => h?.level),
              sampleTexts: headingItems
                .slice(0, 3)
                .map((h) => h?.text?.substring(0, 80) || ""),
            },

            buttons: {
              count: pageInfo?.buttons?.count || 0,
              ariaLabelCount: buttonItems.filter((b) => b?.hasAriaLabel).length,
              disabledCount: buttonItems.filter((b) => b?.isDisabled).length,
              samples: buttonItems.slice(0, 5).map((b) => ({
                text: b?.text?.substring(0, 30) || "",
                hasAriaLabel: !!b?.hasAriaLabel,
                isDisabled: !!b?.isDisabled,
              })),
            },

            forms: {
              count: pageInfo?.forms?.count || 0,
              withLabels: formItems.filter((f) => f?.hasLabels).length,
              withRequiredFields: formItems.filter((f) => f?.hasRequiredFields)
                .length,
              averageInputFields:
                formItems.length > 0
                  ? Number(
                      (
                        formItems.reduce(
                          (sum, form) => sum + (form?.inputCount || 0),
                          0
                        ) / formItems.length
                      ).toFixed(1)
                    )
                  : 0,
              samples: formItems.slice(0, 3),
            },

            images: {
              total: pageInfo?.images?.total || 0,
              missingAlt: pageInfo?.images?.missingAlt || 0,
              emptyAlt: pageInfo?.images?.emptyAlt || 0,
              withAlt: pageInfo?.images?.withAlt || 0,
              exampleSelectors: (
                pageInfo?.images?.missingAltSelectors || []
              ).slice(0, 2),
            },

            links: {
              total: pageInfo?.links?.total || 0,
              emptyText: pageInfo?.links?.emptyText || 0,
            },

            touchTargets: {
              total: pageInfo?.touchTargets?.total || 0,
              smallCount: pageInfo?.touchTargets?.smallerThan44 || 0,
              examples: (pageInfo?.touchTargets?.selectorsSmall || []).slice(
                0,
                2
              ),
            },

            accessibility: {
              ariaElementCount: pageInfo?.ariaLabels?.total || 0,
              hasAriaLabels: !!pageInfo?.ariaLabels?.hasAriaLabels,
              altTextQuality: pageInfo?.altTexts || { good: 0, poor: 0 },
            },

            textContent: {
              wordCount: pageInfo?.textContent?.wordCount || 0,
              characterCount: pageInfo?.textContent?.characterCount || 0,
              paragraphs: pageInfo?.textContent?.paragraphs || 0,
            },

            readability: {
              sentenceCount: pageInfo?.readability?.sentenceCount || 0,
              averageSentenceLength: Number(
                (
                  pageInfo?.readability?.averageSentenceLengthWords || 0
                ).toFixed(1)
              ),
              medianSentenceLength: Number(
                (pageInfo?.readability?.medianSentenceLengthWords || 0).toFixed(
                  1
                )
              ),
            },

            visual: {
              uniqueColors: pageInfo?.colors?.uniqueColors || 0,
              contrast: {
                elementsChecked: pageInfo?.contrast?.elementsChecked || 0,
                belowAA: pageInfo?.contrast?.belowAA || 0,
                belowAAA: pageInfo?.contrast?.belowAAA || 0,
                examples: (pageInfo?.contrast?.selectorsBelowAA || []).slice(
                  0,
                  2
                ),
              },
            },
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

2. Score each heuristic from 0-100, then compute: usability_score = Σ(heuristic_score × weight).
3. Do not confine scores to narrow bands (e.g., always within 70-80 or 80-90). Follow the evidence and weights to determine the final score. Only pages with many serious issues should fall below 60.

**Scoring Calibration (IMPORTANT):**
- Use the full 0-100 range. Avoid clustering most pages within a narrow band unless they genuinely share identical quality.
- Treat 70 as a neutral, acceptable baseline when no major heuristics fail and there are clear strengths. Raise the score toward 85-95 for polished, well-structured experiences with only minor issues.
- Reserve 50-69 for experiences with notable friction or multiple medium-severity problems. Drop below 50 only when severe usability failures exist across several heuristics.
- When strong positives are detected (e.g., clear hierarchy, accessible buttons, high contrast, concise copy), reflect them by increasing the corresponding heuristic scores.

**Heuristic Evaluation Workflow (MANDATORY):**
1. For each heuristic (1-10), inspect the provided context and explicitly decide whether the evidence shows clear strengths, minor friction, or severe problems.
2. Begin every heuristic at a baseline score of 70. Adjust upward when the context demonstrates clear strengths for that heuristic; adjust downward only when concrete issues are indicated. Severe failures should push the score below 50.
3. Do **not** let one issue depress multiple heuristics unless the evidence clearly maps to each of them.
4. After adjusting all ten heuristic scores, compute the overall usability_score strictly as Σ(heuristic_score × weight) using the weights given above. Double-check the arithmetic before returning the final JSON.

**Issue Reporting Rules:**
1. PRIORITY: Report issues related to HIGH-WEIGHT heuristics FIRST (especially #4, #1, #5, #3)
2. Return 1-3 most critical issues, sorted by:
   
   -  Severity (high > medium > low)

**Location Format (CRITICAL for developers):**
- MUST provide SPECIFIC DOM element identifiers for every issue
- REQUIRED: Give an exact CSS selector or ID that pinpoints the element (e.g. \`div.main > section.hero > button.cta-primary\`, \`form#signup-form input[name="email"]\`, \`header nav a.logo-link\`).
- Include visual position when helpful (e.g., "top-right", "main content area")
- Good examples (SPECIFIC DOM ELEMENTS):
  * "input#email-field in <form class='signup-form'>"
  * "button.submit-btn in header <nav>"
  * "div.hero section.primary-callout button.cta-primary"
  * "img.gallery-item:nth-of-type(3) in <div class='gallery-grid'>"
  * "footer.site-footer ul.nav-links a[href='/pricing']"
- Bad examples (TOO VAGUE - avoid these):
  * "Navigation area" ❌
  * "Some buttons" ❌
  * "Footer section" ❌
  * "Throughout the page" ❌

**Issue Discovery Rules:**
- Report REAL issues only - do NOT fabricate problems if the page is well-designed
- If reanalyzing, find DIFFERENT issues than before (avoid repeating the same problems)
- Return 1-3 issues maximum; if fewer genuine issues exist, return fewer

Return ONLY valid JSON with the specified structure.`;

        // Build context with previous issues if doing re-analysis
        let contextPrompt = `Context:\n${structuredSummary}`;
        if (previousIssues.length > 0) {
          contextPrompt += `\n\nPreviously reported issues (DO NOT repeat these):\n${previousIssues
            .map((issue, i) => `${i + 1}. ${issue.title}`)
            .join("\n")}`;
        }

        const prompt = contextPrompt;

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
              minItems: 0,
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
            // Increased creativity for diverse analysis
            initialPrompts: [
              {
                role: "system",
                content: systemInstructions,
              },
            ],
            temperature: 0.6, // Balanced creativity and speed (was 0.4 → 0.8 → 0.6)
            topK: 8, // Moderate exploration (was 3 → 20 → 8)

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

            // Store current issues to avoid repetition in next analysis
            previousIssues = [...previousIssues, ...sortedIssues];
            // Keep only last 10 issues to prevent unlimited growth
            if (previousIssues.length > 10) {
              previousIssues = previousIssues.slice(-10);
            }

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
