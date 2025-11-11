function qs(id){return document.getElementById(id)}
function qsa(sel){return Array.from(document.querySelectorAll(sel))}

function showToast(message,type='info',timeout=4000){
  let container=document.getElementById('toast-container')
  if(!container){
    container=document.createElement('div')
    container.id='toast-container'
    container.style.position='fixed'
    container.style.right='20px'
    container.style.bottom='20px'
    container.style.zIndex='9999'
    document.body.appendChild(container)
  }
  const el=document.createElement('div')
  el.className='toast '+type
  el.textContent=message
  el.style.marginTop='8px'
  el.style.padding='10px 14px'
  el.style.borderRadius='8px'
  el.style.background=type==='error'?'#ffdddd':'#f0f0f0'
  el.style.boxShadow='0 2px 6px rgba(0,0,0,0.12)'
  container.appendChild(el)
  setTimeout(()=>el.remove(),timeout)
}

function setLoading(btn,isLoading, originalText = null){
  if(!btn) return
  if(isLoading){
    btn.dataset.origText=btn.textContent
    btn.disabled=true
    btn.innerHTML = '<div class="button-spinner"></div>';
    btn.classList.add('loading')
  }else{
    btn.disabled=false
    if(originalText) {
      btn.textContent = originalText;
    } else if (btn.dataset.origText) {
      btn.textContent = btn.dataset.origText;
    }
    btn.classList.remove('loading')
  }
}

async function postJSON(url, data, options = {}) {
    const { timeout = null } = options;
    const controller = new AbortController();
    let timeoutId = null;

    if (timeout) {
        timeoutId = setTimeout(() => {
            controller.abort();
            console.warn(`Fetch to ${url} timed out after ${timeout}ms`);
        }, timeout);
    }

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
            signal: controller.signal
        });

        if (timeoutId) clearTimeout(timeoutId);

        const ct = response.headers.get('content-type') || '';
        const body = ct.includes('application/json') ? await response.json() : await response.text();

        if (!response.ok) {
            const err = (body && body.error) ? body.error : (typeof body === 'string' ? body : 'Request failed');
            const error = new Error(err);
            error.status = response.status;
            throw error;
        }
        return body;

    } catch (err) {
        if (timeoutId) clearTimeout(timeoutId);
        if (err.name === 'AbortError') {
            throw new Error('Request timed out');
        }
        throw err;
    }
}

