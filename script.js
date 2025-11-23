let dictionary = {};
let reverseDictionary = {};
let favorites = new Set();
let recentSearches = [];
let currentLanguage = 'english';  // For backward compatibility
let currentMode = 'offline';  // 'offline' or 'online'
let onlineDirection = 'mizo-to-en';  // 'en-to-mizo' or 'mizo-to-en'
let serverConnected = false;
let deferredPrompt = null;

// Configuration
const API_URL = 'https://toxobilly.pythonanywhere.com/api';
const TRANSLATION_CACHE = new Map();
const MAX_RECENT_SEARCHES = 10;
const MAX_FAVORITES = 100;

// ============================================
// INITIALIZATION
// ============================================

async function initializeApp() {
    try {
        console.log('🚀 Initializing Mizo Dictionary...');
        
        // Load offline dictionary
        await loadOfflineDictionary();
        
        // Create reverse dictionary for Mizo→English
        createReverseDictionary();
        
        // Check server connection
        await checkServerConnection();
        
        // Setup event listeners
        setupEventListeners();
        
        // Load user data from localStorage
        loadUserData();
        
        // Initialize word of the day
        initializeWordOfTheDay();
        
        // Update UI
        updateStats();
        updateSidebar();
        updateSearchPlaceholder();
        
        console.log(`✓ Dictionary loaded with ${Object.keys(dictionary).length} words`);
        
    } catch (error) {
        console.error('Error initializing app:', error);
        showError('Error loading dictionary. Some features may not work.');
    }
}

async function loadOfflineDictionary() {
    try {
        console.log('Loading offline dictionary...');
        const response = await fetch('dictionary.json');
        
        if (!response.ok) {
            throw new Error('Failed to load dictionary');
        }
        
        dictionary = await response.json();
        console.log(`✓ Loaded ${Object.keys(dictionary).length} words (offline mode)`);
    } catch (error) {
        console.error('Error loading dictionary:', error);
        throw error;
    }
}

// Create Mizo to English reverse dictionary
function createReverseDictionary() {
    reverseDictionary = {};
    for (const [englishWord, mizoDefinition] of Object.entries(dictionary)) {
        const mizoWords = extractMizoWords(mizoDefinition);
        mizoWords.forEach(mizoWord => {
            if (!reverseDictionary[mizoWord]) {
                reverseDictionary[mizoWord] = [];
            }
            reverseDictionary[mizoWord].push({
                english: englishWord,
                fullDefinition: mizoDefinition
            });
        });
    }
    console.log(`✓ Reverse dictionary created with ${Object.keys(reverseDictionary).length} Mizo words`);
}

function extractMizoWords(definition) {
    const words = definition
        .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g, ' ')
        .split(/\s+/)
        .filter(word => 
            word.length > 2 && 
            !word.match(/^[0-9]/) && 
            !word.match(/[A-Z]/) &&
            word.match(/^[a-z\u1000-\u109F]+$/)
        );
    return [...new Set(words)];
}

async function checkServerConnection() {
    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 3000);
        
        const response = await fetch(`${API_URL}/status`, {
            signal: controller.signal
        });
        
        clearTimeout(timeout);
        
        if (response.ok) {
            const status = await response.json();
            serverConnected = status.model_loaded || status.api_key_configured;
            updateServerStatus(serverConnected);
            console.log(serverConnected ? '✓ Server connected' : '⚠ Server not ready');
        } else {
            serverConnected = false;
            updateServerStatus(false);
        }
    } catch (error) {
        serverConnected = false;
        updateServerStatus(false);
        console.warn('⚠ Translation server offline. Online mode will not work.');
    }
}

// ============================================
// EVENT LISTENERS
// ============================================

function setupEventListeners() {
    // Mode toggle (Offline/Online)
    setupModeToggle();
    
    // Direction toggle (for online mode)
    setupDirectionToggle();
    
    // Search functionality
    setupSearch();
    
    // Tab switching
    setupTabs();
    
    // Install PWA prompt
    setupPWA();
}

function setupModeToggle() {
    const offlineTab = document.getElementById('offline-tab');
    const onlineTab = document.getElementById('online-tab');
    
    if (offlineTab) {
        offlineTab.addEventListener('click', () => switchMode('offline'));
    }
    
    if (onlineTab) {
        onlineTab.addEventListener('click', () => switchMode('online'));
    }
}

