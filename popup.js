const themes = {
  default: {
    background: '',
    color: '',
    linkColor: ''
  },
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
  }
};

let customTheme = {
  background: '#363636',
  color: '#ffffff',
  linkColor: '#80b3ff'
};

let textSettings = {
  enabled: false,
  fontSize: 16,
  lineHeight: 1.6,
  paragraphSpacing: 10,
  fontFamily: 'default'
};

let currentEditingColor = null;
let currentHue = 0;

async function getCurrentTab() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  return tabs[0];
}

async function applyTheme(themeName) {
  const tab = await getCurrentTab();
  const theme = themeName === 'custom' ? customTheme : themes[themeName];

  chrome.tabs.sendMessage(tab.id, {
    action: 'applyTheme',
    theme: theme,
    themeName: themeName
  });

  const url = new URL(tab.url);
  const domain = url.hostname;
  
  chrome.storage.local.get(['themes'], (result) => {
    const savedThemes = result.themes || {};
    savedThemes[domain] = themeName;
    chrome.storage.local.set({ themes: savedThemes });
  });

  updateActiveButton(themeName);
}

async function applyTextSettings() {
  const tab = await getCurrentTab();
  
  chrome.tabs.sendMessage(tab.id, {
    action: 'applyTextSettings',
    settings: textSettings
  });

  const url = new URL(tab.url);
  const domain = url.hostname;
  
  chrome.storage.local.get(['textSettings'], (result) => {
    const savedSettings = result.textSettings || {};
    savedSettings[domain] = textSettings;
    chrome.storage.local.set({ textSettings: savedSettings });
  });
}

function updateActiveButton(themeName) {
  document.querySelectorAll('.theme-btn').forEach(btn => {
    btn.classList.remove('active');
    if (btn.dataset.theme === themeName) {
      btn.classList.add('active');
    }
  });
}

async function loadCurrentTheme() {
  const tab = await getCurrentTab();
  const url = new URL(tab.url);
  const domain = url.hostname;

  chrome.storage.local.get(['themes', 'customTheme', 'textSettings'], (result) => {
    const savedThemes = result.themes || {};
    const currentTheme = savedThemes[domain] || 'default';
    
    if (result.customTheme) {
      customTheme = result.customTheme;
      updateCustomThemeUI();
      updateCustomThemeIcon();
    }
    
    if (result.textSettings && result.textSettings[domain]) {
      textSettings = result.textSettings[domain];
      updateTextSettingsUI();
    }
    
    updateActiveButton(currentTheme);
    
    const customControls = document.getElementById('customControls');
    if (currentTheme === 'custom') {
      customControls.style.display = 'block';
    }
  });
}

function updateCustomThemeUI() {
  document.getElementById('bgColorBox').style.background = customTheme.background;
  document.getElementById('bgColorValue').textContent = customTheme.background.toUpperCase();
  document.getElementById('textColorBox').style.background = customTheme.color;
  document.getElementById('textColorValue').textContent = customTheme.color.toUpperCase();
}

function updateCustomThemeIcon() {
  const preview = document.getElementById('customThemePreview');
  preview.style.background = customTheme.background;
  preview.style.color = customTheme.color;
}

function updateTextSettingsUI() {
  document.getElementById('textSettingsToggle').checked = textSettings.enabled;
  document.getElementById('fontSizeSlider').value = textSettings.fontSize;
  document.getElementById('fontSizeValue').textContent = textSettings.fontSize + 'px';
  document.getElementById('lineHeightSlider').value = textSettings.lineHeight;
  document.getElementById('lineHeightValue').textContent = textSettings.lineHeight;
  document.getElementById('paragraphSpacingSlider').value = textSettings.paragraphSpacing;
  document.getElementById('paragraphSpacingValue').textContent = textSettings.paragraphSpacing + 'px';
  document.getElementById('fontFamilySelect').value = textSettings.fontFamily;
  
  const textControls = document.getElementById('textControls');
  textControls.style.display = textSettings.enabled ? 'block' : 'none';
}

function hslToRgb(h, s, l) {
  s /= 100;
  l /= 100;
  const k = n => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = n => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [f(0) * 255, f(8) * 255, f(4) * 255];
}

function rgbToHex(r, g, b) {
  return '#' + [r, g, b].map(x => {
    const hex = Math.round(x).toString(16);
    return hex.length === 1 ? '0' + hex : hex;
  }).join('');
}

function drawColorPicker(hue) {
  const canvas = document.getElementById('colorCanvas');
  const ctx = canvas.getContext('2d');
  const width = canvas.width;
  const height = canvas.height;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const saturation = (x / width) * 100;
      const lightness = 100 - (y / height) * 100;
      const [r, g, b] = hslToRgb(hue, saturation, lightness);
      ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
      ctx.fillRect(x, y, 1, 1);
    }
  }
}

