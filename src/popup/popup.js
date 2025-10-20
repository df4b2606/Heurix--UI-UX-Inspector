let session;

async function runPrompt(prompt, params) {
  try {
    if (!session) {
      session = await LanguageModel.create(params);
    }
    return session.prompt(prompt);
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
  const analyzeAgainBtnId = "analyzeAgainBtn";

  // Handle analyze button click
  analyzeBtn.addEventListener("click", async function () {
    // Add loading state
    analyzeBtn.classList.add("loading");
    analyzeBtn.innerHTML = "<span>Analyzing...</span>";

    //   //Check if AI model is available
    //   const options = { model: "gemini-nano", language: "en" };
    //   const availability = await LanguageModel.availability();
    //   if (availability === "unavailable") {
    //     alert("❌ Chrome Built-in AI is not supported on this device.");
    //     return;
    //   }
    //   else if (availability === "downloadable" || availability === "downloading") {
    //     const session = await LanguageModel.create({

    //       monitor(m) {
    //         m.addEventListener("downloadprogress", (e) => {
    //           console.log(`Downloaded ${e.loaded * 100}%`);
    //         });
    //       },
    //       systemPrompt: `
    //       You are an expert UX auditor.
    //       Analyze web pages based on usability and design heuristics.
    //       You will be given the input like including:
    //       -Page hierarchy structure (Header, Button, Form, etc.)
    //       - Text readability (word count, sentence length, contrast)
    //       - Accessibility attributes (ARIA labels, alt text)
    //       For each input, return a JSON object with the following structure:
    //       {
    //         "usability_score": number (0-100),
    //         "issues": [list of heuristic violations],
    //         "summary": "A concise summary of UX quality (<=50 words)"
    //       }
    //       Always respond ONLY with valid JSON.
    // `,

    //       expectedInputs: [{ type: "text", languages: ["en"] }],
    //       expectedOutputs: [{ type: "json", languages: ["en"] }],

    //       // 4️⃣ 控制模型输出的稳定性
    //       temperature: 0.4,
    //       topK: 3,

    //       responseConstraint: {
    //         type: "object",
    //         properties: {
    //           usability_score: { type: "number" },
    //           issues: { type: "array", items: { type: "string" } },
    //           summary: { type: "string" },
    //         },
    //         required: ["usability_score", "issues", "summary"],
    //       },
    //     });
    //   }

    //   else if (availability === "available") {

    // Query the active tab
    chrome.tabs.query(
      { active: true, currentWindow: true },
      async function (tabs) {
        const currentTab = tabs[0];

        const prompt = `Analyze the current page: ${currentTab.url}`;

        try {
          const params = {
            initialPrompts: [
              {
                role: "system",
                content: `
      You are an expert UX auditor.
      Analyze web pages based on usability and design heuristics.
      You will be given input including:
      - Page hierarchy structure (Header, Button, Form, etc.)
      - Text readability (word count, sentence length, contrast)
      - Accessibility attributes (ARIA labels, alt text)
      
      For each input, return a JSON object with the following structure:
      {
        "usability_score": number (0-100),
        "issues": [list of heuristic violations],
        "summary": "A concise summary of UX quality (<=50 words)"
      }
      
      Always respond ONLY with valid JSON.
            `,
              },
            ],

            // 控制模型输出的稳定性
            temperature: 0.4,
            topK: 3,

            expectedInputs: [{ type: "text", languages: ["en"] }],
            expectedOutputs: [{ type: "text", languages: ["en"] }],

            responseConstraint: {
              type: "object",
              properties: {
                usability_score: { type: "number" },
                issues: { type: "array", items: { type: "string" } },
                summary: { type: "string" },
              },
              required: ["usability_score", "issues", "summary"],
            },
          };
          const response = await runPrompt(prompt, params);
        } catch (error) {
          console.error("Error analyzing page:", error);
          alert("❌ Failed to analyze page. Please try again.");
        }

        // Here you can add your analysis logic
        console.log("Analyzing page:", currentTab.url);

        // Simulate analysis, then show example results
        setTimeout(() => {
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
            againBtn.addEventListener("click", () => {
              // Reset to intro view
              results.classList.add("hidden");
              document.querySelector(".subtitle").style.display = "";
              analyzeBtn.style.display = "";
              document.querySelector(".instruction-text").style.display = "";
            });
          }
        }, 1200);
      }
    );
  });

  // Add keyboard support
  document.addEventListener("keydown", function (e) {
    if (e.key === "Enter" && document.activeElement === analyzeBtn) {
      analyzeBtn.click();
    }
  });
});
