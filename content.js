// Listen for messages from popup and background
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'applyTheme') {
    applyTheme(request.theme, request.themeName);
  } else if (request.action === 'applyTextSettings') {
    applyTextSettings(request.settings);
  } else if (request.action === 'showAIResult') {
    showAIResultPopup(request.result, request.originalText, request.functionName);
  } else if (request.action === 'showAILoading') {
    showAILoadingIndicator();
  } else if (request.action === 'showError') {
    showErrorPopup(request.message);
  } else if (request.action === 'startPageTranslation') {
    initPageTranslation(request.targetLanguage)
      .then(result => sendResponse({ success: true, ...result }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  } else if (request.action === 'stopTranslation') {
    stopTranslation();
    sendResponse({ success: true });
  } else if (request.action === 'restoreOriginal') {
    restoreOriginalText();
    sendResponse({ success: true });
  }
});

// Global variables for storing the current theme and settings
let currentTheme = null;
let currentTextSettings = null;

// Add the global spinner animation once
function ensureSpinnerAnimation() {
  if (!document.getElementById('reading-spinner-animation')) {
    const style = document.createElement('style');
    style.id = 'reading-spinner-animation';
    style.textContent = `
      @keyframes reading-spin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
      }
    `;
    document.head.appendChild(style);
  }
}

// Called on boot
ensureSpinnerAnimation();

// Theme application function - CHANGES EVERYTHING like in the original, BUT excludes AI elements
function applyTheme(theme, themeName) {
  currentTheme = { theme, themeName };
  
  const existingStyle = document.getElementById('reading-theme-style');
  if (existingStyle) {
    existingStyle.remove();
  }

  if (themeName === 'default') {
    return;
  }

  const style = document.createElement('style');
  style.id = 'reading-theme-style';
  
  style.textContent = `
    html, body {
      background-color: ${theme.background} !important;
      color: ${theme.color} !important;
    }
    
    *:not(#reading-ai-popup):not(#reading-ai-popup *):not(#reading-ai-loader):not(#reading-ai-loader *):not(#reading-ai-overlay):not(#translation-progress-indicator):not(#translation-progress-indicator *) {
      background-color: ${theme.background} !important;
      color: ${theme.color} !important;
      border-color: ${theme.color} !important;
    }
    
    a:not(#reading-ai-popup *):not(#reading-ai-loader *), 
    a:not(#reading-ai-popup *):not(#reading-ai-loader *) * {
      color: ${theme.linkColor} !important;
    }
    
    img, video, iframe, svg {
      opacity: 0.9 !important;
    }
    
    input:not(#reading-ai-popup *):not(#reading-ai-loader *), 
    textarea:not(#reading-ai-popup *):not(#reading-ai-loader *), 
    select:not(#reading-ai-popup *):not(#reading-ai-loader *) {
      background-color: ${adjustBrightness(theme.background, 10)} !important;
      color: ${theme.color} !important;
      border: 1px solid ${theme.color} !important;
    }
    
    button:not(#reading-ai-popup *):not(#reading-ai-loader *) {
      background-color: ${adjustBrightness(theme.background, 20)} !important;
      color: ${theme.color} !important;
      border: 1px solid ${theme.color} !important;
    }
    
    code:not(#reading-ai-popup *):not(#reading-ai-loader *), 
    pre:not(#reading-ai-popup *):not(#reading-ai-loader *) {
      background-color: ${adjustBrightness(theme.background, 15)} !important;
      color: ${theme.color} !important;
    }
  `;
  
  document.head.appendChild(style);
}

// Smart search function for text containers
function findMainTextContainers() {
  const candidates = [];
  
  const contentSelectors = [
    'article',
    '[role="main"]',
    'main',
    '.article',
    '.post',
    '.content',
    '.entry-content',
    '.post-content',
    '.article-content',
    '#content',
    '#main',
    '.main-content'
  ];
  
  for (const selector of contentSelectors) {
    const elements = document.querySelectorAll(selector);
    elements.forEach(el => {
      if (el && hasSignificantText(el)) {
        candidates.push(el);
      }
    });
  }
  
  if (candidates.length === 0) {
    const allElements = document.querySelectorAll('div, section, article');
    allElements.forEach(el => {
      if (hasSignificantText(el)) {
        candidates.push(el);
      }
    });
  }
  
  if (candidates.length === 0) {
    return [document.body];
  }
  
  return candidates;
}

