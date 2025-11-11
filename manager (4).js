document.addEventListener("DOMContentLoaded", () => {
    
    // --- 1. Element Selectors ---
    const tabs = document.querySelectorAll('.tab-link');
    const tabContents = document.querySelectorAll('.tab-content');
    
    // AI Brain
    const knowledgeInput = document.getElementById('knowledge-input');
    const addKnowledgeBtn = document.getElementById('add-knowledge-btn');
    const instructionsInput = document.getElementById('instructions-input');
    const addInstructionsBtn = document.getElementById('add-instructions-btn');

    // 🚀 NEW: Data Sets
    const csvFileInput = document.getElementById('csv-file-input');
    const csvFileName = document.getElementById('csv-file-name');
    const uploadCsvBtn = document.getElementById('upload-csv-btn');
    const dataListContainer = document.getElementById('data-list-container');
    const dataListLoading = document.getElementById('data-list-loading');

    // Theme Manager
    const themeNameInput = document.getElementById('theme-name-input');
    const themeIdPreview = document.getElementById('theme-id-preview-text');
    const themeCssInput = document.getElementById('theme-css-input');
    const addThemeBtn = document.getElementById('add-theme-btn');
    const themeListContainer = document.getElementById('theme-list-container');
    const themeListLoading = document.getElementById('theme-list-loading');
    
    // Global Toast
    const toast = document.getElementById('toast-notification');
    let toastTimer = null;

    // 🚀 NEW: Confirmation Modal Elements
    const confirmOverlay = document.getElementById('confirm-modal-overlay');
    const confirmTitle = document.getElementById('confirm-modal-title');
    const confirmMessage = document.getElementById('confirm-modal-message');
    const confirmBtnConfirm = document.getElementById('confirm-modal-btn-confirm');
    const confirmBtnCancel = document.getElementById('confirm-modal-btn-cancel');
    let modalResolve = null; // To store the promise's resolve function

    // 🚀 NEW: User Manager Elements
    const userListContainer = document.getElementById('user-list-container');
    const userListLoading = document.getElementById('user-list-loading');
    const userDetailsModalOverlay = document.getElementById('user-details-modal-overlay');
    const userDetailsModalTitle = document.getElementById('user-details-modal-title');
    const userDetailsModalContent = document.getElementById('user-details-modal-content');
    const userDetailsModalCloseBtn = document.getElementById('user-details-modal-close-btn');
    
    let currentPersonalityChart = null; // To hold the chart instance

    console.log("Manager.js: All elements selected."); // DEBUG

    // List of default theme IDs that cannot be deleted
    // This list comes from app.py
    const defaultThemeIds = [
        'theme-light', 'theme-dark', 'theme-ocean', 'theme-forest',
        'theme-sakura-light', 'theme-sakura-dark', 'theme-cyberpunk-light',
        'theme-cyberpunk-dark', 'theme-nord-light', 'theme-nord-dark',
        'theme-solarized-light', 'theme-solarized-dark', 'theme-gruvbox-light',
        'theme-gruvbox-dark', 'theme-catppuccin-light', 'theme-catppuccin-dark',
        'theme-rose-pine-light', 'theme-rose-pine-dark'
    ];
    
    // --- 2. Helper Functions ---

    /**
     * 🚀 NEW: Helper to escape HTML to prevent XSS from AI response
     */
    function escapeHTML(str) {
        if (typeof str !== 'string') return '';
        return str.replace(/[&<>"']/g, function(m) {
            return {
                '&': '&amp;',
                '<': '&lt;',
                '>': '&gt;',
                '"': '&quot;',
                "'": '&#39;'
            }[m];
        });
    }

    /**
     * Shows a toast notification.
     * @param {string} message The message to display.
     * @param {string} type 'success' or 'error'.
     */
    function showToast(message, type = 'success') {
        if (!toast) return;
        if (toastTimer) {
            clearTimeout(toastTimer);
        }
        toast.textContent = message;
        toast.className = `show ${type}`;
        toastTimer = setTimeout(() => {
            toast.className = '';
        }, 3000);
    }

    /**
     * 🚀 NEW: Shows a confirmation modal and returns a Promise
     * @param {string} title The title for the modal.
     * @param {string} message The message for the modal.
     * @returns {Promise<boolean>} Resolves true if confirmed, false if canceled.
     */
    function showConfirmModal(title, message) {
        return new Promise((resolve) => {
            modalResolve = resolve; // Store the resolve function
            
            if (confirmTitle) confirmTitle.textContent = title;
            if (confirmMessage) confirmMessage.textContent = message;
            
            if (confirmOverlay) confirmOverlay.classList.add('visible');
        });
    }

    // 🚀 NEW: Add event listeners for the modal buttons
    if (confirmBtnConfirm) {
        confirmBtnConfirm.addEventListener('click', () => {
            if (confirmOverlay) confirmOverlay.classList.remove('visible');
            if (modalResolve) modalResolve(true); // Resolve promise with true
            modalResolve = null;
        });
    }

    if (confirmBtnCancel) {
        confirmBtnCancel.addEventListener('click', () => {
            if (confirmOverlay) confirmOverlay.classList.remove('visible');
            if (modalResolve) modalResolve(false); // Resolve promise with false
            modalResolve = null;
        });
    }

    /**
     * Sets the loading state for a button.
     * @param {HTMLButtonElement} button The button element.
     * @param {boolean} isLoading True to show spinner, false to show text.
     * @param {string} [defaultText] The text to restore. If null, uses data-text.
     */
    function setButtonLoading(button, isLoading, defaultText = null) {
        if (!button) return; // Guard clause
        if (!button.dataset.text) {
            const span = button.querySelector('span');
            if (span) {
                button.dataset.text = span.textContent;
            } else {
                button.dataset.text = 'Submit'; // Fallback
            }
        }
        const span = button.querySelector('span');
        
        if (isLoading) {
            button.disabled = true;
            if (span) span.style.display = 'none';
            if (!button.querySelector('.spinner')) {
                const spinner = document.createElement('div');
                spinner.className = 'spinner';
                button.prepend(spinner);
            }
        } else {
            button.disabled = false;
            const spinner = button.querySelector('.spinner');
            if (spinner) spinner.remove();
            if (span) {
                span.style.display = 'inline';
                span.textContent = defaultText || button.dataset.text;
            }
        }
    }

    /**
     * Converts a theme name to a theme ID.
     * e.g., "My Custom Theme" -> "theme-my-custom-theme"
     * @param {string} name The theme name.
     * @returns {string} The formatted theme ID.
     */
    function generateThemeId(name) {
        if (!name || name.trim() === "") {
            return "";
        }
        const safeName = name.toLowerCase()
            .replace(/[^a-z0-9\s-]/g, '') // Remove special chars
            .replace(/[\s_]+/g, '-')       // Replace spaces/underscores with hyphens
            .replace(/^-+|-+$/g, '');      // Trim leading/trailing hyphens
            
        return `theme-${safeName}`;
    }

    // --- 3. Tab Switching Logic ---
    // ### MODIFICATION: Added logic to load tab content on first click
    let initialTabLoad = {
        'tab-ai-brain': true, // Always visible
        'tab-data-manager': false,
        'tab-theme-manager': false,
        'tab-user-manager': false
    };

    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const target = tab.dataset.tab;
            
            // Deactivate all
            tabs.forEach(t => t.classList.remove('active'));
            tabContents.forEach(c => c.classList.remove('active'));
            
            // Activate target
            tab.classList.add('active');
            const targetContent = document.getElementById(target);
            if (targetContent) {
                targetContent.classList.add('active');
            }

            // --- 🚀 NEW: Load content on tab click ---
            if (!initialTabLoad[target]) {
                if (target === 'tab-user-manager') {
                    console.log("Manager.js: Loading users on tab click...");
                    loadAndRenderUsers();
                }
                if (target === 'tab-theme-manager') {
                    console.log("Manager.js: Loading themes on tab click...");
                    loadAndRenderThemes();
                }
                if (target === 'tab-data-manager') {
                    console.log("Manager.js: Loading data files on tab click...");
                    loadAndRenderDataFiles();
                }
                initialTabLoad[target] = true; // Mark as loaded
            }
        });
    });

    // --- 4. AI Brain Logic ---

    async function addBrainData(endpoint, inputElement, buttonElement) {
        if (!inputElement || !buttonElement) return; // Guard
        
        const text = inputElement.value.trim();
        if (!text) {
            showToast("Text box is empty. Nothing to add.", "error");
            return;
        }
        
        setButtonLoading(buttonElement, true);
        const payloadKey = endpoint.includes('knowledge') ? 'knowledge' : 'instructions';
        
        try {
            const response = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ [payloadKey]: text })
            });
            
            const result = await response.json();
            if (!response.ok) {
                throw new Error(result.error || "Failed to save data.");
            }

            inputElement.value = ''; // Clear on success
            showToast(`Success! Added ${result.lines_added} new lines.`, "success");
            setButtonLoading(buttonElement, false, "Added!");
            setTimeout(() => setButtonLoading(buttonElement, false), 2000);

        } catch (error) {
            showToast(`Error: ${error.message}`, "error");
            setButtonLoading(buttonElement, false, "Error!");
            setTimeout(() => setButtonLoading(buttonElement, false), 2000);
        }
    }

    if (addKnowledgeBtn) {
        addKnowledgeBtn.addEventListener('click', () => {
            addBrainData('/api/manager/add-knowledge', knowledgeInput, addKnowledgeBtn);
        });
    }

    if (addInstructionsBtn) {
        addInstructionsBtn.addEventListener('click', () => {
            addBrainData('/api/manager/add-instructions', instructionsInput, addInstructionsBtn);
        });
    }

    // --- 5. Theme Manager Logic ---

    // Load and render the list of themes on page load
    async function loadAndRenderThemes() {
        if (!themeListContainer) return; // Only run if the element exists

        themeListContainer.innerHTML = ''; // Clear list
        if (themeListLoading) themeListLoading.style.display = 'block'; // Show loading
        
        try {
            const response = await fetch('/api/themes');
            if (!response.ok) throw new Error("Could not fetch theme list.");
            
            const themes = await response.json();
            if (themeListLoading) themeListLoading.style.display = 'none'; // Hide loading
            
            if (themes.length === 0) {
                themeListContainer.innerHTML = '<div class="theme-item"><span>No themes found.</span></div>';
                return;
            }
            
            themes.forEach(theme => {
                if (!theme || !theme.id) return; // Skip invalid theme data
                const isDefault = defaultThemeIds.includes(theme.id);
                const item = document.createElement('div');
                item.className = 'theme-item';
                item.innerHTML = `
                    <span>${theme.name} (<code>${theme.id}</code>)</span>
                    <button class="delete-btn" 
                            data-id="${theme.id}" 
                            data-name="${theme.name}"
                            ${isDefault ? 'disabled' : ''} 
                            title="${isDefault ? 'Cannot delete a default theme' : 'Delete theme'}">
                        Delete
                    </button>
                `;
                themeListContainer.appendChild(item);
            });

        } catch (error) {
            if (themeListLoading) themeListLoading.style.display = 'none';
            themeListContainer.innerHTML = `<div class="theme-item error"><span>Error loading themes: ${error.message}</span></div>`;
        }
    }

    // Add Theme ID preview generator
    if (themeNameInput) {
        themeNameInput.addEventListener('input', () => {
            const themeId = generateThemeId(themeNameInput.value);
            if (themeId) {
                const selector = `body.${themeId}`;
                if (themeIdPreview) themeIdPreview.textContent = selector;
                if (themeCssInput) themeCssInput.placeholder = `Your CSS MUST start with the selector above...\n\n${selector} {\n  --bg-primary: #123456;\n  /* ... */\n}`;
            } else {
                if (themeIdPreview) themeIdPreview.textContent = 'body.theme-my-theme';
                if (themeCssInput) themeCssInput.placeholder = `Your CSS MUST start with the selector above...`;
            }
        });
    }

    // Handle Add Theme button click
    if (addThemeBtn) {
        addThemeBtn.addEventListener('click', async () => {
            const name = themeNameInput.value.trim();
            const css = themeCssInput.value.trim();
            const id = generateThemeId(name);
            
            if (!name || !css) {
                showToast("Theme Name and CSS Code are required.", "error");
                return;
            }
            
            if (!css.includes(`body.${id}`)) {
                showToast(`CSS code must start with 'body.${id}'`, "error");
                return;
            }
            
            setButtonLoading(addThemeBtn, true);
            
            try {
                const response = await fetch('/api/themes/add', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name: name, css: css })
                });
                
                const result = await response.json();
                if (!response.ok) {
                    throw new Error(result.error || "Failed to add theme.");
                }
                
                showToast(`Theme '${result.new_theme.name}' added!`, "success");
                themeNameInput.value = '';
                themeCssInput.value = '';
                if (themeIdPreview) themeIdPreview.textContent = 'body.theme-my-theme';
                setButtonLoading(addThemeBtn, false, "Added!");
                setTimeout(() => setButtonLoading(addThemeBtn, false), 2000);
                
                loadAndRenderThemes(); // Refresh the list

            } catch (error) {
                showToast(`Error: ${error.message}`, "error");
                setButtonLoading(addThemeBtn, false, "Error!");
                setTimeout(() => setButtonLoading(addThemeBtn, false), 2000);
            }
        });
    }

    // 🚀 FIX: Handle Delete Theme button clicks (using event delegation and custom modal)
    if (themeListContainer) {
        themeListContainer.addEventListener('click', async (e) => { // Make async
            if (!e.target.classList.contains('delete-btn')) {
                return;
            }
            
            const button = e.target;
            const themeId = button.dataset.id;
            const themeName = button.dataset.name;
            
            if (!themeId || button.disabled) {
                return;
            }
            
            // 🚀 Replaced confirm() with custom modal
            const confirmed = await showConfirmModal(
                'Delete Theme?', 
                `Are you sure you want to delete "${themeName}"? This action cannot be undone.`
            );
            
            if (confirmed) {
                try {
                    const response = await fetch('/api/themes/delete', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ id: themeId })
                    });

                    const result = await response.json();
                    if (!response.ok) {
                        throw new Error(result.error || "Failed to delete theme.");
                    }

                    showToast(`Theme '${themeName}' deleted.`, "success");
                    loadAndRenderThemes(); // Refresh the list

                } catch (error) {
                    showToast(`Error: ${error.message}`, "error");
                }
            }
        });
    }

    // --- 🚀 NEW: 6. Data Set Manager Logic ---

    // Load and render the list of data files
    async function loadAndRenderDataFiles() {
        if (!dataListContainer) return;

        dataListContainer.innerHTML = '';
        if (dataListLoading) dataListLoading.style.display = 'block';
        
        try {
            const response = await fetch('/api/manager/data-files');
            if (!response.ok) throw new Error("Could not fetch data file list.");
            
            const files = await response.json();
            if (dataListLoading) dataListLoading.style.display = 'none';
            
            if (files.length === 0) {
                dataListContainer.innerHTML = '<div class="data-item"><span>No data sets found.</span></div>';
                return;
            }
            
            files.forEach(filename => {
                const item = document.createElement('div');
                item.className = 'data-item';
                item.innerHTML = `
                    <span>${filename}</span>
                    <button class="delete-btn" 
                            data-filename="${filename}"
                            title="Delete ${filename}">
                        Delete
                    </button>
                `;
                dataListContainer.appendChild(item);
            });

        } catch (error) {
            if (dataListLoading) dataListLoading.style.display = 'none';
            dataListContainer.innerHTML = `<div class="data-item error"><span>Error loading files: ${error.message}</span></div>`;
        }
    }

    // Handle file input change to show preview name
    if (csvFileInput) {
        csvFileInput.addEventListener('change', () => {
            if (csvFileInput.files.length > 0) {
                const file = csvFileInput.files[0];
                if (file.name.endsWith('.csv')) {
                    if (csvFileName) csvFileName.textContent = file.name;
                } else {
                    showToast("Invalid file. Please select a .csv file.", "error");
                    csvFileInput.value = ''; // Clear the input
                    if (csvFileName) csvFileName.textContent = 'No file selected';
                }
            } else {
                if (csvFileName) csvFileName.textContent = 'No file selected';
            }
        });
    }

    // Handle CSV Upload button click
    if (uploadCsvBtn) {
        uploadCsvBtn.addEventListener('click', async () => {
            if (!csvFileInput || csvFileInput.files.length === 0) {
                showToast("Please select a .csv file to upload.", "error");
                return;
            }
            
            const file = csvFileInput.files[0];
            if (!file.name.endsWith('.csv')) {
                showToast("Invalid file. Please select a .csv file.", "error");
                return;
            }
            
            const formData = new FormData();
            formData.append('file', file);
            
            setButtonLoading(uploadCsvBtn, true);
            
            try {
                const response = await fetch('/api/manager/upload-data', {
                    method: 'POST',
                    body: formData // No Content-Type header needed for FormData
                });
                
                const result = await response.json();
                if (!response.ok) {
                    throw new Error(result.error || "Failed to upload file.");
                }
                
                showToast(`File '${result.filename}' uploaded successfully!`, "success");
                csvFileInput.value = ''; // Clear input
                if (csvFileName) csvFileName.textContent = 'No file selected';
                
                setButtonLoading(uploadCsvBtn, false, "Uploaded!");
                setTimeout(() => setButtonLoading(uploadCsvBtn, false), 2000);
                
                loadAndRenderDataFiles(); // Refresh the list

            } catch (error) {
                showToast(`Error: ${error.message}`, "error");
                setButtonLoading(uploadCsvBtn, false, "Error!");
                setTimeout(() => setButtonLoading(uploadCsvBtn, false), 2000);
            }
        });
    }

    // Handle Delete Data File button clicks
    if (dataListContainer) {
        dataListContainer.addEventListener('click', async (e) => {
            if (!e.target.classList.contains('delete-btn')) {
                return;
            }
            
            const button = e.target;
            const filename = button.dataset.filename;
            
            if (!filename) return;
            
            const confirmed = await showConfirmModal(
                'Delete Data Set?', 
                `Are you sure you want to delete "${filename}"? This will permanently remove the file.`
            );
            
            if (confirmed) {
                try {
                    // Note: Filename is part of the URL, no JSON body
                    const response = await fetch(`/api/manager/data-file/${filename}`, {
                        method: 'DELETE'
                    });

                    const result = await response.json();
                    if (!response.ok) {
                        throw new Error(result.error || "Failed to delete file.");
                    }

                    showToast(`File '${filename}' deleted.`, "success");
                    loadAndRenderDataFiles(); // Refresh the list

                } catch (error) {
                    showToast(`Error: ${error.message}`, "error");
                }
            }
        });
    }
    
    // --- 🚀 NEW: 7. User Manager Logic ---

    /**
     * Fetches the user list and renders it.
     */
    async function loadAndRenderUsers() {
        if (!userListContainer || !userListLoading) return;

        userListLoading.style.display = 'block';
        userListContainer.innerHTML = '';
        
        try {
            const response = await fetch('/api/manager/users');
            if (!response.ok) {
                // ### MODIFICATION: Better error handling from response
                let errorMsg = `Failed to fetch users: ${response.status} ${response.statusText}`;
                try {
                    const errData = await response.json();
                    errorMsg = errData.error || errorMsg;
                } catch (e) {}
                throw new Error(errorMsg);
            }
            const users = await response.json();

            userListLoading.style.display = 'none';

            if (!users || users.length === 0) {
                userListContainer.innerHTML = '<div class="data-item"><span>No users found.</span></div>';
                return;
            }

            users.forEach(user => {
                if (!user || !user.id) {
                    console.error("Received invalid user data from API:", user);
                    return; // Skip this entry
                }

                const user_id = user.id;
                const is_banned = user.is_banned;
                
                // 🐞 FIX: Use the 'display_name' from the API response
                const display_name = user.display_name || user.email || user.id;

                const item = document.createElement('div');
                item.className = 'user-item';
                if (is_banned) item.classList.add('banned');
                
                // Set dataset attributes for event delegation
                item.dataset.userId = user_id;

                item.innerHTML = `
                    <span class="user-id" title="ID: ${user_id}">${escapeHTML(display_name)}</span>
                    <div class="user-actions">
                        <button class="action-btn details-btn" data-action="details">Details</button>
                        <button class="action-btn personality-btn" data-action="personality">Personality</button>
                        ${is_banned ? 
                            `<button class="action-btn unban-btn" data-action="unban">Unban</button>` :
                            `<button class="action-btn ban-btn" data-action="ban">Ban</button>`
                        }
                        <button class="action-btn delete-btn" data-action="delete">Delete</button>
                    </div>
                `;
                userListContainer.appendChild(item);
            });

        } catch (error) {
            userListLoading.style.display = 'none';
            userListContainer.innerHTML = `<div class="data-item error"><span>Error loading users: ${error.message}</span></div>`;
            console.error(error);
        }
    }

    /**
     * Handles clicks on the user list container (event delegation).
     */
    if (userListContainer) {
        console.log("Manager.js: Adding click listener to userListContainer."); // DEBUG
        userListContainer.addEventListener('click', async (e) => {
            console.log("Manager.js: userListContainer clicked."); // DEBUG
            
            const button = e.target.closest('.action-btn');
            if (!button) {
                console.log("Manager.js: Click was not on an action-btn."); // DEBUG
                return;
            }
            console.log("Manager.js: Button clicked:", button.dataset.action); // DEBUG

            const userItem = button.closest('.user-item');
            if (!userItem) {
                console.error("Manager.js: CRITICAL! Button is not inside a .user-item."); // DEBUG
                return;
            }

            const userId = userItem.dataset.userId;
            const action = button.dataset.action;
            console.log(`Manager.js: Action: ${action}, UserID: ${userId}`); // DEBUG

            if (!userId || userId === "undefined") {
                console.warn("Manager.js: Invalid UserID detected."); // DEBUG
                showToast("Invalid user ID. Cannot perform action.", "error");
                return;
            }

            try {
                switch (action) {
                    case 'details':
                        console.log("Manager.js: Calling handleDetailsClick..."); // DEBUG
                        await handleDetailsClick(userId);
                        break;
                    case 'personality':
                        console.log("Manager.js: Calling handlePersonalityClick..."); // DEBUG
                        await handlePersonalityClick(userId);
                        break;
                    case 'ban':
                        console.log("Manager.js: Calling handleBanClick..."); // DEBUG
                        await handleBanClick(userId, button);
                        break;
                    case 'unban':
                        console.log("Manager.js: Calling handleUnbanClick..."); // DEBUG
                        await handleUnbanClick(userId, button);
                        break;
                    case 'delete':
                        console.log("Manager.js: Calling handleDeleteClick..."); // DEBUG
                        await handleDeleteClick(userId);
                        break;
                    default:
                        console.warn("Manager.js: Unknown action:", action); // DEBUG
                }
            } catch (error) {
                console.error(`Manager.js: Failed to execute action '${action}' for '${userId}':`, error);
                showToast(`An error occurred: ${error.message}`, "error");
            }
        });
    } else {
        console.error("Manager.js: CRITICAL! userListContainer not found."); // DEBUG
    }


    /**
     * 🚀 UPDATED: Shows the User Details modal
     */
    async function handleDetailsClick(userId) {
        console.log(`Manager.js: handleDetailsClick function started for ${userId}.`); // DEBUG
        if (!userDetailsModalOverlay || !userDetailsModalTitle || !userDetailsModalContent) {
            console.error("Manager.js: Details modal elements not found!"); // DEBUG
            return;
        }
        
        userDetailsModalTitle.textContent = `User Details: ${userId}`;
        userDetailsModalContent.innerHTML = '<div class="spinner-full"></div>';
        
        // 🐞 FIX: Destroy old chart, but don't hide any template
        if (currentPersonalityChart) {
            currentPersonalityChart.destroy();
            currentPersonalityChart = null;
        }

        userDetailsModalOverlay.classList.add('visible');
        console.log("Manager.js: Details modal is now visible."); // DEBUG
        
        try {
            console.log("Manager.js: Fetching details from:", `/api/manager/user-details/${userId}`); // DEBUG
            const response = await fetch(`/api/manager/user-details/${userId}`);
            
            if (!response.ok) {
                let errorMsg = `Server error: ${response.status} ${response.statusText}`;
                try {
                    const errorData = await response.json();
                    errorMsg = errorData.error || JSON.stringify(errorData);
                } catch (e) { }
                console.error("Manager.js: Fetch failed:", errorMsg); // DEBUG
                throw new Error(errorMsg);
            }
            
            const data = await response.json(); 
            console.log("Manager.js: Details data received:", data); // DEBUG

            const details = data.device_details || {};
            const visits = data.visit_history || [];

            userDetailsModalContent.innerHTML = `
                <div class="user-details-grid">
                    <div class="detail-block">
                        <h3>Session Info</h3>
                        <div class="detail-item"><strong>Status:</strong> <span>${data.is_banned ? 'BANNED' : 'Active'}</span></div>
                        <div class="detail-item"><strong>Sessions:</strong> <span>${data.session_count}</span></div>
                        <div class="detail-item"><strong>Total Visits:</strong> <span>${visits.length}</span></div>
                        <div class="detail-item"><strong>Last Seen:</strong> <span>${details.last_seen ? new Date(details.last_seen).toLocaleString() : 'Unknown'}</span></div>
                    </div>

                    <div class="detail-block">
                        <h3>Device & Network</h3>
                        <div class="detail-item"><strong>IP Address:</strong> <span>${details.ip || 'Unknown'}</span></div>
                        <div class="detail-item"><strong>Device:</strong> <span>${details.device || 'Unknown'}</span></div>
                        <div class="detail-item"><strong>OS:</strong> <span>${details.os || 'Unknown'}</span></div>
                        <div class="detail-item"><strong>Browser:</strong> <span>${details.browser || 'Unknown'}</span></div>
                    </div>
                </div>
                
                <h3 style="margin-top: 1.5rem;">Visit History (${visits.length})</h3>
                <div class="visit-history">
                    ${visits.length > 0 ? visits.reverse().map(v => `<div>${escapeHTML(v)}</div>`).join('') : 'No visits recorded.'}
                </div>
            `;

        } catch (error) {
            console.error("Details Error:", error);
            userDetailsModalContent.innerHTML = `<div class="data-item error"><span>Error: ${error.message}</span></div>`;
        }
    }
    
    /**
     * 🚀 UPDATED: Shows the Personality Analysis modal
     */
    async function handlePersonalityClick(userId) {
        console.log(`Manager.js: handlePersonalityClick function started for ${userId}.`); // DEBUG
        if (!userDetailsModalOverlay || !userDetailsModalTitle || !userDetailsModalContent) {
            console.error("Manager.js: Personality modal elements not found!"); // DEBUG
            return;
        }

        userDetailsModalTitle.textContent = `Personality Analysis for ${userId}`;
        
        // 🐞 FIX: Set the innerHTML of the *modal content*
        userDetailsModalContent.innerHTML = `
            <div class="personality-view-wrapper">
                <div class="personality-analysis-wrapper">
                    <div class="spinner-full"></div>
                </div>
                <div class="personality-chart-wrapper">
                    <div id="personality-chart-container-modal" class="personality-chart-container">
                         <canvas id="personality-chart-canvas-modal"></canvas>
                    </div>
                </div>
            </div>
        `;
        
        // 🐞 FIX: Find the *newly created* elements *inside* userDetailsModalContent
        const newChartContainer = userDetailsModalContent.querySelector('#personality-chart-container-modal');
        const newChartCanvas = userDetailsModalContent.querySelector('#personality-chart-canvas-modal');
        const newAnalysisWrapper = userDetailsModalContent.querySelector('.personality-analysis-wrapper');

        // Destroy old chart if it exists
        if (currentPersonalityChart) {
            currentPersonalityChart.destroy();
            currentPersonalityChart = null;
        }
        
        userDetailsModalOverlay.classList.add('visible');
        console.log("Manager.js: Personality modal is now visible with 50/50 layout."); // DEBUG

        try {
            console.log("Manager.js: Fetching personality from:", `/api/manager/user-personality/${userId}`); // DEBUG
            const response = await fetch(`/api/manager/user-personality/${userId}`, { method: 'POST' });

            if (!response.ok) {
                let errorMsg = `Server error: ${response.status} ${response.statusText}`;
                try {
                    const errorData = await response.json();
                    errorMsg = errorData.error || JSON.stringify(errorData);
                } catch (e) {
                     try {
                        const errorText = await response.text();
                        errorMsg = errorText.length < 200 ? errorText : `Server error: ${response.status}`;
                    } catch (textErr) {}
                }
                console.error("Manager.js: Fetch failed:", errorMsg); // DEBUG
                throw new Error(errorMsg);
            }
            
            const data = await response.json(); 
            console.log("Manager.js: Personality data received:", data); // DEBUG
            const analysisData = data.analysis_data;

            if (!analysisData) {
                throw new Error("Invalid analysis data received from server.");
            }

            const highlightsHTML = analysisData.highlights.map(item => `<li>${escapeHTML(item)}</li>`).join('');
            const analysisReportHTML = `
                <div class="personality-analysis-header">
                    <h3>AI-Generated Analysis</h3>
                    <span class="risk-level-badge risk-${escapeHTML(analysisData.risk_level)}">
                        Risk: ${escapeHTML(analysisData.risk_level)}
                    </span>
                </div>
                <div class="personality-analysis">
                    <p class="personality-analysis-justification">${escapeHTML(analysisData.risk_justification)}</p>
                    <ul class="personality-highlights">
                        ${highlightsHTML}
                    </ul>
                </div>
            `;
            
            if (newAnalysisWrapper) {
                newAnalysisWrapper.innerHTML = analysisReportHTML;
            } else {
                console.error("Manager.js: Could not find newAnalysisWrapper!");
            }

            if (analysisData.politeness !== undefined) { 
                console.log("Manager.js: Rendering personality chart."); // DEBUG
                const scores = analysisData; 
                
                const chartData = {
                    labels: ['Politeness', 'Formality', 'Inquisitiveness', 'Analytical', 'Emotional Tone', 'Violative'],
                    datasets: [{
                        label: `${userId}'s Traits (0-10)`,
                        data: [
                            scores.politeness || 0,
                            scores.formality || 0,
                            scores.inquisitiveness || 0,
                            scores.analytical || 0,
                            scores.emotional_tone || 0,
                            scores.violative || 0 
                        ],
                        fill: true,
                        backgroundColor: 'rgba(192, 159, 48, 0.2)',
                        borderColor: 'rgba(192, 159, 48, 1)',
                        pointBackgroundColor: 'rgba(192, 159, 48, 1)',
                        pointBorderColor: '#fff',
                        pointHoverBackgroundColor: '#fff',
                        pointHoverBorderColor: 'rgba(192, 159, 48, 1)'
                    }]
                };

                // 🐞 FIX: Show the new chart container
                if (newChartContainer) newChartContainer.style.display = 'block';

                // 🐞 FIX: Create the chart on the *new* canvas
                currentPersonalityChart = new Chart(newChartCanvas, {
                    type: 'radar',
                    data: chartData,
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        scales: {
                            r: {
                                angleLines: { color: 'rgba(255, 255, 255, 0.1)' },
                                grid: { color: 'rgba(255, 255, 255, 0.1)' },
                                pointLabels: {
                                    color: 'rgba(224, 224, 224, 0.9)', 
                                    font: {
                                        family: "'Poppins', sans-serif",
                                        size: 13,
                                        weight: '500' 
                                    },
                                    padding: 10
                                },
                                ticks: {
                                    color: 'rgba(179, 179, 179, 0.7)', 
                                    backdropColor: 'rgba(30, 30, 30, 0.5)', 
                                    stepSize: 2,
                                    beginAtZero: true,
                                    max: 10,
                                    font: {
                                        size: 10
                                    }
                                }
                            }
                        },
                        plugins: {
                            legend: {
                                labels: {
                                    color: 'rgba(224, 224, 224, 0.9)', 
                                    font: {
                                        family: "'Poppins', sans-serif",
                                        size: 14
                                    }
                                }
                            }
                        }
                    }
                });
            } else {
                console.warn("No analysis scores found in data.");
                if(newChartContainer) newChartContainer.innerHTML = "<p>No chart data available.</p>";
            }

        } catch (error) {
            console.error("Personality Error:", error);
            if (newAnalysisWrapper) {
                 newAnalysisWrapper.innerHTML = `<div class="data-item error"><span>Error: ${error.message}</span></div>`;
            }
        }
    }

    /**
     * Bans a user.
     */
    async function handleBanClick(userId, button) {
        const confirmed = await showConfirmModal('Ban User?', `Are you sure you want to ban "${userId}"? They will be locked out of the app.`);
        if (!confirmed) return;

        setButtonLoading(button, true);
        try {
            const response = await fetch('/api/manager/user-ban', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ user_id: userId })
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || 'Failed to ban user.');

            showToast(`User "${userId}" has been banned.`, 'success');
            loadAndRenderUsers(); // Refresh the list

        } catch (error) {
            showToast(error.message, 'error');
            setButtonLoading(button, false);
        }
    }

    /**
     * Unbans a user.
     */
    async function handleUnbanClick(userId, button) {
        setButtonLoading(button, true);
        try {
            const response = await fetch('/api/manager/user-unban', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ user_id: userId })
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || 'Failed to unban user.');

            showToast(`User "${userId}" has been unbanned.`, 'success');
            loadAndRenderUsers(); // Refresh the list

        } catch (error) {
            showToast(error.message, 'error');
            setButtonLoading(button, false);
        }
    }

    /**
     * Deletes a user's data.
     */
    async function handleDeleteClick(userId) {
        const confirmed = await showConfirmModal('DELETE USER DATA?', `Are you sure you want to permanently delete all data for "${userId}"? This includes their user file and all chat history. This cannot be undone.`);
        if (!confirmed) return;

        try {
            const response = await fetch(`/api/manager/user-data/${userId}`, {
                method: 'DELETE'
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || 'Failed to delete data.');
            
            showToast(`All data for "${userId}" has been deleted.`, 'success');
            loadAndRenderUsers(); // Refresh the list

        } catch (error) {
            showToast(error.message, 'error');
        }
    }

    // 🚀 UPDATED: Close modal (for both Details and Personality)
    if (userDetailsModalCloseBtn) {
        userDetailsModalCloseBtn.addEventListener('click', () => {
            if (userDetailsModalOverlay) userDetailsModalOverlay.classList.remove('visible');
            if (currentPersonalityChart) {
                currentPersonalityChart.destroy();
                currentPersonalityChart = null;
            }
        });
    }
    if (userDetailsModalOverlay) {
        userDetailsModalOverlay.addEventListener('click', (e) => {
            if (e.target === userDetailsModalOverlay) {
                if (userDetailsModalOverlay) userDetailsModalOverlay.classList.remove('visible');
                if (currentPersonalityChart) {
                    currentPersonalityChart.destroy();
                    currentPersonalityChart = null;
                }
            }
        });
    }


    // --- 8. Initial Page Load ---
    console.log("Manager.js: Running initial page load functions..."); // DEBUG
    // ### MODIFICATION: Removed initial load. Will be loaded on tab click. ###
    // loadAndRenderThemes();
    // loadAndRenderDataFiles();
    // loadAndRenderUsers(); 
});
