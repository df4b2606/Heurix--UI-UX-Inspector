// Content Script - Extracts page information for UX analysis

// Listen for messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === "GET_PAGE_INFO") {
    const pageInfo = extractPageInfo();
    sendResponse(pageInfo);
    return true;
  }
});

// Extract useful page information for UX analysis
function extractPageInfo() {
  const t0 = performance.now();
  const metrics = {};

  const tH0 = performance.now();
  const headings = extractHeadings();
  metrics.headingsMs = Math.round(performance.now() - tH0);

  const tB0 = performance.now();
  const buttons = extractButtons();
  metrics.buttonsMs = Math.round(performance.now() - tB0);

  const tF0 = performance.now();
  const forms = extractForms();
  metrics.formsMs = Math.round(performance.now() - tF0);

  const tI0 = performance.now();
  const images = extractImages();
  metrics.imagesMs = Math.round(performance.now() - tI0);

  const tT0 = performance.now();
  const touchTargets = getTouchTargetMetrics();
  metrics.touchTargetsMs = Math.round(performance.now() - tT0);

  const tL0 = performance.now();
  const links = extractLinks();
  metrics.linksMs = Math.round(performance.now() - tL0);

  const tA0 = performance.now();
  const ariaLabels = checkAriaLabels();
  metrics.ariaLabelsMs = Math.round(performance.now() - tA0);

  const tAlt0 = performance.now();
  const altTexts = checkAltTexts();
  metrics.altTextsMs = Math.round(performance.now() - tAlt0);

  const tTxt0 = performance.now();
  const textContent = getTextMetrics();
  metrics.textMetricsMs = Math.round(performance.now() - tTxt0);

  const tRead0 = performance.now();
  const readability = getReadabilityMetrics();
  metrics.readabilityMs = Math.round(performance.now() - tRead0);

  const tClr0 = performance.now();
  const colors = extractColors();
  metrics.colorsMs = Math.round(performance.now() - tClr0);

  const tCtr0 = performance.now();
  const contrast = getContrastMetrics();
  metrics.contrastMs = Math.round(performance.now() - tCtr0);

  const t1 = performance.now();
  metrics.totalMs = Math.round(t1 - t0);

  const info = {
    // Basic page structure
    headings,
    buttons,
    forms,
    images,
    touchTargets,
    links,

    // Accessibility info
    ariaLabels,
    altTexts,

    // Content metrics
    textContent,
    readability,

    // Visual info
    colors,
    contrast,

    timestamp: Date.now(),
    metrics,
  };

  try {
    console.log("[Heurix][Perf][content] extractPageInfo metrics:", metrics);
  } catch (_) {}

  return info;
}

// Extract heading structure
function extractHeadings() {
  const headings = [];
  const headingElements = document.querySelectorAll("h1, h2, h3, h4, h5, h6");

  headingElements.forEach((heading, index) => {
    if (index < 20) {
      // Limit to first 20
      headings.push({
        level: heading.tagName,
        text: heading.textContent.trim().substring(0, 100),
        isEmpty: heading.textContent.trim().length === 0,
      });
    }
  });

  return {
    count: headingElements.length,
    hasH1: document.querySelector("h1") !== null,
    items: headings,
  };
}

// Extract button information
function extractButtons() {
  const buttons = document.querySelectorAll(
    'button, input[type="button"], input[type="submit"], [role="button"]'
  );
  const buttonInfo = [];

  buttons.forEach((btn, index) => {
    if (index < 15) {
      // Limit to first 15
      buttonInfo.push({
        text:
          btn.textContent.trim().substring(0, 50) || btn.value || "[No text]",
        hasAriaLabel: btn.hasAttribute("aria-label"),
        isDisabled: btn.disabled,
      });
    }
  });

  return {
    count: buttons.length,
    items: buttonInfo,
  };
}

// Extract form information
function extractForms() {
  const forms = document.querySelectorAll("form");
  const formInfo = [];

  forms.forEach((form, index) => {
    if (index < 10) {
      const inputs = form.querySelectorAll("input, textarea, select");
      formInfo.push({
        inputCount: inputs.length,
        hasLabels: form.querySelectorAll("label").length > 0,
        hasRequiredFields: form.querySelector("[required]") !== null,
      });
    }
  });

  return {
    count: forms.length,
    items: formInfo,
  };
}