function hasSignificantText(element) {
  const textContent = element.textContent || '';
  const textLength = textContent.trim().length;
  
  if (textLength < 200) return false;
  
  const tagName = element.tagName.toLowerCase();
  if (['script', 'style', 'noscript'].includes(tagName)) return false;
  
  const paragraphs = element.querySelectorAll('p');
  if (paragraphs.length < 2) return false;
  
  return true;
}

// Function to find the BEST container (as in translation)
function findBestTextContainer() {
  const containers = findMainTextContainers();
  
  let bestContainer = null;
  let maxParagraphs = 0;
  
  containers.forEach(container => {
    const paragraphCount = container.querySelectorAll('p').length;
    if (paragraphCount > maxParagraphs) {
      maxParagraphs = paragraphCount;
      bestContainer = container;
    }
  });
  
  return bestContainer || containers[0] || document.body;
}

// Function to apply text settings ONLY to the best container
function applyTextSettings(settings) {
  currentTextSettings = settings;
  
  const existingStyle = document.getElementById('reading-text-settings-style');
  if (existingStyle) {
    existingStyle.remove();
  }
  
  // Remove old classes
  document.querySelectorAll('.reading-text-enhanced').forEach(el => {
    el.classList.remove('reading-text-enhanced');
  });

  if (!settings.enabled) {
    return;
  }

  // Find the BEST container (as in translation)
  const bestContainer = findBestTextContainer();
  const style = document.createElement('style');
  style.id = 'reading-text-settings-style';
  
  const targetClass = 'reading-text-enhanced';
  bestContainer.classList.add(targetClass);
  
  let fontFamilyRule = '';
  if (settings.fontFamily !== 'default') {
    fontFamilyRule = `font-family: ${settings.fontFamily} !important;`;
  }
  
  style.textContent = `
    .${targetClass}, 
    .${targetClass} p,
    .${targetClass} li,
    .${targetClass} div,
    .${targetClass} span,
    .${targetClass} td,
    .${targetClass} th {
      font-size: ${settings.fontSize}px !important;
      line-height: ${settings.lineHeight} !important;
      ${fontFamilyRule}
    }
    
    .${targetClass} p {
      margin-bottom: ${settings.paragraphSpacing}px !important;
    }
    
    .${targetClass} h1,
    .${targetClass} h2,
    .${targetClass} h3,
    .${targetClass} h4,
    .${targetClass} h5,
    .${targetClass} h6 {
      line-height: ${Math.max(1.2, settings.lineHeight - 0.2)} !important;
      ${fontFamilyRule}
    }
    
    .${targetClass} li {
      margin-bottom: ${Math.floor(settings.paragraphSpacing / 2)}px !important;
    }
  `;
  
  document.head.appendChild(style);
}

function adjustBrightness(color, percent) {
  const num = parseInt(color.replace('#', ''), 16);
  const amt = Math.round(2.55 * percent);
  const R = (num >> 16) + amt;
  const G = (num >> 8 & 0x00FF) + amt;
  const B = (num & 0x0000FF) + amt;
  
  return '#' + (
    0x1000000 +
    (R < 255 ? (R < 1 ? 0 : R) : 255) * 0x10000 +
    (G < 255 ? (G < 1 ? 0 : G) : 255) * 0x100 +
    (B < 255 ? (B < 1 ? 0 : B) : 255)
  ).toString(16).slice(1);
}

// ===== AI POPUPS WITH FIXED STYLES AND THEME FROM THE EXTENSION =====