function openColorPopup(colorType) {
  currentEditingColor = colorType;
  const popup = document.getElementById('colorPopup');
  popup.style.display = 'flex';

  const label = document.getElementById('colorTypeLabel');
  label.textContent = colorType === 'bg' ? chrome.i18n.getMessage('backgroundColor') : chrome.i18n.getMessage('textColor');

  const currentColor = colorType === 'bg' ? customTheme.background : customTheme.color;
  document.getElementById('colorHexInput').value = currentColor.toUpperCase();
  document.getElementById('colorPreviewBox').style.background = currentColor;

  drawColorPicker(currentHue);
  updateHueSliderThumb(currentHue);
}

function closeColorPopup() {
  document.getElementById('colorPopup').style.display = 'none';
}

function selectAndApplyColor(color) {
  if (currentEditingColor === 'bg') {
    customTheme.background = color;
  } else {
    customTheme.color = color;
  }
  
  chrome.storage.local.set({ customTheme: customTheme }, () => {
    updateCustomThemeUI();
    updateCustomThemeIcon();
    applyTheme('custom');
  });
  
  closeColorPopup();
}

function updatePreview(color) {
  document.getElementById('colorPreviewBox').style.background = color;
  document.getElementById('colorHexInput').value = color.toUpperCase();
}

function updateHueSliderThumb(hue) {
  const [r, g, b] = hslToRgb(hue, 100, 50);
  const color = rgbToHex(r, g, b);
  const hueSlider = document.getElementById('hueSlider');
  
  let style = document.getElementById('hue-slider-dynamic-style');
  if (!style) {
    style = document.createElement('style');
    style.id = 'hue-slider-dynamic-style';
    document.head.appendChild(style);
  }
  
  style.textContent = `
    #hueSlider::-webkit-slider-thumb {
      background: ${color} !important;
      border: 3px solid white !important;
    }
    #hueSlider::-moz-range-thumb {
      background: ${color} !important;
      border: 3px solid white !important;
    }
  `;
}

function getColorFromCanvas(e) {
  const canvas = document.getElementById('colorCanvas');
  const rect = canvas.getBoundingClientRect();
  const x = (e.clientX - rect.left) * (canvas.width / rect.width);
  const y = (e.clientY - rect.top) * (canvas.height / rect.height);
  
  const saturation = (x / canvas.width) * 100;
  const lightness = 100 - (y / canvas.height) * 100;
  
  const [r, g, b] = hslToRgb(currentHue, saturation, lightness);
  return rgbToHex(r, g, b);
}

// Initialize i18n
function initI18n() {
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    el.textContent = chrome.i18n.getMessage(key) || el.textContent;
  });
  
  document.querySelectorAll('[data-i18n-title]').forEach(el => {
    const key = el.getAttribute('data-i18n-title');
    el.title = chrome.i18n.getMessage(key) || el.title;
  });
  
  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    const key = el.getAttribute('data-i18n-placeholder');
    el.placeholder = chrome.i18n.getMessage(key) || el.placeholder;
  });
}

