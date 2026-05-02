chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === "FETCH_FILE") {
    fetch(request.url)
      .then(response => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.blob();
      })
      .then(blob => {
        const reader = new FileReader();
        reader.onloadend = () => {
          sendResponse({ ok: true, data: reader.result, contentType: blob.type });
        };
        reader.readAsDataURL(blob);
      })
      .catch(error => {
        sendResponse({ ok: false, error: error.message });
      });
    return true; // async response
  }
});