function getPopupStyles() {
  // Basic styles are ALWAYS fixed for popups
  let styles = {
    background: '#ffffff',
    color: '#333333',
    fontSize: '15px',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
  };

  // Apply ONLY the theme (colors) if it exists and is not the default one
  if (currentTheme && currentTheme.themeName !== 'default') {
    const theme = currentTheme.theme;
    styles.background = theme.background;
    styles.color = theme.color;
  }

  // Apply ONLY the font and size from the text settings (NOT lineHeight and spacing!)
  if (currentTextSettings?.enabled) {
    styles.fontSize = `${currentTextSettings.fontSize}px`;

    if (currentTextSettings.fontFamily !== 'default') {
      styles.fontFamily = currentTextSettings.fontFamily;
    }
  }

  return styles;
}

function showAIResultPopup(result, originalText, functionName = 'result') {
  removeAIPopups();
  ensureSpinnerAnimation();

  const styles = getPopupStyles();
  const headerBg = adjustBrightness(styles.background, 10);
  const closeBg = adjustBrightness(styles.background, 15);

  // Get localized function name
  const displayName = chrome.i18n.getMessage(functionName) || chrome.i18n.getMessage('result');

  const popup = document.createElement('div');
  popup.id = 'reading-ai-popup';
  popup.style.cssText = `
    position: fixed !important;
    top: 50% !important;
    left: 50% !important;
    transform: translate(-50%, -50%) !important;
    background: ${styles.background} !important;
    color: ${styles.color} !important;
    padding: 20px !important;
    border-radius: 12px !important;
    box-shadow: 0 4px 20px rgba(0,0,0,0.4) !important;
    z-index: 2147483647 !important;
    max-width: 750px !important;
    max-height: 80vh !important;
    overflow-y: auto !important;
    font-family: ${styles.fontFamily} !important;
    font-size: ${styles.fontSize} !important;
    line-height: 1.6 !important;
    box-sizing: border-box !important;
  `;

  popup.innerHTML = `
    <div style="display: flex !important; justify-content: space-between !important; align-items: center !important; margin: 0 0 16px 0 !important; padding: 0 0 12px 0 !important; border-bottom: 2px solid ${adjustBrightness(styles.background, 20)} !important; box-sizing: border-box !important;">
      <h3 style="margin: 0 !important; padding: 0 !important; color: ${styles.color} !important; font-size: 18px !important; font-weight: 600 !important; font-family: ${styles.fontFamily} !important; line-height: 1.2 !important; display: flex !important; align-items: center !important; gap: 8px !important; box-sizing: border-box !important;">
        <svg width="20" height="20" viewBox="0 0 16 16" fill="currentColor" style="flex-shrink: 0 !important;">
          <path d="M11 5a3 3 0 1 1-6 0 3 3 0 0 1 6 0ZM8 7a2 2 0 1 0 0-4 2 2 0 0 0 0 4Zm.256 7a4.474 4.474 0 0 1-.229-1.004H3c.001-.246.154-.986.832-1.664C4.484 10.68 5.711 10 8 10c.26 0 .507.009.74.025.226-.341.496-.65.804-.918C9.077 9.038 8.564 9 8 9c-5 0-6 3-6 4s1 1 1 1h5.256Z"/>
          <path d="M16 12.5a3.5 3.5 0 1 1-7 0 3.5 3.5 0 0 1 7 0Zm-1.993-1.679a.5.5 0 0 0-.686.172l-1.17 1.95-.547-.547a.5.5 0 0 0-.708.708l.774.773a.75.75 0 0 0 1.174-.144l1.335-2.226a.5.5 0 0 0-.172-.686Z"/>
        </svg>
        ${displayName}
      </h3>
      <button id="close-ai-popup" style="background: ${closeBg} !important; border: none !important; font-size: 24px !important; cursor: pointer !important; color: ${styles.color} !important; width: 32px !important; height: 32px !important; border-radius: 6px !important; display: flex !important; align-items: center !important; justify-content: center !important; line-height: 1 !important; padding: 0 !important; margin: 0 !important; box-sizing: border-box !important;">×</button>
    </div>
    <div style="background: ${headerBg} !important; padding: 12px !important; border-radius: 8px !important; margin: 0 0 16px 0 !important; max-height: 150px !important; overflow-y: auto !important; border-left: 3px solid #7c3aed !important; box-sizing: border-box !important;">
      <strong style="color: ${styles.color} !important; font-weight: 600 !important; font-family: ${styles.fontFamily} !important; font-size: ${styles.fontSize} !important; line-height: 1.6 !important; display: inline !important; margin: 0 !important; padding: 0 !important; box-sizing: border-box !important;">${chrome.i18n.getMessage('original')}:</strong>
      <br style="content: '' !important; margin: 0 !important; padding: 0 !important;">
      <span style="color: ${styles.color} !important; font-family: ${styles.fontFamily} !important; font-size: ${styles.fontSize} !important; line-height: 1.6 !important; display: inline !important; margin: 0 !important; padding: 0 !important; white-space: pre-wrap !important; word-wrap: break-word !important; box-sizing: border-box !important;">${escapeHtml(originalText)}</span>
    </div>
    <div style="color: ${styles.color} !important; font-size: ${styles.fontSize} !important; line-height: 1.6 !important; font-family: ${styles.fontFamily} !important; margin: 0 !important; padding: 0 !important; word-wrap: break-word !important; box-sizing: border-box !important;">
      ${convertMarkdownToHtml(result, styles)}
    </div>
  `;

  document.body.appendChild(popup);

  const overlay = document.createElement('div');
  overlay.id = 'reading-ai-overlay';
  overlay.style.cssText = `
    position: fixed !important;
    top: 0 !important;
    left: 0 !important;
    right: 0 !important;
    bottom: 0 !important;
    background: rgba(0,0,0,0.6) !important;
    z-index: 2147483646 !important;
  `;
  document.body.appendChild(overlay);

  document.getElementById('close-ai-popup').addEventListener('click', removeAIPopups);
  overlay.addEventListener('click', removeAIPopups);
}