function setupDirectionToggle() {
    const enToMizoBtn = document.getElementById('en-to-mizo-btn');
    const mizoToEnBtn = document.getElementById('mizo-to-en-btn');
    
    if (enToMizoBtn) {
        enToMizoBtn.addEventListener('click', () => switchOnlineDirection('en-to-mizo'));
    }
    
    if (mizoToEnBtn) {
        mizoToEnBtn.addEventListener('click', () => switchOnlineDirection('mizo-to-en'));
    }
}

function setupSearch() {
    const searchInput = document.getElementById('searchInput');
    const searchBtn = document.getElementById('searchBtn');
    
    if (searchBtn) {
        searchBtn.addEventListener('click', () => {
            if (searchInput) {
                performSearch(searchInput.value);
            }
        });
    }
    
    if (searchInput) {
        searchInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                performSearch(searchInput.value);
            }
        });
    }
}

function setupTabs() {
    const tabs = document.querySelectorAll('.tab');
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const tabName = tab.dataset.tab;
            switchTab(tabName);
        });
    });
}

function switchTab(tabName) {
    // Remove active class from all tabs and content areas
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.content-area').forEach(c => c.classList.remove('active'));
    
    // Add active class to selected tab and content
    const selectedTab = document.querySelector(`[data-tab="${tabName}"]`);
    if (selectedTab) {
        selectedTab.classList.add('active');
    }
    
    const contentMap = {
        'dictionary': 'dictionaryView',
        'favorites': 'favoritesView',
        'wotd': 'wotdView'
    };
    
    const contentId = contentMap[tabName];
    if (contentId) {
        const content = document.getElementById(contentId);
        if (content) {
            content.classList.add('active');
        }
    }
    
    if (tabName === 'favorites') {
        displayFavorites();
    } else if (tabName === 'wotd') {
        const wotd = localStorage.getItem('currentWotd');
        if (wotd) {
            displayWotdView(wotd, dictionary[wotd]);
        }
    }
}

function setupPWA() {
    window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        deferredPrompt = e;
        const installBtn = document.getElementById('installButton');
        if (installBtn) {
            installBtn.style.display = 'block';
            installBtn.addEventListener('click', installApp);
        }
    });
}

function installApp() {
    if (deferredPrompt) {
        deferredPrompt.prompt();
        deferredPrompt.userChoice.then((choiceResult) => {
            if (choiceResult.outcome === 'accepted') {
                console.log('PWA installed');
            }
            deferredPrompt = null;
        });
    }
}

// ============================================
// MODE SWITCHING
// ============================================

function switchMode(mode) {
    currentMode = mode;
    
    // Update tab states
    document.querySelectorAll('[data-mode]').forEach(btn => {
        btn.classList.remove('active');
    });
    
    const activeTab = document.getElementById(`${mode}-tab`);
    if (activeTab) {
        activeTab.classList.add('active');
    }
    
    // Show/hide direction toggle
    const directionToggle = document.getElementById('online-direction-toggle');
    if (directionToggle) {
        directionToggle.style.display = mode === 'online' ? 'flex' : 'none';
    }
    
    // Update UI
    updateSearchPlaceholder();
    updateServerStatus(serverConnected);
    clearResults();
    
    console.log(`Switched to ${mode} mode`);
}

function switchOnlineDirection(direction) {
    onlineDirection = direction;
    
    // Update direction button states
    document.querySelectorAll('[data-direction]').forEach(btn => {
        btn.classList.remove('active');
    });
    
    const activeBtn = document.getElementById(`${direction}-btn`);
    if (activeBtn) {
        activeBtn.classList.add('active');
    }
    
    // Update placeholder and clear results
    updateSearchPlaceholder();
    clearResults();
    
    console.log(`Online direction: ${direction}`);
}

function updateSearchPlaceholder() {
    const searchInput = document.getElementById('searchInput');
    if (!searchInput) return;
    
    if (currentMode === 'offline') {
        searchInput.placeholder = 'Enter a word to look up...';
    } else {
        if (onlineDirection === 'en-to-mizo') {
            searchInput.placeholder = 'Enter English word...';
        } else {
            searchInput.placeholder = 'Mizo in ziak rawh...';
        }
    }
}