// Extract image information
function extractImages() {
  const images = document.querySelectorAll("img");
  let missingAlt = 0;
  let emptyAlt = 0;
  const missingAltSelectors = new Set();

  images.forEach((img) => {
    if (!img.hasAttribute("alt")) {
      missingAlt++;
      const sel = getConciseSelector(img, {
        ancestorDepth: 3,
        preferSections: true,
        childSuffix: "img",
      });
      if (sel) missingAltSelectors.add(sel);
    } else if (img.alt.trim() === "") {
      emptyAlt++;
    }
  });

  return {
    total: images.length,
    missingAlt,
    emptyAlt,
    withAlt: images.length - missingAlt - emptyAlt,
    missingAltSelectors: Array.from(missingAltSelectors).slice(0, 4),
  };
}

// Extract link information
function extractLinks() {
  const links = document.querySelectorAll("a[href]");
  let emptyLinks = 0;

  links.forEach((link) => {
    if (link.textContent.trim() === "") {
      emptyLinks++;
    }
  });

  return {
    total: links.length,
    emptyText: emptyLinks,
  };
}

// Check ARIA labels usage
function checkAriaLabels() {
  const ariaElements = document.querySelectorAll(
    "[aria-label], [aria-labelledby], [aria-describedby]"
  );

  return {
    total: ariaElements.length,
    hasAriaLabels: ariaElements.length > 0,
  };
}

// Check alt text quality
function checkAltTexts() {
  const images = document.querySelectorAll("img");
  let goodAlt = 0;
  let poorAlt = 0;

  images.forEach((img) => {
    const alt = img.alt || "";
    if (alt.length > 10) {
      goodAlt++;
    } else if (alt.length > 0) {
      poorAlt++;
    }
  });

  return {
    good: goodAlt,
    poor: poorAlt,
  };
}

// Get text content metrics
function getTextMetrics() {
  const bodyText = document.body.innerText || "";
  const words = bodyText
    .trim()
    .split(/\s+/)
    .filter((w) => w.length > 0);

  return {
    wordCount: words.length,
    characterCount: bodyText.length,
    paragraphs: document.querySelectorAll("p").length,
  };
}