function showAILoadingIndicator() {
  removeAIPopups();
  ensureSpinnerAnimation();

  const styles = getPopupStyles();

  const loader = document.createElement('div');
  loader.id = 'reading-ai-loader';
  loader.style.cssText = `
    position: fixed !important;
    top: 50% !important;
    left: 50% !important;
    transform: translate(-50%, -50%) !important;
    background: ${styles.background} !important;
    color: ${styles.color} !important;
    padding: 30px 40px !important;
    border-radius: 12px !important;
    box-shadow: 0 4px 20px rgba(0,0,0,0.4) !important;
    z-index: 2147483647 !important;
    text-align: center !important;
    font-family: ${styles.fontFamily} !important;
    box-sizing: border-box !important;
  `;

  loader.innerHTML = `
    <div style="font-size: 16px !important; color: ${styles.color} !important; margin: 0 0 12px 0 !important; padding: 0 !important; font-family: ${styles.fontFamily} !important; line-height: 1.4 !important; display: flex !important; align-items: center !important; gap: 8px !important; justify-content: center !important; box-sizing: border-box !important;">
      <svg width="18" height="18" viewBox="0 0 16 16" fill="currentColor" style="flex-shrink: 0 !important;">
        <path d="M5 0a.5.5 0 0 1 .5.5V2h1V.5a.5.5 0 0 1 1 0V2h1V.5a.5.5 0 0 1 1 0V2h1V.5a.5.5 0 0 1 1 0V2A2.5 2.5 0 0 1 14 4.5h1.5a.5.5 0 0 1 0 1H14v1h1.5a.5.5 0 0 1 0 1H14v1h1.5a.5.5 0 0 1 0 1H14v1h1.5a.5.5 0 0 1 0 1H14a2.5 2.5 0 0 1-2.5 2.5v1.5a.5.5 0 0 1-1 0V14h-1v1.5a.5.5 0 0 1-1 0V14h-1v1.5a.5.5 0 0 1-1 0V14h-1v1.5a.5.5 0 0 1-1 0V14A2.5 2.5 0 0 1 2 11.5H.5a.5.5 0 0 1 0-1H2v-1H.5a.5.5 0 0 1 0-1H2v-1H.5a.5.5 0 0 1 0-1H2v-1H.5a.5.5 0 0 1 0-1H2A2.5 2.5 0 0 1 4.5 2V.5A.5.5 0 0 1 5 0zm-.5 3A1.5 1.5 0 0 0 3 4.5v7A1.5 1.5 0 0 0 4.5 13h7a1.5 1.5 0 0 0 1.5-1.5v-7A1.5 1.5 0 0 0 11.5 3h-7zM5 6.5A1.5 1.5 0 0 1 6.5 5h3A1.5 1.5 0 0 1 11 6.5v3A1.5 1.5 0 0 1 9.5 11h-3A1.5 1.5 0 0 1 5 9.5v-3zM6.5 6a.5.5 0 0 0-.5.5v3a.5.5 0 0 0 .5.5h3a.5.5 0 0 0 .5-.5v-3a.5.5 0 0 0-.5-.5h-3z"/>
      </svg>
      ${chrome.i18n.getMessage('aiProcessing')}
    </div>
    <div style="display: inline-block !important; width: 40px !important; height: 40px !important; border: 4px solid ${adjustBrightness(styles.background, 30)} !important; border-top: 4px solid #7c3aed !important; border-radius: 50% !important; animation: reading-spin 1s linear infinite !important; box-sizing: border-box !important;"></div>
  `;

  document.body.appendChild(loader);

  const overlay = document.createElement('div');
  overlay.id = 'reading-ai-overlay';
  overlay.style.cssText = `
    position: fixed !important;
    top: 0 !important;
    left: 0 !important;
    right: 0 !important;
    bottom: 0 !important;
    background: rgba(0,0,0,0.5) !important;
    z-index: 2147483646 !important;
  `;
  document.body.appendChild(overlay);
}