function updateServerStatus(connected) {
    const statusDiv = document.getElementById('server-status');
    if (!statusDiv) return;
    
    if (currentMode === 'online') {
        statusDiv.style.display = 'block';
        
        if (connected) {
            statusDiv.style.background = '#e8f5e9';
            statusDiv.style.color = '#2e7d32';
            const statusText = statusDiv.querySelector('#status-text');
            if (statusText) {
                statusText.textContent = 'Server Connected';
            }
        } else {
            statusDiv.style.background = '#ffebee';
            statusDiv.style.color = '#c62828';
            const statusText = statusDiv.querySelector('#status-text');
            if (statusText) {
                statusText.textContent = 'Server Offline';
            }
        }
    } else {
        statusDiv.style.display = 'none';
    }
}

// ============================================
// SEARCH FUNCTIONALITY
// ============================================

async function performSearch(query) {
    if (!query || query.trim() === '') {
        return;
    }
    
    const searchTerm = query.trim();
    
    // Switch to dictionary tab
    switchTab('dictionary');
    
    if (currentMode === 'offline') {
        // Offline: Use dictionary.json (English or Mizo)
        searchOffline(searchTerm);
    } else {
        // Online: Use Google Translate API
        if (onlineDirection === 'mizo-to-en') {
            await searchOnline(searchTerm, 'mizo-to-en');
        } else {
            await searchOnline(searchTerm, 'en-to-mizo');
        }
    }
    
    // Add to recent searches
    addToRecentSearches(searchTerm);
}

function searchOffline(query) {
    const word = query.toLowerCase();
    
    // Try English → Mizo first
    if (dictionary[word]) {
        displayWordResult(word, dictionary[word], 'English → Mizo');
        return;
    }
    
    // Try Mizo → English reverse lookup
    if (reverseDictionary[word]) {
        displayReverseResults(word, reverseDictionary[word]);
        return;
    }
    
    // Not found
    displayNoResult(query);
}

async function searchOnline(word, direction) {
    if (!serverConnected) {
        showError('Translation server is offline. Please run: python translation_server.py');
        return;
    }
    
    showLoadingState('Translating...');
    
    try {
        // Check cache
        const cacheKey = `${direction}:${word.toLowerCase()}`;
        if (TRANSLATION_CACHE.has(cacheKey)) {
            console.log('Using cached translation');
            const translation = TRANSLATION_CACHE.get(cacheKey);
            displayOnlineResult(word, translation, direction, true);
            return;
        }
        
        // Call API
        const endpoint = direction === 'mizo-to-en' 
            ? `${API_URL}/translate-mizo`
            : `${API_URL}/translate-english`;
        
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ word: word })
        });
        
        if (!response.ok) {
            throw new Error('Translation request failed');
        }
        
        const data = await response.json();
        
        if (data.success) {
            const translation = direction === 'mizo-to-en' ? data.english : data.mizo;
            
            // Cache the result
            TRANSLATION_CACHE.set(cacheKey, translation);
            
            displayOnlineResult(word, translation, direction, false);
        } else {
            throw new Error(data.error || 'Translation failed');
        }
        
    } catch (error) {
        console.error('Translation error:', error);
        showError(`Could not translate "${word}". ${error.message}`);
    }
}

// ============================================
// DISPLAY FUNCTIONS (Using your original style)
// ============================================

function displayWordResult(word, definition, direction) {
    const resultsContainer = document.getElementById('dictionaryResults');
    const resultsTitle = document.getElementById('resultsTitle');
    const resultsSubtitle = document.getElementById('resultsSubtitle');
    
    if (resultsTitle) {
        resultsTitle.textContent = `Result for "${word}"`;
    }
    
    if (resultsSubtitle) {
        resultsSubtitle.textContent = direction || 'English → Mizo';
    }
    
    const favoriteKey = `${word}:${definition}`;
    const isFavorite = favorites.has(favoriteKey);
    
    resultsContainer.innerHTML = `
        <div class="word-card">
            <div class="word-header">
                <h3 class="word">${escapeHtml(word)}</h3>
                <button class="favorite-star ${isFavorite ? 'active' : ''}" 
                        onclick="toggleFavorite('${escapeHtml(word)}', '${escapeHtml(definition)}')">
                    <i class="fas fa-star"></i>
                </button>
            </div>
            <div class="definition">${escapeHtml(definition)}</div>
            <div style="margin-top: 10px;">
                <span class="offline-badge">⚡ Offline</span>
            </div>
        </div>
    `;
}