// Compute readability metrics such as average sentence length
function getReadabilityMetrics() {
  const bodyText = (document.body.innerText || "").trim();
  if (!bodyText) {
    return {
      sentenceCount: 0,
      averageSentenceLengthWords: 0,
      medianSentenceLengthWords: 0,
    };
  }

  const sentences = bodyText
    .split(/(?<=[\.\!\?])\s+|[。！？]+\s*/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  const sentenceWordCounts = sentences.map(
    (s) => s.split(/\s+/).filter((w) => w.length > 0).length
  );

  const sentenceCount = sentenceWordCounts.length;
  const averageSentenceLengthWords =
    sentenceCount === 0
      ? 0
      : sentenceWordCounts.reduce((a, b) => a + b, 0) / sentenceCount;
  const sorted = [...sentenceWordCounts].sort((a, b) => a - b);
  const medianSentenceLengthWords =
    sentenceCount === 0
      ? 0
      : sentenceCount % 2 === 1
      ? sorted[(sentenceCount - 1) / 2]
      : (sorted[sentenceCount / 2 - 1] + sorted[sentenceCount / 2]) / 2;

  return {
    sentenceCount,
    averageSentenceLengthWords,
    medianSentenceLengthWords,
  };
}

// Contrast metrics based on WCAG 2.1
function getContrastMetrics() {
  const textSelectors = [
    "p",
    "span",
    "li",
    "a",
    "button",
    "input",
    "label",
    "small",
    "strong",
    "em",
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
  ];

  const nodeList = document.querySelectorAll(textSelectors.join(","));
  const elements = Array.from(nodeList).slice(0, 200); // sample to limit cost

  let checked = 0;
  let belowAA = 0; // contrast < 4.5 for normal text
  let belowAAA = 0; // contrast < 7

  const examplesBelowAA = [];

  elements.forEach((el) => {
    const styles = window.getComputedStyle(el);
    if (styles.visibility === "hidden" || styles.display === "none") return;
    const fontSize = parseFloat(styles.fontSize || "0");
    if (fontSize === 0) return;

    const fg = parseCssColor(styles.color);
    const bg = getEffectiveBackgroundColor(el);
    if (!fg || !bg) return;

    const ratio = contrastRatio(fg, bg);
    checked += 1;
    if (ratio < 7) belowAAA += 1;
    if (ratio < 4.5) {
      belowAA += 1;
      if (examplesBelowAA.length < 4) {
        const sel = getConciseSelector(el, { ancestorDepth: 3 });
        if (sel) examplesBelowAA.push(sel);
      }
    }
  });

  return {
    elementsChecked: checked,
    belowAA,
    belowAAA,
    selectorsBelowAA: examplesBelowAA,
  };
}

function parseCssColor(cssColor) {
  // Supports rgb(a) and hex
  if (!cssColor) return null;
  if (cssColor.startsWith("rgb")) {
    const parts = cssColor
      .replace(/rgba?\(/, "")
      .replace(/\)/, "")
      .split(",")
      .map((p) => parseFloat(p.trim()))
      .slice(0, 3);
    if (parts.length === 3 && parts.every((n) => !isNaN(n))) {
      return { r: parts[0] / 255, g: parts[1] / 255, b: parts[2] / 255 };
    }
  }
  if (cssColor.startsWith("#")) {
    let hex = cssColor.slice(1);
    if (hex.length === 3) {
      hex = hex
        .split("")
        .map((c) => c + c)
        .join("");
    }
    if (hex.length === 6) {
      const r = parseInt(hex.slice(0, 2), 16) / 255;
      const g = parseInt(hex.slice(2, 4), 16) / 255;
      const b = parseInt(hex.slice(4, 6), 16) / 255;
      return { r, g, b };
    }
  }
  return null;
}

function relativeLuminance(rgb) {
  const transform = (c) =>
    c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  const r = transform(rgb.r);
  const g = transform(rgb.g);
  const b = transform(rgb.b);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrastRatio(fg, bg) {
  const L1 = relativeLuminance(fg) + 0.05;
  const L2 = relativeLuminance(bg) + 0.05;
  return L1 > L2 ? L1 / L2 : L2 / L1;
}

function getEffectiveBackgroundColor(el) {
  let node = el;
  while (node && node !== document.documentElement) {
    const styles = window.getComputedStyle(node);
    const bg = styles.backgroundColor;
    if (
      bg &&
      !/rgba\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*,\s*0\s*\)/.test(bg) &&
      bg !== "transparent"
    ) {
      const parsed = parseCssColor(bg);
      if (parsed) return parsed;
    }
    node = node.parentElement;
  }
  // Fallback to body background or white
  const bodyBg = window.getComputedStyle(document.body).backgroundColor;
  return parseCssColor(bodyBg) || { r: 1, g: 1, b: 1 };
}

// Extract color information (simplified)
function extractColors() {
  const colors = new Set();
  const elements = document.querySelectorAll(
    "body, header, main, footer, nav, button, a"
  );

  elements.forEach((el) => {
    const styles = window.getComputedStyle(el);
    colors.add(styles.color);
    colors.add(styles.backgroundColor);
  });

  return {
    uniqueColors: colors.size,
  };
}

console.log("Heurix UX Inspector content script loaded");

// Utilities
function getConciseSelector(el, options = {}) {
  if (!el || !(el instanceof Element)) return "";
  const opts = Object.assign(
    { ancestorDepth: 2, preferSections: false, childSuffix: "" },
    options
  );

  // Prefer id if simple
  if (el.id && /^[a-zA-Z_][\w\-:.]*$/.test(el.id)) {
    return `#${el.id}`;
  }

  const parts = [];
  let node = el;
  let depth = 0;
  const preferred = new Set([
    "section",
    "nav",
    "header",
    "main",
    "footer",
    "article",
    "aside",
    "ul",
    "ol",
  ]);

  while (
    node &&
    node !== document.documentElement &&
    depth <= opts.ancestorDepth
  ) {
    const tag = (node.tagName || "").toLowerCase();
    let token = tag;
    const classList = Array.from(node.classList || []);
    if (classList.length > 0) {
      token += `.${classList[0]}`;
    }
    if (node.id && /^[a-zA-Z_][\w\-:.]*$/.test(node.id)) {
      token = `#${node.id}`;
      parts.unshift(token);
      break;
    }

    if (depth === 0) {
      // leaf
      if (opts.childSuffix && !token.endsWith(opts.childSuffix)) {
        token =
          token.split(".")[0] +
          (opts.childSuffix ? `.${opts.childSuffix}` : "");
      }
    }

    // Only include ancestor tokens that are helpful
    if (
      depth === 0 ||
      preferred.has(tag) ||
      (opts.preferSections && preferred.has(tag))
    ) {
      parts.unshift(token);
    }

    node = node.parentElement;
    depth += 1;
  }

  return parts.join(" ") || (el.tagName ? el.tagName.toLowerCase() : "");
}

function getTouchTargetMetrics() {
  const clickable = document.querySelectorAll(
    'a[href], button, input[type="button"], input[type="submit"], [role="button"]'
  );
  let small = 0;
  const selectors = [];
  clickable.forEach((el) => {
    const rect = el.getBoundingClientRect();
    if (rect.width < 44 || rect.height < 44) {
      small += 1;
      if (selectors.length < 4) {
        selectors.push(getConciseSelector(el, { ancestorDepth: 2 }));
      }
    }
  });
  return {
    total: clickable.length,
    smallerThan44: small,
    selectorsSmall: selectors,
  };
}