function showErrorPopup(message) {
  removeAIPopups();
  ensureSpinnerAnimation();

  const styles = getPopupStyles();
  const closeBg = adjustBrightness(styles.background, 15);

  const popup = document.createElement('div');
  popup.id = 'reading-ai-popup';
  popup.style.cssText = `
    position: fixed !important;
    top: 50% !important;
    left: 50% !important;
    transform: translate(-50%, -50%) !important;
    background: ${styles.background} !important;
    color: ${styles.color} !important;
    padding: 20px !important;
    border-radius: 12px !important;
    box-shadow: 0 4px 20px rgba(0,0,0,0.4) !important;
    z-index: 2147483647 !important;
    max-width: 400px !important;
    font-family: ${styles.fontFamily} !important;
    box-sizing: border-box !important;
  `;

  popup.innerHTML = `
    <div style="display: flex !important; justify-content: space-between !important; align-items: center !important; margin: 0 0 12px 0 !important; padding: 0 !important; box-sizing: border-box !important;">
      <h3 style="margin: 0 !important; padding: 0 !important; color: #d32f2f !important; font-size: 18px !important; font-weight: 600 !important; font-family: ${styles.fontFamily} !important; line-height: 1.2 !important; display: flex !important; align-items: center !important; gap: 8px !important; box-sizing: border-box !important;">
        <svg width="20" height="20" viewBox="0 0 16 16" fill="#d32f2f" style="flex-shrink: 0 !important;">
          <path d="M8.982 1.566a1.13 1.13 0 0 0-1.96 0L.165 13.233c-.457.778.091 1.767.98 1.767h13.713c.889 0 1.438-.99.98-1.767L8.982 1.566zM8 5c.535 0 .954.462.9.995l-.35 3.507a.552.552 0 0 1-1.1 0L7.1 5.995A.905.905 0 0 1 8 5zm.002 6a1 1 0 1 1 0 2 1 1 0 0 1 0-2z"/>
        </svg>
        ${chrome.i18n.getMessage('errorTitle')}
      </h3>
      <button id="close-ai-popup" style="background: ${closeBg} !important; border: none !important; font-size: 24px !important; cursor: pointer !important; color: ${styles.color} !important; width: 32px !important; height: 32px !important; border-radius: 6px !important; display: flex !important; align-items: center !important; justify-content: center !important; line-height: 1 !important; padding: 0 !important; margin: 0 !important; box-sizing: border-box !important;">×</button>
    </div>
    <div style="color: ${styles.color} !important; font-size: 14px !important; line-height: 1.5 !important; font-family: ${styles.fontFamily} !important; margin: 0 !important; padding: 0 !important; box-sizing: border-box !important;">
      ${escapeHtml(message)}
    </div>
  `;

  document.body.appendChild(popup);

  const overlay = document.createElement('div');
  overlay.id = 'reading-ai-overlay';
  overlay.style.cssText = `
    position: fixed !important;
    top: 0 !important;
    left: 0 !important;
    right: 0 !important;
    bottom: 0 !important;
    background: rgba(0,0,0,0.6) !important;
    z-index: 2147483646 !important;
  `;
  document.body.appendChild(overlay);

  document.getElementById('close-ai-popup').addEventListener('click', removeAIPopups);
  overlay.addEventListener('click', removeAIPopups);

  setTimeout(removeAIPopups, 5000);
}