function displayReverseResults(mizoWord, results) {
    const resultsContainer = document.getElementById('dictionaryResults');
    const resultsTitle = document.getElementById('resultsTitle');
    const resultsSubtitle = document.getElementById('resultsSubtitle');
    
    if (resultsTitle) {
        resultsTitle.textContent = `Results for "${mizoWord}"`;
    }
    
    if (resultsSubtitle) {
        resultsSubtitle.textContent = `Found ${results.length} match${results.length > 1 ? 'es' : ''}`;
    }
    
    let html = '';
    results.slice(0, 10).forEach((result) => {
        const favoriteKey = `${result.english}:${result.fullDefinition}`;
        const isFavorite = favorites.has(favoriteKey);
        
        html += `
            <div class="word-card">
                <div class="word-header">
                    <h3 class="word">${escapeHtml(result.english)}</h3>
                    <button class="favorite-star ${isFavorite ? 'active' : ''}" 
                            onclick="toggleFavorite('${escapeHtml(result.english)}', '${escapeHtml(result.fullDefinition)}')">
                        <i class="fas fa-star"></i>
                    </button>
                </div>
                <div class="definition">${escapeHtml(result.fullDefinition)}</div>
                <div style="margin-top: 10px;">
                    <span class="offline-badge">⚡ Offline (Mizo → English)</span>
                </div>
            </div>
        `;
    });
    
    resultsContainer.innerHTML = html;
}

function displayOnlineResult(query, translation, direction, cached) {
    const resultsContainer = document.getElementById('dictionaryResults');
    const resultsTitle = document.getElementById('resultsTitle');
    const resultsSubtitle = document.getElementById('resultsSubtitle');
    
    if (resultsTitle) {
        resultsTitle.textContent = `Result for "${query}"`;
    }
    
    if (resultsSubtitle) {
        resultsSubtitle.textContent = direction === 'mizo-to-en' ? 'Mizo → English' : 'English → Mizo';
    }
    
    const favoriteKey = `${query}:${translation}`;
    const isFavorite = favorites.has(favoriteKey);
    
    const badge = cached 
        ? '<span class="cached-badge">💾 Cached</span>'
        : '<span class="online-badge">🌐 Translate</span>';
    
    resultsContainer.innerHTML = `
        <div class="word-card">
            <div class="word-header">
                <h3 class="word">${escapeHtml(query)}</h3>
                <button class="favorite-star ${isFavorite ? 'active' : ''}" 
                        onclick="toggleFavorite('${escapeHtml(query)}', '${escapeHtml(translation)}')">
                    <i class="fas fa-star"></i>
                </button>
            </div>
            <div class="definition">${escapeHtml(translation)}</div>
            <div style="margin-top: 10px;">${badge}</div>
        </div>
    `;
}

function displayNoResult(query) {
    const resultsContainer = document.getElementById('dictionaryResults');
    const resultsTitle = document.getElementById('resultsTitle');
    const resultsSubtitle = document.getElementById('resultsSubtitle');
    
    if (resultsTitle) {
        resultsTitle.textContent = 'No results found';
    }
    
    if (resultsSubtitle) {
        resultsSubtitle.textContent = `No match for "${query}"`;
    }
    
    resultsContainer.innerHTML = `
        <div class="empty-state">
            <i class="fas fa-search"></i>
            <h3>Word not found</h3>
            <p>No translation found for "<strong>${escapeHtml(query)}</strong>"</p>
            <p>Try searching for a different word or check the spelling</p>
        </div>
    `;
}

function showLoadingState(message) {
    const resultsContainer = document.getElementById('dictionaryResults');
    if (resultsContainer) {
        resultsContainer.innerHTML = `
            <div class="empty-state">
                <div class="spinner"></div>
                <p>${escapeHtml(message)}</p>
            </div>
        `;
    }
}

