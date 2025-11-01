// Web audit rules judgement information for UX analysis

// Listen for messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === "GET_RULES_AUDIT_INFO") {
    const pageInfo = rulesAudit();
    sendResponse(pageInfo);
    return true;
  }
});

function rulesAudit() {}
