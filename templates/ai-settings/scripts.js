const vscode = acquireVsCodeApi();
const form = document.getElementById('settingsForm');
const providerSelect = document.getElementById('provider');
const testBtn = document.getElementById('testBtn');
const saveBtn = document.getElementById('saveBtn');
const messageDiv = document.getElementById('message');

// Request to load current settings
vscode.postMessage({ command: 'loadSettings' });

// Provider change handler
providerSelect.addEventListener('change', () => {
  const provider = providerSelect.value;
  document.querySelectorAll('.provider-details').forEach(el => {
    el.classList.remove('active');
  });
  const detailsEl = document.getElementById('provider-' + provider);
  if (detailsEl) {
    detailsEl.classList.add('active');
  }
  hideMessage();

  // Auto-load models for the new provider
  const formData = getFormData();
  autoLoadModels(provider, formData.apiKey, formData.endpoint);
});

function showMessage(text, isError = false) {
  const type = isError ? 'error' : 'success';
  const icons = {
    success: '✓',
    error: '✗',
    info: 'ℹ'
  };
  messageDiv.innerHTML = `<span class="message-icon">${icons[type]}</span><span>${text}</span>`;
  messageDiv.className = 'message ' + type;
  messageDiv.style.display = 'flex';
}

function hideMessage() {
  messageDiv.style.display = 'none';
}

function autoLoadModels(provider, apiKey, endpoint) {
  // Auto-load models for providers where it's possible
  if (provider === 'vscode-lm') {
    // Always load VS Code LM models
    vscode.postMessage({
      command: 'listModels',
      settings: { provider: 'vscode-lm', apiKey: '', endpoint: '' }
    });
  } else if (provider === 'anthropic') {
    // Anthropic has a fixed list, we can show it immediately
    const anthropicModels = [
      'claude-3-5-sonnet-20241022',
      'claude-3-5-haiku-20241022',
      'claude-3-opus-20240229',
      'claude-3-sonnet-20240229',
      'claude-3-haiku-20240307'
    ];
    handleModelsListed(anthropicModels);
  } else if ((provider === 'openai' || provider === 'gemini') && apiKey) {
    // Load models if API key is available
    vscode.postMessage({
      command: 'listModels',
      settings: { provider: provider, apiKey: apiKey, endpoint: endpoint }
    });
  } else if (provider === 'custom' && endpoint) {
    // Load models if endpoint is available
    vscode.postMessage({
      command: 'listModels',
      settings: { provider: 'custom', apiKey: apiKey, endpoint: endpoint }
    });
  }
}

function getFormData() {
  const provider = providerSelect.value;
  let apiKey = '';
  let model = '';
  let endpoint = '';

  if (provider === 'vscode-lm') {
    const selectEl = document.getElementById('model-vscode-lm-select');
    const inputEl = document.getElementById('model-vscode-lm');
    model = (selectEl && !selectEl.classList.contains('hidden') && selectEl.value)
      ? selectEl.value
      : inputEl.value;
  } else if (provider === 'openai') {
    apiKey = document.getElementById('apiKey-openai').value;
    const selectEl = document.getElementById('model-openai-select');
    const inputEl = document.getElementById('model-openai');
    model = (selectEl && !selectEl.classList.contains('hidden') && selectEl.value)
      ? selectEl.value
      : inputEl.value;
  } else if (provider === 'anthropic') {
    apiKey = document.getElementById('apiKey-anthropic').value;
    const selectEl = document.getElementById('model-anthropic-select');
    const inputEl = document.getElementById('model-anthropic');
    model = (selectEl && !selectEl.classList.contains('hidden') && selectEl.value)
      ? selectEl.value
      : inputEl.value;
  } else if (provider === 'gemini') {
    apiKey = document.getElementById('apiKey-gemini').value;
    const selectEl = document.getElementById('model-gemini-select');
    const inputEl = document.getElementById('model-gemini');
    model = (selectEl && !selectEl.classList.contains('hidden') && selectEl.value)
      ? selectEl.value
      : inputEl.value;
  } else if (provider === 'custom') {
    apiKey = document.getElementById('apiKey-custom').value;
    model = document.getElementById('model-custom').value;
    endpoint = document.getElementById('endpoint-custom').value;
  }

  return { provider, apiKey, model, endpoint };
}

function setFormData(settings) {
  providerSelect.value = settings.provider || 'vscode-lm';
  providerSelect.dispatchEvent(new Event('change'));

  if (settings.provider === 'vscode-lm') {
    document.getElementById('model-vscode-lm').value = settings.model || '';
  } else if (settings.provider === 'openai') {
    document.getElementById('apiKey-openai').value = settings.apiKey || '';
    document.getElementById('model-openai').value = settings.model || '';
  } else if (settings.provider === 'anthropic') {
    document.getElementById('apiKey-anthropic').value = settings.apiKey || '';
    document.getElementById('model-anthropic').value = settings.model || '';
  } else if (settings.provider === 'gemini') {
    document.getElementById('apiKey-gemini').value = settings.apiKey || '';
    document.getElementById('model-gemini').value = settings.model || '';
  } else if (settings.provider === 'custom') {
    document.getElementById('apiKey-custom').value = settings.apiKey || '';
    document.getElementById('model-custom').value = settings.model || '';
    document.getElementById('endpoint-custom').value = settings.endpoint || '';
  }
}