document.addEventListener('DOMContentLoaded', () => {
  initI18n();
  loadCurrentTheme();

  document.querySelectorAll('.theme-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const themeName = btn.dataset.theme;
      
      const customControls = document.getElementById('customControls');
      if (themeName === 'custom') {
        customControls.style.display = 'block';
        applyTheme('custom');
      } else {
        customControls.style.display = 'none';
        applyTheme(themeName);
      }
    });
  });

  document.getElementById('bgColorSelector').addEventListener('click', () => {
    openColorPopup('bg');
  });

  document.getElementById('textColorSelector').addEventListener('click', () => {
    openColorPopup('text');
  });

  document.getElementById('closeColorPopup').addEventListener('click', (e) => {
    e.stopPropagation();
    closeColorPopup();
  });

  const hueSlider = document.getElementById('hueSlider');
  hueSlider.addEventListener('input', (e) => {
    currentHue = parseInt(e.target.value);
    drawColorPicker(currentHue);
    updateHueSliderThumb(currentHue);
  });

  const canvas = document.getElementById('colorCanvas');
  
  canvas.addEventListener('mousemove', (e) => {
    if (document.getElementById('colorPopup').style.display !== 'flex') return;
    const color = getColorFromCanvas(e);
    updatePreview(color);
  });
  
  canvas.addEventListener('click', (e) => {
    const color = getColorFromCanvas(e);
    selectAndApplyColor(color);
  });

  document.getElementById('colorPopup').addEventListener('click', (e) => {
    if (e.target.id === 'colorPopup') {
      closeColorPopup();
    }
  });

  document.getElementById('colorHexInput').addEventListener('input', (e) => {
    let value = e.target.value.toUpperCase();
    if (!value.startsWith('#')) {
      value = '#' + value;
    }
    
    if (/^#[0-9A-F]{6}$/.test(value)) {
      updatePreview(value);
    }
  });
  
  document.getElementById('colorHexInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      let value = e.target.value.toUpperCase();
      if (!value.startsWith('#')) {
        value = '#' + value;
      }
      
      if (/^#[0-9A-F]{6}$/.test(value)) {
        selectAndApplyColor(value);
      }
    }
  });

  document.getElementById('textSettingsToggle').addEventListener('change', (e) => {
    textSettings.enabled = e.target.checked;
    const textControls = document.getElementById('textControls');
    textControls.style.display = textSettings.enabled ? 'block' : 'none';
    applyTextSettings();
  });

  document.getElementById('fontSizeSlider').addEventListener('input', (e) => {
    textSettings.fontSize = parseInt(e.target.value);
    document.getElementById('fontSizeValue').textContent = textSettings.fontSize + 'px';
    applyTextSettings();
  });

  document.getElementById('lineHeightSlider').addEventListener('input', (e) => {
    textSettings.lineHeight = parseFloat(e.target.value);
    document.getElementById('lineHeightValue').textContent = textSettings.lineHeight;
    applyTextSettings();
  });

  document.getElementById('paragraphSpacingSlider').addEventListener('input', (e) => {
    textSettings.paragraphSpacing = parseInt(e.target.value);
    document.getElementById('paragraphSpacingValue').textContent = textSettings.paragraphSpacing + 'px';
    applyTextSettings();
  });

  document.getElementById('fontFamilySelect').addEventListener('change', (e) => {
    textSettings.fontFamily = e.target.value;
    applyTextSettings();
  });

  // ===== AI ASSISTANT FUNCTIONALITY =====
  
  checkApiKeyStatus();

  document.getElementById('saveApiKeyBtn').addEventListener('click', async () => {
    const apiKey = document.getElementById('apiKeyInput').value.trim();

    if (!apiKey) {
      alert(chrome.i18n.getMessage('enterApiKey'));
      return;
    }

    if (!apiKey.startsWith('sk-')) {
      alert(chrome.i18n.getMessage('apiKeyMustStartWith'));
      return;
    }

    try {
      const response = await chrome.runtime.sendMessage({
        action: 'saveApiKey',
        apiKey: apiKey
      });

      if (response.success) {
        document.getElementById('apiKeyInput').value = '';
        document.getElementById('apiKeyInput').placeholder = chrome.i18n.getMessage('apiKeySaved');
        checkApiKeyStatus();

        setTimeout(() => {
          document.getElementById('apiKeyInput').placeholder = chrome.i18n.getMessage('apiKeyPlaceholder');
        }, 2000);
      }
    } catch (error) {
      console.error('Error saving API key:', error);
      alert(chrome.i18n.getMessage('errorSavingKey'));
    }
  });

  document.getElementById('translateLangSelect').addEventListener('change', (e) => {
    const translateBtn = document.getElementById('translatePageBtn');
    translateBtn.disabled = !e.target.value;
  });

  document.getElementById('translatePageBtn').addEventListener('click', async () => {
    const language = document.getElementById('translateLangSelect').value;

    if (!language) return;

    const translateBtn = document.getElementById('translatePageBtn');
    const originalText = translateBtn.textContent;

    translateBtn.disabled = true;
    translateBtn.textContent = chrome.i18n.getMessage('starting');

    try {
      const tab = await getCurrentTab();

      const response = await chrome.tabs.sendMessage(tab.id, {
        action: 'startPageTranslation',
        targetLanguage: language
      });

      if (response.success) {
        translateBtn.textContent = chrome.i18n.getMessage('translating');

        setTimeout(() => {
          translateBtn.textContent = chrome.i18n.getMessage('restoreOriginal');
          translateBtn.disabled = false;
          translateBtn.onclick = async () => {
            await chrome.tabs.sendMessage(tab.id, {
              action: 'restoreOriginal'
            });
            translateBtn.textContent = originalText;
            translateBtn.onclick = null;
            location.reload();
          };
        }, 1000);
      } else {
        alert(chrome.i18n.getMessage('error') + ': ' + response.error);
        translateBtn.disabled = false;
        translateBtn.textContent = originalText;
      }
    } catch (error) {
      console.error('Translation error:', error);
      alert(chrome.i18n.getMessage('translationError') + ': ' + error.message);
      translateBtn.disabled = false;
      translateBtn.textContent = originalText;
    }
  });

  async function checkApiKeyStatus() {
    try {
      const response = await chrome.runtime.sendMessage({
        action: 'checkApiKey'
      });

      const statusIndicator = document.getElementById('aiStatus');
      const translationControls = document.getElementById('translationControls');

      if (response.hasKey) {
        statusIndicator.classList.add('active');
        statusIndicator.title = 'API ключ настроен';
        translationControls.style.display = 'block';
      } else {
        statusIndicator.classList.remove('active');
        statusIndicator.title = 'API ключ не настроен';
        translationControls.style.display = 'none';
      }
    } catch (error) {
      console.error('Error checking API key:', error);
    }
  }

  function extractPageText() {
    const selectors = [
      'article',
      'main',
      '[role="main"]',
      '.article',
      '.post',
      '.content'
    ];

    let content = null;
    for (const selector of selectors) {
      content = document.querySelector(selector);
      if (content) break;
    }

    if (!content) {
      content = document.body;
    }

    const paragraphs = content.querySelectorAll('p, h1, h2, h3, h4, h5, h6');
    let text = '';
    
    paragraphs.forEach(p => {
      const pText = p.textContent.trim();
      if (pText.length > 20) {
        text += pText + '\n\n';
      }
    });

    return text.trim();
  }
});