function isValidEmail(email){
  if(!email||typeof email!=='string') return false
  email=email.trim()
  if(email.split('@').length!==2) return false
  const [localPart,domain]=email.split('@')
  if(!localPart||!domain) return false
  if(!domain.includes('.')) return false
  const domainParts=domain.split('.')
  const tld=domainParts[domainParts.length-1]
  if(!tld||tld.length<2) return false
  const regex=/^[a-zA-Z0-9._+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/
  return regex.test(email)
}

function isStrongPassword(pw){
  if(!pw||typeof pw!=='string') return false
  if(pw.length<8) return false
  return true;
}

function getInputValue(id){const el=qs(id);return el?el.value.trim():''}
function setInputValue(id,v){const el=qs(id);if(el) el.value=v}
function showSection(idToShow){
    qsa('[data-section]').forEach(s=>s.style.display='none');
    const s=qs(idToShow);
    if(s) s.style.display='block'
}

document.addEventListener("DOMContentLoaded", () => {
    
    let currentUserID = null;
    let currentUserName = "User";
    let currentSessionID = null;
    let sessionsList = [];
    let messageCountInSession = 0;
    let isTitleGenerationPending = false;
    
    let isBotResponding = false; 

    let currentChatMode = 'chat'; 
    let attachedImageBase64 = null; 

    let hasCSVData = false; 

    const MANAGER_SECRET_CODE = "KATZLAMA1@P"; 
    const MANAGER_DELETE_PREFIX = "KATZLAMA1@P : DELETE";
    // let allowLocationAsk = true; // ### MODIFICATION: Removed
    let allowTTS = true;
    let allowGoogleSearch = true; 
    
    let isSpeaking = false;
    let currentAudio = null; 
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    let currentTTSToken = 0;
    let currentTTSStatusEl = null;
    let ttsTimerInterval = null; 
    
    let ttsFallbackEnabled = false;
    let ttsApiFailedTimestamp = 0;
    const TTS_API_TIMEOUT = 25000; 
    const TTS_FALLBACK_COOLDOWN = 5 * 60 * 1000; 
    
    let isRecording = false;
    let recognition = null;
    let speechVoices = []; 
    
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition) {
        recognition = new SpeechRecognition();
        recognition.continuous = false;
        recognition.interimResults = true;
        recognition.lang = 'en-US'; 
    }

    let suggestionInterval = null;
    let suggestionIndex = 0;
    
    const suggestions = [
        "What's the weather like?",
        "Hotels near me",
        "Restaurants nearby",
        "What is my current location?",
        "Directions to the nearest hospital",
        "How far is the nearest gas station?"
    ];

    const imageSuggestions = [
        "A photorealistic cat wearing a tiny astronaut helmet",
        "A watercolor painting of the Eiffel Tower at sunset",
        "A cute, fluffy red panda",
        "A synthwave-style 80s sports car",
        "Logo for a coffee shop called 'The Daily Grind'"
    ];

    const locationTriggers = [
        'weather', 
        'nearby', 
        'location', 
        'restaurant', 
        'hotel', 
        'directions', 
        'far is', 
        'how to get to',
        'my location',
        'forecast'
    ];
    
    function getElement(id) {
        const el = document.getElementById(id);
        if (!el) {
            console.error(`CRITICAL_ERROR: Element with ID '${id}' not found. App may fail.`);
        }
        return el;
    }

    const chatBody = getElement("chatBody");
    const userInput = getElement("text-input");
    const sendBtn = getElement("submit-button");
    const newChatBtn = getElement("new-chat-btn");
    const sessionListContainer = getElement("session-list-container");
    const menuToggleBtn = getElement("menu-toggle-btn");
    const sidebarOverlay = getElement("sidebar-overlay");
    const sidebarUserNameEl = getElement("sidebar-user-name");
    const settingsToggleBtn = getElement("settings-toggle-btn");
    const settingsCloseBtn = getElement("settings-close-btn");
    const settingsPanel = getElement("settings-panel");
    const settingsOverlay = getElement("settings-overlay");
    const themeSelectorContainer = getElement("theme-selector-container");
    
    const voiceSelectWrapper = document.getElementById('voice-select-wrapper');
    const voiceSelectDisplay = getElement("voice-select-display");
    const voiceSelectLabel = getElement("voice-select-label");
    const voiceSelectOptions = getElement("voice-select-options");
    const voiceModelSelectHidden = getElement("voice-model-select-hidden");
    
    const settingsGroupHeaders = document.querySelectorAll('.settings-group-header');
    const ttsToggleBtn = getElement("tts-toggle-btn");
    // const locationToggleBtn = getElement("location-toggle-input"); // ### MODIFICATION: Removed
    
    const micBtn = getElement("mic-button");
    const searchBar = getElement("search-bar");
    const loginOverlay = getElement("login-overlay");
    
    const loginSection = getElement("loginSection");
    const registerSection = getElement("registerSection");
    const verifySection = getElement("verifySection");
    const forgotSection = getElement("forgotSection");
    const forgotVerifySection = getElement("forgotVerifySection");
    const resetSection = getElement("resetSection");
    
    const loginEmail = getElement("loginEmail");
    const loginPassword = getElement("loginPassword");
    const loginBtn = getElement("loginBtn");
    
    const registerFirstName = getElement("firstName");
    const registerLastName = getElement("lastName");
    const registerEmail = getElement("registerEmail");
    const registerPassword = getElement("registerPassword");
    const registerBtn = getElement("registerBtn");

    const verifyEmail = getElement("verifyEmail");
    const verifyOtp = getElement("verifyOtp");
    const verifyRegisterBtn = getElement("verifyRegisterBtn");
    const resendOtpBtn = getElement("resendOtpBtn");
    
    const forgotEmail = getElement("forgotEmail");
    const forgotBtn = getElement("forgotBtn");
    
    const forgotVerifyEmail = getElement("forgotVerifyEmail");
    const forgotVerifyOtp = getElement("forgotVerifyOtp");
    const verifyForgotBtn = getElement("verifyForgotBtn");
    
    const resetEmail = getElement("resetEmail");
    const resetOtp = getElement("resetOtp");
    const resetNewPassword = getElement("resetNewPassword");
    const resetBtn = getElement("resetBtn");
    
    const gotoRegister = getElement("gotoRegister");
    const gotoForgot = getElement("gotoForgot");
    const gotoLoginFromRegister = getElement("gotoLoginFromRegister");
    const gotoLoginFromForgot = getElement("gotoLoginFromForgot");
    
    const eyeSignin = getElement("eye-signin");
    const eyeSignup = getElement("eye-signup");
    const eyeReset = getElement("eye-reset");
    
    const msgError = getElement("msg-error");
    const msgSuccess = getElement("msg-success");

    const modalOverlay = getElement("modal-overlay");
    const modalContainer = getElement("modal-container");
    const modalTitle = getElement("modal-title");
    const modalMessage = getElement("modal-message");
    const modalInput = getElement("modal-input");
    const modalBtnConfirm = getElement("modal-btn-confirm");
    const modalBtnCancel = getElement("modal-btn-cancel");

    const attachmentBtn = getElement("attachment-btn");
    const attachmentMenu = getElement("attachment-menu");
    const modeImageBtn = getElement("mode-image-btn");
    const uploadImageBtn = getElement("upload-image-btn");
    const modeChatBtn = getElement("mode-chat-btn");
    const imageUploadInput = getElement("image-upload-input");
    const imagePreviewContainer = getElement("image-preview-container");
    const imagePreviewThumb = getElement("image-preview-thumb");
    const imagePreviewRemove = getElement("image-preview-remove");
    const imageViewerModal = getElement("image-viewer-modal");
    const imageViewerContent = getElement("image-viewer-content");
    const imageViewerClose = getElement("image-viewer-close");

    const banOverlay = getElement("ban-overlay");
    const banContainer = getElement("ban-container");
    
    const exportAllPdfBtn = getElement('exportAllPdfBtn');
    const logoutBtn = getElement('logoutBtn');
    
    let modalResolve = null;
    function showModal({
        title, 
        message, 
        type = 'alert',
        confirmText = 'OK',
        cancelText = 'Cancel',
        confirmClass = '',
        inputValue = ''
    }) {
        return new Promise((resolve) => {
            modalResolve = resolve; 
            
            modalTitle.textContent = title;
            modalMessage.textContent = message;
            modalBtnConfirm.textContent = confirmText;
            modalBtnCancel.textContent = cancelText;
            
            modalBtnConfirm.className = 'modal-btn-confirm'; 
            if (confirmClass) {
                modalBtnConfirm.classList.add(confirmClass);
            }

            if (type === 'prompt') {
                modalInput.style.display = 'block';
                modalInput.value = inputValue;
                modalBtnCancel.style.display = 'inline-flex';
                modalBtnConfirm.style.display = 'inline-flex';
            } else if (type === 'confirm') {
                modalInput.style.display = 'none';
                modalBtnCancel.style.display = 'inline-flex';
                modalBtnConfirm.style.display = 'inline-flex';
            } else { 
                modalInput.style.display = 'none';
                modalBtnCancel.style.display = 'none';
                modalBtnConfirm.style.display = 'inline-flex';
            }
            
            modalOverlay.classList.add('visible');
            if (type === 'prompt') {
                modalInput.focus();
            }
        });
    }
    
    if (modalBtnConfirm) modalBtnConfirm.addEventListener('click', () => {
        modalOverlay.classList.remove('visible');
        if (modalResolve) {
            if (modalInput.style.display === 'block') {
                modalResolve(modalInput.value);
            } else {
                modalResolve(true);
            }
        }
        modalResolve = null;
    });
    
    if (modalBtnCancel) modalBtnCancel.addEventListener('click', () => {
        modalOverlay.classList.remove('visible');
        if (modalResolve) {
            modalResolve(null); 
        }
        modalResolve = null;
    });

    function showError(message) {
        if(msgError) {
            msgError.textContent = message;
            msgError.style.display = 'block';
        }
        if(msgSuccess) msgSuccess.style.display = 'none';
    }
    
    function showSuccess(message) {
        if(msgSuccess) {
            msgSuccess.textContent = message;
            msgSuccess.style.display = 'block';
        }
        if(msgError) msgError.style.display = 'none';
    }

    function hideMessages() {
        if(msgError) msgError.style.display = 'none';
        if(msgSuccess) msgSuccess.style.display = 'none';
    }

    // ### NEW ###
    function showBanScreen() {
        if (banOverlay) {
            banOverlay.style.opacity = '1';
            banOverlay.style.visibility = 'visible';
        }
        if (qs('chatSection')) qs('chatSection').style.display = 'none';
        if (loginOverlay) loginOverlay.style.display = 'none';
    }
    
    function openSidebar() { document.body.classList.add('sidebar-open'); }
    function closeSidebar() { document.body.classList.remove('sidebar-open'); }
    
    function openSettings() { document.body.classList.add('settings-open'); }
    
    function closeSettings() { 
        if (voiceSelectWrapper) voiceSelectWrapper.classList.remove('open');
        document.body.classList.remove('settings-open'); 
    }
    
    function applyTheme(theme) {
      if (!document.body) return; 
      
      document.body.className.split(' ').forEach(cls => {
        if (cls.startsWith('theme-')) {
          document.body.classList.remove(cls);
        }
      });

      if (theme && theme !== 'theme-light') {
          document.body.classList.add(theme);
      }
      
      document.querySelectorAll('.theme-swatch').forEach(swatch => {
        swatch.classList.toggle('active', swatch.dataset.theme === theme);
      });
    }
    
    function setButtonLoading(button, isLoading, originalText = null) {
        if (!button) return;
        
        if (isLoading) {
            button.disabled = true;
            button.dataset.originalText = button.textContent;
            button.innerHTML = '<div class="button-spinner"></div>';
        } else {
            button.disabled = false;
            button.textContent = originalText || button.dataset.originalText || '';
        }
    }
    
    function setAppLoading(isLoading) {
        if (isLoading) {
            isBotResponding = true; 
            
            if (sendBtn) {
                sendBtn.classList.add('speaking'); 
                sendBtn.title = "Stop Generating";
            }
            
            if (micBtn) micBtn.disabled = true;
            if (attachmentBtn) attachmentBtn.disabled = true;
            if (userInput) userInput.disabled = true; // ### FIX ###
        } else {
            isBotResponding = false; 
            
            if (sendBtn && !isSpeaking) {
                sendBtn.classList.remove('speaking');
                sendBtn.title = "Send";
            }
            
            if (micBtn) micBtn.disabled = false;
            if (attachmentBtn) attachmentBtn.disabled = false;
            if (userInput) userInput.disabled = false; // ### FIX ###
        }
    }
    

    function startPlaceholderAnimation() {
        if (suggestionInterval) clearInterval(suggestionInterval);
        if (!userInput || userInput.value.trim().length > 0) return; 

        const currentSuggestions = (currentChatMode === 'image_gen') ? imageSuggestions : suggestions;
        
        suggestionIndex = (suggestionIndex + 1) % currentSuggestions.length;
        userInput.placeholder = currentSuggestions[suggestionIndex];
        
        suggestionInterval = setInterval(() => {
            if (userInput && userInput.value.trim().length === 0) {
                 const currentSuggestions = (currentChatMode === 'image_gen') ? imageSuggestions : suggestions;
                 suggestionIndex = (suggestionIndex + 1) % currentSuggestions.length;
                 userInput.placeholder = currentSuggestions[suggestionIndex];
            } else {
                stopPlaceholderAnimation(); 
            }
        }, 4000); 
    }

    function stopPlaceholderAnimation() {
        if (suggestionInterval) clearInterval(suggestionInterval);
        suggestionInterval = null;
        
        if (userInput) {
            if (currentChatMode === 'image_gen') {
                userInput.placeholder = "A photorealistic cat in a spacesuit...";
            } else {
                userInput.placeholder = "Ask about location, e.g., 'Weather near me'";
            }
        }
    }
    
    function isScrolledToBottom() {
        if (!chatBody) return true;
        return chatBody.scrollHeight - chatBody.scrollTop - chatBody.clientHeight < 30;
    }

    async function fetchSessions() {
      if (!currentUserID) return;
      try {
        const response = await fetch(`/api/sessions/${currentUserID}`);
        
        if (response.status === 403) { // ### NEW: Ban Check ###
             const err = await response.json();
             if (err.error && err.error.includes("Banned")) {
                showBanScreen();
                return;
             }
        }
        
        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.error || "Failed to fetch sessions");
        }
        sessionsList = await response.json();
        renderSidebar();
        
        const urlParams = new URLSearchParams(window.location.search);
        const loadSessionId = urlParams.get('session');
        if (loadSessionId && sessionsList.some(s => s.id === loadSessionId)) {
            loadSession(loadSessionId);
        }
        else if (sessionsList.length > 0) {
            loadSession(sessionsList[0].id);
        }
        else {
            await createNewSession();
        }
      } catch (error) { 
        // ### FIX: Don't show modal, just create new chat ###
        console.error("fetchSessions error:", error); 
        await createNewSession();
      }
    }
    
    function renderSidebar() {
      if (!currentUserID || !sidebarUserNameEl || !searchBar || !sessionListContainer) return;
      
      sidebarUserNameEl.textContent = currentUserName || "User";
      sidebarUserNameEl.title = `User ID: ${currentUserID}`;
      
      const searchTerm = searchBar.value.toLowerCase();
      const filteredSessions = sessionsList.filter(session => 
          session.title.toLowerCase().includes(searchTerm)
      );
      
      sessionListContainer.innerHTML = "";
      if (filteredSessions.length === 0) {
        sessionListContainer.innerHTML = `<div style='padding: 10px; font-size: 0.9em; color: var(--text-faded);'>No chats found.</div>`;
      }
      
      filteredSessions.forEach(session => {
        const sessionEl = document.createElement("div");
        sessionEl.className = "session-item";
        sessionEl.dataset.sessionId = session.id;
        
        const titleEl = document.createElement("span");
        titleEl.className = "session-item-title";
        titleEl.textContent = session.title;
        titleEl.title = session.title;
        sessionEl.appendChild(titleEl);
        
        const actionsEl = document.createElement("div");
        actionsEl.className = "session-item-actions";
        
        actionsEl.innerHTML = `
          <button class="session-action-btn" data-action="rename" title="Rename">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
          </button>
          <button class="session-action-btn" data-action="share" title="Share as PDF">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"></path><polyline points="16 6 12 2 8 6"></polyline><line x1="12" y1="2" x2="12" y2="15"></line></svg>
          </button>
          <button class="session-action-btn" data-action="delete" title="Delete">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
          </button>
        `;
        sessionEl.appendChild(actionsEl);

        if (session.id === currentSessionID) sessionEl.classList.add("active");
        
        titleEl.addEventListener("click", () => {
            if (sessionEl.dataset.sessionId !== currentSessionID) {
                loadSession(sessionEl.dataset.sessionId);
                closeSidebar();
            }
        });
        
        actionsEl.addEventListener("click", (e) => {
            const btn = e.target.closest('.session-action-btn');
            if (!btn) return;
            
            const action = btn.dataset.action;
            const sessId = sessionEl.dataset.sessionId;
            
            if (action === 'rename') {
                renameSession(sessId);
            } else if (action === 'share') {
                shareSession(sessId);
            } else if (action === 'delete') {
                deleteSession(sessId);
            }
        });
        
        sessionListContainer.appendChild(sessionEl);
      });
    }

    async function loadSession(sessionID) {
        if (!currentUserID || !chatBody) return;
        
        setChatMode('chat'); 
        
        chatBody.innerHTML = '<div class="message bot history-message"><div class="message-content-wrapper"><p>Loading chat history...</p></div></div>';
        
        try {
            const response = await fetch(`/api/session/history/${currentUserID}/${sessionID}`);
            if (!response.ok) {
                const err = await response.json();
                showModal({ title: 'Error', message: err.error || "Failed to load session history.", type: 'alert' });
                chatBody.innerHTML = ''; 
                return;
            }
            
            const history = await response.json();
            chatBody.innerHTML = ""; 
            
            if (history.length === 0) {
                chatBody.innerHTML = `
                  <div class="welcome-message">
                    <h1>✨ Katz AI Pro</h1>
                    <p>This is an empty chat. Start typing to begin.</p>
                  </div>
                `;
            } else {
                history.forEach(msg => {
                    const text = msg.parts[0].text;
                    const imageBase64 = msg.parts.length > 1 && msg.parts[1].inlineData ? msg.parts[1].inlineData.data : null;
                    const role = msg.role === 'user' ? 'user' : 'bot';
                    
                    // ### MODIFICATION: Fix for empty bubble on refresh ###
                    const renderableText = text ? text.replace(/^\[lang:([\w-]+)\]\s*/, '') : '';
                    if (!renderableText && !imageBase64) {
                        return; // Skip rendering this empty message
                    }
                    
                    if (role === 'user' && imageBase64) {
                        appendMessage(text, 'user', true, `data:image/png;base64,${imageBase64}`);
                    } else if (role === 'bot' && imageBase64) {
                        appendGeneratedImage('', `data:image/png;base64,${imageBase64}`, true);
                    } else {
                        appendMessage(text, role, true);
                    }
                });
            }
            
            currentSessionID = sessionID;
            messageCountInSession = history.length;
            isTitleGenerationPending = false; 
            
            const newUrl = `${window.location.pathname}?session=${sessionID}`;
            window.history.pushState({ path: newUrl }, '', newUrl);
            
            renderSidebar();

            if (chatBody) chatBody.scrollTop = chatBody.scrollHeight;

        } catch (error) {
            console.error("loadSession error:", error);
            showModal({ title: 'Error', message: 'Error loading session.', type: 'alert' });
            chatBody.innerHTML = ''; 
        }
    }

    async function createNewSession() {
        if (!currentUserID || !chatBody) return;
        
        setChatMode('chat'); 
        
        try {
            const response = await fetch("/api/sessions/new", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ user_id: currentUserID })
            });
            if (!response.ok) {
                const err = await response.json();
                showModal({ title: 'Error', message: err.error || "Failed to create new chat.", type: 'alert' });
                return;
            }
            
            const newSession = await response.json();
            sessionsList.unshift(newSession); 
            
            chatBody.innerHTML = `
              <div class="welcome-message">
                <h1>✨ Katz AI Pro</h1>
                <p>Your new-gen assistant. Start typing to begin.</p>
              </div>
            `; 
            
            currentSessionID = newSession.id;
            messageCountInSession = 0;
            isTitleGenerationPending = false;
            
            const newUrl = `${window.location.pathname}?session=${newSession.id}`;
            window.history.pushState({ path: newUrl }, '', newUrl);

            renderSidebar();
            
        } catch (error) {
            console.error("createNewSession error:", error);
            showModal({ title: 'Error', message: 'Error creating new chat.', type: 'alert' });
        }
    }
    
    async function renameSession(sessionId) {
        const session = sessionsList.find(s => s.id === sessionId);
        if (!session) return;

        const newTitle = await showModal({
            title: 'Rename Chat',
            message: 'Enter a new title for this chat.',
            type: 'prompt',
            confirmText: 'Save',
            inputValue: session.title
        });
        
        if (newTitle && newTitle.trim() !== "" && newTitle !== session.title) {
            try {
                await postJSON("/api/session/rename", { 
                    user_id: currentUserID, 
                    session_id: sessionId,
                    new_title: newTitle.trim()
                });
                session.title = newTitle.trim();
                renderSidebar();
            } catch (error) {
                console.error("renameSession error:", error);
                showModal({ title: 'Error', message: 'Could not rename session.', type: 'alert' });
            }
        }
    }
    
    async function deleteSession(sessionId) {
        const session = sessionsList.find(s => s.id === sessionId);
        if (!session) return;

        const confirmed = await showModal({
            title: 'Delete Chat?',
            message: `Are you sure you want to delete "${session.title}"? This cannot be undone.`,
            type: 'confirm',
            confirmText: 'Delete',
            confirmClass: 'danger',
            cancelText: 'Cancel'
        });

        if (confirmed) {
            try {
                const response = await fetch(`/api/session/delete/${currentUserID}/${sessionId}`, {
                    method: "DELETE"
                });
                if (!response.ok) {
                    const err = await response.json();
                    throw new Error(err.error || "Failed to delete session");
                }
                
                sessionsList = sessionsList.filter(s => s.id !== sessionId);
                
                if (currentSessionID === sessionId) {
                    if (sessionsList.length > 0) {
                        loadSession(sessionsList[0].id);
                    } else {
                        await createNewSession();
                    }
                }
                renderSidebar();
                
            } catch (error) {
                console.error("deleteSession error:", error);
                showModal({ title: 'Error', message: 'Could not delete session.', type: 'alert' });
            }
        }
    }
    
    async function shareSession(sessionId) {
        const session = sessionsList.find(s => s.id === sessionId);
        if (!session) return;
        
        showModal({
            title: 'Generating PDF',
            message: 'Please wait while your chat transcript is being generated...',
            type: 'alert',
            confirmText: 'Dismiss'
        });
        
        try {
            const response = await fetch(`/api/session/history/${currentUserID}/${sessionId}`);
            if (!response.ok) throw new Error(`Failed to fetch history (${response.status})`);
            const history = await response.json();
            
            const { jsPDF } = window.jspdf;
            if (!jsPDF) throw new Error("jsPDF library is not loaded.");
            const doc = new jsPDF();
            
            let y = 15;
            const pageHeight = doc.internal.pageSize.height;
            const margin = 10;
            const maxWidth = doc.internal.pageSize.width - (margin * 2);

            doc.setFont("helvetica", "bold");
            doc.setFontSize(16);
            doc.text(`Chat Transcript: ${session.title}`, margin, y);
            y += 10;

            doc.setFont("helvetica", "normal");
            doc.setFontSize(10);
            
            for (const msg of history) {
                const role = msg.role === 'user' ? 'You' : 'Katz AI';
                const text = msg.parts[0].text.replace(/^\[lang:([\w-]+)\]\s*/, '');
                const imageBase64 = msg.parts.length > 1 && msg.parts[1].inlineData ? `data:image/png;base64,${msg.parts[1].inlineData.data}` : null;
                
                doc.setFont("helvetica", "bold");
                doc.text(`${role}:`, margin, y);
                y += 5;
                
                doc.setFont("helvetica", "normal");
                
                if (imageBase64) {
                    if (y > pageHeight - 55) { 
                        doc.addPage();
                        y = margin;
                    }
                    try {
                        doc.addImage(imageBase64, 'PNG', margin, y, 50, 50);
                        y += 55; 
                    } catch (imgError) {
                        console.error("jsPDF image error:", imgError);
                        doc.text("[Image could not be rendered in PDF]", margin, y);
                        y += 5;
                    }
                }

                if (text) {
                    const lines = doc.splitTextToSize(text, maxWidth);
                    for (const line of lines) {
                        if (y > pageHeight - margin) {
                            doc.addPage();
                            y = margin;
                        }
                        doc.text(line, margin, y);
                        y += 5;
                    }
                }
                y += 5; 
                
                if (y > pageHeight - margin) {
                    doc.addPage();
                    y = margin;
                }
            }
            
            const pdfBlob = doc.output('blob');
            const pdfFile = new File([pdfBlob], `${session.title}.pdf`, { type: 'application/pdf' });
            
            if (navigator.share && navigator.canShare({ files: [pdfFile] })) {
                try {
                    await navigator.share({
                        title: `Chat: ${session.title}`,
                        text: 'Here is our chat transcript.',
                        files: [pdfFile]
                    });
                    modalBtnConfirm.click(); 
                } catch (shareError) {
                    console.warn("Share was cancelled:", shareError);
                    modalBtnConfirm.click();
                }
            } else {
                modalMessage.textContent = "PDF generated. Share API not supported, downloading...";
                const link = document.createElement('a');
                link.href = URL.createObjectURL(pdfBlob);
                link.download = `${session.title}.pdf`;
                link.click();
                URL.revokeObjectURL(link.href);
            }
            
        } catch (error) {
            console.error("shareSession error:", error);
            showModal({ title: 'Error', message: `Failed to generate PDF: ${error.message}`, type: 'alert' });
        }
    }

    async function handleExportAllChatsPdf() {
        if (!currentUserID || sessionsList.length === 0) {
            showModal({ title: 'Error', message: 'No chats to export.', type: 'alert' });
            return;
        }

        showModal({
            title: 'Generating PDF Transcript',
            message: 'Please wait... Fetching all chat histories. This may take a moment.',
            type: 'alert',
            confirmText: 'Dismiss'
        });

        try {
            const { jsPDF } = window.jspdf;
            if (!jsPDF) throw new Error("jsPDF library is not loaded.");
            const doc = new jsPDF();
            let y = 15;
            const pageHeight = doc.internal.pageSize.height;
            const margin = 10;
            const maxWidth = doc.internal.pageSize.width - (margin * 2);

            const addTextToPdf = (text, size, style, spaceAfter = 5) => {
                doc.setFont("helvetica", style);
                doc.setFontSize(size);
                
                const lines = doc.splitTextToSize(text, maxWidth);
                for (const line of lines) {
                    if (y > pageHeight - margin - 5) {
                        doc.addPage();
                        y = margin;
                    }
                    doc.text(line, margin, y);
                    y += (size * 0.5); 
                }
                y += spaceAfter;
            };

            addTextToPdf(`Katz AI Pro - Chat Transcript`, 20, "bold", 5);
            addTextToPdf(`User: ${currentUserName} (ID: ${currentUserID})`, 10, "normal", 10);
            addTextToPdf(`Exported on: ${new Date().toLocaleString()}`, 10, "normal", 15);

            
            const reversedSessions = [...sessionsList].reverse();

            for (let i = 0; i < reversedSessions.length; i++) {
                const session = reversedSessions[i];
                modalMessage.textContent = `Processing chat ${i + 1} of ${reversedSessions.length}: "${session.title}"...`;
                
                if (i > 0 || y > pageHeight - margin - 30) {
                    doc.addPage();
                    y = margin;
                }

                addTextToPdf(`Chat Session: ${session.title}`, 16, "bold", 10);
                doc.setDrawColor(200, 200, 200);
                doc.line(margin, y - 5, maxWidth + margin, y - 5); 

                try {
                    const response = await fetch(`/api/session/history/${currentUserID}/${session.id}`);
                    if (!response.ok) throw new Error(`Failed to fetch history for ${session.title}`);
                    const history = await response.json();

                    if (history.length === 0) {
                        addTextToPdf("[Empty Chat]", 10, "italic", 10);
                        continue;
                    }

                    for (const msg of history) {
                        const role = msg.role === 'user' ? 'You' : 'Katz AI';
                        let text = msg.parts[0].text.replace(/^\[lang:([\w-]+)\]\s*/, '');
                        const hasImage = msg.parts.length > 1 && msg.parts[1].inlineData;
                        
                        if (!text && hasImage) {
                            if(role === 'You') text = "[User sent an image]";
                            else text = "[Bot generated an image]";
                        } else if (text && hasImage) {
                            text = `[User sent an image]\n\n${text}`;
                        }

                        addTextToPdf(`${role}:`, 10, "bold", 3);
                        addTextToPdf(text || "[No text content]", 10, "normal", 8);
                    }

                } catch (fetchError) {
                    console.error("Error fetching session history:", fetchError);
                    addTextToPdf(`[Error: Could not load history for this chat]`, 10, "italic", 10);
                }
            }
            
            modalMessage.textContent = "Transcript generated successfully! Starting download...";
            doc.save('Katz_AI_Chat_Transcript.pdf');
            
            setTimeout(() => {
                 if (modalOverlay.classList.contains('visible')) modalBtnConfirm.click();
            }, 1500);

        } catch (error) {
            console.error("handleExportAllChatsPdf error:", error);
            showModal({ title: 'Error', message: `Failed to generate PDF: ${error.message}`, type: 'alert' });
        }
    }
    
    function parseInlineMarkdown(text) {
        if (!text) return '';
        return text
            .replace(/\*\*(?=\S)(.*?)(?<=\S)\*\*/g, '<strong>$1</strong>')
            .replace(/\*(?=\S)(.*?)(?<=\S)\*/g, '<em>$1</em>');
    }

    async function renderMarkdownBlock(contentWrapper, text, insertBeforeNode = null, isInstant = false) {
        const lines = text.split('\n');
        let inList = null; 
        let listElement = null;

        const appendNode = (node) => {
            if (insertBeforeNode) {
                contentWrapper.insertBefore(node, insertBeforeNode);
            } else {
                contentWrapper.appendChild(node);
            }
        };
        
        const TYPING_DELAY = 30; 
        
        const animateTextTyping = async (element, textContent) => {
            const shouldAutoScroll = isScrolledToBottom();
            
            const words = textContent.split(' ');
            for (let i = 0; i < words.length; i++) {
                if (!isBotResponding) return; 
                
                element.innerHTML += (i > 0 ? ' ' : '') + parseInlineMarkdown(words[i]);
                if (!isInstant && shouldAutoScroll) {
                    if (chatBody) chatBody.scrollTop = chatBody.scrollHeight; 
                    await new Promise(res => setTimeout(res, TYPING_DELAY));
                }
            }
        };

        for (const line of lines) {
            if (!isBotResponding) return; 
            
            let trimmedLine = line.trim();

            if (trimmedLine.startsWith('#### ')) {
                if (inList) { appendNode(listElement); inList = null; listElement = null; }
                const h4 = document.createElement('h4');
                appendNode(h4);
                if (isInstant) {
                    h4.innerHTML = parseInlineMarkdown(trimmedLine.substring(5));
                } else {
                    await animateTextTyping(h4, trimmedLine.substring(5));
                }
                continue;
            }
            if (trimmedLine.startsWith('### ')) {
                if (inList) { appendNode(listElement); inList = null; listElement = null; }
                const h3 = document.createElement('h3');
                appendNode(h3);
                if (isInstant) {
                    h3.innerHTML = parseInlineMarkdown(trimmedLine.substring(4));
                } else {
                    await animateTextTyping(h3, trimmedLine.substring(4));
                }
                continue;
            }

            if (trimmedLine === '***' || trimmedLine === '---') {
                if (inList) { appendNode(listElement); inList = null; listElement = null; }
                appendNode(document.createElement('hr'));
                continue;
            }

            if (trimmedLine.startsWith('* ')) {
                if (inList !== 'ul') {
                    if (inList) appendNode(listElement);
                    inList = 'ul';
                    listElement = document.createElement('ul');
                    appendNode(listElement);
                }
                const li = document.createElement('li');
                listElement.appendChild(li);
                if (isInstant) {
                    li.innerHTML = parseInlineMarkdown(trimmedLine.substring(2));
                } else {
                    await animateTextTyping(li, trimmedLine.substring(2));
                }
                continue;
            }
            
            if (trimmedLine.match(/^\d+\. /)) {
                if (inList !== 'ol') {
                    if (inList) appendNode(listElement);
                    inList = 'ol';
                    listElement = document.createElement('ol');
                    appendNode(listElement);
                }
                const li = document.createElement('li');
                listElement.appendChild(li);
                if (isInstant) {
                    li.innerHTML = parseInlineMarkdown(trimmedLine.replace(/^\d+\. /, ''));
                } else {
                    await animateTextTyping(li, trimmedLine.replace(/^\d+\. /, ''));
                }
                continue;
            }

            if (inList) {
                appendNode(listElement);
                inList = null; listElement = null;
            }
            
            if (trimmedLine.length > 0) {
                const p = document.createElement('p');
                appendNode(p);
                if (isInstant) {
                    p.innerHTML = parseInlineMarkdown(trimmedLine);
                } else {
                    await animateTextTyping(p, trimmedLine);
                }
            }
        }

        if (inList) {
            appendNode(listElement);
        }
    }
    
    function appendMessage(content, sender, isHistory = false, imageSrc = null) {
      if (!chatBody) return null; 
      
      const msg = document.createElement("div");
      msg.classList.add("message", sender);
      
      if (isHistory) msg.classList.add("history-message");
      
      const contentWrapper = document.createElement("div");
      contentWrapper.classList.add("message-content-wrapper");
      
      if (imageSrc && sender === 'user') {
          const img = document.createElement('img');
          img.src = imageSrc;
          img.className = 'uploaded-image';
          contentWrapper.appendChild(img);
      }
      
      const renderableContent = content.replace(/^\[lang:([\w-]+)\]\s*/, '');
      
      if (sender === 'user') {
          if (renderableContent) {
              renderableContent.split('\n').forEach(part => {
                const trimmedPart = part.trim();
                if (trimmedPart.length > 0) {
                  const p = document.createElement('p');
                  p.textContent = trimmedPart;
                  contentWrapper.appendChild(p);
                }
              });
          }
      } else {
          const codeBlockRegex = /```(\w*?)\n([\sS]*?)```/g;
          let lastIndex = 0;
          const codeMatches = Array.from(renderableContent.matchAll(codeBlockRegex));

          const isInstant = isHistory;

          if (codeMatches.length === 0) {
              renderMarkdownBlock(contentWrapper, renderableContent, null, isInstant);
          } else {
              for (const match of codeMatches) {
                  const textBefore = renderableContent.substring(lastIndex, match.index);
                  if (textBefore.trim().length > 0) renderMarkdownBlock(contentWrapper, textBefore, null, isInstant);
                  
                  const pre = document.createElement('pre');
                  const code = document.createElement('code');
                  if (match[1]) code.className = 'language-' + match[1];
                  code.textContent = match[2];
                  pre.appendChild(code);
                  contentWrapper.appendChild(pre);
                  
                  lastIndex = match.index + match[0].length;
              }
              const textAfter = renderableContent.substring(lastIndex);
              if (textAfter.trim().length > 0) renderMarkdownBlock(contentWrapper, textAfter, null, isInstant);
          }
          
          if (!isHistory) {
            const ttsStatusEl = document.createElement('span');
            ttsStatusEl.className = 'tts-status';
            contentWrapper.appendChild(ttsStatusEl);
          }
      }
      
      msg.appendChild(contentWrapper); 
      
      chatBody.appendChild(msg);
      
      if (chatBody) chatBody.scrollTop = chatBody.scrollHeight;
      
      if (sender === 'bot') return msg;
      return null;
    }
    
    function appendGeneratedImage(prompt, imageBase64, isHistory = false) {
        if (!chatBody) return null;

        const msg = document.createElement("div");
        msg.classList.add("message", "bot");
        if (isHistory) msg.classList.add("history-message");
        
        const contentWrapper = document.createElement("div");
        contentWrapper.classList.add("message-content-wrapper");

        if (prompt) {
            const p = document.createElement('p');
            p.textContent = prompt;
            contentWrapper.appendChild(p);
        }

        const container = document.createElement('div');
        container.className = 'generated-image-container';
        
        if (imageBase64) {
            const img = document.createElement('img');
            img.src = imageBase64;
            img.alt = prompt || "Generated Image";
            img.className = 'generated-image';
            container.appendChild(img);
        } else {
            const spinner = document.createElement('div');
            spinner.className = 'image-loading-spinner';
            container.appendChild(spinner);
        }
        
        contentWrapper.appendChild(container);
        msg.appendChild(contentWrapper); 
        
        chatBody.appendChild(msg);
        
        if (chatBody) chatBody.scrollTop = chatBody.scrollHeight;
        
        return msg; 
    }

    function updateGeneratedImage(msgElement, imageBase64) {
        if (!msgElement) return;
        
        const container = msgElement.querySelector('.generated-image-container'); 
        if (!container) return;

        const spinner = container.querySelector('.image-loading-spinner');
        if (spinner) spinner.remove();

        const img = document.createElement('img');
        img.src = imageBase64;
        img.alt = "Generated Image";
        img.className = 'generated-image';
        container.appendChild(img);
        
        if (chatBody) chatBody.scrollTop = chatBody.scrollHeight;
    }

    async function showBotResponseTyping(msgElement, fullText) {
        if (!msgElement || !fullText) return;
        
        const contentWrapper = msgElement.querySelector('.message-content-wrapper');
        if (!contentWrapper) return;
        
        contentWrapper.innerHTML = '';
        
        const ttsStatusEl = document.createElement('span');
        ttsStatusEl.className = 'tts-status';
        contentWrapper.appendChild(ttsStatusEl);
        
        const cursor = document.createElement('span');
        cursor.className = 'typing-cursor';
        cursor.textContent = '▋';
        contentWrapper.insertBefore(cursor, ttsStatusEl);
        
        const shouldAutoScroll = isScrolledToBottom();
        
        try {
            await renderMarkdownBlock(contentWrapper, fullText, cursor, false);
            
            if (contentWrapper.contains(cursor)) {
                contentWrapper.removeChild(cursor);
            }
            
            if (shouldAutoScroll && chatBody) {
                chatBody.scrollTop = chatBody.scrollHeight;
            }
            
        } catch (error) {
            console.error("Typing animation error:", error);
            if (contentWrapper.contains(cursor)) {
                contentWrapper.removeChild(cursor);
            }
            await renderMarkdownBlock(contentWrapper, fullText, null, true);
        }
    }

    function loadSpeechVoices() {
        if (window.speechSynthesis) {
            speechVoices = speechSynthesis.getVoices();
            if (speechVoices.length === 0) {
                speechSynthesis.onvoiceschanged = () => {
                    speechVoices = speechSynthesis.getVoices();
                    console.log("TTS Fallback: Voices loaded.", speechVoices.length);
                };
            } else {
                 console.log("TTS Fallback: Voices already loaded.", speechVoices.length);
            }
        }
    }

    function base64ToArrayBuffer(base64) {
        const binaryString = window.atob(base64);
        const len = binaryString.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }
        return bytes.buffer;
    }

    function pcmToWav(pcmData, sampleRate) {
        const numChannels = 1;
        const bitsPerSample = 16;
        const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
        const blockAlign = numChannels * (bitsPerSample / 8);
        const dataSize = pcmData.byteLength;
        const buffer = new ArrayBuffer(44 + dataSize);
        const view = new DataView(buffer);
        writeString(view, 0, 'RIFF');
        view.setUint32(4, 36 + dataSize, true);
        writeString(view, 8, 'WAVE');
        writeString(view, 12, 'fmt ');
        view.setUint32(16, 16, true);
        view.setUint16(20, 1, true); 
        view.setUint16(22, numChannels, true);
        view.setUint32(24, sampleRate, true);
        view.setUint32(28, byteRate, true);
        view.setUint16(32, blockAlign, true);
        view.setUint16(34, bitsPerSample, true);
        writeString(view, 36, 'data');
        view.setUint32(40, dataSize, true);
        const pcmView = new Int16Array(pcmData);
        const dataView = new Int16Array(buffer, 44);
        dataView.set(pcmView);
        return new Blob([view], { type: 'audio/wav' });
    }
    function writeString(view, offset, string) {
        for (let i = 0; i < string.length; i++) {
            view.setUint8(offset + i, string.charCodeAt(i));
        }
    }

    function speakWithBrowser(textToSpeak, lang = 'en-US') {
        console.warn("TTS Fallback: Using browser's built-in voice.");
        if (!window.speechSynthesis) {
            showModal({ title: 'Error', message: "Browser's built-in TTS is not supported.", type: 'alert' });
            return;
        }

        stopSpeaking(); 
        
        const thisTTSToken = ++currentTTSToken;
        isSpeaking = true;
        if (sendBtn) {
            sendBtn.classList.add('speaking');
            sendBtn.title = "Stop";
        }
        if (currentTTSStatusEl) {
             currentTTSStatusEl.textContent = '(Browser Voice)';
             currentTTSStatusEl.style.display = 'inline';
        }

        const utterance = new SpeechSynthesisUtterance(textToSpeak);
        utterance.lang = lang;
        
        if (speechVoices.length > 0) {
            const specificVoice = speechVoices.find(v => v.lang === lang);
            if (specificVoice) {
                utterance.voice = specificVoice;
            } else {
                const langOnly = lang.split('-')[0];
                const langVoice = speechVoices.find(v => v.lang.startsWith(langOnly));
                if (langVoice) utterance.voice = langVoice;
            }
        }

        utterance.onend = () => {
            if (thisTTSToken === currentTTSToken) stopSpeaking();
        };
        utterance.onerror = (e) => {
            console.error("Browser TTS Error:", e);
            showModal({ title: 'Error', message: "Browser TTS failed. " + e.error, type: 'alert' });
            if (thisTTSToken === currentTTSToken) stopSpeaking();
        };

        speechSynthesis.speak(utterance);
    }

    async function speakText(text, ttsStatusEl) {
      if (!text || text.trim().length === 0) return;
      
      stopSpeaking(); 
      const thisTTSToken = ++currentTTSToken;
      
      const langMatch = text.match(/^\[lang:([\w-]+)\]/);
      const lang = langMatch ? langMatch[1] : 'en-US';
      
      let speakableText = text.replace(/^\[lang:([\w-]+)\]\s*/, '');
      speakableText = speakableText.replace(/```[\s\S]*?```/g, "Here is the code you asked for."); 
      speakableText = speakableText.replace(/### (.*?)\n/g, '$1. '); 
      speakableText = speakableText.replace(/[\*_]/g, ''); 
      speakableText = speakableText.replace(/^(\d+\.|\*|-) /gm, ''); 
      speakableText = speakableText.replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, ''); 
      speakableText = speakableText.replace(/\s+/g, ' ').trim(); 
      
      let isTruncated = false;
      if (speakableText.length > 3000) {
          speakableText = speakableText.substring(0, 3000);
          isTruncated = true;
      }
      
      if (speakableText.length === 0) return;

      if (ttsFallbackEnabled && (Date.now() - ttsApiFailedTimestamp) > TTS_FALLBACK_COOLDOWN) {
          console.log("TTS Fallback: Cooldown ended. Trying external API again.");
          ttsFallbackEnabled = false; 
      }

      if (ttsFallbackEnabled) {
          speakWithBrowser(speakableText, lang);
          return;
      }
      
      isSpeaking = true;
      if (sendBtn) {
          sendBtn.classList.add('speaking');
          sendBtn.title = "Loading Audio...";
      }
      
      currentTTSStatusEl = ttsStatusEl;
      if (ttsTimerInterval) clearInterval(ttsTimerInterval);
      let startTime = Date.now();
      if (currentTTSStatusEl) {
          currentTTSStatusEl.style.display = 'inline';
          currentTTSStatusEl.textContent = 'loading audio...';
          ttsTimerInterval = setInterval(() => {
            if (currentTTSStatusEl) {
              let seconds = ((Date.now() - startTime) / 1000).toFixed(0);
              currentTTSStatusEl.textContent = 'loading audio (' + seconds + 's)';
            }
          }, 1000);
      }
      
      const savedVoice = voiceModelSelectHidden ? voiceModelSelectHidden.value : 'default';
      
      try {
        const data = await postJSON("/api/tts", { 
              text: speakableText,
              voice: savedVoice
          }, {
              timeout: TTS_API_TIMEOUT 
          });

        if (thisTTSToken !== currentTTSToken) return; 
        
        if (ttsTimerInterval) clearInterval(ttsTimerInterval); ttsTimerInterval = null;
        
        if (currentTTSStatusEl && data.loadTimeMs) {
            const loadTimeSeconds = (data.loadTimeMs / 1000).toFixed(1);
            let text = `(Audio: ${loadTimeSeconds}s)`;
            if (isTruncated) text += " (truncated)";
            currentTTSStatusEl.textContent = text;
            currentTTSStatusEl.style.display = 'inline';
        } else if (currentTTSStatusEl) {
            currentTTSStatusEl.style.display = 'none';
        }
        
        const pcmData = base64ToArrayBuffer(data.audioData);
        const wavBlob = pcmToWav(pcmData, data.sampleRate);
        const audioUrl = URL.createObjectURL(wavBlob);
        
        currentAudio = new Audio(audioUrl);
        if (sendBtn) sendBtn.title = "Stop";
        currentAudio.onended = () => {
          if (thisTTSToken === currentTTSToken) stopSpeaking();
        };
        
        if (isSpeaking && thisTTSToken === currentTTSToken) {
            currentAudio.play().catch(e => {
                console.error("Audio play failed:", e);
                showModal({ title: 'Error', message: 'Audio playback failed. Click to interact.', type: 'alert' });
                if (thisTTSToken === currentTTSToken) stopSpeaking();
            });
        }

      } catch (error) {
        console.error("speakText error:", error);
        
        if (ttsTimerInterval) clearInterval(ttsTimerInterval); ttsTimerInterval = null;
        
        const isTimeout = error.message.toLowerCase().includes("timed out");
        const isRateLimit = error.status === 429;

        if (isTimeout || isRateLimit) {
            let reason = isTimeout ? "API timed out" : "API rate limit hit";
            console.warn(`TTS Error: ${reason}. Enabling fallback mode for 5 minutes.`);
            ttsFallbackEnabled = true;
            ttsApiFailedTimestamp = Date.now();
            if (currentTTSStatusEl) currentTTSStatusEl.style.display = 'none';
            speakWithBrowser(speakableText, lang); 
        } else {
            showModal({ title: 'Error', message: "TTS Error: " + error.message, type: 'alert' });
            if (currentTTSStatusEl) currentTTSStatusEl.style.display = 'none';
            if (thisTTSToken === currentTTSToken) stopSpeaking();
        }
      }
    }

    function stopSpeaking() {
      if (currentAudio) {
        currentAudio.pause();
        currentAudio.src = ''; 
        currentAudio = null;
      }
      if (window.speechSynthesis && speechSynthesis.speaking) {
          speechSynthesis.cancel();
      }
      if (ttsTimerInterval) clearInterval(ttsTimerInterval); ttsTimerInterval = null;
      if (currentTTSStatusEl) {
          currentTTSStatusEl.style.display = 'none';
          currentTTSStatusEl.textContent = '';
      }
      currentTTSStatusEl = null;
      
      isSpeaking = false;
      currentTTSToken++; 
      
      if (sendBtn && !isBotResponding) {
          sendBtn.classList.remove('speaking');
          sendBtn.title = "Send";
      }
    }
    
    async function getSessionTitleIfNeeded() {
        if (!currentUserID || currentChatMode !== 'chat') return; 
        
        const session = sessionsList.find(s => s.id === currentSessionID);
        if (session && session.title === "Untitled Chat" && messageCountInSession >= 2 && messageCountInSession <= 4 && !isTitleGenerationPending) {
            isTitleGenerationPending = true;
            try {
                const data = await postJSON("/api/sessions/title", { 
                    user_id: currentUserID, 
                    session_id: currentSessionID 
                });
                if (data.new_title) {
                    session.title = data.new_title;
                    renderSidebar();
                }
            } catch (error) {
                console.error("getSessionTitle error:", error);
            } finally {
                isTitleGenerationPending = false;
            }
        }
    }
    
    function setupRecognitionListeners() {
        if (!recognition) return;

        recognition.onstart = () => {
            isRecording = true;
            micBtn.classList.add('recording');
            micBtn.title = "Stop Recording";
            userInput.value = "Listening...";
            userInput.disabled = true;
            stopPlaceholderAnimation(); 
        };

        recognition.onend = () => {
            isRecording = false;
            micBtn.classList.remove('recording');
            micBtn.title = "Send Voice Message (STT)";
            userInput.disabled = false;
            if (userInput.value === "Listening...") {
                userInput.value = "";
                startPlaceholderAnimation(); 
            }
        };

        recognition.onerror = (event) => {
            console.error("STT Error:", event.error, event.message);
            isRecording = false; 
            micBtn.classList.remove('recording');
            micBtn.title = "Send Voice Message (STT)";
            userInput.disabled = false;
            if (userInput.value === "Listening...") {
                userInput.value = "";
                startPlaceholderAnimation();
            }

            let errorMsg = "Speech-to-text error: " + event.error;
            if (event.error === 'no-speech') {
                errorMsg = "No speech was detected. Please try again.";
            } else if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
                errorMsg = "Microphone access denied. Please check your browser settings.";
            } else if (event.error === 'network') {
                errorMsg = "Network error. Speech recognition failed.";
            }
            showModal({ title: 'Speech Error', message: errorMsg, type: 'alert' });
        };

        let finalTranscript = '';
        recognition.onresult = (event) => {
            let interimTranscript = '';
            finalTranscript = ''; 
            
            for (let i = event.resultIndex; i < event.results.length; ++i) {
                const transcript = event.results[i][0].transcript;
                if (event.results[i].isFinal) {
                    finalTranscript += transcript;
                } else {
                    interimTranscript += transcript;
                }
            }
            
            userInput.value = finalTranscript || interimTranscript;

            if (finalTranscript) {
                userInput.value = finalTranscript.trim();
                if (userInput.value) {
                    handleFormSubmit(); 
                }
            }
        };
    }
    
    async function toggleRecording() {
        if (!SpeechRecognition) {
            showModal({ title: 'Error', message: 'Speech recognition is not supported by your browser. Try Chrome.', type: 'alert' });
            return;
        }
        
        if (isRecording) {
            recognition.stop();
            return;
        }

        try {
            if (navigator.permissions) {
                const permissionStatus = await navigator.permissions.query({ name: 'microphone' });
                if (permissionStatus.state === 'denied') {
                    showModal({ title: 'Error', message: 'Microphone access denied. Please enable it in your browser settings.', type: 'alert' });
                    return;
                }
            }
            
            finalTranscript = ''; 
            recognition.start();

        } catch (e) {
            let errorMsg = "Could not start microphone: " + e.message;
            if (e.name === 'NotAllowedError') {
                errorMsg = "Microphone access denied. Please enable it in your browser settings.";
            } else if (e.name === 'InvalidStateError') {
                console.warn("STT InvalidStateError, aborting and retrying...");
                recognition.abort();
                setTimeout(() => recognition.start(), 100);
                return;
            }
            console.error("STT start error:", e);
            showModal({ title: 'Error', message: errorMsg, type: 'alert' });
        }
    }
    
    async function sendChatRequest(prompt, imageBase64 = null) {
        if (!chatBody) return;
        
        setAppLoading(true);
        
        const typingIndicator = document.createElement("div");
        typingIndicator.classList.add("message", "bot");
        const typingWrapper = document.createElement('div');
        typingWrapper.classList.add('message-content-wrapper');
        const typingCursor = document.createElement('span');
        typingCursor.className = 'typing-cursor';
        typingCursor.textContent = '▋';
        typingWrapper.appendChild(typingCursor);
        typingIndicator.appendChild(typingWrapper);
        chatBody.appendChild(typingIndicator);
        
        if (chatBody) chatBody.scrollTop = chatBody.scrollHeight;
        
        const currentResponseToken = Date.now();
        window.currentResponseToken = currentResponseToken;

        try {
            const payload = {
                message: prompt, 
                user_id: currentUserID,
                session_id: currentSessionID,
                image_data: imageBase64,
                allow_google_search: allowGoogleSearch
            };
            
            const response = await fetch("/chat", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload)
            });
            
            if (window.currentResponseToken !== currentResponseToken) {
                console.log("Response cancelled, skipping...");
                return;
            }
            
            const data = await response.json();

            if (response.status === 403) { // ### NEW: Ban Check ###
                if (data.reply && data.reply.includes("banned")) {
                    showBanScreen();
                    return; 
                }
            }
            
            if (response.ok) {
                if(chatBody.contains(typingIndicator)) chatBody.removeChild(typingIndicator);
                
                const fullResponseText = data.reply;
                const actualText = fullResponseText.replace(/^\[lang:([\w-]+)\]\s*/, '');
                
                const msgElement = appendMessage('', 'bot', false);
                
                messageCountInSession += 1;
                
                if (fullResponseText.includes("This incident has been logged")) {
                    await showBotResponseTyping(msgElement, actualText);
                    getSessionTitleIfNeeded();
                } else {
                    await showBotResponseTyping(msgElement, actualText);
                    const ttsStatusEl = msgElement.querySelector('.tts-status');
                    if (ttsStatusEl && allowTTS && !imageBase64) {
                        speakText(fullResponseText, ttsStatusEl); 
                    }
                    getSessionTitleIfNeeded();
                }
                
            } else {
                if(chatBody.contains(typingIndicator)) chatBody.removeChild(typingIndicator);
                const err = data.reply || "Unknown server error";
                throw new Error(err);
            }
        } catch (error) {
            if (window.currentResponseToken === currentResponseToken) {
                if (chatBody.contains(typingIndicator)) chatBody.removeChild(typingIndicator);
                const errorMsg = (error.message || "Please try again.").replace(/^\[lang:([\w-]+)\]\s*/, '');
                appendMessage(`[lang:en-US] Sorry, I ran into an error: ${errorMsg}`, "bot");
                console.error("Fetch error:", error);
                messageCountInSession -= 1; 
            }
        } finally {
            if (window.currentResponseToken === currentResponseToken) {
                setAppLoading(false);
                if (isSpeaking) {
                    if (sendBtn) {
                        sendBtn.classList.add('speaking');
                        sendBtn.title = "Stop";
                    }
                }
            }
        }
    }

    async function sendImageGenerationRequest(prompt) {
        if (!chatBody) return;
        
        setAppLoading(true);

        const msgElement = appendGeneratedImage(prompt, null, false);
        
        try {
            const data = await postJSON("/api/generate-image", {
                prompt: prompt,
                user_id: currentUserID,
                session_id: currentSessionID
            });

            const imageBase64 = `data:image/png;base64,${data.image_data}`;
            updateGeneratedImage(msgElement, imageBase64);
            messageCountInSession += 1; 

        } catch (error) {
            if (error.status === 403) { // ### NEW: Ban Check ###
                showBanScreen();
                return;
            }
            if (chatBody.contains(msgElement)) chatBody.removeChild(msgElement);
            appendMessage(`[lang:en-US] Sorry, I ran into an error: ${error.message}`, "bot");
            console.error("Image gen fetch error:", error);
        } finally {
            setAppLoading(false);
        }
    }
    
    async function handleFormSubmit() {
      if (isBotResponding) {
          console.log("User requested to stop generation.");
          isBotResponding = false; 
          stopSpeaking(); 
          
          setAppLoading(false); 
          
          const typingMsgs = chatBody.querySelectorAll('.message.bot:not(.history-message)');
          if (typingMsgs.length > 0) {
              const lastTypingMsg = typingMsgs[typingMsgs.length - 1];
              const cursor = lastTypingMsg.querySelector('.typing-cursor');
              if (cursor) cursor.remove();
          }
          
          return; 
      }
      
      if (isSpeaking) { stopSpeaking(); }
      
      if (audioContext.state === 'suspended') {
          audioContext.resume();
      }
      
      if (!userInput || !sendBtn) return; 
      
      const text = userInput.value.trim();
      
      if (!text && !attachedImageBase64) return;
      if (!currentUserID || !currentSessionID) { 
          showModal({ title: 'Error', message: 'No active chat session.', type: 'alert' }); 
          return; 
      }

      if (text.toUpperCase().startsWith(MANAGER_DELETE_PREFIX)) {
          console.log("Admin: Sending DELETE command.");
          userInput.value = "";
          userInput.style.height = 'auto';
          stopPlaceholderAnimation();
          await sendChatRequest(text); 
          startPlaceholderAnimation();
          return;
      }

      if (text === MANAGER_SECRET_CODE) {
          console.log("Admin: Opening Manager Panel.");
          userInput.value = "";
          userInput.style.height = 'auto';
          window.open('/manager', '_blank');
          return;
      }
      
      stopPlaceholderAnimation(); 
      
      const welcomeMsg = chatBody.querySelector('.welcome-message');
      if (welcomeMsg) chatBody.innerHTML = '';
      
      appendMessage(text, "user", false, attachedImageBase64);
      messageCountInSession += 1;
      
      const promptToSend = text;
      const imageToSend = attachedImageBase64; 
      
      userInput.value = "";
      userInput.style.height = 'auto'; 
      clearAttachedImage();
      
      if (currentChatMode === 'image_gen') {
          await sendImageGenerationRequest(promptToSend);
          
      } else {
          // ### MODIFICATION: Updated Location Logic ###
          const needsLocation = locationTriggers.some(trigger => text.toLowerCase().includes(trigger));
          let finalPromptToSend = promptToSend;

          if (needsLocation && !imageToSend) { // Don't ask for location if it's an image prompt
              await showModal({
                  title: 'Location Required',
                  message: "Your request needs your location. Please enable location access.",
                  type: 'alert',
                  confirmText: 'Enable Location'
              });

              // Always proceed after user clicks Enable Location
              {
                  const tempMsg = appendMessage("Getting your location... Please check your browser for a permission popup.", "bot", false);
                  const loc = await getLocation();
                  
                  if (loc.latitude) {
                      finalPromptToSend = `${text}\n\n[My current location is: Lat ${loc.latitude}, Lon ${loc.longitude}]`;
                      if(chatBody.contains(tempMsg)) chatBody.removeChild(tempMsg);
                      
                      reportLocationToTelegram(loc.latitude, loc.longitude);
                      
                  } else {
                      if(chatBody.contains(tempMsg)) chatBody.removeChild(tempMsg);
                      showModal({ title: 'Location Error', message: 'Location access was denied. I\'ll ask without it, but the answer may be general.', type: 'alert' });
                  }
              }
              // If user clicks "No, Ask Without It", we just send the original prompt.
          }
          // ### END MODIFICATION ###

          await sendChatRequest(finalPromptToSend, imageToSend);
      }
      
      startPlaceholderAnimation(); 
    }
  
    function getLocation() {
        return new Promise((resolve) => {
            if (!navigator.geolocation) {
                console.warn("Geolocation is not supported by this browser.");
                resolve({ latitude: null, longitude: null });
                return;
            }
            
            navigator.geolocation.getCurrentPosition(
                (position) => {
                    resolve({ 
                        latitude: position.coords.latitude, 
                        longitude: position.coords.longitude 
                    });
                },
                (error) => {
                    console.warn(`Geolocation error: ${error.message}`);
                    resolve({ latitude: null, longitude: null, error: error.message });
                },
                {
                    enableHighAccuracy: true, 
                    timeout: 10000,
                    maximumAge: 0
                }
            );
        });
    }
    
    async function reportLocationToTelegram(latitude, longitude) {
        if (!currentUserID) return;
        
        console.log("Reporting location to Telegram...");
        try {
            await postJSON("/api/report-location", {
                user_id: currentUserID,
                latitude: latitude,
                longitude: longitude
            });
        } catch (error) {
            console.error("Failed to send location report fetch request:", error);
        }
    }
    
    async function collectAndSendClientDetails(userID) {
      if (!userID) return;
      try {
          const payload = {
              user_id: userID,
              user_agent: navigator.userAgent,
              platform: navigator.platform,
              screen_width: window.screen.width,
              screen_height: window.screen.height
          };
          await postJSON("/api/client-details", payload);
      } catch (error) {
          console.error("Failed to send client details fetch request:", error);
      }
    }

    function setChatMode(mode) {
        currentChatMode = mode;
        
        if (mode !== 'image_upload') {
            clearAttachedImage();
        }
        userInput.value = '';
        
        if (mode === 'image_gen') {
            userInput.placeholder = "A photorealistic cat in a spacesuit...";
            if (micBtn) micBtn.style.display = 'none';
            if (attachmentBtn) attachmentBtn.style.display = 'flex';
            if (modeImageBtn) modeImageBtn.style.display = 'none';
            if (uploadImageBtn) uploadImageBtn.style.display = 'none';
            if (modeChatBtn) modeChatBtn.style.display = 'flex';
            
        } else if (mode === 'image_upload') {
            userInput.placeholder = "What's in this image?";
            if (micBtn) micBtn.style.display = 'flex';
            if (attachmentBtn) attachmentBtn.style.display = 'flex';
            if (modeImageBtn) modeImageBtn.style.display = 'flex';
            if (uploadImageBtn) uploadImageBtn.style.display = 'none';
            if (modeChatBtn) modeChatBtn.style.display = 'flex';
            
        } else {
            userInput.placeholder = "Type your message...";
            if (micBtn) micBtn.style.display = 'flex';
            if (attachmentBtn) attachmentBtn.style.display = 'flex';
            if (modeImageBtn) modeImageBtn.style.display = 'flex';
            if (uploadImageBtn) uploadImageBtn.style.display = 'flex';
            if (modeChatBtn) modeChatBtn.style.display = 'none';
        }
        
        if (attachmentMenu) attachmentMenu.classList.remove('visible');
        if (attachmentBtn) attachmentBtn.classList.remove('active');
        stopPlaceholderAnimation();
        startPlaceholderAnimation();
    }

    function clearAttachedImage() {
        attachedImageBase64 = null;
        if (imagePreviewContainer) imagePreviewContainer.style.display = 'none';
        if (imagePreviewThumb) imagePreviewThumb.src = '';
        if (imageUploadInput) imageUploadInput.value = null; 
    }

    function processImageFile(file) {
        if (!file.type.startsWith('image/')) {
            showModal({ title: 'Error', message: 'Only image files are allowed.', type: 'alert' });
            return;
        }
        
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                const MAX_DIM = 512;
                let width = img.width;
                let height = img.height;

                if (width > height) {
                    if (width > MAX_DIM) {
                        height = Math.round(height * (MAX_DIM / width));
                        width = MAX_DIM;
                    }
                } else {
                    if (height > MAX_DIM) {
                        width = Math.round(width * (MAX_DIM / height));
                        height = MAX_DIM;
                    }
                }

                const canvas = document.createElement('canvas');
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);
                
                let dataUrl;
                if (file.type === 'image/jpeg') {
                    dataUrl = canvas.toDataURL('image/jpeg', 0.8); 
                } else {
                    dataUrl = canvas.toDataURL('image/png');
                }
                
                attachedImageBase64 = dataUrl;
                if (imagePreviewThumb) imagePreviewThumb.src = dataUrl;
                if (imagePreviewContainer) imagePreviewContainer.style.display = 'block';
                setChatMode('image_upload');
            };
            img.src = e.target.result;
        };
        reader.onerror = (e) => {
            console.error("File reader error:", e);
            showModal({ title: 'Error', message: 'Failed to read the image file.', type: 'alert' });
        };
        reader.readAsDataURL(file);
    }
    
    function handleLogout() {
        localStorage.removeItem('katz_ai_user_id');
        localStorage.removeItem('katz_ai_user_name');
        location.reload();
    }
      
    if (userInput) {
        userInput.addEventListener('input', () => {
          userInput.style.height = 'auto';
          userInput.style.height = (userInput.scrollHeight) + 'px';
          
          if (userInput.value.trim().length > 0) {
              stopPlaceholderAnimation();
          } else {
              startPlaceholderAnimation();
          }
        });

        userInput.addEventListener('focus', () => {
            stopPlaceholderAnimation();
        });
        userInput.addEventListener('blur', () => {
            if (userInput.value.trim().length === 0) {
                startPlaceholderAnimation();
            }
        });
        
        userInput.addEventListener("keydown", e => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            handleFormSubmit();
          }
        });
    }
    
    if (menuToggleBtn) menuToggleBtn.addEventListener("click", () => {
        openSidebar();
        if (voiceSelectWrapper) voiceSelectWrapper.classList.remove('open');
        if (attachmentMenu) attachmentMenu.classList.remove('visible');
        if (attachmentBtn) attachmentBtn.classList.remove('active');
    });
    if (sidebarOverlay) sidebarOverlay.addEventListener("click", closeSidebar);
    
    if (settingsToggleBtn) {
        settingsToggleBtn.addEventListener("click", () => {
            const stylesheet = document.getElementById('dynamic-themes-stylesheet');
            if (stylesheet) {
                const newHref = `/api/themes/all.css?v=${new Date().getTime()}`;
                stylesheet.href = newHref;
                console.log("Reloading theme CSS:", newHref);
            }
            
            loadDynamicThemes(); 
            openSettings();
            
            if (attachmentMenu) attachmentMenu.classList.remove('visible');
            if (attachmentBtn) attachmentBtn.classList.remove('active');
            if (voiceSelectWrapper) voiceSelectWrapper.classList.remove('open');
        });
    }
    if (settingsCloseBtn) settingsCloseBtn.addEventListener("click", closeSettings);
    if (settingsOverlay) settingsOverlay.addEventListener("click", closeSettings);
    
    if (themeSelectorContainer) {
        themeSelectorContainer.addEventListener("click", (e) => {
          const swatch = e.target.closest('.theme-swatch');
          if (swatch) {
            const newTheme = swatch.dataset.theme;
            localStorage.setItem('theme', newTheme);
            applyTheme(newTheme); 
          }
        });
    }

    if (voiceSelectDisplay) {
        voiceSelectDisplay.addEventListener('click', () => {
            if (voiceSelectWrapper) voiceSelectWrapper.classList.toggle('open');
            if (attachmentMenu) attachmentMenu.classList.remove('visible');
            if (attachmentBtn) attachmentBtn.classList.remove('active');
        });
    }

    if (voiceSelectOptions) {
        voiceSelectOptions.addEventListener('click', (e) => {
            const option = e.target.closest('.custom-option');
            if (!option) return;

            const selectedValue = option.dataset.value;
            const selectedText = option.textContent;

            if (voiceModelSelectHidden) voiceModelSelectHidden.value = selectedValue;
            if (voiceSelectLabel) voiceSelectLabel.textContent = selectedText;
            
            localStorage.setItem('voiceModel', selectedValue);
            
            voiceSelectOptions.querySelectorAll('.custom-option').forEach(opt => {
                opt.classList.remove('selected');
            });
            option.classList.add('selected');
            
            if (voiceSelectWrapper) voiceSelectWrapper.classList.remove('open');
        });
    }

    document.addEventListener('click', (e) => {
        if (voiceSelectWrapper && !voiceSelectWrapper.contains(e.target)) {
            voiceSelectWrapper.classList.remove('open');
        }
        if (attachmentMenu && attachmentBtn && !attachmentMenu.contains(e.target) && !attachmentBtn.contains(e.target)) {
            attachmentMenu.classList.remove('visible');
            attachmentBtn.classList.remove('active');
        }
    });

    if (settingsGroupHeaders) {
        settingsGroupHeaders.forEach(header => {
            header.addEventListener('click', () => {
                const group = header.closest('.settings-group');
                if (group) {
                    group.classList.toggle('open');
                }
            });
        });
    }
    
    if (ttsToggleBtn) {
        ttsToggleBtn.addEventListener('click', () => {
            const currentState = ttsToggleBtn.dataset.ttsState;
            const newState = currentState === 'on' ? 'off' : 'on';
            ttsToggleBtn.dataset.ttsState = newState;
            allowTTS = (newState === 'on');
            localStorage.setItem('allowTTS', allowTTS);
            
            if (!allowTTS) {
                stopSpeaking(); 
            }
        });
    }
    
    // ### MODIFICATION: Removed Location Toggle Listener ###
    
    if (newChatBtn) newChatBtn.addEventListener("click", () => {
        createNewSession();
        closeSidebar();
    });
    
    if (searchBar) searchBar.addEventListener('input', renderSidebar);
    
    if (micBtn) {
        if (SpeechRecognition) {
            setupRecognitionListeners(); 
            micBtn.addEventListener("click", toggleRecording);
        } else {
            micBtn.disabled = true;
            micBtn.title = "STT not supported in this browser";
        }
    }
    
    if (sendBtn) sendBtn.addEventListener("click", handleFormSubmit);
    
    if (attachmentBtn) {
        attachmentBtn.addEventListener('click', () => {
            attachmentMenu.classList.toggle('visible');
            attachmentBtn.classList.toggle('active');
            if (voiceSelectWrapper) voiceSelectWrapper.classList.remove('open');
        });
    }

    if (modeImageBtn) {
        modeImageBtn.addEventListener('click', () => {
            setChatMode('image_gen');
        });
    }

    if (uploadImageBtn) {
        uploadImageBtn.addEventListener('click', () => {
            if (imageUploadInput) imageUploadInput.click();
            if (attachmentMenu) attachmentMenu.classList.remove('visible');
            if (attachmentBtn) attachmentBtn.classList.remove('active');
        });
    }
    
    if (modeChatBtn) {
        modeChatBtn.addEventListener('click', () => {
            setChatMode('chat');
        });
    }

    if (imageUploadInput) {
        imageUploadInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                processImageFile(file);
            }
        });
    }
    
    if (imagePreviewRemove) {
        imagePreviewRemove.addEventListener('click', () => {
            clearAttachedImage();
            setChatMode('chat');
        });
    }
    
    if (imageViewerClose) {
        imageViewerClose.addEventListener('click', () => {
            if (imageViewerModal) imageViewerModal.style.display = 'none';
        });
    }
    
    if (chatBody) {
        chatBody.addEventListener('click', (e) => {
            if (e.target.classList.contains('generated-image')) {
                if (imageViewerModal) imageViewerModal.style.display = 'block';
                if (imageViewerContent) imageViewerContent.src = e.target.src;
            }
        });
    }
      
    if(exportAllPdfBtn) {
        exportAllPdfBtn.addEventListener('click', handleExportAllChatsPdf);
    }
    
    if(logoutBtn) {
        logoutBtn.addEventListener('click', handleLogout);
    }
    
    async function checkCSVDataStatus() {
        try {
            const response = await fetch('/api/data/status');
            if (!response.ok) throw new Error('Failed to fetch data status');
            const data = await response.json();
            
            hasCSVData = data.has_data;
            
            if (hasCSVData) {
                console.log(`CSV Data Feature: Enabled. Found ${data.file_count} files.`);
            } else {
                console.log("CSV Data Feature: Disabled. No files found.");
            }
            
        } catch (error) {
            console.error("Error checking CSV data status:", error);
            hasCSVData = false;
        }
    }
    
    async function loadDynamicThemes() {
        if (!themeSelectorContainer) {
            console.warn("Theme selector container not found. Skipping dynamic themes.");
            return; 
        }
        try {
            const response = await fetch('/api/themes');
            if (!response.ok) throw new Error('Failed to fetch themes');
            const themes = await response.json();
            
            themeSelectorContainer.innerHTML = ''; 
            
            themes.forEach(theme => {
                if (!theme || !theme.id) return; 
                const swatch = document.createElement('div');
                swatch.className = 'theme-swatch';
                swatch.dataset.theme = theme.id;
                
                swatch.id = `theme-swatch-${theme.id.replace('theme-', '')}`; 
                
                swatch.innerHTML = `
                    <div class="swatch-circle"></div>
                    <span>${theme.name}</span>
                `;
                themeSelectorContainer.appendChild(swatch);
            });

            const savedTheme = localStorage.getItem('theme') || 'theme-dark';
            applyTheme(savedTheme);
            
        } catch (error) {
            console.error("Error loading dynamic themes:", error);
            themeSelectorContainer.innerHTML = '<p style="color: var(--text-faded); font-size: 0.9em;">Could not load themes.</p>';
        }
    }
    
    async function startApp(userId, firstName) {
        currentUserID = userId;
        currentUserName = firstName || "User";
        localStorage.setItem('katz_ai_user_id', currentUserID);
        localStorage.setItem('katz_ai_user_name', currentUserName);
        
        if (loginOverlay) {
            loginOverlay.style.opacity = '0';
            loginOverlay.style.visibility = 'hidden';
        }
        document.body.classList.add('chat-visible');
        if(qs('chatSection')) qs('chatSection').style.display = 'block';
        
        collectAndSendClientDetails(currentUserID);
        await fetchSessions(); // This now includes a ban check
        await checkCSVDataStatus();
        startPlaceholderAnimation();
    }

    
    function setupEye(btn, input) {
        if (!btn || !input) return;
        btn.addEventListener('click', () => {
            const show = btn.querySelector('.icon-show');
            const hide = btn.querySelector('.icon-hide');
            if (input.type === 'password') {
                input.type = 'text';
                if (show) show.style.display = 'none';
                if (hide) hide.style.display = 'block';
            } else {
                input.type = 'password';
                if (show) show.style.display = 'block';
                if (hide) hide.style.display = 'none';
            }
        });
    }
    
    setupEye(eyeSignin, loginPassword);
    setupEye(eyeSignup, registerPassword);
    setupEye(eyeReset, resetNewPassword);
    
    if (gotoRegister) {
        gotoRegister.addEventListener('click', (e) => {
            e.preventDefault();
            showSection('registerSection');
            hideMessages();
        });
    }
    
    if (gotoLoginFromRegister) {
        gotoLoginFromRegister.addEventListener('click', (e) => {
            e.preventDefault();
            showSection('loginSection');
            hideMessages();
        });
    }
    
    if (gotoForgot) {
        gotoForgot.addEventListener('click', (e) => {
            e.preventDefault();
            showSection('forgotSection');
            hideMessages();
        });
    }
    
    if (gotoLoginFromForgot) {
        gotoLoginFromForgot.addEventListener('click', (e) => {
            e.preventDefault();
            showSection('loginSection');
            hideMessages();
        });
    }

    if (loginBtn) {
        loginBtn.addEventListener('click', async () => {
            const email = loginEmail.value.trim().toLowerCase();
            const password = loginPassword.value;
            
            hideMessages();
            
            if (!email || !isValidEmail(email)) {
                showError('Please enter a valid email address');
                return;
            }
            
            if (!password) {
                showError('Please enter your password');
                return;
            }
            
            setLoading(loginBtn, true);
            
            try {
                const data = await postJSON('/api/login', { email, password });
                
                showSuccess(data.message || 'Login successful!');
                await startApp(data.user_id, data.first_name);
                
            } catch (error) {
                console.error('Sign in error:', error);
                
                if (error.status === 403) { // ### NEW: Ban Check ###
                    showBanScreen();
                    return;
                }
                
                const errorMsg = error.message || 'Login failed';
                showError(errorMsg);
                if(errorMsg.includes("not verified")) {
                    setInputValue('verifyEmail', email);
                    showSection('verifySection');
                }
            } finally {
                setLoading(loginBtn, false, 'Sign In');
            }
        });
    }
    
    if (registerBtn) {
        registerBtn.addEventListener('click', async () => {
            const email = registerEmail.value.trim().toLowerCase();
            const password = registerPassword.value;
            const firstName = registerFirstName.value.trim();
            const lastName = registerLastName.value.trim();

            hideMessages();
            
            if (!email || !isValidEmail(email)) {
                showError('Please enter a valid email address');
                return;
            }
            
            if (!password || password.length < 8) {
                showError('Password must be at least 8 characters');
                return;
            }
            
            setLoading(registerBtn, true);
            
            try {
                const data = await postJSON('/api/register', { 
                    email, 
                    password,
                    first_name: firstName,
                    last_name: lastName
                });
                
                showSuccess(data.message || 'OTP sent! Please check your email.');
                setInputValue('verifyEmail', email);
                showSection('verifySection');

            } catch (error) {
                console.error('Sign up error:', error);
                showError(error.message || 'Sign up failed');
            } finally {
                setLoading(registerBtn, false, 'Create Account');
            }
        });
    }
    
    if (verifyRegisterBtn) {
        verifyRegisterBtn.addEventListener('click', async () => {
            const email = verifyEmail.value.trim().toLowerCase();
            const otp = verifyOtp.value.trim();
            
            hideMessages();
            
            if(!otp || otp.length !== 6) {
                showError('Please enter the 6-digit OTP.');
                return;
            }
            
            setLoading(verifyRegisterBtn, true);
            
            try {
                const data = await postJSON('/api/register/verify', { email, otp });
                
                showSuccess(data.message || 'Verification successful!');
                await startApp(data.user_id, data.first_name);
                
            } catch (error) {
                console.error('Verify error:', error);
                showError(error.message || 'Verification failed');
            } finally {
                setLoading(verifyRegisterBtn, false, 'Verify & Sign Up');
            }
        });
    }
    
    if (resendOtpBtn) {
        resendOtpBtn.addEventListener('click', async () => {
            const email = verifyEmail.value.trim().toLowerCase();
            hideMessages();
            setLoading(resendOtpBtn, true, 'Sending...');
            
            try {
                const data = await postJSON('/api/register/resend', { email });
                showSuccess(data.message || 'New OTP sent!');
            } catch (error) {
                console.error('Resend error:', error);
                showError(error.message || 'Resend failed');
            } finally {
                setLoading(resendOtpBtn, false, 'Resend OTP');
            }
        });
    }

    if (forgotBtn) {
        forgotBtn.addEventListener('click', async () => {
            const email = forgotEmail.value.trim().toLowerCase();
            hideMessages();
            
            if (!email || !isValidEmail(email)) {
                showError('Please enter a valid email address');
                return;
            }
            
            setLoading(forgotBtn, true);
            
            try {
                const data = await postJSON('/api/forgot', { email });
                showSuccess(data.message || 'Reset code sent!');
                setInputValue('forgotVerifyEmail', email);
                showSection('forgotVerifySection');
            } catch (error) {
                console.error('Forgot error:', error);
                showError(error.message || 'Failed to send reset code');
            } finally {
                setLoading(forgotBtn, false, 'Send Reset Code');
            }
        });
    }
    
    if (verifyForgotBtn) {
        verifyForgotBtn.addEventListener('click', async () => {
            const email = forgotVerifyEmail.value.trim().toLowerCase();
            const otp = forgotVerifyOtp.value.trim();
            hideMessages();
            
            if(!otp || otp.length !== 6) {
                showError('Please enter the 6-digit OTP.');
                return;
            }
            
            setLoading(verifyForgotBtn, true);
            
            try {
                const data = await postJSON('/api/forgot/verify', { email, otp });
                showSuccess(data.message || 'OTP Verified!');
                setInputValue('resetEmail', email);
                setInputValue('resetOtp', otp);
                showSection('resetSection');
            } catch (error) {
                console.error('Forgot verify error:', error);
                showError(error.message || 'Verification failed');
            } finally {
                setLoading(verifyForgotBtn, false, 'Verify Code');
            }
        });
    }
    
    if (resetBtn) {
        resetBtn.addEventListener('click', async () => {
            const email = resetEmail.value.trim().toLowerCase();
            const otp = resetOtp.value.trim();
            const newPassword = resetNewPassword.value;
            hideMessages();
            
            if (!newPassword || newPassword.length < 8) {
                showError('Password must be at least 8 characters');
                return;
            }
            
            setLoading(resetBtn, true);
            
            try {
                const data = await postJSON('/api/forgot/reset', { email, otp, new_password: newPassword });
                showSuccess(data.message || 'Password reset! You can now log in.');
                setInputValue('loginEmail', email);
                setInputValue('loginPassword', '');
                showSection('loginSection');
            } catch (error) {
                console.error('Reset error:', error);
                showError(error.message || 'Password reset failed');
            } finally {
                setLoading(resetBtn, false, 'Reset Password');
            }
        });
    }
    
    (async () => {
        try {
            // Load settings from localStorage
            allowTTS = localStorage.getItem('allowTTS') !== 'false'; 
            // allowLocationAsk = localStorage.getItem('allowLocationAsk') !== 'false'; // ### MODIFICATION: Removed

            // Apply settings to UI
            if (ttsToggleBtn) ttsToggleBtn.dataset.ttsState = allowTTS ? 'on' : 'off';
            // if (locationToggleBtn) locationToggleBtn.checked = allowLocationAsk; // ### MODIFICATION: Removed
        
            loadSpeechVoices(); 
            await loadDynamicThemes();
            
            const savedUserID = localStorage.getItem('katz_ai_user_id');
            const savedUserName = localStorage.getItem('katz_ai_user_name');

            if (savedUserID) {
                console.log("Found existing session. Starting app.");
                await startApp(savedUserID, savedUserName);
            } else {
                console.log("No session found. Showing login overlay.");
                if (loginOverlay) loginOverlay.style.display = 'flex';
                showSection('loginSection');
            }
            
            const savedVoice = localStorage.getItem('voiceModel') || 'default';
            if (voiceModelSelectHidden) voiceModelSelectHidden.value = savedVoice;
            if (voiceSelectOptions) {
                const option = voiceSelectOptions.querySelector(`.custom-option[data-value="${savedVoice}"]`);
                if (option) {
                    if (voiceSelectLabel) voiceSelectLabel.textContent = option.textContent;
                    voiceSelectOptions.querySelectorAll('.custom-option').forEach(opt => opt.classList.remove('selected'));
                    option.classList.add('selected');
                }
            }

        } catch (error) {
            console.error("Initialization error:", error);
            if (loginOverlay) loginOverlay.style.display = 'flex'; 
        }
    })();

});
