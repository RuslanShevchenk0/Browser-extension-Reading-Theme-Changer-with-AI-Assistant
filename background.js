// Background Service Worker for working with DeepSeek via the OpenRouter API
const translationCache = new Map();
const CACHE_EXPIRY = 24 * 60 * 60 * 1000; // 24 часа

// OpenRouter API configuration
const OPENROUTER_CONFIG = {
  baseUrl: 'https://openrouter.ai/api/v1/chat/completions',
  model: 'deepseek/deepseek-chat-v3.1',
  maxTokens: 4000,
  siteUrl: 'https://github.com/reading-theme-changer',
  siteName: 'Reading Assistant' 
};

// Getting the API key from storage
async function getApiKey() {
  const result = await chrome.storage.local.get(['openrouterApiKey']);
  return result.openrouterApiKey || '';
}

// Check for the presence of an API key
async function hasApiKey() {
  const key = await getApiKey();
  return key && key.length > 0;
}

// Basic function for calling OpenRouter API
async function callOpenRouterAPI(messages, temperature = 0.7) {
  const apiKey = await getApiKey();
  
  if (!apiKey) {
    throw new Error('API ключ не настроен. Пожалуйста, добавьте ключ в настройках.');
  }

  try {
    const response = await fetch(OPENROUTER_CONFIG.baseUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'HTTP-Referer': OPENROUTER_CONFIG.siteUrl,
        'X-Title': OPENROUTER_CONFIG.siteName
      },
      body: JSON.stringify({
        model: OPENROUTER_CONFIG.model,
        messages: messages,
        temperature: temperature,
        max_tokens: OPENROUTER_CONFIG.maxTokens
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error?.message || `API error: ${response.status}`);
    }

    const data = await response.json();
    return data.choices[0].message.content;
  } catch (error) {
    console.error('OpenRouter API Error:', error);
    throw error;
  }
}

// Text translation function (for blocks)
async function translateText(text, targetLanguage) {
  const cacheKey = `translate_${text.substring(0, 100)}_${targetLanguage}`;

  if (translationCache.has(cacheKey)) {
    const cached = translationCache.get(cacheKey);
    if (Date.now() - cached.timestamp < CACHE_EXPIRY) {
      return cached.translation;
    }
  }

  const languageNames = {
    'en': 'English',
    'uk': 'Ukrainian',
    'ru': 'Russian',
    'es': 'Spanish',
    'de': 'German',
    'fr': 'French'
  };

  const targetLangName = languageNames[targetLanguage] || targetLanguage;

  const systemPrompt = chrome.i18n.getMessage('systemPromptTranslate').replace('{language}', targetLangName);

  const messages = [
    {
      role: 'system',
      content: systemPrompt
    },
    {
      role: 'user',
      content: text
    }
  ];

  const translation = await callOpenRouterAPI(messages, 0.3);

  translationCache.set(cacheKey, {
    translation: translation,
    timestamp: Date.now()
  });

  return translation;
}

// Function for translating a block of paragraphs
async function translateBlock(paragraphs, targetLanguage) {
  const numberedTexts = paragraphs.map((p, i) => `[${i}] ${p.text}`);
  const combinedText = numberedTexts.join('\n\n');
  
  console.log('Translating combined text, length:', combinedText.length);
  
  const translation = await translateText(combinedText, targetLanguage);
  
  console.log('Received translation, length:', translation.length);
  
  const parts = translation.split(/\[(\d+)\]\s*/);
  const translations = [];
  
  for (let i = 0; i < paragraphs.length; i++) {
    const idx = parts.indexOf(String(i));
    if (idx >= 0 && parts[idx + 1]) {
      translations.push({ translation: parts[idx + 1].trim() });
    } else {
      const simpleparts = translation.split('\n\n').filter(t => t.trim());
      translations.push({ translation: (simpleparts[i] || paragraphs[i].text).trim() });
    }
  }
  
  return translations;
}

// Function for determining the text language
function detectLanguage(text) {
  const cyrillicPattern = /[\u0400-\u04FF]/;

  if (cyrillicPattern.test(text)) {
    if (/[іїєґ]/i.test(text)) {
      return 'Ukrainian';
    }
    return 'Russian';
  }
  if (/[äöüß]/i.test(text)) {
    return 'German';
  }
  if (/[àâçèéêëîïôùûü]/i.test(text)) {
    return 'French';
  }
  if (/[ñ¿¡]/i.test(text)) {
    return 'Spanish';
  }
  return 'English';
}

// Text simplification function
async function simplifyText(text, pageContext = {}) {
  const contextInfo = pageContext.title ? `\n\nContext: I am on the page "${pageContext.title}".` : '';
  const detectedLanguage = detectLanguage(text);

  const systemPrompt = chrome.i18n.getMessage('systemPromptSimplify') +
    `\n\nIMPORTANT: The input text is in ${detectedLanguage}. You MUST respond in ${detectedLanguage} language only.`;
  const userPrompt = chrome.i18n.getMessage('userPromptSimplify').replace('{text}', text);

  const messages = [
    {
      role: 'system',
      content: systemPrompt
    },
    {
      role: 'user',
      content: `${contextInfo}\n\n${userPrompt}`
    }
  ];

  return await callOpenRouterAPI(messages, 0.7);
}