function showError(message) {
    const resultsContainer = document.getElementById('dictionaryResults');
    if (resultsContainer) {
        resultsContainer.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-exclamation-circle"></i>
                <h3>Error</h3>
                <p>${escapeHtml(message)}</p>
            </div>
        `;
    }
}

function clearResults() {
    const resultsContainer = document.getElementById('dictionaryResults');
    const resultsTitle = document.getElementById('resultsTitle');
    const resultsSubtitle = document.getElementById('resultsSubtitle');
    
    if (resultsContainer) {
        resultsContainer.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-search"></i>
                <h3>Search the Dictionary</h3>
                <p>Enter a word in the search bar above to find its translation</p>
            </div>
        `;
    }
    
    if (resultsTitle) {
        resultsTitle.textContent = 'Dictionary Results';
    }
    
    if (resultsSubtitle) {
        resultsSubtitle.textContent = 'Type a word to begin your search';
    }
}

// ============================================
// FAVORITES & RECENT SEARCHES
// (Your original code - keeping intact)
// ============================================

function loadUserData() {
    try {
        const savedFavorites = localStorage.getItem('favorites');
        if (savedFavorites) {
            favorites = new Set(JSON.parse(savedFavorites));
        }
        
        const savedSearches = localStorage.getItem('recentSearches');
        if (savedSearches) {
            recentSearches = JSON.parse(savedSearches);
        }
    } catch (error) {
        console.error('Error loading user data:', error);
    }
}

function saveUserData() {
    try {
        localStorage.setItem('favorites', JSON.stringify([...favorites]));
        localStorage.setItem('recentSearches', JSON.stringify(recentSearches));
    } catch (error) {
        console.error('Error saving user data:', error);
    }
}

function toggleFavorite(word, definition) {
    const key = `${word}:${definition}`;
    
    if (favorites.has(key)) {
        favorites.delete(key);
    } else {
        if (favorites.size >= MAX_FAVORITES) {
            const firstKey = favorites.values().next().value;
            favorites.delete(firstKey);
        }
        favorites.add(key);
    }
    
    saveUserData();
    updateStats();
    updateSidebar();
    
    // Update current view if in favorites tab
    if (document.getElementById('favoritesView').classList.contains('active')) {
        displayFavorites();
    }
}

function addToRecentSearches(word) {
    recentSearches = recentSearches.filter(w => w !== word);
    recentSearches.unshift(word);
    
    if (recentSearches.length > MAX_RECENT_SEARCHES) {
        recentSearches = recentSearches.slice(0, MAX_RECENT_SEARCHES);
    }
    
    saveUserData();
    updateSidebar();
}

