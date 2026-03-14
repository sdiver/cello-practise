// API 基础配置
const API_BASE = '';

// 通用请求函数
async function request(url, options = {}) {
    const defaultOptions = {
        headers: {
            'Content-Type': 'application/json',
        },
    };

    const response = await fetch(`${API_BASE}${url}`, {
        ...defaultOptions,
        ...options,
        headers: {
            ...defaultOptions.headers,
            ...options.headers,
        },
    });

    if (!response.ok) {
        const error = await response.json().catch(() => ({ error: '请求失败' }));
        throw new Error(error.error || error.message || `HTTP ${response.status}`);
    }

    return response.json();
}

// API 方法
const api = {
    // 用户
    login: (username, nickname) =>
        request('/api/users/login', {
            method: 'POST',
            body: JSON.stringify({ username, nickname }),
        }),

    getUser: (id) =>
        request(`/api/users/${id}`),

    getUserSettings: (id) =>
        request(`/api/users/${id}/settings`),

    updateUserSettings: (id, settings) =>
        request(`/api/users/${id}/settings`, {
            method: 'PUT',
            body: JSON.stringify(settings),
        }),

    // 琴谱
    getSheets: (params = {}) => {
        const query = new URLSearchParams(params).toString();
        return request(`/api/sheets?${query}`);
    },

    getSheet: (id) =>
        request(`/api/sheets/${id}`),

    uploadSheet: (formData) =>
        fetch(`${API_BASE}/api/sheets/upload`, {
            method: 'POST',
            body: formData,
        }).then(r => r.json()),

    saveSheet: (data) =>
        request('/api/sheets/save', {
            method: 'POST',
            body: JSON.stringify(data),
        }),

    deleteSheet: (id, userId) =>
        request(`/api/sheets/${id}`, {
            method: 'DELETE',
            body: JSON.stringify({ user_id: userId }),
        }),

    // 收藏
    getFavorites: (userId) =>
        request(`/api/sheets/user/favorites?user_id=${userId}`),

    addFavorite: (id, userId) =>
        request(`/api/sheets/${id}/favorite`, {
            method: 'POST',
            body: JSON.stringify({ user_id: userId }),
        }),

    removeFavorite: (id, userId) =>
        request(`/api/sheets/${id}/favorite`, {
            method: 'DELETE',
            body: JSON.stringify({ user_id: userId }),
        }),

    // 搜索
    searchSheets: (query, source = 'all', page = 1) =>
        request(`/api/search/sheets?q=${encodeURIComponent(query)}&source=${source}&page=${page}`),

    getSearchHistory: (userId) =>
        request(`/api/search/history?user_id=${userId}`),

    getTrending: () =>
        request('/api/search/trending'),

    // 练习记录
    getPracticeRecords: (userId, params = {}) => {
        const query = new URLSearchParams({ user_id: userId, ...params }).toString();
        return request(`/api/practice/records?${query}`);
    },

    getPracticeStats: (userId, period = 30) =>
        request(`/api/practice/stats?user_id=${userId}&period=${period}`),

    savePracticeRecord: (data) =>
        request('/api/practice/records', {
            method: 'POST',
            body: JSON.stringify(data),
        }),

    // 练习计划
    getPracticePlans: (userId, status) =>
        request(`/api/practice/plans?user_id=${userId}${status ? `&status=${status}` : ''}`),

    createPracticePlan: (data) =>
        request('/api/practice/plans', {
            method: 'POST',
            body: JSON.stringify(data),
        }),

    updatePracticePlan: (id, data) =>
        request(`/api/practice/plans/${id}`, {
            method: 'PUT',
            body: JSON.stringify(data),
        }),

    deletePracticePlan: (id) =>
        request(`/api/practice/plans/${id}`, {
            method: 'DELETE',
        }),

    // AI
    analyzePractice: (data) =>
        request('/api/ai/analyze', {
            method: 'POST',
            body: JSON.stringify(data),
        }),

    chatWithAI: (message, userId, sessionId) =>
        request('/api/ai/chat', {
            method: 'POST',
            body: JSON.stringify({ message, user_id: userId, session_id: sessionId }),
        }),

    getChatHistory: (userId, sessionId) =>
        request(`/api/ai/chat/history?user_id=${userId}&session_id=${sessionId}`),

    generatePlan: (data) =>
        request('/api/ai/plan', {
            method: 'POST',
            body: JSON.stringify(data),
        }),

    // MuseScore
    parseMuseScore: (url) =>
        request('/api/musescore/parse', {
            method: 'POST',
            body: JSON.stringify({ url }),
        }),

    saveMuseScore: (url, userId) =>
        request('/api/musescore/save', {
            method: 'POST',
            body: JSON.stringify({ url, user_id: userId }),
        }),

    getMuseScoreRecommendations: (limit = 5) =>
        request(`/api/musescore/recommendations?limit=${limit}`),

    batchSaveMuseScore: (userId) =>
        request('/api/musescore/batch-save', {
            method: 'POST',
            body: JSON.stringify({ user_id: userId }),
        }),

    // MusicXML
    parseMusicXML: (formData) =>
        fetch(`${API_BASE}/api/musicxml/parse`, {
            method: 'POST',
            body: formData,
        }).then(r => r.json()),

    uploadMusicXML: (formData) =>
        fetch(`${API_BASE}/api/musicxml/upload`, {
            method: 'POST',
            body: formData,
        }).then(r => r.json()),

    getMusicXMLContent: (id) =>
        fetch(`${API_BASE}/api/musicxml/${id}/render`),

    // MIDI
    parseMidi: (formData) =>
        fetch(`${API_BASE}/api/midi/parse`, {
            method: 'POST',
            body: formData,
        }).then(r => r.json()),

    uploadMidi: (formData) =>
        fetch(`${API_BASE}/api/midi/upload`, {
            method: 'POST',
            body: formData,
        }).then(r => r.json()),

    getMidiNotes: (id) =>
        fetch(`${API_BASE}/api/midi/${id}/notes`).then(r => r.json()),
};

// 登录检查
function checkLogin() {
    const user = localStorage.getItem('user');
    return user ? JSON.parse(user) : null;
}

// 获取当前用户ID
function getCurrentUserId() {
    const user = checkLogin();
    return user ? user.id : null;
}