// Test button handler
testBtn.addEventListener('click', () => {
  hideMessage();
  testBtn.disabled = true;
  testBtn.innerHTML = '<span class="btn-icon">⏳</span><span>Testing...</span>';

  vscode.postMessage({
    command: 'testConnection',
    settings: getFormData()
  });
});

// Form submit handler
form.addEventListener('submit', (e) => {
  e.preventDefault();
  hideMessage();
  saveBtn.disabled = true;
  saveBtn.innerHTML = '<span class="btn-icon">⏳</span><span>Saving...</span>';

  vscode.postMessage({
    command: 'saveSettings',
    settings: getFormData()
  });
});

// List models button handlers
document.querySelectorAll('.list-models-btn').forEach(btn => {
  btn.addEventListener('click', function () {
    const provider = this.getAttribute('data-provider');
    const settings = getFormData();

    if ((provider === 'openai' || provider === 'gemini') && !settings.apiKey) {
      showMessage('Please enter an API key first', true);
      return;
    }

    // VS Code LM and Anthropic don't require API key check
    if (provider === 'custom' && !settings.endpoint) {
      showMessage('Please enter an endpoint first', true);
      return;
    }

    this.disabled = true;
    this.textContent = 'Loading models...';

    vscode.postMessage({
      command: 'listModels',
      settings: { provider: provider, apiKey: settings.apiKey, endpoint: settings.endpoint }
    });
  });
});

// Model select change handlers
['vscode-lm', 'openai', 'anthropic', 'gemini'].forEach(provider => {
  const selectEl = document.getElementById('model-' + provider + '-select');
  const inputEl = document.getElementById('model-' + provider);
  if (selectEl && inputEl) {
    selectEl.addEventListener('change', function () {
      if (this.value) {
        inputEl.value = this.value;
      }
    });
  }
});

// Auto-load models when API key is entered for OpenAI and Gemini
['openai', 'gemini'].forEach(provider => {
  const apiKeyInput = document.getElementById('apiKey-' + provider);
  if (apiKeyInput) {
    apiKeyInput.addEventListener('blur', function () {
      if (this.value && this.value.length > 10) {
        autoLoadModels(provider, this.value, '');
      }
    });
  }
});

// Auto-load models when custom endpoint is entered
const customEndpoint = document.getElementById('endpoint-custom');
if (customEndpoint) {
  customEndpoint.addEventListener('blur', function () {
    if (this.value) {
      const apiKey = document.getElementById('apiKey-custom').value;
      autoLoadModels('custom', apiKey, this.value);
    }
  });
}

// Message handler
window.addEventListener('message', event => {
  const message = event.data;
  testBtn.disabled = false;
  testBtn.innerHTML = '<span class="btn-icon">⚡</span><span>Test Connection</span>';
  saveBtn.disabled = false;
  saveBtn.innerHTML = '<span class="btn-icon">✓</span><span>Save Settings</span>';

  // Reset list models buttons
  document.querySelectorAll('.list-models-btn').forEach(btn => {
    btn.disabled = false;
    btn.textContent = 'List available models';
  });

  switch (message.type) {
    case 'testSuccess':
      showMessage('✓ ' + message.result);
      break;
    case 'testError':
      showMessage('✗ ' + message.error, true);
      break;
    case 'saveSuccess':
      showMessage('✓ Settings saved successfully!');
      break;
    case 'saveError':
      showMessage('✗ Failed to save: ' + message.error, true);
      break;
    case 'settingsLoaded':
      setFormData(message.settings);
      // Auto-load models for the current provider
      const settings = message.settings;
      if (settings && settings.provider) {
        autoLoadModels(settings.provider, settings.apiKey || '', settings.endpoint || '');
      }
      break;
    case 'modelsListed':
      handleModelsListed(message.models);
      showMessage('✓ Found ' + message.models.length + ' model(s)');
      break;
    case 'modelsListError':
      showMessage('✗ Failed to list models: ' + message.error, true);
      break;
  }
});

function handleModelsListed(models) {
  const provider = providerSelect.value;
  const selectEl = document.getElementById('model-' + provider + '-select');
  const inputEl = document.getElementById('model-' + provider);

  if (selectEl && models.length > 0) {
    // Populate dropdown
    selectEl.innerHTML = '<option value="">Select a model...</option>';
    models.forEach(model => {
      const option = document.createElement('option');
      option.value = model;
      option.textContent = model;
      selectEl.appendChild(option);
    });

    // Show dropdown, hide input
    selectEl.classList.remove('hidden');
    inputEl.classList.add('hidden');

    // If there's a current value, select it
    if (inputEl.value) {
      selectEl.value = inputEl.value;
    }
  }
}