function displayFavorites() {
    const favoritesContainer = document.getElementById('favoritesList');
    if (!favoritesContainer) return;
    
    if (favorites.size === 0) {
        favoritesContainer.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-star"></i>
                <h3>No favorites yet</h3>
                <p>Click the star icon on any word to add it to your favorites</p>
            </div>
        `;
        return;
    }
    
    let html = '';
    [...favorites].forEach(fav => {
        const [word, definition] = fav.split(':');
        html += `
            <div class="word-card">
                <div class="word-header">
                    <h3 class="word">${escapeHtml(word)}</h3>
                    <button class="favorite-star active" 
                            onclick="toggleFavorite('${escapeHtml(word)}', '${escapeHtml(definition)}')">
                        <i class="fas fa-star"></i>
                    </button>
                </div>
                <div class="definition">${escapeHtml(truncateDefinition(definition, 100))}</div>
            </div>
        `;
    });
    
    favoritesContainer.innerHTML = html;
}

// ============================================
// WORD OF THE DAY (Your original code)
// ============================================

function initializeWordOfTheDay() {
    const today = new Date().toDateString();
    let wotd = localStorage.getItem('currentWotd');
    let wotdDate = localStorage.getItem('wotdDate');
    
    if (!wotd || wotdDate !== today) {
        const words = Object.keys(dictionary);
        const randomWord = words[Math.floor(Math.random() * words.length)];
        wotd = randomWord;
        localStorage.setItem('currentWotd', wotd);
        localStorage.setItem('wotdDate', today);
        addToWotdHistory(randomWord);
    }
    
    updateWotdDisplay(wotd);
}

function addToWotdHistory(word) {
    let history = JSON.parse(localStorage.getItem('wotdHistory') || '[]');
    const today = new Date().toISOString().split('T')[0];
    history = history.filter(item => item.date !== today);
    history.unshift({
        date: today,
        word: word,
        definition: dictionary[word]
    });
    history = history.slice(0, 7);
    localStorage.setItem('wotdHistory', JSON.stringify(history));
}

function updateWotdDisplay(word) {
    const definition = dictionary[word] || '';
    const sidebarWord = document.getElementById('sidebarWotdWord');
    const sidebarDef = document.getElementById('sidebarWotdDef');
    
    if (sidebarWord) {
        sidebarWord.textContent = word;
    }
    
    if (sidebarDef) {
        sidebarDef.textContent = truncateDefinition(definition, 80);
    }
}

function displayWotdView(word, definition) {
    const history = JSON.parse(localStorage.getItem('wotdHistory') || '[]');
    let html = `
        <div class="word-card">
            <div class="word-header">
                <h3 class="word">${escapeHtml(word)}</h3>
            </div>
            <div class="definition">${escapeHtml(definition)}</div>
        </div>
    `;
    
    if (history.length > 0) {
        html += '<h4 style="margin-top: 20px;">Past Words of the Day</h4>';
        history.slice(1).forEach(item => {
            html += `
                <div class="word-card">
                    <div class="word-header">
                        <h3 class="word">${escapeHtml(item.word)}</h3>
                        <small>${item.date}</small>
                    </div>
                    <div class="definition">${escapeHtml(truncateDefinition(item.definition, 100))}</div>
                </div>
            `;
        });
    }
    
    document.getElementById('wotdContent').innerHTML = html;
}

// ============================================
// UI UPDATES
// ============================================

function updateStats() {
    const wordCount = document.getElementById('wordCount');
    if (wordCount) {
        const count = Object.keys(dictionary).length;
        wordCount.textContent = `${count} words • English to Mizo translations`;
    }
}

function updateSidebar() {
    // Update sidebar favorites
    const sidebarFavorites = document.getElementById('sidebarFavorites');
    if (sidebarFavorites) {
        if (favorites.size === 0) {
            sidebarFavorites.innerHTML = `
                <div class="empty-state" style="padding: 20px 0;">
                    <i class="fas fa-star" style="font-size: 24px;"></i>
                    <p style="font-size: 12px;">No favorites yet</p>
                </div>
            `;
        } else {
            let html = '';
            [...favorites].slice(0, 5).forEach(fav => {
                const [word] = fav.split(':');
                html += `<div class="recent-word" onclick="performSearch('${escapeHtml(word)}')">${escapeHtml(word)}</div>`;
            });
            sidebarFavorites.innerHTML = html;
        }
    }
    
    // Update recent searches
    const recentContainer = document.getElementById('recentSearches');
    if (recentContainer) {
        if (recentSearches.length === 0) {
            recentContainer.innerHTML = `
                <div class="empty-state" style="padding: 10px 0;">
                    <p style="font-size: 12px;">No recent searches</p>
                </div>
            `;
        } else {
            let html = '';
            recentSearches.slice(0, 5).forEach(word => {
                html += `<div class="recent-word" onclick="performSearch('${escapeHtml(word)}')">${escapeHtml(word)}</div>`;
            });
            recentContainer.innerHTML = html;
        }
    }
}
// Word of the day scroll tir na
document.addEventListener('DOMContentLoaded', function() {
    const wotdTab = document.getElementById('wotd-tab');
    
    if (wotdTab) {
        wotdTab.addEventListener('click', function() {
            // Find the sidebar WOTD section and scroll to it
            const wotdSection = document.querySelector('.wotd-section') || 
                               document.querySelector('.sidebar-section:has(#sidebarWotdWord)') ||
                               document.getElementById('sidebarWotdWord')?.closest('.sidebar-section');
            
            if (wotdSection) {
                wotdSection.scrollIntoView({ 
                    behavior: 'smooth', 
                    block: 'start' 
                });
            }
        });
    }
});


// ============================================
// UTILITY FUNCTIONS
// ============================================

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function truncateDefinition(text, maxLength) {
    if (text.length <= maxLength) return text;
    return text.substr(0, maxLength) + '...';
}

// ============================================
// INITIALIZE ON LOAD
// ============================================

document.addEventListener('DOMContentLoaded', initializeApp);

// Refresh server connection periodically
setInterval(checkServerConnection, 30000); // Every 30 seconds
