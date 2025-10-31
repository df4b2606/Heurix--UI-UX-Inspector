let session;
let lastAnalysis; // store the latest parsed analysis for Details view
let lastAnalyzedTab = null;
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
  const exportBtn = document.getElementById("exportBtn");

  const ANALYZE_BTN_DEFAULT_HTML = analyzeBtn ? analyzeBtn.innerHTML : "";
  const ANALYZE_BTN_LOADING_HTML = "<span>Analyzing...</span>";

  const subtitleEl = document.querySelector(".subtitle");
  const instructionEl = document.querySelector(".instruction-text");
  const strengthsListEl = document.querySelector(".panel--success .panel-list");
  const issuesListEl = document.querySelector(".panel--danger .panel-list");
  const summaryTitleEl = document.querySelector(".panel--info .panel-title");
  const summaryListEl = document.querySelector(".panel--info .panel-list");
  const gaugeEl = document.querySelector(".gauge");
  const scoreValueEl = gaugeEl ? gaugeEl.querySelector(".score-value") : null;
  const viewDetailsBtn = document.getElementById("viewDetailsBtn");
  const analyzeAgainBtn = document.getElementById(analyzeAgainBtnId);
  const instructionDefaultText = instructionEl ? instructionEl.textContent : "";

  let streamBuffer = "";
  let streamApplied = {
    usability_score: null,
    strengths: null,
    issues: null,
    summary: null,
  };
  let skeletonDisplayed = false;

  function resetStreamState() {
    streamBuffer = "";
    streamApplied = {
      usability_score: null,
      strengths: null,
      issues: null,
      summary: null,
    };
  }

  function arraysEqual(a, b) {
    if (!Array.isArray(a) || !Array.isArray(b)) return false;
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i += 1) {
      if (JSON.stringify(a[i]) !== JSON.stringify(b[i])) {
        return false;
      }
    }
    return true;
  }

  function decodeJsonString(raw) {
    try {
      return JSON.parse(`"${raw}"`);
    } catch (_) {
      return raw;
    }
  }

  function extractIssueTitles(buffer) {
    if (!buffer) return [];
    const issuesIndex = buffer.indexOf('"issues"');
    if (issuesIndex === -1) return [];
    const substring = buffer.slice(issuesIndex);
    const regex = /"title"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"/g;
    const titles = [];
    let match;
    while ((match = regex.exec(substring))) {
      titles.push(decodeJsonString(match[1]));
    }
    return titles;
  }

  function getScoreColor(score) {
    const numeric = Number(score);
    if (Number.isFinite(numeric) && numeric >= 80) {
      return {
        primary: "#34A853",
        track: "#e7f5eb",
        glow: "rgba(52, 168, 83, 0.28)",
        text: "#166534",
      };
    }
    if (Number.isFinite(numeric) && numeric >= 60) {
      return {
        primary: "#FBBC05",
        track: "#fff4d1",
        glow: "rgba(251, 188, 5, 0.32)",
        text: "#92400e",
      };
    }
    if (Number.isFinite(numeric)) {
      return {
        primary: "#EA4335",
        track: "#ffe4e1",
        glow: "rgba(234, 67, 53, 0.32)",
        text: "#b91c1c",
      };
    }
    return {
      primary: "#10b981",
      track: "#ecfdf5",
      glow: "rgba(16, 185, 129, 0.25)",
      text: "#065f46",
    };
  }

  function updateScoreDisplay(score, { animate = false } = {}) {
    if (score == null) return;
    const numeric = Number(score);
    const rounded = Number.isFinite(numeric) ? Math.round(numeric) : 0;
    if (scoreValueEl) {
      if (animate) {
        animateNumber(scoreValueEl, rounded);
      } else {
        scoreValueEl.textContent = String(rounded);
      }
      scoreValueEl.classList.remove("skeleton-text");
      const { text } = getScoreColor(rounded);
      scoreValueEl.style.color = text;
    }
    if (gaugeEl) {
      const clamped = Math.max(0, Math.min(100, rounded));
      const { primary, track, glow } = getScoreColor(rounded);
      gaugeEl.style.background = `radial-gradient(closest-side, ${track} 72%, transparent 73% 100%), conic-gradient(${primary} ${clamped}%, #e5e7eb 0)`;
      gaugeEl.style.boxShadow = `0 20px 60px ${glow}`;
    }
  }

  function renderStrengths(strengths, { force = false } = {}) {
    if (!strengthsListEl || !Array.isArray(strengths)) return;
    if (!force && strengths.length === 0) return;
    strengthsListEl.innerHTML = "";
    if (strengths.length === 0) {
      const li = document.createElement("li");
      li.className = "success";
      li.textContent = "暂未识别明显优势。";
      strengthsListEl.appendChild(li);
      return;
    }
    strengths.forEach((strength) => {
      const li = document.createElement("li");
      li.className = "success";
      li.textContent = strength;
      strengthsListEl.appendChild(li);
    });
  }

  function renderIssues(issues, { force = false } = {}) {
    if (!issuesListEl || !Array.isArray(issues)) return;
    if (!force && issues.length === 0) return;
    issuesListEl.innerHTML = "";
    if (issues.length === 0) {
      const li = document.createElement("li");
      li.className = "danger";
      li.textContent = "暂未检测到新的问题。";
      issuesListEl.appendChild(li);
      return;
    }
    issues.forEach((issue) => {
      const li = document.createElement("li");
      li.className = "danger";
      const title =
        typeof issue === "string"
          ? issue
          : issue?.title || issue?.description || "Issue";
      li.textContent = title;
      issuesListEl.appendChild(li);
    });
  }

  function renderSummary(text, { force = false } = {}) {
    if (!summaryListEl) return;
    const safeText = typeof text === "string" ? text.trim() : "";
    if (!force && !safeText) return;
    summaryListEl.innerHTML = "";
    const li = document.createElement("li");
    li.className = "info";
    li.textContent = safeText || "暂未生成摘要。";
    summaryListEl.appendChild(li);
  }

  function applyStreamingState(nextState) {
    const updated = { ...streamApplied };

    if (
      typeof nextState.usability_score === "number" &&
      nextState.usability_score !== streamApplied.usability_score
    ) {
      updateScoreDisplay(nextState.usability_score, { animate: false });
      updated.usability_score = nextState.usability_score;
    }

    if (
      Array.isArray(nextState.strengths) &&
      !arraysEqual(nextState.strengths, streamApplied.strengths || [])
    ) {
      renderStrengths(nextState.strengths);
      updated.strengths = nextState.strengths;
    }

    if (
      Array.isArray(nextState.issues) &&
      !arraysEqual(nextState.issues, streamApplied.issues || [])
    ) {
      renderIssues(nextState.issues);
      updated.issues = nextState.issues;
    }

    if (
      typeof nextState.summary === "string" &&
      nextState.summary &&
      nextState.summary !== streamApplied.summary
    ) {
      renderSummary(nextState.summary);
      updated.summary = nextState.summary;
    }

    streamApplied = { ...streamApplied, ...updated };
  }

  function handleStreamChunk(delta) {
    if (!delta) return;
    let piece = delta;
    if (typeof piece !== "string") {
      piece = String(piece);
    }
    if (!piece) return;
    streamBuffer += piece;

    const nextState = {};

    const scoreMatch = streamBuffer.match(
      /"usability_score"\s*:\s*([0-9]+(?:\.[0-9]+)?)/
    );
    if (scoreMatch) {
      nextState.usability_score = Number(scoreMatch[1]);
    }

    const summaryMatch = streamBuffer.match(
      /"summary"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"/
    );
    if (summaryMatch) {
      try {
        nextState.summary = JSON.parse(`"${summaryMatch[1]}"`);
      } catch (_) {}
    }

    const strengthsMatch = streamBuffer.match(
      /"strengths"\s*:\s*(\[[\s\S]*?\])/
    );
    if (strengthsMatch) {
      try {
        nextState.strengths = JSON.parse(strengthsMatch[1]);
      } catch (_) {}
    }

    const issuesMatch = streamBuffer.match(/"issues"\s*:\s*(\[[\s\S]*?\])/);
    if (issuesMatch) {
      try {
        nextState.issues = JSON.parse(issuesMatch[1]);
      } catch (_) {}
    }

    if (!Array.isArray(nextState.issues)) {
      const titleOnlyIssues = extractIssueTitles(streamBuffer);
      if (titleOnlyIssues.length > 0) {
        nextState.issues = titleOnlyIssues.map((title) => ({ title }));
      }
    }

    const hasRenderableData =
      nextState.usability_score != null ||
      (Array.isArray(nextState.issues) && nextState.issues.length > 0) ||
      (Array.isArray(nextState.strengths) && nextState.strengths.length > 0) ||
      (typeof nextState.summary === "string" && nextState.summary);

    if (!skeletonDisplayed && hasRenderableData) {
      prepareResultsSkeleton({ reset: false });
    }

    applyStreamingState(nextState);
  }

  function finalizeAnalysis(parsed, sortedIssues) {
    if (!skeletonDisplayed) {
      prepareResultsSkeleton({ reset: false });
    }
    if (parsed && typeof parsed.usability_score === "number") {
      const alreadyHadScore = streamApplied.usability_score != null;
      updateScoreDisplay(parsed.usability_score, {
        animate: !alreadyHadScore,
      });
      streamApplied.usability_score = parsed.usability_score;
    }

    const strengthsArray = Array.isArray(parsed?.strengths)
      ? parsed.strengths
      : [];
    renderStrengths(strengthsArray, { force: true });
    streamApplied.strengths = strengthsArray;

    const finalIssues = Array.isArray(sortedIssues) ? sortedIssues : [];
    renderIssues(finalIssues, { force: true });
    streamApplied.issues = finalIssues;

    const summaryText =
      typeof parsed?.summary === "string" ? parsed.summary : "";
    renderSummary(summaryText, { force: true });
    streamApplied.summary = summaryText;

    if (results) {
      results.classList.remove("streaming");
      results.removeAttribute("aria-busy");
    }
    if (scoreValueEl) {
      scoreValueEl.classList.remove("skeleton-text");
    }
    if (viewDetailsBtn) viewDetailsBtn.removeAttribute("disabled");
    if (analyzeAgainBtn) analyzeAgainBtn.removeAttribute("disabled");
    setExportButtonEnabled(true);
  }

  function setAnalyzeButtonLoading(isLoading) {
    if (!analyzeBtn) return;
    if (isLoading) {
      analyzeBtn.classList.add("loading");
      analyzeBtn.innerHTML = ANALYZE_BTN_LOADING_HTML;
      analyzeBtn.setAttribute("disabled", "disabled");
    } else {
      analyzeBtn.classList.remove("loading");
      analyzeBtn.innerHTML = ANALYZE_BTN_DEFAULT_HTML;
      analyzeBtn.removeAttribute("disabled");
    }
  }

  function setExportButtonEnabled(enabled) {
    if (!exportBtn) return;
    if (enabled) {
      exportBtn.removeAttribute("disabled");
    } else {
      exportBtn.setAttribute("disabled", "disabled");
    }
  }

  function setSkeletonList(listElement, count, baseClass) {
    if (!listElement) return;
    listElement.innerHTML = "";
    for (let i = 0; i < count; i += 1) {
      const li = document.createElement("li");
      li.className = baseClass ? `${baseClass} skeleton-text` : "skeleton-text";
      li.textContent = "生成中…";
      listElement.appendChild(li);
    }
  }

  function enterAnalysisPendingState() {
    skeletonDisplayed = false;
    resetStreamState();
    lastAnalysis = null;
    if (results) {
      results.classList.add("hidden");
      results.classList.remove("streaming");
      results.removeAttribute("aria-busy");
    }
    if (details) details.classList.add("hidden");
    if (headerBackBtn) headerBackBtn.style.display = "none";
    if (subtitleEl) subtitleEl.style.display = "";
    if (instructionEl) {
      instructionEl.style.display = "none";
      instructionEl.textContent = instructionDefaultText;
    }
    if (analyzeBtn) {
      analyzeBtn.style.display = "";
    }
    if (viewDetailsBtn) viewDetailsBtn.setAttribute("disabled", "disabled");
    if (analyzeAgainBtn) analyzeAgainBtn.setAttribute("disabled", "disabled");
    setExportButtonEnabled(false);
  }

  function prepareResultsSkeleton({ reset = true } = {}) {
    if (reset) {
      resetStreamState();
    }
    skeletonDisplayed = true;
    if (subtitleEl) subtitleEl.style.display = "none";
    if (instructionEl) {
      instructionEl.style.display = "none";
      instructionEl.textContent = instructionDefaultText;
    }
    if (analyzeBtn) {
      analyzeBtn.style.display = "none";
    }
    if (results) {
      results.classList.remove("hidden");
      results.classList.add("streaming");
      results.setAttribute("aria-busy", "true");
    }
    if (scoreValueEl) {
      scoreValueEl.textContent = "…";
      scoreValueEl.classList.add("skeleton-text");
      scoreValueEl.style.color = "";
    }
    if (gaugeEl) {
      gaugeEl.style.background =
        "radial-gradient(closest-side, #f3f4f6 72%, transparent 73% 100%), conic-gradient(#e5e7eb 0%, #e5e7eb 0)";
      gaugeEl.style.boxShadow = "0 20px 60px rgba(107, 114, 128, 0.16)";
    }
    setSkeletonList(strengthsListEl, 3, "success");
    setSkeletonList(issuesListEl, 3, "danger");
    if (summaryTitleEl) summaryTitleEl.textContent = "Summary";
    setSkeletonList(summaryListEl, 1, "info");
    if (viewDetailsBtn) viewDetailsBtn.setAttribute("disabled", "disabled");
    if (analyzeAgainBtn) analyzeAgainBtn.setAttribute("disabled", "disabled");
    setExportButtonEnabled(false);
  }

  function clearResultsSkeleton() {
    if (results) {
      results.classList.remove("streaming");
      results.removeAttribute("aria-busy");
    }
    if (scoreValueEl) {
      scoreValueEl.classList.remove("skeleton-text");
      if (!scoreValueEl.textContent || scoreValueEl.textContent === "…") {
        scoreValueEl.textContent = "0";
      }
      scoreValueEl.style.color = "";
    }
    if (strengthsListEl) strengthsListEl.innerHTML = "";
    if (issuesListEl) issuesListEl.innerHTML = "";
    if (summaryListEl) summaryListEl.innerHTML = "";
    if (gaugeEl) {
      gaugeEl.style.background = "";
      gaugeEl.style.boxShadow = "";
    }
    setExportButtonEnabled(false);
  }

  function showIntroView() {
    resetStreamState();
    clearResultsSkeleton();
    if (results) results.classList.add("hidden");
    if (details) details.classList.add("hidden");
    if (subtitleEl) subtitleEl.style.display = "";
    if (instructionEl) {
      instructionEl.style.display = "";
      instructionEl.textContent = instructionDefaultText;
    }
    if (headerBackBtn) headerBackBtn.style.display = "none";
    skeletonDisplayed = false;
    if (analyzeBtn) {
      analyzeBtn.style.display = "";
      setAnalyzeButtonLoading(false);
    }
  }

  function animateNumber(element, target, duration = 600) {
    return new Promise((resolve) => {
      if (!element) {
        resolve();
        return;
      }
      const startValue = Number(element.textContent) || 0;
      const startTime = performance.now();
      const normalizedTarget = Number(target) || 0;

      function step(now) {
        const progress = Math.min(1, (now - startTime) / duration);
        const value = Math.round(
          startValue + (normalizedTarget - startValue) * progress
        );
        element.textContent = String(value);
        if (progress < 1) {
          requestAnimationFrame(step);
        } else {
          resolve();
        }
      }

      requestAnimationFrame(step);
    });
  }

  if (analyzeAgainBtn) {
    analyzeAgainBtn.addEventListener("click", () => {
      showIntroView();
      runAnalysis();
    });
  }

  if (viewDetailsBtn) {
    viewDetailsBtn.addEventListener("click", () => {
      if (!lastAnalysis) return;

      renderDetails(lastAnalysis, lastAnalyzedTab);

      if (results) results.classList.add("hidden");
      if (details) details.classList.remove("hidden");
      if (headerBackBtn) headerBackBtn.style.display = "inline-flex";
    });
  }

  if (headerBackBtn) {
    headerBackBtn.addEventListener("click", () => {
      if (details) details.classList.add("hidden");
      if (results) results.classList.remove("hidden");
      headerBackBtn.style.display = "none";
    });
  }

  if (exportBtn) {
    exportBtn.addEventListener("click", handleExportClick);
  }

  async function handleExportClick() {
    if (!lastAnalysis) {
      alert("⚠️ 请先运行分析以生成报告。");
      return;
    }

    try {
      const lines = buildReportLines(lastAnalysis, lastAnalyzedTab);
      const logoImage = await getReportLogoImage();
      const rawScore = Number(lastAnalysis.usability_score);
      const normalizedScore = Number.isFinite(rawScore)
        ? Math.max(0, Math.min(100, rawScore))
        : 0;
      const scoreRingImage = createScoreRingImage(normalizedScore);
      const pdfBytes = createPdfReport({
        lines,
        logoImage,
        scoreRingImage,
      });
      const blob = new Blob([pdfBytes], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const fileName = buildReportFileName(lastAnalyzedTab);

      const link = document.createElement("a");
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => URL.revokeObjectURL(url), 0);
    } catch (error) {
      console.error("Failed to export report:", error);
      alert("❌ 报告导出失败，请重试。");
    }
  }

  function buildReportFileName(tabInfo) {
    const base = sanitizeFileName(
      tabInfo?.title || tabInfo?.url || "ux-report"
    );
    const timestamp = new Date()
      .toISOString()
      .replace(/[:T]/g, "-")
      .split(".")[0];
    return `${base || "ux-report"}-${timestamp}.pdf`;
  }

  const MAX_LINE_LENGTH = 90;

  function buildReportLines(analysis, tabInfo) {
    const lines = [];
    const now = new Date();

    pushWrapped(lines, "Heurix - UX Audit Report");
    pushWrapped(lines, `Generated: ${now.toLocaleString()}`);
    if (tabInfo?.title) {
      pushWrapped(lines, `Page Title: ${tabInfo.title}`);
    }
    if (tabInfo?.url) {
      pushWrapped(lines, `URL: ${tabInfo.url}`);
    }

    lines.push("");
    pushWrapped(
      lines,
      `Usability Score: ${Math.round(analysis.usability_score || 0)} / 100`
    );

    if (analysis.summary) {
      lines.push("");
      pushWrapped(lines, "Summary:");
      pushWrapped(lines, analysis.summary, 2);
    }

    if (Array.isArray(analysis.strengths) && analysis.strengths.length > 0) {
      lines.push("");
      pushWrapped(lines, "Strengths:");
      analysis.strengths.forEach((strength, index) => {
        pushWrapped(lines, `${index + 1}. ${strength}`, 2);
      });
    }

    if (Array.isArray(analysis.issues) && analysis.issues.length > 0) {
      lines.push("");
      pushWrapped(lines, "Key Issues:");
      analysis.issues.forEach((issue, index) => {
        const titleLine = `${index + 1}. ${issue.title || "Issue"} [${(
          issue.severity || ""
        ).toUpperCase()}]`;
        pushWrapped(lines, titleLine.replace(/\s+/g, " "), 2);
        if (issue.description) {
          pushWrapped(lines, `Description: ${issue.description}`, 4);
        }
        if (issue.location) {
          pushWrapped(lines, `Location: ${issue.location}`, 4);
        }
        if (issue.impact) {
          pushWrapped(lines, `Impact: ${issue.impact}`, 4);
        }
        if (issue.recommendation) {
          pushWrapped(lines, `Recommendation: ${issue.recommendation}`, 4);
        }
        lines.push("");
      });
      while (lines.length && lines[lines.length - 1] === "") {
        lines.pop();
      }
    }

    return lines;
  }

  function pushWrapped(target, text, indentSpaces = 0) {
    if (text == null) return;
    const indent = " ".repeat(indentSpaces);
    const available = Math.max(10, MAX_LINE_LENGTH - indentSpaces);
    const wrapped = wrapText(String(text), available);
    if (wrapped.length === 0) {
      target.push(indent.trimEnd());
      return;
    }
    wrapped.forEach((segment) => {
      target.push((indent + segment).trimEnd());
    });
  }

  function wrapText(text, maxLen) {
    const clean = text.replace(/\s+/g, " ").trim();
    if (!clean) return [];
    const words = clean.split(" ");
    const lines = [];
    let current = "";

    words.forEach((word) => {
      const safeWord = word || "";
      if (safeWord.length > maxLen) {
        if (current) {
          lines.push(current);
          current = "";
        }
        for (let i = 0; i < safeWord.length; i += maxLen) {
          lines.push(safeWord.slice(i, i + maxLen));
        }
        return;
      }

      if (!current) {
        current = safeWord;
        return;
      }

      if (`${current} ${safeWord}`.length <= maxLen) {
        current = `${current} ${safeWord}`;
      } else {
        lines.push(current);
        current = safeWord;
      }
    });

    if (current) {
      lines.push(current);
    }

    return lines;
  }

  function sanitizeFileName(input) {
    return String(input || "")
      .replace(/[\\/:*?"<>|]/g, "-")
      .replace(/\s+/g, "-")
      .slice(0, 80);
  }

  function escapePdfText(text) {
    return text
      .replace(/[\u0000-\u001F\u007F-\uFFFF]/g, "?")
      .replace(/\\/g, "\\\\")
      .replace(/\(/g, "\\(")
      .replace(/\)/g, "\\)");
  }

  let cachedReportLogoImage = null;

  async function getReportLogoImage() {
    if (cachedReportLogoImage !== null) {
      return cachedReportLogoImage;
    }

    try {
      const url = chrome.runtime.getURL("images/icon-128.png");
      const image = await loadImageAsJpegUint8Array(url, {
        maxDimension: 256,
        quality: 0.92,
      });

      if (!image?.data?.length) {
        cachedReportLogoImage = null;
        return cachedReportLogoImage;
      }

      const displayWidth = 110;
      const aspectRatio = image.height > 0 ? image.height / image.width : 1;
      const displayHeight = Math.max(1, Math.round(displayWidth * aspectRatio));

      cachedReportLogoImage = {
        ...image,
        displayWidth,
        displayHeight,
        resourceName: "/Im1",
      };
    } catch (error) {
      console.warn("Failed to load logo for PDF:", error);
      cachedReportLogoImage = null;
    }

    return cachedReportLogoImage;
  }

  async function loadImageAsJpegUint8Array(url, options = {}) {
    const { maxDimension = 256, quality = 0.92 } = options;

    const image = await new Promise((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () =>
        reject(new Error(`Failed to load image for PDF: ${url}`));
      element.crossOrigin = "anonymous";
      element.src = url;
    });

    const naturalWidth = image.naturalWidth || image.width;
    const naturalHeight = image.naturalHeight || image.height;
    const maxSide = Math.max(naturalWidth, naturalHeight);
    const scale = maxSide > maxDimension ? maxDimension / maxSide : 1;
    const canvasWidth = Math.max(1, Math.round(naturalWidth * scale));
    const canvasHeight = Math.max(1, Math.round(naturalHeight * scale));

    const canvas = document.createElement("canvas");
    canvas.width = canvasWidth;
    canvas.height = canvasHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return null;
    }

    ctx.drawImage(image, 0, 0, canvasWidth, canvasHeight);
    const dataUrl = canvas.toDataURL("image/jpeg", quality);

    return {
      data: dataUrlToUint8Array(dataUrl),
      width: canvasWidth,
      height: canvasHeight,
    };
  }

  function createScoreRingImage(score) {
    const normalized = Math.max(0, Math.min(100, Number(score) || 0));
    const palette = getScoreColor(normalized) || {};
    const trackColor = palette.track || "#e5e7eb";
    const ringColor = palette.primary || "#2563eb";
    const textColor = palette.text || "#0f172a";

    const size = 260;
    const ringWidth = 28;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return null;
    }

    const center = size / 2;
    const radius = center - ringWidth;

    ctx.clearRect(0, 0, size, size);

    const backgroundGradient = ctx.createRadialGradient(
      center,
      center,
      radius * 0.15,
      center,
      center,
      radius * 1.1
    );
    backgroundGradient.addColorStop(0, "#ffffff");
    backgroundGradient.addColorStop(1, "#f8fafc");
    ctx.fillStyle = backgroundGradient;
    ctx.fillRect(0, 0, size, size);

    ctx.lineWidth = ringWidth;
    ctx.lineCap = "round";

    ctx.strokeStyle = trackColor;
    ctx.beginPath();
    ctx.arc(center, center, radius, 0, Math.PI * 2);
    ctx.stroke();

    ctx.strokeStyle = ringColor;
    ctx.beginPath();
    ctx.arc(
      center,
      center,
      radius,
      -Math.PI / 2,
      -Math.PI / 2 + (Math.PI * 2 * normalized) / 100
    );
    ctx.stroke();

    ctx.fillStyle = textColor;
    ctx.font = "bold 68px 'Arial'";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(String(Math.round(normalized)), center, center - 6);

    ctx.fillStyle = "#4b5563";
    ctx.font = "24px 'Arial'";
    ctx.fillText("/100", center, center + 38);

    ctx.fillStyle = "#4b5563";
    ctx.font = "22px 'Arial'";
    ctx.fillText("Usability Score", center, center + radius - 30);

    const dataUrl = canvas.toDataURL("image/jpeg", 0.92);

    return {
      data: dataUrlToUint8Array(dataUrl),
      width: canvas.width,
      height: canvas.height,
      displayWidth: 160,
      displayHeight: 160,
      resourceName: "/Im2",
    };
  }

  function dataUrlToUint8Array(dataUrl) {
    const [, base64 = ""] = String(dataUrl || "").split(",");
    const binary = atob(base64);
    const length = binary.length;
    const bytes = new Uint8Array(length);
    for (let i = 0; i < length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }

  function concatUint8Arrays(arrays) {
    const total = arrays.reduce((sum, arr) => sum + (arr?.length || 0), 0);
    const result = new Uint8Array(total);
    let offset = 0;
    arrays.forEach((arr) => {
      if (!arr) return;
      result.set(arr, offset);
      offset += arr.length;
    });
    return result;
  }

  function formatPdfNumber(value) {
    if (!Number.isFinite(value)) return "0";
    return (Math.round(value * 100) / 100).toString();
  }

  let textMeasureContext = null;

  function getTextMeasureContext() {
    if (textMeasureContext) {
      return textMeasureContext;
    }
    const canvas = document.createElement("canvas");
    textMeasureContext = canvas.getContext("2d");
    return textMeasureContext;
  }

  function measureTextWidth(
    text,
    { fontSize = 12, fontWeight = "", fontFamily = "Helvetica" } = {}
  ) {
    const ctx = getTextMeasureContext();
    if (!ctx) {
      return String(text || "").length * (fontSize * 0.5);
    }
    const parts = [fontWeight, `${fontSize}px`, fontFamily].filter(Boolean);
    ctx.save();
    ctx.font = parts.join(" ");
    const metrics = ctx.measureText(String(text || ""));
    ctx.restore();
    return metrics.width || 0;
  }

  function cssPxToPdfPoints(px) {
    return (Number(px) || 0) * 0.75;
  }

  function createPdfReport({ lines, logoImage, scoreRingImage }) {
    const encoder = new TextEncoder();
    const pageWidth = 595;
    const pageHeight = 842;
    const marginX = 60;
    const headerHeight = Math.round(pageHeight / 6);
    const headerY = pageHeight - headerHeight;
    const lineHeight = 16;
    const MIN_BOTTOM_MARGIN = 80;

    const sanitizedLines = lines.map((line) => escapePdfText(line || ""));
    const titleLine = sanitizedLines[0] || "";
    const bodyLines = sanitizedLines.slice(1);

    const logoPlacement =
      logoImage && logoImage.data?.length
        ? (() => {
            const baseWidth = logoImage.displayWidth || logoImage.width || 120;
            const displayWidth = Math.min(160, baseWidth);
            const ratio = logoImage.width
              ? logoImage.height / Math.max(logoImage.width, 1)
              : 1;
            const computedHeight =
              logoImage.displayHeight || Math.round(displayWidth * ratio);
            const displayHeight = Math.min(
              headerHeight - 24,
              Math.max(60, computedHeight || 120)
            );
            return {
              ...logoImage,
              displayWidth,
              displayHeight,
              x: (pageWidth - displayWidth) / 2,
              y: headerY + (headerHeight - displayHeight) / 2,
              resourceName: logoImage.resourceName || "/Im1",
            };
          })()
        : null;

    const titleFontSize = 20;
    const titleWidthPx = measureTextWidth(titleLine, {
      fontSize: titleFontSize,
      fontWeight: "bold",
    });
    const titleWidthPoints = cssPxToPdfPoints(titleWidthPx);
    const titleX = titleLine ? (pageWidth - titleWidthPoints) / 2 : marginX;
    const titleY = headerY - 34;

    const ringPlacement =
      scoreRingImage && scoreRingImage.data?.length
        ? (() => {
            const displayWidth = scoreRingImage.displayWidth || 160;
            const displayHeight = scoreRingImage.displayHeight || displayWidth;
            return {
              ...scoreRingImage,
              displayWidth,
              displayHeight,
              x: (pageWidth - displayWidth) / 2,
              y: titleY - 36 - displayHeight,
              resourceName: scoreRingImage.resourceName || "/Im2",
            };
          })()
        : null;

    const bodyBaseY = ringPlacement ? ringPlacement.y - 70 : titleY - 90;
    const maxLinesFirstPage =
      bodyBaseY > MIN_BOTTOM_MARGIN
        ? Math.max(
            0,
            Math.floor((bodyBaseY - MIN_BOTTOM_MARGIN) / lineHeight) + 1
          )
        : 0;

    const firstPageBodyLines =
      maxLinesFirstPage > 0 ? bodyLines.slice(0, maxLinesFirstPage) : [];
    const remainingBodyLines =
      maxLinesFirstPage > 0
        ? bodyLines.slice(firstPageBodyLines.length)
        : bodyLines.slice();

    let textStartY = bodyBaseY;
    if (firstPageBodyLines.length > 0) {
      const usedLineCount = Math.max(0, firstPageBodyLines.length - 1);
      const bottomY = textStartY - lineHeight * usedLineCount;
      if (bottomY < MIN_BOTTOM_MARGIN) {
        textStartY += MIN_BOTTOM_MARGIN - bottomY;
      }
      textStartY = Math.min(textStartY, bodyBaseY);
      textStartY = Math.max(textStartY, MIN_BOTTOM_MARGIN + lineHeight);
    }

    const headerColor = {
      r: 124 / 255,
      g: 58 / 255,
      b: 237 / 255,
    };

    const firstPageCommands = [];
    firstPageCommands.push("q");
    firstPageCommands.push(
      `${formatPdfNumber(headerColor.r)} ${formatPdfNumber(
        headerColor.g
      )} ${formatPdfNumber(headerColor.b)} rg`
    );
    firstPageCommands.push(
      `0 ${formatPdfNumber(headerY)} ${formatPdfNumber(
        pageWidth
      )} ${formatPdfNumber(headerHeight)} re`
    );
    firstPageCommands.push("f");
    firstPageCommands.push("Q");

    const images = [];
    const firstPageXObjectNames = [];

    if (logoPlacement) {
      images.push({ ...logoPlacement });
      firstPageXObjectNames.push(logoPlacement.resourceName || "/Im1");
      firstPageCommands.push("q");
      firstPageCommands.push(
        `${formatPdfNumber(logoPlacement.displayWidth)} 0 0 ${formatPdfNumber(
          logoPlacement.displayHeight
        )} ${formatPdfNumber(logoPlacement.x)} ${formatPdfNumber(
          logoPlacement.y
        )} cm`
      );
      firstPageCommands.push(`${logoPlacement.resourceName || "/Im1"} Do`);
      firstPageCommands.push("Q");
    }

    if (titleLine) {
      firstPageCommands.push("BT");
      firstPageCommands.push(`/F1 ${formatPdfNumber(titleFontSize)} Tf`);
      firstPageCommands.push("20 TL");
      firstPageCommands.push(
        `1 0 0 1 ${formatPdfNumber(titleX)} ${formatPdfNumber(titleY)} Tm`
      );
      firstPageCommands.push(`(${titleLine}) Tj`);
      firstPageCommands.push("ET");
    }

    if (ringPlacement) {
      images.push({ ...ringPlacement });
      firstPageXObjectNames.push(ringPlacement.resourceName || "/Im2");
      firstPageCommands.push("q");
      firstPageCommands.push(
        `${formatPdfNumber(ringPlacement.displayWidth)} 0 0 ${formatPdfNumber(
          ringPlacement.displayHeight
        )} ${formatPdfNumber(ringPlacement.x)} ${formatPdfNumber(
          ringPlacement.y
        )} cm`
      );
      firstPageCommands.push(`${ringPlacement.resourceName || "/Im2"} Do`);
      firstPageCommands.push("Q");
    }

    if (firstPageBodyLines.length > 0) {
      const firstBodyLine = firstPageBodyLines[0] || "";
      firstPageCommands.push("BT");
      firstPageCommands.push("/F1 12 Tf");
      firstPageCommands.push("16 TL");
      firstPageCommands.push(
        `1 0 0 1 ${formatPdfNumber(marginX)} ${formatPdfNumber(textStartY)} Tm`
      );
      firstPageCommands.push(firstBodyLine ? `(${firstBodyLine}) Tj` : "() Tj");
      if (firstPageBodyLines.length > 1) {
        firstPageBodyLines.slice(1).forEach((line) => {
          firstPageCommands.push("T*");
          if (line) {
            firstPageCommands.push(`(${line}) Tj`);
          }
        });
      }
      firstPageCommands.push("ET");
    }

    const pageDescriptors = [
      {
        commands: firstPageCommands,
        xObjectNames: firstPageXObjectNames,
      },
    ];

    if (remainingBodyLines.length > 0) {
      const additionalStartY = pageHeight - 80;
      const maxLinesPerAdditionalPage = Math.max(
        1,
        Math.floor((additionalStartY - MIN_BOTTOM_MARGIN) / lineHeight) + 1
      );

      for (
        let index = 0;
        index < remainingBodyLines.length;
        index += maxLinesPerAdditionalPage
      ) {
        const pageLines = remainingBodyLines.slice(
          index,
          index + maxLinesPerAdditionalPage
        );
        const commands = [];
        commands.push("BT");
        commands.push("/F1 12 Tf");
        commands.push("16 TL");
        commands.push(
          `1 0 0 1 ${formatPdfNumber(marginX)} ${formatPdfNumber(
            additionalStartY
          )} Tm`
        );
        if (pageLines.length > 0) {
          commands.push(pageLines[0] ? `(${pageLines[0]}) Tj` : "() Tj");
          pageLines.slice(1).forEach((line) => {
            commands.push("T*");
            if (line) {
              commands.push(`(${line}) Tj`);
            }
          });
        } else {
          commands.push("() Tj");
        }
        commands.push("ET");

        pageDescriptors.push({ commands, xObjectNames: [] });
      }
    }

    const encodedPages = pageDescriptors.map((descriptor) => ({
      ...descriptor,
      stream: `${descriptor.commands.join("\n")}\n`,
    }));

    encodedPages.forEach((page) => {
      page.contentBytes = encoder.encode(page.stream);
    });

    const catalogId = 1;
    const pagesId = 2;
    let nextObjectId = 3;

    const pageObjects = encodedPages.map((page) => {
      const pageId = nextObjectId;
      const contentId = nextObjectId + 1;
      nextObjectId += 2;
      return {
        ...page,
        pageId,
        contentId,
      };
    });

    const fontObjectId = nextObjectId;
    nextObjectId += 1;

    const imageLookup = {};
    images.forEach((image) => {
      image.objectId = nextObjectId;
      imageLookup[image.resourceName || "/Im"] = image;
      nextObjectId += 1;
    });

    const objects = [];

    const catalogObject = encoder.encode(
      `${catalogId} 0 obj\n<< /Type /Catalog /Pages ${pagesId} 0 R >>\nendobj\n`
    );
    objects.push(catalogObject);

    const kidsEntries = pageObjects
      .map((page) => `${page.pageId} 0 R`)
      .join(" ");
    const pagesObject = encoder.encode(
      `${pagesId} 0 obj\n<< /Type /Pages /Kids [${kidsEntries}] /Count ${pageObjects.length} >>\nendobj\n`
    );
    objects.push(pagesObject);

    pageObjects.forEach((page) => {
      const resourceSegments = [`/Font << /F1 ${fontObjectId} 0 R >>`];
      const xObjectEntries = page.xObjectNames
        .map((name) => {
          const image = imageLookup[name];
          if (!image) return "";
          return `${name} ${image.objectId} 0 R`;
        })
        .filter(Boolean)
        .join(" ");
      if (xObjectEntries) {
        resourceSegments.push(`/XObject << ${xObjectEntries} >>`);
      }

      const pageObject = encoder.encode(
        `${
          page.pageId
        } 0 obj\n<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Contents ${
          page.contentId
        } 0 R /Resources << ${resourceSegments.join(" ")} >> >>\nendobj\n`
      );
      objects.push(pageObject);

      const contentObject = concatUint8Arrays([
        encoder.encode(
          `${page.contentId} 0 obj\n<< /Length ${page.contentBytes.length} >>\nstream\n`
        ),
        page.contentBytes,
        encoder.encode(`endstream\nendobj\n`),
      ]);
      objects.push(contentObject);
    });

    const fontObject = encoder.encode(
      `${fontObjectId} 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n`
    );
    objects.push(fontObject);

    images.forEach((image) => {
      const imageObject = concatUint8Arrays([
        encoder.encode(
          `${
            image.objectId
          } 0 obj\n<< /Type /XObject /Subtype /Image /Width ${Math.max(
            1,
            Math.round(image.width)
          )} /Height ${Math.max(
            1,
            Math.round(image.height)
          )} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${
            image.data.length
          } >>\nstream\n`
        ),
        image.data,
        encoder.encode(`\nendstream\nendobj\n`),
      ]);
      objects.push(imageObject);
    });

    const header = encoder.encode("%PDF-1.4\n");
    const segments = [header, ...objects];

    const offsets = [0];
    let position = header.length;
    objects.forEach((obj) => {
      offsets.push(position);
      position += obj.length;
    });

    const xrefOffset = position;
    const xrefLines = [
      "xref",
      `0 ${objects.length + 1}`,
      "0000000000 65535 f ",
    ];
    for (let i = 1; i <= objects.length; i += 1) {
      const offset = offsets[i];
      xrefLines.push(`${String(offset).padStart(10, "0")} 00000 n `);
    }

    const xrefSection = encoder.encode(`${xrefLines.join("\n")}\n`);
    const trailerSection = encoder.encode(
      `trailer\n<< /Size ${
        objects.length + 1
      } /Root ${catalogId} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`
    );

    segments.push(xrefSection);
    segments.push(trailerSection);

    return concatUint8Arrays(segments);
  }

  async function runAnalysis() {
    setAnalyzeButtonLoading(true);
    enterAnalysisPendingState();
    const tTotal0 = performance.now();

    // Query the active tab
    chrome.tabs.query(
      { active: true, currentWindow: true },
      async function (tabs) {
        const currentTab = tabs[0];
        lastAnalyzedTab = {
          title: currentTab?.title || "",
          url: currentTab?.url || "",
        };

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

        const systemInstructions = `You are a UX/UI expert evaluating web pages based on Nielsen's 10 Usability Heuristics. Your goal is to help the developers improve the UI design and usability of the page.

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
1. Return 1-3 most critical issues, sorted by:
   
   -  Severity (high > medium > low)
2. Every issue MUST include a 'location' string that pinpoints the exact DOM element. Provide a selector or ID that uniquely identifies the element (e.g., 'form.signup-form input[name="email"]', 'main article.post-card:nth-of-type(2) button.cta'). Generic areas such as "navigation" or "footer" are not acceptable.

**Location Format (CRITICAL for developers):**
- MUST provide SPECIFIC DOM element identifiers for every issue
- REQUIRED: Give an exact CSS selector or ID that pinpoints the element (e.g. \`div.main > section.hero > button.cta-primary\`, \`form#signup-form input[name="email"]\`, \`header nav a.logo-link\`).
- Include visual position when helpful (e.g., "top-right", "main content area")
- Good examples (SPECIFIC DOM ELEMENTS):
  * "input#email-field in <form class='signup-form'>"
  * "button.submit-btn in header <nav>"
  * "div.hero section.primary-callout button.cta-primary"
  * "img.gallery-item:nth-of-type(3) in <div class='gallery-grid'>"
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
          const tModel0 = performance.now();
          const response = await runPrompt(
            prompt,
            params,
            schema,
            handleStreamChunk
          );
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
            finalizeAnalysis(parsed, sortedIssues);
            const tUi1 = performance.now();
            console.log(
              `[Heurix][Perf] update UI summary: ${Math.round(tUi1 - tUi0)} ms`
            );
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
          showIntroView();
        } finally {
          setAnalyzeButtonLoading(false);
        }
      }
    );
  }

  // Handle analyze button click
  analyzeBtn.addEventListener("click", runAnalysis);

  setExportButtonEnabled(false);

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
