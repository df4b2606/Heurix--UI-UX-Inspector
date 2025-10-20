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
  const info = {
    // Basic page structure
    headings: extractHeadings(),
    buttons: extractButtons(),
    forms: extractForms(),
    images: extractImages(),
    links: extractLinks(),

    // Accessibility info
    ariaLabels: checkAriaLabels(),
    altTexts: checkAltTexts(),

    // Content metrics
    textContent: getTextMetrics(),

    // Visual info
    colors: extractColors(),

    timestamp: Date.now(),
  };

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

  images.forEach((img) => {
    if (!img.hasAttribute("alt")) {
      missingAlt++;
    } else if (img.alt.trim() === "") {
      emptyAlt++;
    }
  });

  return {
    total: images.length,
    missingAlt,
    emptyAlt,
    withAlt: images.length - missingAlt - emptyAlt,
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