// Text explanation function
async function explainText(text, pageContext = {}) {
  const contextInfo = pageContext.title ? `\n\nContext: I am on the page "${pageContext.title}".` : '';
  const detectedLanguage = detectLanguage(text);

  const systemPrompt = chrome.i18n.getMessage('systemPromptExplain') +
    `\n\nIMPORTANT: The input text is in ${detectedLanguage}. You MUST respond in ${detectedLanguage} language only.` +
    `\n\nKeep your explanation concise and to the point. For short text (1-3 words), provide a brief 2-3 sentence explanation. For longer text, limit your response to one short paragraph.`;
  const userPrompt = chrome.i18n.getMessage('userPromptExplain').replace('{text}', text);

  const messages = [
    {
      role: 'system',
      content: systemPrompt
    },
    {
      role: 'user',
      content: `${contextInfo}\n\n${userPrompt}`
    }
  ];

  return await callOpenRouterAPI(messages, 0.7);
}

// Text summarization function
async function summarizeText(text, pageContext = {}) {
  const contextInfo = pageContext.title ? `\n\nContext: I am on the page "${pageContext.title}".` : '';
  const detectedLanguage = detectLanguage(text);

  const systemPrompt = chrome.i18n.getMessage('systemPromptSummarize') +
    `\n\nIMPORTANT: The input text is in ${detectedLanguage}. You MUST respond in ${detectedLanguage} language only.`;
  const userPrompt = chrome.i18n.getMessage('userPromptSummarize').replace('{text}', text);

  const messages = [
    {
      role: 'system',
      content: systemPrompt
    },
    {
      role: 'user',
      content: `${contextInfo}\n\n${userPrompt}`
    }
  ];

  return await callOpenRouterAPI(messages, 0.5);
}

// Handler for messages from popup and content scripts
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  (async () => {
    try {
      switch (request.action) {
        case 'checkApiKey':
          const hasKey = await hasApiKey();
          sendResponse({ success: true, hasKey: hasKey });
          break;

        case 'saveApiKey':
          await chrome.storage.local.set({ openrouterApiKey: request.apiKey });
          sendResponse({ success: true });
          break;

        case 'translateBlock':
          console.log('Translating block:', request.paragraphs.length, 'paragraphs');
          const translatedBlock = await translateBlock(request.paragraphs, request.targetLanguage);
          console.log('Translation complete:', translatedBlock.length);
          sendResponse({ success: true, translations: translatedBlock });
          break;

        case 'simplifyText':
          const simplified = await simplifyText(request.text, request.pageContext);
          sendResponse({ success: true, result: simplified });
          break;

        case 'explainText':
          const explanation = await explainText(request.text, request.pageContext);
          sendResponse({ success: true, result: explanation });
          break;

        case 'summarizeText':
          const summary = await summarizeText(request.text, request.pageContext);
          sendResponse({ success: true, result: summary });
          break;

        default:
          sendResponse({ success: false, error: 'Unknown action' });
      }
    } catch (error) {
      console.error('Background script error:', error);
      sendResponse({ success: false, error: error.message });
    }
  })();

  return true;
});

// Create a context menu for the selected text
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'simplifyText',
    title: chrome.i18n.getMessage('contextMenuSimplify'),
    contexts: ['selection']
  });

  chrome.contextMenus.create({
    id: 'explainText',
    title: chrome.i18n.getMessage('contextMenuExplain'),
    contexts: ['selection']
  });

  chrome.contextMenus.create({
    id: 'summarizeText',
    title: chrome.i18n.getMessage('contextMenuSummarize'),
    contexts: ['selection']
  });
});

// Helper function for sending messages securely
async function safeSendMessage(tabId, message) {
  try {
    await chrome.tabs.sendMessage(tabId, message);
  } catch (error) {
    console.error('Error sending message to tab:', error);
  }
}

// Context menu click handler
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (!info.selectionText) return;

  if (!await hasApiKey()) {
    await safeSendMessage(tab.id, {
      action: 'showError',
      message: chrome.i18n.getMessage('apiKeyNotConfigured')
    });
    return;
  }

  await safeSendMessage(tab.id, {
    action: 'showAILoading'
  });

  try {
    const pageContext = {
      title: tab.title,
      url: tab.url
    };

    let result;
    let functionName;

    switch (info.menuItemId) {
      case 'simplifyText':
        result = await simplifyText(info.selectionText, pageContext);
        functionName = 'functionSimplify';
        break;
      case 'explainText':
        result = await explainText(info.selectionText, pageContext);
        functionName = 'functionExplain';
        break;
      case 'summarizeText':
        result = await summarizeText(info.selectionText, pageContext);
        functionName = 'functionSummarize';
        break;
    }
    await safeSendMessage(tab.id, {
      action: 'showAIResult',
      result: result,
      originalText: info.selectionText,
      functionName: functionName
    });
  } catch (error) {
    await safeSendMessage(tab.id, {
      action: 'showError',
      message: error.message
    });
  }
});

console.log('Reading Assistant - Background Service Worker загружен');