function removeAIPopups() {
  const popup = document.getElementById('reading-ai-popup');
  const loader = document.getElementById('reading-ai-loader');
  const overlay = document.getElementById('reading-ai-overlay');
  
  if (popup) popup.remove();
  if (loader) loader.remove();
  if (overlay) overlay.remove();
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function convertMarkdownToHtml(text, styles) {
  let html = escapeHtml(text);

  html = html.replace(/^###\s+(.+)$/gm, `<h3 style="font-size: 16px !important; font-weight: 600 !important; margin: 12px 0 6px 0 !important; padding: 0 !important; color: ${styles.color} !important; font-family: ${styles.fontFamily} !important; line-height: 1.3 !important;">$1</h3>`);

  html = html.replace(/^##\s+(.+)$/gm, `<h2 style="font-size: 17px !important; font-weight: 600 !important; margin: 14px 0 8px 0 !important; padding: 0 !important; color: ${styles.color} !important; font-family: ${styles.fontFamily} !important; line-height: 1.3 !important;">$1</h2>`);

  html = html.replace(/^#\s+(.+)$/gm, `<h1 style="font-size: 18px !important; font-weight: 600 !important; margin: 16px 0 10px 0 !important; padding: 0 !important; color: ${styles.color} !important; font-family: ${styles.fontFamily} !important; line-height: 1.3 !important;">$1</h1>`);

  html = html.replace(/\*\*(.+?)\*\*/g, `<strong style="font-weight: 600 !important; color: ${styles.color} !important;">$1</strong>`);

  html = html.replace(/^\s*\*\s+(.+)$/gm, `<li style="margin-left: 20px !important; margin-bottom: 4px !important; color: ${styles.color} !important; line-height: 1.6 !important;">$1</li>`);

  html = html.replace(/(<li[^>]*>.*?<\/li>\s*)+/gs, match => {
    return `<ul style="margin: 8px 0 !important; padding: 0 !important; list-style-type: disc !important; color: ${styles.color} !important;">${match}</ul>`;
  });

  html = html.replace(/\n/g, '<br>');

  html = html.replace(/(<\/h[123]>)<br>/g, '$1');
  html = html.replace(/(<\/ul>)<br>/g, '$1');

  html = html.replace(/<br>(<h[123])/g, '$1');

  html = html.replace(/(<br>){3,}/g, '<br><br>');

  return html;
}

// ===== PAGE TURN =====

let translationState = {
  isTranslating: false,
  isEnabled: false,
  targetLanguage: null,
  currentBlockIndex: 0,
  allParagraphs: [],
  translatedCount: 0,
  blockSize: 25
};

async function initPageTranslation(targetLanguage) {
  translationState.targetLanguage = targetLanguage;
  translationState.isEnabled = true;
  translationState.currentBlockIndex = 0;
  translationState.translatedCount = 0;
  
  const targetContainer = findBestTextContainer();
  translationState.allParagraphs = [];
  
  if (!targetContainer) {
    throw new Error('Не найдено контейнера с текстом');
  }
  
  const paragraphs = targetContainer.querySelectorAll('p, h1, h2, h3, h4, h5, h6');
  paragraphs.forEach(p => {
    const isInExcluded = p.closest('nav, header, footer, aside, [role="navigation"]');
    if (isInExcluded) return;
    
    const text = p.textContent.trim();
    if (text.length > 20) {
      translationState.allParagraphs.push({
        element: p,
        text: text,
        original: text,
        translated: false
      });
    }
  });
  
  if (translationState.allParagraphs.length === 0) {
    throw new Error('Не найдено текста для перевода');
  }
  
  await translateNextBlock();
  
  window.addEventListener('scroll', handleTranslationScroll, { passive: true });
  
  return {
    total: translationState.allParagraphs.length,
    translated: translationState.translatedCount
  };
}

async function translateNextBlock() {
  if (translationState.isTranslating) return;
  if (!translationState.isEnabled) return;
  
  const startIndex = translationState.currentBlockIndex * translationState.blockSize;
  const endIndex = Math.min(startIndex + translationState.blockSize, translationState.allParagraphs.length);
  
  if (startIndex >= translationState.allParagraphs.length) {
    translationState.isEnabled = false;
    window.removeEventListener('scroll', handleTranslationScroll);
    showTranslationComplete();
    return;
  }
  
  translationState.isTranslating = true;
  showTranslationProgress(startIndex, endIndex, translationState.allParagraphs.length);
  
  try {
    const block = translationState.allParagraphs.slice(startIndex, endIndex);
    
    const response = await chrome.runtime.sendMessage({
      action: 'translateBlock',
      paragraphs: block,
      targetLanguage: translationState.targetLanguage
    });
    
    if (response.success) {
      response.translations.forEach((item, index) => {
        const paragraph = translationState.allParagraphs[startIndex + index];
        paragraph.element.textContent = item.translation;
        paragraph.translated = true;
        translationState.translatedCount++;
      });
      
      translationState.currentBlockIndex++;
      hideTranslationProgress();
    }
  } catch (error) {
    console.error('Translation error:', error);
    showErrorPopup('Ошибка перевода: ' + error.message);
    translationState.isEnabled = false;
  }
  
  translationState.isTranslating = false;
}

function handleTranslationScroll() {
  if (!translationState.isEnabled || translationState.isTranslating) return;
  
  const lastTranslatedIndex = translationState.currentBlockIndex * translationState.blockSize - 1;
  if (lastTranslatedIndex < 0) return;
  
  const lastElement = translationState.allParagraphs[lastTranslatedIndex]?.element;
  if (lastElement) {
    const rect = lastElement.getBoundingClientRect();
    if (rect.bottom < window.innerHeight * 1.5) {
      translateNextBlock();
    }
  }
}

function showTranslationProgress(start, end, total) {
  removeElement('translation-progress-indicator');
  ensureSpinnerAnimation();

  const styles = getPopupStyles();

  const indicator = document.createElement('div');
  indicator.id = 'translation-progress-indicator';
  indicator.style.cssText = `
    position: fixed !important;
    bottom: 20px !important;
    right: 20px !important;
    background: ${styles.background} !important;
    color: ${styles.color} !important;
    padding: 12px 20px !important;
    border-radius: 8px !important;
    box-shadow: 0 4px 12px rgba(0,0,0,0.4) !important;
    z-index: 2147483647 !important;
    font-family: ${styles.fontFamily} !important;
    font-size: 14px !important;
    font-weight: 500 !important;
    border: 2px solid #7c3aed !important;
    box-sizing: border-box !important;
  `;

  const percent = Math.round((end / total) * 100);
  indicator.innerHTML = `
    <div style="display: flex !important; align-items: center !important; gap: 10px !important; margin: 0 !important; padding: 0 !important; box-sizing: border-box !important;">
      <div style="width: 20px !important; height: 20px !important; border: 2px solid ${adjustBrightness(styles.background, 30)} !important; border-top: 2px solid #7c3aed !important; border-radius: 50% !important; animation: reading-spin 1s linear infinite !important; margin: 0 !important; padding: 0 !important; box-sizing: border-box !important;"></div>
      <div style="color: ${styles.color} !important; font-family: ${styles.fontFamily} !important; font-size: 14px !important; line-height: 1.4 !important; margin: 0 !important; padding: 0 !important; box-sizing: border-box !important;">${chrome.i18n.getMessage('translationProgress')}: ${percent}% (${end}/${total})</div>
    </div>
  `;

  document.body.appendChild(indicator);
}

function hideTranslationProgress() {
  removeElement('translation-progress-indicator');
}

function showTranslationComplete() {
  const styles = getPopupStyles();

  const notification = document.createElement('div');
  notification.style.cssText = `
    all: initial;
    position: fixed !important;
    bottom: 20px !important;
    right: 20px !important;
    background: #4caf50 !important;
    color: white !important;
    padding: 12px 20px !important;
    border-radius: 8px !important;
    box-shadow: 0 4px 12px rgba(0,0,0,0.3) !important;
    z-index: 2147483647 !important;
    font-family: ${styles.fontFamily} !important;
    font-size: 14px !important;
    font-weight: 500 !important;
  `;
  notification.textContent = chrome.i18n.getMessage('translationComplete');
  document.body.appendChild(notification);
  setTimeout(() => notification.remove(), 3000);
}

function stopTranslation() {
  translationState.isEnabled = false;
  translationState.isTranslating = false;
  window.removeEventListener('scroll', handleTranslationScroll);
  hideTranslationProgress();
}

function restoreOriginalText() {
  translationState.allParagraphs.forEach(p => {
    if (p.translated) {
      p.element.textContent = p.original;
      p.translated = false;
    }
  });
  stopTranslation();
  translationState.translatedCount = 0;
  translationState.currentBlockIndex = 0;
}

function removeElement(id) {
  const element = document.getElementById(id);
  if (element) element.remove();
}

// Restore the theme on boot
function restoreTheme() {
  const domain = window.location.hostname;
  
  chrome.storage.local.get(['themes', 'textSettings'], (result) => {
    const savedThemes = result.themes || {};
    const themeName = savedThemes[domain];
    
    if (themeName && themeName !== 'default') {
      const themes = {
        light: {
          background: '#fafafa',
          color: '#303030',
          linkColor: '#0066cc'
        },
        dark: {
          background: '#1a1a1a',
          color: '#e0e0e0',
          linkColor: '#6db3f2'
        },
        sepia: {
          background: '#f4ecd8',
          color: '#5c4a3a',
          linkColor: '#8b6914'
        },
        gray: {
          background: '#363636',
          color: '#ffffff',
          linkColor: '#80b3ff'
        },
        night: {
          background: '#0d1117',
          color: '#c9d1d9',
          linkColor: '#58a6ff'
        },
        custom: {
          background: '#363636',
          color: '#ffffff',
          linkColor: '#80b3ff'
        }
      };
      
      chrome.storage.local.get(['customTheme'], (customResult) => {
        if (customResult.customTheme) {
          themes.custom = customResult.customTheme;
        }
        
        const theme = themes[themeName];
        if (theme) {
          applyTheme(theme, themeName);
        }
      });
    }
    
    const savedTextSettings = result.textSettings || {};
    const textSettings = savedTextSettings[domain];
    
    if (textSettings) {
      applyTextSettings(textSettings);
    }
  });
}

restoreTheme();
